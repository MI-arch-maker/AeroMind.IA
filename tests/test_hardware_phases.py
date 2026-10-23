"""Tests for the hardware phases A-D (MAVLink pilot, pool, geofence, gate N4 HW).

These tests run without pymavlink installed — they inject a fake connection
factory so no socket is opened. The HARDWARE_CONTROL env var is monkeypatched
to "true" for the gate tests.
"""

from __future__ import annotations

import json
import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")

from web.database import Base  # noqa: E402
from web import mavlink_command_api as cmd  # noqa: E402
from web import mavlink_pool as pool_mod  # noqa: E402
from web import geofence_validator as geo  # noqa: E402
from web import hardware_gate as hw_gate  # noqa: E402
from web import labbench as lb  # noqa: E402
from web.models import Drone, Project, User  # noqa: E402
from sqlalchemy import select  # noqa: E402


@pytest.fixture(autouse=True)
def reset_pool_singleton():
    """Each test gets a fresh pool."""
    pool_mod.reset_pool(pool_mod.MavlinkPool())
    yield
    pool_mod.reset_pool(None)


@pytest.fixture()
def hardware_enabled(monkeypatch):
    """Force HARDWARE_CONTROL=true for the duration of a test."""
    monkeypatch.setenv("HARDWARE_CONTROL", "true")
    yield
    monkeypatch.delenv("HARDWARE_CONTROL", raising=False)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def _make_user_project_drones(db, n_drones: int = 1):
    user_id = f"user-{uuid4()}"
    db.add(User(id=user_id, email=f"{user_id}@example.com"))
    db.flush()
    project_id = str(uuid4())
    db.add(Project(id=project_id, user_id=user_id, name="Projet HW", data_json="{}"))
    db.flush()
    drones = []
    for i in range(n_drones):
        drone_id = str(uuid4())
        drone = Drone(
            id=drone_id,
            user_id=user_id,
            project_id=project_id,
            name=f"Drone HW {i + 1}",
            config_json=json.dumps({"airframe": "multirotor"}),
        )
        db.add(drone)
        drones.append(drone)
    db.commit()
    user = {"id": user_id, "role": "user"}
    return user, project_id, drones


# ===========================================================================
# Phase A — MavlinkCommandPilot
# ===========================================================================

class FakeConnection:
    def __init__(self):
        self.sent = []
    def command_long_send(self, target_system, target_component, cmd_id, confirmation, *params):
        self.sent.append((target_system, target_component, cmd_id, confirmation, list(params)))
    def close(self):
        pass


def test_pilot_refuses_command_when_hardware_disabled(monkeypatch):
    monkeypatch.delenv("HARDWARE_CONTROL", raising=False)
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command("NAV_TAKEOFF", parameters={"p7": 30}, confirmation_token="x" * 32)
    assert exc_info.value.code == "HARDWARE_DISABLED"


def test_pilot_refuses_command_not_on_allowlist(hardware_enabled):
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command("MAV_CMD_DO_SOMETHING_WEIRD", parameters={}, confirmation_token="x" * 32)
    assert exc_info.value.code == "COMMAND_NOT_ALLOWED"


def test_pilot_refuses_short_confirmation_token(hardware_enabled):
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command("NAV_TAKEOFF", parameters={"p7": 30}, confirmation_token="short")
    assert exc_info.value.code == "CONFIRMATION_TOKEN_INVALID"


def test_pilot_refuses_mode_not_on_allowlist(hardware_enabled):
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command("DO_SET_MODE", parameters={"mode": 999}, confirmation_token="x" * 32)
    assert exc_info.value.code == "MODE_NOT_ALLOWED"


def test_pilot_sends_takeoff_when_everything_ok(hardware_enabled):
    fake = FakeConnection()
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: fake)
    receipt = pilot.send_command(
        "NAV_TAKEOFF",
        parameters=cmd.build_takeoff_params(30),
        confirmation_token="x" * 32,
    )
    assert receipt.accepted is True
    assert receipt.sent_to_hardware is True
    assert receipt.command == "NAV_TAKEOFF"
    assert len(fake.sent) == 1
    # Check that the command id is 22 (NAV_TAKEOFF)
    assert fake.sent[0][2] == 22


def test_pilot_handles_transport_failure_gracefully(hardware_enabled):
    class BrokenConnection:
        def command_long_send(self, *args, **kwargs):
            raise OSError("Connection lost")
        def close(self): pass
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: BrokenConnection())
    receipt = pilot.send_command(
        "NAV_TAKEOFF",
        parameters=cmd.build_takeoff_params(30),
        confirmation_token="x" * 32,
    )
    assert receipt.accepted is False
    assert receipt.sent_to_hardware is False
    assert "Échec d'envoi MAVLink" in receipt.reason


def test_takeoff_altitude_bounds():
    with pytest.raises(cmd.HardwareCommandError):
        cmd.build_takeoff_params(0.1)  # below min
    with pytest.raises(cmd.HardwareCommandError):
        cmd.build_takeoff_params(200)  # above EASA Open max


# ===========================================================================
# Phase B — MavlinkPool
# ===========================================================================

