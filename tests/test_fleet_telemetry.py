"""Tests for the fleet telemetry aggregator (SSE backend).

These tests verify the snapshot endpoint + the per-drone telemetry mapping
without needing a real MAVLink connection — they inject a fake observer
factory that returns canned snapshots.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Any

import pytest

# Force env before importing web modules
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")

from web import fleet_telemetry as ft  # noqa: E402
from web import mavlink_pool as pool_mod  # noqa: E402
from web import geofence_validator as geo  # noqa: E402
from web.mavlink_command_api import HardwareCommandError  # noqa: E402
from web.mavlink_observer import HeartbeatState, TelemetrySnapshot  # noqa: E402


@pytest.fixture(autouse=True)
def reset_pool_singleton():
    pool_mod.reset_pool(pool_mod.MavlinkPool())
    yield
    pool_mod.reset_pool(None)
    # P0-01 fix — use the public test helper instead of poking at the
    # private ``_geofences`` dict, so the storage backend can be swapped
    # (DB / Redis / shared multi-worker) without breaking these tests.
    geo.clear_geofence_cache_for_testing()


class FakeObserver:
    """Read-only observer that returns a canned snapshot — used by tests."""

    def __init__(self, snapshot: TelemetrySnapshot):
        self._snap = snapshot

    def poll(self, max_messages: int = 50) -> TelemetrySnapshot:
        return self._snap

    def close(self) -> None:
        pass


def _make_observer(connected: bool, lat: float | None, lon: float | None, alt: float | None, armed: bool = False) -> FakeObserver:
    snap = TelemetrySnapshot(
        status="OBSERVING" if connected else "DISCONNECTED",
        connected=connected,
        position={"latitude_deg": lat, "longitude_deg": lon, "altitude_m": alt, "relative_altitude_m": alt},
        heartbeat=HeartbeatState(base_mode=128 if armed else 0),
        battery={"battery_remaining": 78, "voltage_battery": 12.4},
        flight={"heading": 45.0, "airspeed": 3.2},
    )
    return FakeObserver(snap)


def _register_drone_with_observer(pool: pool_mod.MavlinkPool, drone_id: str, drone_name: str, observer: FakeObserver) -> None:
    """Bypass the real connection_factory by registering a custom pilot + observer.

    P0-02 fix — the pool now requires ``owner_id`` + ``project_id`` for tenant
    isolation (SEC-02). The fleet telemetry tests don't exercise cross-tenant
    behaviour, so they pass a single fixed identity; the assertion is that the
    snapshot reads only what the pool exposes for that identity.
    """
    pool.register(
        drone_id,
        drone_name,
        "udpout:127.0.0.1:14550",
        owner_id="test-owner",
        project_id="p1",
    )
    # Manually replace the observer with our fake
    entry = pool.entry(drone_id, owner_id="test-owner", project_id="p1")
    entry.observer = observer


# ===========================================================================
# Tests
# ===========================================================================


def test_snapshot_empty_pool():
    snap = ft.fleet_snapshot_sync(user_id="test-user")
    assert snap["poolSize"] == 0
    assert snap["drones"] == []
    assert "timestamp" in snap
    assert "hardwareControlEnabled" in snap


def test_snapshot_returns_drone_positions():
    pool = pool_mod.get_pool()
    obs = _make_observer(connected=True, lat=38.001, lon=-122.001, alt=12.5, armed=True)
    _register_drone_with_observer(pool, "drone-1", "Drone 1", obs)

    snap = ft.fleet_snapshot_sync(user_id="test-user")
    assert snap["poolSize"] == 1
    drone = snap["drones"][0]
    assert drone["droneId"] == "drone-1"
    assert drone["droneName"] == "Drone 1"
    assert drone["connected"] is True
    assert drone["armed"] is True
    assert drone["position"]["latitude_deg"] == 38.001
    assert drone["position"]["relative_altitude_m"] == 12.5
    assert drone["battery_remaining_pct"] == 78
    assert drone["flight"]["heading"] == 45.0


def test_snapshot_computes_xy_when_geofence_home_set():
    pool = pool_mod.get_pool()
    obs = _make_observer(connected=True, lat=38.001, lon=-122.001, alt=5.0)
    _register_drone_with_observer(pool, "drone-1", "Drone 1", obs)

    # Geofence with home at (38.0, -122.0)
    geo.set_geofence_for_testing(geo.Geofence(
        project_id="p1",
        polygon=[(37.99, -122.01), (38.01, -122.01), (38.01, -121.99), (37.99, -121.99)],
        max_altitude_m=100,
        max_distance_m=500,
        home_lat=38.0,
        home_lon=-122.0,
    ))

    snap = ft.fleet_snapshot_sync(user_id="test-user")
    drone = snap["drones"][0]
    # ~111 m north and ~85 m west of home (lat 0.001 = 111m, lon 0.001 at lat 38 ≈ 88m)
    assert drone["x_m"] is not None
    assert drone["y_m"] is not None
    # North is positive y, so drone at lat > home → y_m > 0
    assert drone["y_m"] > 100  # ~111 m
    # West is negative x, so drone at lon < home → x_m < 0
    assert drone["x_m"] < -80  # ~-88 m
    assert drone["inside_geofence"] is True


def test_snapshot_flags_drone_outside_geofence_polygon():
    pool = pool_mod.get_pool()
    obs = _make_observer(connected=True, lat=38.5, lon=-122.5, alt=5.0)  # far outside
    _register_drone_with_observer(pool, "drone-1", "Drone 1", obs)

    geo.set_geofence_for_testing(geo.Geofence(
        project_id="p1",
        polygon=[(37.99, -122.01), (38.01, -122.01), (38.01, -121.99), (37.99, -121.99)],
        home_lat=38.0,
        home_lon=-122.0,
    ))

    snap = ft.fleet_snapshot_sync(user_id="test-user")
    drone = snap["drones"][0]
    assert drone["inside_geofence"] is False


def test_snapshot_flags_drone_above_max_altitude():
    pool = pool_mod.get_pool()
    obs = _make_observer(connected=True, lat=38.001, lon=-122.001, alt=200.0)
    _register_drone_with_observer(pool, "drone-1", "Drone 1", obs)

    geo.set_geofence_for_testing(geo.Geofence(
        project_id="p1",
        polygon=[(37.99, -122.01), (38.01, -122.01), (38.01, -121.99), (37.99, -121.99)],
        max_altitude_m=100,
        home_lat=38.0,
        home_lon=-122.0,
    ))

    snap = ft.fleet_snapshot_sync(user_id="test-user")
    drone = snap["drones"][0]
    assert drone["altitude_ok"] is False


def test_snapshot_handles_disconnected_observer():
    pool = pool_mod.get_pool()
    obs = _make_observer(connected=False, lat=None, lon=None, alt=None)
    _register_drone_with_observer(pool, "drone-1", "Drone 1", obs)

    snap = ft.fleet_snapshot_sync(user_id="test-user")
    drone = snap["drones"][0]
    assert drone["connected"] is False
    assert drone["position"]["latitude_deg"] is None
    assert drone["x_m"] is None
    assert drone["y_m"] is None


def test_snapshot_handles_multiple_drones():
    pool = pool_mod.get_pool()
    obs1 = _make_observer(connected=True, lat=38.001, lon=-122.001, alt=5.0)
    obs2 = _make_observer(connected=True, lat=38.002, lon=-122.002, alt=10.0, armed=True)
    _register_drone_with_observer(pool, "drone-1", "Alpha", obs1)
    _register_drone_with_observer(pool, "drone-2", "Bravo", obs2)

    geo.set_geofence_for_testing(geo.Geofence(
        project_id="p1",
        polygon=[(37.99, -122.01), (38.05, -122.01), (38.05, -121.99), (37.99, -121.99)],
        home_lat=38.0,
        home_lon=-122.0,
    ))

    snap = ft.fleet_snapshot_sync(user_id="test-user")
    assert snap["poolSize"] == 2
    drones = {d["droneId"]: d for d in snap["drones"]}
    assert drones["drone-1"]["droneName"] == "Alpha"
    assert drones["drone-2"]["droneName"] == "Bravo"
    assert drones["drone-2"]["armed"] is True
    assert drones["drone-1"]["armed"] is False


def test_snapshot_includes_geofence_metadata():
    pool = pool_mod.get_pool()
    obs = _make_observer(connected=True, lat=38.0, lon=-122.0, alt=10.0)
    _register_drone_with_observer(pool, "drone-1", "Drone 1", obs)

    geo.set_geofence_for_testing(geo.Geofence(
        project_id="p1",
        polygon=[(37.99, -122.01), (38.01, -122.01), (38.01, -121.99), (37.99, -121.99)],
        max_altitude_m=120,
        home_lat=38.0,
        home_lon=-122.0,
    ))

    snap = ft.fleet_snapshot_sync(user_id="test-user")
    assert snap["geofenceConfigured"] is True
    assert snap["homeLat"] == 38.0
    assert snap["homeLon"] == -122.0
    assert snap["maxAltitudeM"] == 120


def test_snapshot_no_geofence_returns_null_home():
    pool = pool_mod.get_pool()
    obs = _make_observer(connected=True, lat=38.0, lon=-122.0, alt=10.0)
    _register_drone_with_observer(pool, "drone-1", "Drone 1", obs)
    # No geofence set

    snap = ft.fleet_snapshot_sync(user_id="test-user")
    assert snap["geofenceConfigured"] is False
    assert snap["homeLat"] is None
    drone = snap["drones"][0]
    # Without home, x_m / y_m can't be computed
    assert drone["x_m"] is None
    assert drone["y_m"] is None


def test_haversine_xy_m_north_east():
    # Drone north + east of home → x_m > 0, y_m > 0
    x, y = ft._haversine_xy_m(lat=38.001, lon=-121.999, home_lat=38.0, home_lon=-122.0)
    assert x > 80  # ~88 m east
    assert y > 100  # ~111 m north


def test_haversine_xy_m_south_west():
    # Drone south + west of home → x_m < 0, y_m < 0
    x, y = ft._haversine_xy_m(lat=37.999, lon=-122.001, home_lat=38.0, home_lon=-122.0)
    assert x < -80  # ~-88 m west
    assert y < -100  # ~-111 m south


def test_point_in_polygon_simple_square():
    polygon = [(0.0, 0.0), (10.0, 0.0), (10.0, 10.0), (0.0, 10.0)]
    assert ft._point_in_polygon((5, 5), polygon) is True
    assert ft._point_in_polygon((15, 5), polygon) is False
    assert ft._point_in_polygon((-1, 5), polygon) is False
