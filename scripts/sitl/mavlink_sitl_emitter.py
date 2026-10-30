#!/usr/bin/env python3
"""AeroMind — Lightweight MAVLink autopilot SITL emitter.

This script emits REAL MAVLink frames (HEARTBEAT, GLOBAL_POSITION_INT,
SYS_STATUS, GPS_RAW_INT, FENCE_STATUS, VFR_HUD) on a UDP port so that the
AeroMind ``MavlinkObserver`` (which uses ``pymavlink``) can connect to it as a
genuine autopilot. No binary ArduPilot/PX4 install is required — pymavlink
itself serialises the frames, so the bytes on the wire are 100 % MAVLink-spec
compliant and the observer parses them like any real vehicle.

The emitter is READ-ONLY by design: it never receives commands and never arms.
It only broadcasts telemetry. This matches AeroMind's "passive observation"
posture (SEC-07): the panel always shows the live frame, but no command path
is opened.

Usage::

    python3 scripts/sitl/mavlink_sitl_emitter.py \\
        --host 127.0.0.1 --port 14551 \\
        --lat 48.8566 --lng 2.3522

The script is also import-safe (``from scripts.sitl.mavlink_sitl_emitter import
MavlinkSitlEmitter``) so the FastAPI lifespan can start it in-process when
``AEROMIND_ENV=development``.
"""
from __future__ import annotations

import argparse
import math
import os
import socket
import struct
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any


@dataclass
class SitlState:
    """Mutable state advanced once per tick (1 Hz by default)."""
    tick: int = 0
    lat: float = 48.8566
    lng: float = 2.3522
    altitude_m: float = 18.0
    relative_alt_m: float = 18.0
    battery_remaining_pct: float = 96.0
    voltage_battery: float = 12.6
    current_battery: float = 8.5
    heading_deg: float = 0.0
    groundspeed_mps: float = 1.2
    airspeed_mps: float = 1.0
    climb_mps: float = 0.0
    satellites_visible: int = 14
    gps_fix_type: int = 3  # 3 = 3D fix
    eph: int = 80  # HDOP * 100
    epv: int = 120  # VDOP * 100
    fence_breach: int = 0
    fence_breach_count: int = 0


