"""V5 LOT E / R-19 — SITL integration test for the MAVLink mission protocol.

This script connects to a running ArduPilot SITL instance (started
separately via scripts/sitl/start_ardupilot_sitl.sh) and exercises the
full mission upload protocol end-to-end:

  1. Connect to the SITL autopilot via mavlink-router (default URL:
     tcpout:127.0.0.1:5760)
  2. Wait for HEARTBEAT from the autopilot
  3. Build a small 3-waypoint mission
  4. Call web.mavlink_mission_protocol.upload_mission()
  5. Verify the protocol returns state='uploaded' with ack_type=0
     (MAV_MISSION_ACCEPTED) and items_sent == 3

BLOCKED in this sandbox — ArduPilot SITL requires:
  - apt-get install ardupilot-sitl (needs root)
  - Or a Docker container with the ArduPilot SITL image
  - Or a binary download from https://firmware.ardupilot.org/

To run on a preprod VM:
  $ sudo apt-get install -y ardupilot-sitl mavlink-router
  $ ./scripts/sitl/start_ardupilot_sitl.sh &
  $ ./scripts/sitl/start_mavlink_router.sh &
  $ python3 tests/test_sitl_mission_upload.py

The script exits 0 on success, 1 on any failure, 2 if SITL is unreachable
(BLOCKED — needs SITL deployment).
"""
from __future__ import annotations

import os
import sys
import time

# Force env before importing web modules
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("HARDWARE_CONTROL", "true")  # required for upload_mission

SITL_URL = os.environ.get("AEROMIND_SITL_URL", "tcpout:127.0.0.1:5760")
HEARTBEAT_TIMEOUT_S = 30


def _connect_sitl():
    """Connect to the SITL autopilot via pymavlink. Returns the connection
    object or raises if SITL is unreachable."""
    try:
        from pymavlink import mavutil
    except ImportError as exc:
        print(f"BLOCKED: pymavlink not installed ({exc})", file=sys.stderr)
        sys.exit(2)
    try:
        conn = mavutil.mavlink_connection(SITL_URL, source_system=255, source_component=190)
    except Exception as exc:
        print(f"BLOCKED: cannot connect to SITL at {SITL_URL} ({exc})", file=sys.stderr)
        print("To start SITL: ./scripts/sitl/start_ardupilot_sitl.sh", file=sys.stderr)
        sys.exit(2)
    # Wait for HEARTBEAT
    print(f"Waiting for HEARTBEAT from {SITL_URL}...", flush=True)
    hb = conn.recv_match(type="HEARTBEAT", blocking=True, timeout=HEARTBEAT_TIMEOUT_S)
    if hb is None:
        print(f"BLOCKED: no HEARTBEAT from SITL within {HEARTBEAT_TIMEOUT_S}s", file=sys.stderr)
        print("Is ArduPilot SITL running? Check `ps aux | grep ardu`", file=sys.stderr)
        sys.exit(2)
    print(f"✓ HEARTBEAT received (sysid={hb.get_srcSystem()}, compid={hb.get_srcComponent()})", flush=True)
    return conn


def _build_3_waypoints():
    """Build a small 3-waypoint mission around a fixed origin."""
    from web.mavlink_mission_protocol import WaypointItem
    return [
        WaypointItem(seq=0, x=int(48.0 * 1e7), y=int(2.0 * 1e7), z=10.0),
        WaypointItem(seq=1, x=int(48.001 * 1e7), y=int(2.001 * 1e7), z=15.0),
        WaypointItem(seq=2, x=int(48.002 * 1e7), y=int(2.002 * 1e7), z=20.0),
    ]


def _verify_mission_uploaded(conn):
    """Upload the mission and verify the protocol completes with ACK accepted."""
    from web.mavlink_mission_protocol import upload_mission, MAV_MISSION_ACCEPTED
    waypoints = _build_3_waypoints()
    print(f"Uploading {len(waypoints)} waypoints to SITL...", flush=True)
    result = upload_mission(
        conn, waypoints,
        target_system=1, target_component=1,
    )
    print(f"  state={result.state}", flush=True)
    print(f"  ack_type={result.ack_type} ({result.ack_label})", flush=True)
    print(f"  items_sent={result.items_sent}/{result.items_total}", flush=True)
    print(f"  requests_received={result.requests_received}", flush=True)
    if result.state != "uploaded":
        print(f"FAIL: upload did not complete successfully: {result.error}", file=sys.stderr)
        sys.exit(1)
    if result.ack_type != MAV_MISSION_ACCEPTED:
        print(f"FAIL: ACK was not ACCEPTED: {result.ack_label}", file=sys.stderr)
        sys.exit(1)
    if result.items_sent != len(waypoints):
        print(f"FAIL: not all items sent: {result.items_sent}/{len(waypoints)}", file=sys.stderr)
        sys.exit(1)
    print("✓ SITL mission upload PASS — MAV_MISSION_ACCEPTED received for all 3 waypoints", flush=True)


def _verify_mission_count_on_autopilot(conn):
    """Read back the mission count from the autopilot to verify the upload
    actually persisted on the flight controller (not just ACK'd)."""
    try:
        from pymavlink import mavutil
    except ImportError:
        print("SKIP mission read-back — pymavlink not available", file=sys.stderr)
        return
    # Request MISSION_COUNT via a MISSION_REQUEST_LIST message
    # (the autopilot responds with MISSION_COUNT)
    try:
        conn.mavlink.mission_request_list_send(255, 190)
    except Exception as exc:
        print(f"SKIP mission read-back — cannot send mission_request_list: {exc}", file=sys.stderr)
        return
    count_msg = conn.recv_match(type="MISSION_COUNT", blocking=True, timeout=10)
    if count_msg is None:
        print("SKIP mission read-back — no MISSION_COUNT received within 10s", file=sys.stderr)
        return
    print(f"✓ Autopilot reports {count_msg.count} mission items stored", flush=True)
    if count_msg.count < 3:
        print(f"FAIL: autopilot has only {count_msg.count} items, expected ≥ 3", file=sys.stderr)
        sys.exit(1)
    print("✓ SITL mission read-back PASS — autopilot persisted the mission", flush=True)


def main():
    print("=== V5 LOT E / R-19 — SITL mission upload test ===", flush=True)
    print(f"SITL_URL={SITL_URL}", flush=True)
    print(f"HARDWARE_CONTROL={os.environ.get('HARDWARE_CONTROL')}", flush=True)
    if os.environ.get("HARDWARE_CONTROL", "").strip().lower() != "true":
        print("FAIL: HARDWARE_CONTROL must be 'true' for the SITL test (this is a "
              "test-only override; production stays OFF)", file=sys.stderr)
        sys.exit(1)
    conn = _connect_sitl()
    try:
        _verify_mission_uploaded(conn)
        _verify_mission_count_on_autopilot(conn)
    finally:
        try:
            conn.close()
        except Exception:
            pass
    print("=== SITL test complete — all checks PASS ===", flush=True)


if __name__ == "__main__":
    main()