def test_pool_register_and_list(hardware_enabled):
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd.MavlinkCommandPilot(url, connection_factory=lambda u: FakeConnection()),
        observer_factory=lambda url: type("O", (), {"close": lambda self: None})(),
    )
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550")
    pool.register("drone-2", "Drone 2", "udpout:127.0.0.1:14551")
    assert pool.size() == 2
    entries = pool.list()
    assert {e["droneId"] for e in entries} == {"drone-1", "drone-2"}


def test_pool_idempotent_register(hardware_enabled):
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd.MavlinkCommandPilot(url, connection_factory=lambda u: FakeConnection()),
        observer_factory=lambda url: type("O", (), {"close": lambda self: None})(),
    )
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550")
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550")
    assert pool.size() == 1


def test_pool_caps_at_max(hardware_enabled):
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd.MavlinkCommandPilot(url, connection_factory=lambda u: FakeConnection()),
        observer_factory=lambda url: type("O", (), {"close": lambda self: None})(),
    )
    for i in range(pool_mod.MAX_POOL_SIZE):
        pool.register(f"drone-{i}", f"Drone {i}", f"udpout:127.0.0.1:{14550 + i}")
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pool.register("drone-overflow", "Drone overflow", "udpout:127.0.0.1:14600")
    assert exc_info.value.code == "POOL_FULL"


def test_pool_unregister(hardware_enabled):
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd.MavlinkCommandPilot(url, connection_factory=lambda u: FakeConnection()),
        observer_factory=lambda url: type("O", (), {"close": lambda self: None})(),
    )
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550")
    assert pool.unregister("drone-1") is True
    assert pool.size() == 0
    assert pool.unregister("drone-1") is False  # already removed


def test_pool_pilot_for_unknown_drone_raises(hardware_enabled):
    pool = pool_mod.MavlinkPool()
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pool.pilot("unknown-drone")
    assert exc_info.value.code == "DRONE_NOT_REGISTERED"


# ===========================================================================
# Phase C — Geofence + E-stop
# ===========================================================================

def test_geofence_fails_closed_when_no_geofence(hardware_enabled):
    result = geo.validate_command_geofence({"p7": 30}, geofence=None)
    assert result["inside_geofence"] is False
    assert "fail-closed" in result["reason"]


def test_geofence_rejects_altitude_above_max(hardware_enabled):
    gf = geo.Geofence(project_id="p1", max_altitude_m=100)
    result = geo.validate_command_geofence({"p7": 150}, gf)
    assert result["inside_geofence"] is False
    assert "Altitude" in result["reason"]


def test_geofence_rejects_outside_polygon(hardware_enabled):
    gf = geo.Geofence(
        project_id="p1",
        polygon=[(48.0, 2.0), (48.1, 2.0), (48.1, 2.1), (48.0, 2.1)],
    )
    # Position at (40, 0) is far outside the polygon
    result = geo.validate_command_geofence({"p5": 40.0, "p6": 0.0}, gf)
    assert result["inside_geofence"] is False
    assert "hors polygone" in result["reason"]


def test_geofence_accepts_inside_polygon(hardware_enabled):
    gf = geo.Geofence(
        project_id="p1",
        polygon=[(48.0, 2.0), (48.1, 2.0), (48.1, 2.1), (48.0, 2.1)],
    )
    result = geo.validate_command_geofence({"p5": 48.05, "p6": 2.05}, gf)
    assert result["inside_geofence"] is True


def test_geofence_rejects_when_hardware_disabled(monkeypatch):
    monkeypatch.delenv("HARDWARE_CONTROL", raising=False)
    gf = geo.Geofence(project_id="p1")
    result = geo.validate_command_geofence({"p7": 30}, gf)
    assert result["inside_geofence"] is False
    assert "HARDWARE_CONTROL" in result["reason"]


def test_geofence_storage_roundtrip():
    gf = geo.Geofence(project_id="test-1", polygon=[(48.0, 2.0), (48.1, 2.0), (48.1, 2.1)])
    geo.set_geofence(gf)
    fetched = geo.get_geofence("test-1")
    assert fetched is not None
    assert fetched.project_id == "test-1"
    assert len(fetched.polygon) == 3
    assert geo.clear_geofence("test-1") is True
    assert geo.get_geofence("test-1") is None


def test_emergency_stop_no_op_when_hardware_disabled(monkeypatch):
    monkeypatch.delenv("HARDWARE_CONTROL", raising=False)
    pool = pool_mod.MavlinkPool()
    result = geo.emergency_stop_all(pool)
    assert result["stopped"] is False
    assert "HARDWARE_CONTROL" in result["reason"]


def test_emergency_stop_sends_land_to_each_drone(hardware_enabled):
    fake_conns = []
    def fake_factory(url):
        conn = FakeConnection()
        fake_conns.append(conn)
        return conn
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd.MavlinkCommandPilot(url, connection_factory=fake_factory),
        observer_factory=lambda url: type("O", (), {"close": lambda self: None})(),
    )
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550")
    pool.register("drone-2", "Drone 2", "udpout:127.0.0.1:14551")
    result = geo.emergency_stop_all(pool)
    assert result["stopped"] is True
    assert len(result["results"]) == 2
    # Each drone received a NAV_LAND (cmd_id 21)
    for conn in fake_conns:
        assert len(conn.sent) == 1
        assert conn.sent[0][2] == 21


