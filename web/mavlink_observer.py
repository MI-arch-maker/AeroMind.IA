"""Read-only MAVLink observer for AeroMind.

This module deliberately consumes MAVLink frames only. It never sends a MAVLink
command, changes a mode, arms, uploads a mission, or writes a parameter. Use a
mavlink-router or another read-only forwarding path when QGroundControl is
connected to the same vehicle link.
"""
from __future__ import annotations

import os
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from threading import RLock
from typing import Any, Callable


READ_ONLY_PARAMETER_PREFIXES = (
    "ARMING_",
    "BRD_SAFETY",
    "COM_ARM",
    "FENCE_",
    "FS_",
    "GF_",
    "NAV_",
)


@dataclass
class HeartbeatState:
    system_id: int | None = None
    component_id: int | None = None
    vehicle_type: int | None = None
    autopilot: int | None = None
    base_mode: int | None = None
    custom_mode: int | None = None
    system_status: int | None = None
    received_at: str | None = None


@dataclass
class TelemetrySnapshot:
    status: str = "DISCONNECTED"
    connected: bool = False
    read_only: bool = True
    hardware_commands_enabled: bool = False
    connection_url: str | None = None
    last_message_type: str | None = None
    messages_received: int = 0
    heartbeat: HeartbeatState = field(default_factory=HeartbeatState)
    position: dict[str, float | int] | None = None
    flight: dict[str, float | int] | None = None
    battery: dict[str, float | int] | None = None
    propulsion: dict[str, float | int | str] = field(default_factory=dict)
    gps: dict[str, float | int] | None = None
    fence_status: dict[str, int] | None = None
    security_parameters: dict[str, float | int | str] = field(default_factory=dict)
    parameters_received: int = 0
    last_frame_at: str | None = None
    last_heartbeat_at: str | None = None
    reconnect_attempts: int = 0
    reconnect_interval_s: float = 5.0
    last_disconnect_reason: str | None = None
    error: str | None = None


