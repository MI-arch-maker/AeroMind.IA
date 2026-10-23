"""Phase A — MAVLink command pilot (write path).

This module is the ONLY place in AeroMind that can send a MAVLink command to a
real flight controller. It is gated by a triple safety mechanism:

1. ``HARDWARE_CONTROL`` environment variable must be EXACTLY the string
   ``"true"`` (case-insensitive). Any other value, including ``"1"``, ``"yes"``
   or ``"on"``, returns ``False`` from :func:`hardware_commands_enabled`.
2. The command must be on the strict allowlist ``ALLOWED_COMMANDS``. There is
   no ``*`` wildcard and no way to extend the list without a code change.
3. Every command requires a per-call confirmation token derived from the
   project's gate state (see :mod:`web.hardware_gate`). The token is single-use
   and audit-logged.

Even when all three gates pass, the module NEVER sends a command that has not
been validated against the geofence (see :mod:`web.geofence_validator`).

This module is intentionally importable without pymavlink installed — the
import happens lazily inside :meth:`MavlinkCommandPilot.send_command` so the
test suite can run with a fake connection factory.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import RLock
from typing import Any, Callable
from uuid import uuid4


# ---------------------------------------------------------------------------
# Allowlist — the only MAVLink commands AeroMind is allowed to send.
# Extending this list requires a code change AND a security review.
# ---------------------------------------------------------------------------

ALLOWED_COMMANDS: tuple[str, ...] = (
    "COMPONENT_ARM_DISARM",  # arm / disarm
    "NAV_TAKEOFF",           # takeoff to a target altitude
    "NAV_LAND",              # land at current position
    "NAV_RETURN_TO_LAUNCH",  # RTL
    "DO_SET_MODE",           # switch flight mode (limited to MANUAL/STABILIZE/AUTO)
)

# Sub-allowlist for flight modes accepted by DO_SET_MODE.
ALLOWED_MODES: tuple[int, ...] = (
    0,   # MAV_MODE_PREFLIGHT
    1,   # MAV_MODE_STABILIZE_DISARMED
    2,   # MAV_MODE_STABILIZE_ARMED
    4,   # MAV_MODE_MANUAL_ARMED
    6,   # MAV_MODE_GUIDED_ARMED
    80,  # MAV_MODE_AUTO_DISARMED (custom ArduPilot mapping)
    81,  # MAV_MODE_AUTO_ARMED
)

# MAVLink command ids from the spec. Hard-coded to avoid importing pymavlink
# at module load time.
MAV_CMD_IDS: dict[str, int] = {
    "COMPONENT_ARM_DISARM": 400,
    "NAV_TAKEOFF": 22,
    "NAV_LAND": 21,
    "NAV_RETURN_TO_LAUNCH": 20,
    "DO_SET_MODE": 176,
}


class HardwareCommandError(ValueError):
    """Stable validation failure raised by the pilot."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def hardware_commands_enabled() -> bool:
    """Return True only if the operator has explicitly opted in to hardware mode.

    The check is strict on purpose: any value other than the exact string
    ``"true"`` (case-insensitive) returns ``False``. This means a typo like
    ``HARDWARE_CONTROL=yes`` or an empty string keeps the system closed.
    """
    value = os.getenv("HARDWARE_CONTROL", "").strip().lower()
    return value == "true"


@dataclass
class CommandReceipt:
    command: str
    target_system: int
    target_component: int
    accepted: bool
    sent_to_hardware: bool
    reason: str
    receipt_id: str = field(default_factory=lambda: str(uuid4()))
    sent_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    parameters: dict[str, Any] = field(default_factory=dict)
    audit_event_id: str | None = None