# ===========================================================================
# Phase D — Hardware N4 gate
# ===========================================================================

def test_hardware_gate_starts_with_all_conditions_false(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    state = hw_gate.hardware_gate_state(db_session, user, project_id)
    assert state["conditions"]["virtual_n3_armed"] is False
    assert state["conditions"]["hardware_review_signed"] is False
    assert state["conditions"]["drone_registered_in_pool"] is False
    assert state["physicalOutputEnabled"] is False


def test_hardware_review_requires_virtual_n3_armed(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.sign_hardware_review(db_session, user, project_id, {
            "reviewer": "reviewer@example.com",
            "reviewToken": "x" * 16,
        })
    assert exc_info.value.code == "GATE_NOT_READY"


def test_hardware_review_full_flow(db_session):
    """Bootstrap a project with N3 armed, then sign the hardware review."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    # Bootstrap registry + N2 run + checklist + arm
    lb.seed_registry(db_session, user, project_id)
    lb.run_fleet_simulation(db_session, user, project_id, {
        "scenarios": [{"droneId": drones[0].id, "ambientC": 20, "heaterPowerW": 4, "dutyCycle": 0.4, "thermalResistanceCPerW": 3.2, "durationSeconds": 60, "positionSetpointDeg": 45}],
    })
    lb.complete_hardware_checklist_drone(db_session, user, project_id, drones[0].id, {
        "deviceIdentified": True, "driverValidated": True, "calibrationSimulated": True,
    })
    lb.arm_n3_gate_drone(db_session, user, project_id, drones[0].id, {
        "humanConfirmed": True, "safetyConfirmed": True, "secondOperatorCode": "secret123",
    })
    # Now the hardware gate should see virtual_n3_armed = True.
    state = hw_gate.hardware_gate_state(db_session, user, project_id)
    assert state["conditions"]["virtual_n3_armed"] is True
    # Sign the hardware review (reviewer differs from operator id).
    sign = hw_gate.sign_hardware_review(db_session, user, project_id, {
        "reviewer": "independent-reviewer@example.com",
        "reviewToken": "very-long-review-token-12345",
    })
    assert sign["signedOff"] is True
    state = hw_gate.hardware_gate_state(db_session, user, project_id)
    assert state["conditions"]["hardware_review_signed"] is True


def test_issue_token_requires_all_conditions(db_session):
    """Token issuance fails when conditions are missing."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.issue_hardware_confirmation_token(db_session, user, project_id, drones[0].id)
    assert exc_info.value.code == "GATE_NOT_READY"


def test_issue_and_consume_token(db_session):
    """Full flow: arm N3 → sign HW review → register drone → issue token → consume."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    lb.seed_registry(db_session, user, project_id)
    lb.run_fleet_simulation(db_session, user, project_id, {
        "scenarios": [{"droneId": drones[0].id, "ambientC": 20, "heaterPowerW": 4, "dutyCycle": 0.4, "thermalResistanceCPerW": 3.2, "durationSeconds": 60, "positionSetpointDeg": 45}],
    })
    lb.complete_hardware_checklist_drone(db_session, user, project_id, drones[0].id, {
        "deviceIdentified": True, "driverValidated": True, "calibrationSimulated": True,
    })
    lb.arm_n3_gate_drone(db_session, user, project_id, drones[0].id, {
        "humanConfirmed": True, "safetyConfirmed": True, "secondOperatorCode": "secret123",
    })
    hw_gate.sign_hardware_review(db_session, user, project_id, {
        "reviewer": "reviewer@example.com",
        "reviewToken": "very-long-review-token-12345",
    })
    # Manually flip the drone_registered_in_pool condition.
    row, data, _ = hw_gate._ensure_hardware_gate_state(db_session, _require_project_owner_helper(db_session, user, project_id), user)
    data["conditions"]["drone_registered_in_pool"] = True
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db_session.commit()

    issued = hw_gate.issue_hardware_confirmation_token(db_session, user, project_id, drones[0].id)
    assert issued["token"] and len(issued["token"]) >= 32
    # Consume it.
    confirmation = hw_gate.consume_hardware_confirmation_token(issued["token"], "NAV_TAKEOFF")
    assert confirmation.consumed is True
    assert confirmation.command == "NAV_TAKEOFF"
    # Second use fails.
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.consume_hardware_confirmation_token(issued["token"], "NAV_TAKEOFF")
    assert exc_info.value.code == "TOKEN_ALREADY_USED"


def test_consume_invalid_token_raises():
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.consume_hardware_confirmation_token("invalid-token", "NAV_TAKEOFF")
    assert exc_info.value.code == "TOKEN_INVALID"


def _require_project_owner_helper(db, user, project_id):
    """Helper — pull the project record."""
    record = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == user["id"]))
    return record