class MavlinkObserver:
    """Small pymavlink adapter with an explicit observation-only contract.

    ``connection_factory`` is injectable so tests do not need a UDP socket or
    an autopilot. The default factory imports pymavlink lazily and opens a
    connection only after ``connect`` is called explicitly.
    """

    def __init__(
        self,
        connection_url: str | None = None,
        connection_factory: Callable[[str], Any] | None = None,
        heartbeat_timeout_s: float = 5.0,
        reconnect_interval_s: float | None = None,
        max_reconnect_attempts: int | None = None,
    ) -> None:
        self.connection_url = connection_url or os.getenv("AEROMIND_MAVLINK_URL", "udpin:0.0.0.0:14550")
        self._connection_factory = connection_factory or self._default_connection_factory
        self.heartbeat_timeout_s = heartbeat_timeout_s
        self.reconnect_interval_s = reconnect_interval_s if reconnect_interval_s is not None else float(os.getenv("AEROMIND_MAVLINK_RECONNECT_INTERVAL_S", "5"))
        self.max_reconnect_attempts = max_reconnect_attempts
        self._connection: Any | None = None
        self._lock = RLock()
        self._snapshot = TelemetrySnapshot(connection_url=self.connection_url)
        self._last_heartbeat_monotonic: float | None = None
        self._last_reconnect_monotonic: float | None = None
        self._snapshot.reconnect_interval_s = self.reconnect_interval_s

    @staticmethod
    def _default_connection_factory(url: str) -> Any:
        try:
            from pymavlink import mavutil
        except ImportError as exc:  # pragma: no cover - depends on deployment extras
            raise RuntimeError("pymavlink n’est pas installé; l’observateur reste fermé") from exc
        return mavutil.mavlink_connection(
            url,
            autoreconnect=True,
            source_system=252,  # P1-18 fix: distinct from pilot (255) to avoid ArduPilot sysid confusion
            source_component=190,
        )

    def connect(self) -> TelemetrySnapshot:
        """Open the configured transport; no MAVLink frame is sent."""
        with self._lock:
            if self._connection is not None:
                return self.snapshot()
            self._snapshot.status = "CONNECTING"
            try:
                self._connection = self._connection_factory(self.connection_url)
            except Exception as exc:
                self._snapshot.status = "ERROR"
                self._snapshot.error = str(exc)
                raise
            self._snapshot.error = None
            self._snapshot.status = "WAITING_HEARTBEAT"
            return self.snapshot()

    def close(self) -> None:
        with self._lock:
            if self._connection is not None and hasattr(self._connection, "close"):
                self._connection.close()
            self._connection = None
            self._snapshot.connected = False
            self._snapshot.status = "DISCONNECTED"

    def poll(self, max_messages: int = 200) -> TelemetrySnapshot:
        """Consume already available frames without transmitting requests."""
        if max_messages < 1:
            raise ValueError("max_messages doit être supérieur ou égal à 1")
        with self._lock:
            if self._connection is None:
                try:
                    self.connect()
                except Exception:
                    return self.snapshot()
            for _ in range(max_messages):
                try:
                    message = self._connection.recv_match(blocking=False)
                except Exception as exc:
                    self._snapshot.error = str(exc)
                    self._snapshot.status = "ERROR"
                    self._connection = None
                    break
                if message is None:
                    break
                self._consume(message)
            self._refresh_connection_state()
            self._maybe_reconnect()
            return self.snapshot()

    def snapshot(self) -> TelemetrySnapshot:
        with self._lock:
            return TelemetrySnapshot(
                **{**asdict(self._snapshot), "heartbeat": HeartbeatState(**asdict(self._snapshot.heartbeat))}
            )

    def _consume(self, message: Any) -> None:
        message_type = str(message.get_type())
        data = message.to_dict() if hasattr(message, "to_dict") else {}
        received_at = datetime.now(UTC).isoformat()
        self._snapshot.last_message_type = message_type
        self._snapshot.last_frame_at = received_at
        self._snapshot.messages_received += 1

        if message_type == "HEARTBEAT":
            header = getattr(message, "_header", None)
            self._snapshot.heartbeat = HeartbeatState(
                system_id=getattr(header, "srcSystem", None),
                component_id=getattr(header, "srcComponent", None),
                vehicle_type=_int_or_none(data.get("type")),
                autopilot=_int_or_none(data.get("autopilot")),
                base_mode=_int_or_none(data.get("base_mode")),
                custom_mode=_int_or_none(data.get("custom_mode")),
                system_status=_int_or_none(data.get("system_status")),
                received_at=received_at,
            )
            self._last_heartbeat_monotonic = _monotonic()
            self._snapshot.last_heartbeat_at = received_at
        elif message_type == "GLOBAL_POSITION_INT":
            self._snapshot.position = {
                "latitude_deg": _scaled(data.get("lat"), 1e7),
                "longitude_deg": _scaled(data.get("lon"), 1e7),
                "altitude_m": _scaled(data.get("alt"), 1000),
                "relative_altitude_m": _scaled(data.get("relative_alt"), 1000),
            }
        elif message_type == "VFR_HUD":
            self._snapshot.flight = _pick_numbers(data, "airspeed", "groundspeed", "heading", "throttle", "alt", "climb")
        elif message_type == "SYS_STATUS":
            self._snapshot.battery = _pick_numbers(data, "voltage_battery", "current_battery", "battery_remaining")
            # SYS_STATUS standard n'inclut pas le carburant; ne pas réinterpréter
            # battery_remaining comme fuel_remaining.
        elif message_type == "FUEL_STATUS":
            # FUEL_STATUS: maximum/consumed/remaining en kg (extension MAVLink).
            self._snapshot.propulsion.update(_pick_numbers(data, "maximum", "consumed", "remaining", "percent_remaining"))
        elif message_type == "BATTERY_STATUS":
            self._snapshot.battery = _pick_numbers(data, "current_consumed", "energy_consumed", "temperature", "current_battery", "battery_remaining", "time_remaining")
        elif message_type in {"ESC_STATUS", "ESC_TELEMETRY_1_TO_4"}:
            for key in ("rpm", "temperature", "esc_temperature", "voltage", "current", "throttle", "motor_temperature"):
                value = data.get(key)
                if isinstance(value, (int, float)):
                    self._snapshot.propulsion[key] = value
                elif isinstance(value, (list, tuple)) and value and isinstance(value[0], (int, float)):
                    self._snapshot.propulsion[f"{key}_channel_1"] = value[0]
        elif message_type == "GPS_RAW_INT":
            self._snapshot.gps = _pick_numbers(data, "fix_type", "satellites_visible", "eph", "epv")
        elif message_type == "FENCE_STATUS":
            self._snapshot.fence_status = _pick_ints(data, "breach_status", "breach_count", "breach_type", "breach_time")
        elif message_type == "PARAM_VALUE":
            name = str(data.get("param_id", "")).rstrip("\\x00")
            if name.upper().startswith(READ_ONLY_PARAMETER_PREFIXES):
                self._snapshot.security_parameters[name] = data.get("param_value")
            self._snapshot.parameters_received += 1

    def _refresh_connection_state(self) -> None:
        alive = bool(
            self._last_heartbeat_monotonic is not None
            and _monotonic() - self._last_heartbeat_monotonic <= self.heartbeat_timeout_s
        )
        self._snapshot.connected = alive
        if alive:
            self._snapshot.status = "OBSERVING"
        elif self._last_heartbeat_monotonic is not None:
            if self._snapshot.status != "RECONNECTING":
                self._snapshot.status = "HEARTBEAT_STALE"
        elif self._connection is not None:
            self._snapshot.status = "WAITING_HEARTBEAT"

    def _maybe_reconnect(self) -> None:
        if self._snapshot.status not in {"HEARTBEAT_STALE", "RECONNECTING", "ERROR"}:
            return
        now = _monotonic()
        if self._last_reconnect_monotonic is not None and now - self._last_reconnect_monotonic < self.reconnect_interval_s:
            return
        if self.max_reconnect_attempts is not None and self._snapshot.reconnect_attempts >= self.max_reconnect_attempts:
            self._snapshot.status = "RECONNECT_EXHAUSTED"
            return
        self._last_reconnect_monotonic = now
        self._snapshot.reconnect_attempts += 1
        self._snapshot.last_disconnect_reason = "HEARTBEAT_STALE" if self._last_heartbeat_monotonic is not None else self._snapshot.error
        self._snapshot.status = "RECONNECTING"
        if self._connection is not None and hasattr(self._connection, "close"):
            self._connection.close()
        self._connection = None
        try:
            self.connect()
            self._snapshot.status = "RECONNECTING"
        except Exception:
            self._snapshot.status = "ERROR"


def _monotonic() -> float:
    import time
    return time.monotonic()


def _int_or_none(value: Any) -> int | None:
    try:
        return None if value is None else int(value)
    except (TypeError, ValueError):
        return None


def _scaled(value: Any, divisor: float) -> float | int | None:
    try:
        return None if value is None else float(value) / divisor
    except (TypeError, ValueError):
        return None


def _pick_numbers(data: dict[str, Any], *keys: str) -> dict[str, float | int]:
    return {key: data[key] for key in keys if data.get(key) is not None}


def _pick_ints(data: dict[str, Any], *keys: str) -> dict[str, int]:
    result: dict[str, int] = {}
    for key in keys:
        value = _int_or_none(data.get(key))
        if value is not None:
            result[key] = value
    return result