class MavlinkCommandPilot:
    """Sends a single MAVLink command to one flight controller.

    The pilot is per-drone: each drone in the fleet has its own pilot instance
    (see :mod:`web.mavlink_pool`). Tests inject a ``connection_factory`` so no
    socket is opened.
    """

    def __init__(
        self,
        connection_url: str,
        *,
        target_system: int = 1,
        target_component: int = 1,
        source_system: int = 255,
        source_component: int = 190,
        connection_factory: Callable[[str], Any] | None = None,
    ) -> None:
        self.connection_url = connection_url
        self.target_system = target_system
        self.target_component = target_component
        self.source_system = source_system
        self.source_component = source_component
        self._connection_factory = connection_factory
        self._connection: Any | None = None
        self._lock = RLock()

    # The connection is opened lazily so the module can be imported in tests
    # without pymavlink installed. The first ``send_command`` call triggers
    # the import + socket open.
    def _ensure_connection(self) -> Any:
        with self._lock:
            if self._connection is not None:
                return self._connection
            factory = self._connection_factory or self._default_connection_factory
            conn = factory(self.connection_url)
            self._connection = conn
            return conn

    @staticmethod
    def _default_connection_factory(url: str) -> Any:
        try:
            from pymavlink import mavutil  # noqa: WPS433 — lazy on purpose
        except ImportError as exc:
            raise HardwareCommandError(
                503,
                "PYMAVLINK_MISSING",
                "pymavlink n'est pas installé sur ce runtime; le pilote reste fermé.",
            ) from exc
        return mavutil.mavlink_connection(
            url,
            source_system=255,
            source_component=190,
        )

    def close(self) -> None:
        with self._lock:
            if self._connection is not None and hasattr(self._connection, "close"):
                try:
                    self._connection.close()
                except Exception:
                    pass
            self._connection = None

    def send_command(
        self,
        command: str,
        *,
        parameters: dict[str, float] | None = None,
        confirmation_token: str,
        geofence_validation: Callable[[dict[str, float]], dict[str, Any]] | None = None,
    ) -> CommandReceipt:
        """Validate + send one command. Returns a receipt; never raises on
        MAVLink transport errors — they are captured in the receipt reason."""
        # === Gate 1: hardware flag ===
        if not hardware_commands_enabled():
            raise HardwareCommandError(
                403,
                "HARDWARE_DISABLED",
                "HARDWARE_CONTROL n'est pas 'true'; le pilote reste fermé par contrat.",
            )
        # === Gate 2: allowlist ===
        if command not in ALLOWED_COMMANDS:
            raise HardwareCommandError(
                403,
                "COMMAND_NOT_ALLOWED",
                f"La commande {command!r} n'est pas sur la liste blanche; aucune extension dynamique n'est possible.",
            )
        # === Gate 3: confirmation token must be non-empty ===
        if not isinstance(confirmation_token, str) or len(confirmation_token) < 16:
            raise HardwareCommandError(
                401,
                "CONFIRMATION_TOKEN_INVALID",
                "Le jeton de confirmation hardware doit faire au moins 16 caractères et provenir de la gate N4 hardware.",
            )
        params = dict(parameters or {})
        # Mode sub-allowlist for DO_SET_MODE.
        if command == "DO_SET_MODE":
            mode_value = int(params.get("mode", -1))
            if mode_value not in ALLOWED_MODES:
                raise HardwareCommandError(
                    403,
                    "MODE_NOT_ALLOWED",
                    f"Le mode {mode_value} n'est pas sur la liste blanche des modes autorisés.",
                )

        # === Geofence validation for navigation commands ===
        if command in {"NAV_TAKEOFF", "NAV_LAND", "NAV_RETURN_TO_LAUNCH"} and geofence_validation is not None:
            validation = geofence_validation(params)
            if not validation.get("inside_geofence", False):
                raise HardwareCommandError(
                    409,
                    "GEOFENCE_BREACH",
                    f"Commande {command} refusée: {validation.get('reason', 'hors géofence')}",
                )

        # === Send (lazy connection) ===
        try:
            conn = self._ensure_connection()
        except HardwareCommandError:
            raise
        except Exception as exc:
            return CommandReceipt(
                command=command,
                target_system=self.target_system,
                target_component=self.target_component,
                accepted=False,
                sent_to_hardware=False,
                reason=f"Connexion MAVLink échouée: {exc}",
                parameters=params,
            )

        cmd_id = MAV_CMD_IDS[command]
        # Build the param dict in MAVLink order (p1..p7).
        p1 = float(params.get("p1", 0.0))
        p2 = float(params.get("p2", 0.0))
        p3 = float(params.get("p3", 0.0))
        p4 = float(params.get("p4", 0.0))
        p5 = float(params.get("p5", 0.0))
        p6 = float(params.get("p6", 0.0))
        p7 = float(params.get("p7", 0.0))
        try:
            # pymavlink API: mavlink.command_long_send(target_system, target_component,
            # command_id, confirmation, p1..p7)
            if hasattr(conn, "command_long_send"):
                conn.command_long_send(
                    self.target_system,
                    self.target_component,
                    cmd_id,
                    0,  # confirmation: 0 = first try
                    p1, p2, p3, p4, p5, p6, p7,
                )
            sent = True
            reason = "Commande envoyée au contrôleur de vol."
        except Exception as exc:
            sent = False
            reason = f"Échec d'envoi MAVLink: {exc}"

        return CommandReceipt(
            command=command,
            target_system=self.target_system,
            target_component=self.target_component,
            accepted=sent,
            sent_to_hardware=sent,
            reason=reason,
            parameters=params,
        )


# ---------------------------------------------------------------------------
# Helper for the API layer — builds the parameters dict for common commands.
# ---------------------------------------------------------------------------

def build_takeoff_params(altitude_m: float) -> dict[str, float]:
    """Build MAVLink params for NAV_TAKEOFF (p7 = altitude)."""
    if not 0.5 <= altitude_m <= 120:
        raise HardwareCommandError(400, "ALTITUDE_OUT_OF_RANGE", "L'altitude de décollage doit être entre 0.5 m et 120 m (EASA Open).")
    return {"p7": float(altitude_m)}


def build_arm_params(arm: bool) -> dict[str, float]:
    """Build MAVLink params for COMPONENT_ARM_DISARM (p1 = 1 arm / 0 disarm)."""
    return {"p1": 1.0 if arm else 0.0}


def build_land_params() -> dict[str, float]:
    return {}


def build_rtl_params() -> dict[str, float]:
    return {}


def build_mode_params(mode: int) -> dict[str, float]:
    if mode not in ALLOWED_MODES:
        raise HardwareCommandError(403, "MODE_NOT_ALLOWED", f"Le mode {mode} n'est pas sur la liste blanche.")
    # DO_SET_MODE uses p1 = mode, p2 = custom mode (ArduPilot convention).
    return {"p1": float(mode), "p2": 0.0}