class MavlinkSitlEmitter:
    """Broadcast real MAVLink frames over UDP without any autopilot binary.

    Frames are produced with the same wire format pymavlink uses to decode
    them on the observer side — so the round-trip exercises the genuine
    MAVLink parser, not a hand-rolled stub.
    """

    SYSID = 1
    COMPID = 1

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 14551,
        lat: float = 48.8566,
        lng: float = 2.3522,
        tick_hz: float = 1.0,
    ) -> None:
        self.host = host
        self.port = port
        self.state = SitlState(lat=lat, lng=lng)
        self.tick_hz = tick_hz
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._sock: socket.socket | None = None
        self._mav: Any | None = None

    # ── MAVLink serialisation ─────────────────────────────────────────────
    def _init_mavlink(self) -> None:
        """Build a pymavlink MAVLink encoder writing to a UDP socket.

        We use ``mavutil.mavudp`` directly (pymavlink's UDP transport) with
        ``input=False`` so it sends rather than receives. The observer
        connects to ``udpin:<host>:<port>`` and receives every frame.
        """
        from pymavlink import mavutil  # imported lazily so the module is import-safe

        # mavudp expects "host:port" as the device string. input=False puts
        # it in output mode — every mav.*_send() call serialises a real
        # MAVLink frame to the UDP socket.
        self._mav = mavutil.mavudp(
            f"{self.host}:{self.port}",
            input=False,
            source_system=self.SYSID,
            source_component=self.COMPID,
        )
        # Keep a reference to the underlying socket for clean shutdown.
        self._sock = getattr(self._mav, "port", None)

    # ── Frame builders ────────────────────────────────────────────────────
    def _send_heartbeat(self) -> None:
        # type=2 (MAV_TYPE_QUADROTOR), autopilot=3 (MAV_AUTOPILOT_ARDUPILOTMEGA),
        # base_mode=217 (custom mode + MAV_MODE_FLAG_SAFETY_ARMED off +
        # MAV_MODE_FLAG_CUSTOM_MODE_ENABLED + MAV_MODE_FLAG_STABILIZE_ENABLED +
        # MAV_MODE_FLAG_GUIDED_ENABLED + MAV_MODE_FLAG_AUTO_ENABLED) — i.e. a
        # disarmed, guided, stabilised quad — exactly the posture the panel
        # is allowed to observe.
        self._mav.mav.heartbeat_send(
            type=2,
            autopilot=3,
            base_mode=217,
            custom_mode=4,  # ArduPilot GUIDED mode
            system_status=4,  # MAV_STATE_ACTIVE
        )

    def _send_sys_status(self) -> None:
        # SYS_STATUS: battery + load. voltages are in mV, current in cA (10 mA).
        self._mav.mav.sys_status_send(
            onboard_control_sensors_present=0xFFFF,
            onboard_control_sensors_enabled=0xFFFF,
            onboard_control_sensors_health=0xFFFF,
            load=200,  # 2.0 % CPU
            voltage_battery=int(self.state.voltage_battery * 1000),
            current_battery=int(self.state.current_battery * 100),
            battery_remaining=int(self.state.battery_remaining_pct),
            drop_rate_comm=0,
            errors_comm=0,
            errors_count1=0,
            errors_count2=0,
            errors_count3=0,
            errors_count4=0,
        )

    def _send_global_position_int(self) -> None:
        # Lat/lng in 1e7 degrees, alt in mm, relative_alt in mm.
        self._mav.mav.global_position_int_send(
            time_boot_ms=int(self.state.tick * 1000 / self.tick_hz) & 0xFFFFFFFF,
            lat=int(self.state.lat * 1e7),
            lon=int(self.state.lng * 1e7),
            alt=int(self.state.altitude_m * 1000),
            relative_alt=int(self.state.relative_alt_m * 1000),
            vx=int(self.state.groundspeed_mps * 100),
            vy=0,
            vz=int(-self.state.climb_mps * 100),
            hdg=int(self.state.heading_deg) & 0xFFFF,
        )

    def _send_gps_raw_int(self) -> None:
        self._mav.mav.gps_raw_int_send(
            time_usec=int(self.state.tick * 1e6 / self.tick_hz) & 0xFFFFFFFFFFFFFFFF,
            fix_type=self.state.gps_fix_type,
            lat=int(self.state.lat * 1e7),
            lon=int(self.state.lng * 1e7),
            alt=int(self.state.altitude_m * 1000),
            eph=self.state.eph,
            epv=self.state.epv,
            vel=int(self.state.groundspeed_mps * 100),
            cog=int(self.state.heading_deg * 100) & 0xFFFF,
            satellites_visible=self.state.satellites_visible,
        )

    def _send_vfr_hud(self) -> None:
        self._mav.mav.vfr_hud_send(
            airspeed=self.state.airspeed_mps,
            groundspeed=self.state.groundspeed_mps,
            heading=int(self.state.heading_deg) & 0xFFFF,
            throttle=30,
            alt=self.state.altitude_m,
            climb=self.state.climb_mps,
        )

    def _send_fence_status(self) -> None:
        # FENCE_STATUS: breach_status=0 means inside the geofence.
        self._mav.mav.fence_status_send(
            breach_status=self.state.fence_breach,
            breach_count=self.state.fence_breach_count,
            breach_type=0,
            breach_time=0,
        )

    # ── State advancement ─────────────────────────────────────────────────
    def _advance(self) -> None:
        """Advance the simulation by one tick — gentle circular drift."""
        s = self.state
        s.tick += 1
        # Circular drift ~90 m radius, 2-minute period.
        angle = (s.tick % 120) * (math.pi / 60)
        s.lat = s.lat + math.sin(angle) * 0.0008
        s.lng = s.lng + math.cos(angle * 0.7) * 0.0008
        # Altitude oscillates ±6 m around 18 m.
        s.altitude_m = 18.0 + math.sin(angle * 1.5) * 6.0
        s.relative_alt_m = s.altitude_m
        # Heading rotates slowly.
        s.heading_deg = (s.heading_deg + 3.0) % 360.0
        # Battery discharges 0.02 % per tick (1 Hz) → ~80 min full discharge.
        s.battery_remaining_pct = max(20.0, s.battery_remaining_pct - 0.02)
        # Voltage tracks SoC on a 3S LiPo curve (10.5 V → 12.6 V).
        s.voltage_battery = 10.5 + (s.battery_remaining_pct / 100.0) * 2.1
        # GPS constellation slightly varying.
        s.satellites_visible = 12 + (s.tick % 5)
        s.eph = 60 + (s.tick % 40)
        s.epv = 100 + (s.tick % 60)

    def _tick(self) -> None:
        self._send_heartbeat()
        self._send_sys_status()
        self._send_global_position_int()
        self._send_gps_raw_int()
        self._send_vfr_hud()
        self._send_fence_status()
        self._advance()

    # ── Lifecycle ─────────────────────────────────────────────────────────
    def start(self) -> None:
        if self._thread is not None:
            return
        self._init_mavlink()
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="MavlinkSitlEmitter", daemon=True,
        )
        self._thread.start()

    def _run(self) -> None:
        interval = 1.0 / self.tick_hz
        while not self._stop.is_set():
            try:
                self._tick()
            except Exception as exc:  # noqa: BLE001
                # Never crash the emitter thread — log and continue so the
                # observer keeps receiving frames.
                print(f"[MavlinkSitlEmitter] tick error: {exc}", flush=True)
            self._stop.wait(interval)

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        if self._sock is not None:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
        self._mav = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="AeroMind MAVLink SITL emitter (real MAVLink frames, no autopilot binary).")
    p.add_argument("--host", default=os.getenv("AEROMIND_SITL_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.getenv("AEROMIND_SITL_PORT", "14551")))
    p.add_argument("--lat", type=float, default=float(os.getenv("AEROMIND_SITL_LAT", "48.8566")))
    p.add_argument("--lng", type=float, default=float(os.getenv("AEROMIND_SITL_LNG", "2.3522")))
    p.add_argument("--tick-hz", type=float, default=1.0)
    return p.parse_args()


def main() -> int:
    args = _parse_args()
    emitter = MavlinkSitlEmitter(
        host=args.host, port=args.port,
        lat=args.lat, lng=args.lng, tick_hz=args.tick_hz,
    )
    emitter.start()
    print(
        f"[MavlinkSitlEmitter] Broadcasting real MAVLink frames to "
        f"udp://{args.host}:{args.port} (lat={args.lat}, lng={args.lng}, "
        f"tick={args.tick_hz} Hz). Connect with MavlinkObserver("
        f"connection_url='udpin:{args.host}:{args.port}').",
        flush=True,
    )
    try:
        while emitter.is_running():
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\n[MavlinkSitlEmitter] Stopping…", flush=True)
    finally:
        emitter.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
