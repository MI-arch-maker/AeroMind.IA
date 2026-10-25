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
# V5 — import canonical_models so its tables are registered against the
# shared Base.metadata. Without this, `Base.metadata.create_all(engine)`
# does not create the canonical tables (hardware_tokens, lab_sessions, etc.),
# and the new DB-backed token issuance flow fails with "no such table".
from web import canonical_models  # noqa: E402, F401


@pytest.fixture(autouse=True)
def reset_pool_singleton():
    """Each test gets a fresh pool."""
    pool_mod.reset_pool(pool_mod.MavlinkPool())
    # V3.1 — also clear the hardware_gate._tokens store so a token injected
    # by one test (e.g. _inject_real_token) does not leak into the next test.
    from web import hardware_gate
    with hardware_gate._tokens_lock:
        hardware_gate._tokens.clear()
    yield
    pool_mod.reset_pool(None)
    with hardware_gate._tokens_lock:
        hardware_gate._tokens.clear()


@pytest.fixture()
def hardware_enabled(monkeypatch):
    """Force HARDWARE_CONTROL=true for the duration of a test."""
    monkeypatch.setenv("HARDWARE_CONTROL", "true")
    yield
    monkeypatch.delenv("HARDWARE_CONTROL", raising=False)


@pytest.fixture()
def db_session(monkeypatch, tmp_path):
    """Isolated file-based SQLite DB + monkeypatch the global SessionLocal.

    V5 — the canonical ``labbench_auth.issue_hardware_token`` writes to
    ``hardware_tokens`` via the GLOBAL ``web.database.SessionLocal``. A
    per-test ``:memory:`` engine is a different connection → different DB.
    We use a file-based engine AND monkeypatch the global SessionLocal so
    the canonical token path writes to the same DB as the test session.
    """
    db_path = tmp_path / "hw.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    # Patch global web.database singletons so canonical_models writes hit the
    # same test DB.
    from web import database as _db_mod
    monkeypatch.setattr(_db_mod, "engine", engine)
    monkeypatch.setattr(_db_mod, "SessionLocal", Session)
    db = Session()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


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


def _inject_real_token(project_id: str, drone_id: str) -> str:
    """Inject a real signed token into the hardware_gate single-use store.

    V3.1 #1 — HARDWARE_CONTROL=true alone MUST NOT authorize a physical
    transport. The pilot now requires a real token issued by
    hardware_gate.issue_hardware_confirmation_token (which itself requires
    the G0–G5 gate state). Unit tests inject a real token directly into the
    _tokens store so they exercise the full authorize_physical_command
    path without bootstrapping the entire gate state machine.
    """
    from web import hardware_gate
    from web.hardware_gate import HardwareConfirmation
    token = "x" * 64  # 64 chars, looks like a real issued token
    confirmation = HardwareConfirmation(
        token=token,
        project_id=project_id,
        drone_id=drone_id,
        reviewer="independent-reviewer@example.com",
        issued_at=__import__("datetime").datetime.now(__import__("datetime").UTC).isoformat(),
    )
    with hardware_gate._tokens_lock:
        hardware_gate._tokens[token] = confirmation
    return token


def _ok_geofence(params: dict[str, float]) -> dict[str, object]:
    """Geofence validator that always accepts — used for happy-path tests."""
    return {"inside_geofence": True, "reason": "OK"}


def test_pilot_refuses_command_when_hardware_disabled_v31(monkeypatch):
    """V3.1 #1 — HARDWARE_CONTROL=false must refuse even with a valid token +
    project_id + drone_id + actor_id + geofence. This is the primary safety
    gate; nothing else can compensate for it being off."""
    monkeypatch.delenv("HARDWARE_CONTROL", raising=False)
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    token = _inject_real_token("p1", "d1")
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command(
            "NAV_TAKEOFF",
            parameters=cmd.build_takeoff_params(30),
            confirmation_token=token,
            geofence_validation=_ok_geofence,
            project_id="p1",
            drone_id="d1",
            actor_id="u1",
        )
    assert exc_info.value.code == "HARDWARE_DISABLED"


def test_hardware_control_true_alone_does_not_authorize_transport(monkeypatch):
    """V3.1 #1 — the EXIGENCE test. HARDWARE_CONTROL=true alone MUST NEVER
    authorize a physical transport. Even with the env var set, the pilot
    refuses the command if the confirmation token has not been issued by
    hardware_gate (i.e. the G0–G5 gate state was never satisfied).

    This test injects a FAKE token ("x"*64) that was NOT registered in the
    hardware_gate._tokens store. The pilot MUST refuse with TOKEN_INVALID.
    """
    monkeypatch.setenv("HARDWARE_CONTROL", "true")
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command(
            "NAV_TAKEOFF",
            parameters=cmd.build_takeoff_params(30),
            confirmation_token="x" * 64,  # valid shape, but NOT in _tokens
            geofence_validation=_ok_geofence,
            project_id="p1",
            drone_id="d1",
            actor_id="u1",
        )
    assert exc_info.value.code in {"TOKEN_INVALID", "CONFIRMATION_TOKEN_INVALID"}


def test_hardware_control_true_alone_no_geofence_refused(monkeypatch):
    """V3.1 #1 — even with HARDWARE_CONTROL=true + valid token, navigation
    commands WITHOUT a geofence_validator are refused (fail-closed)."""
    monkeypatch.setenv("HARDWARE_CONTROL", "true")
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    token = _inject_real_token("p1", "d1")
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command(
            "NAV_TAKEOFF",
            parameters=cmd.build_takeoff_params(30),
            confirmation_token=token,
            geofence_validation=None,  # MISSING — fail-closed
            project_id="p1",
            drone_id="d1",
            actor_id="u1",
        )
    assert exc_info.value.code == "GEOFENCE_REQUIRED"


def test_token_project_drone_mismatch_refused(monkeypatch):
    """V3.1 #1 — a valid token issued for (p1, d1) MUST NOT be usable for
    a command targeting (p2, d2). SEC-02 isolation."""
    monkeypatch.setenv("HARDWARE_CONTROL", "true")
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    token = _inject_real_token("p1", "d1")  # bound to (p1, d1)
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command(
            "NAV_TAKEOFF",
            parameters=cmd.build_takeoff_params(30),
            confirmation_token=token,
            geofence_validation=_ok_geofence,
            project_id="p2",  # WRONG project — token is for p1
            drone_id="d2",  # WRONG drone
            actor_id="u1",
        )
    assert exc_info.value.code in {"TOKEN_PROJECT_MISMATCH", "TOKEN_DRONE_MISMATCH"}


def test_token_replay_refused(monkeypatch):
    """V3.1 #1 — single-use tokens cannot be replayed. The second call MUST
    fail with TOKEN_ALREADY_USED."""
    monkeypatch.setenv("HARDWARE_CONTROL", "true")
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    token = _inject_real_token("p1", "d1")
    # First call consumes the token (geofence accepts, command sent)
    receipt = pilot.send_command(
        "NAV_TAKEOFF",
        parameters=cmd.build_takeoff_params(30),
        confirmation_token=token,
        geofence_validation=_ok_geofence,
        project_id="p1",
        drone_id="d1",
        actor_id="u1",
    )
    assert receipt.accepted is True
    # Second call with the SAME token MUST fail (single-use)
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command(
            "NAV_TAKEOFF",
            parameters=cmd.build_takeoff_params(30),
            confirmation_token=token,
            geofence_validation=_ok_geofence,
            project_id="p1",
            drone_id="d1",
            actor_id="u1",
        )
    assert exc_info.value.code == "TOKEN_ALREADY_USED"


def test_pilot_refuses_command_not_on_allowlist(hardware_enabled):
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command(
            "MAV_CMD_DO_SOMETHING_WEIRD",
            parameters={},
            confirmation_token="x" * 32,
            project_id="p1",
            drone_id="d1",
            actor_id="u1",
        )
    assert exc_info.value.code == "COMMAND_NOT_ALLOWED"


def test_pilot_refuses_short_confirmation_token(hardware_enabled):
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command(
            "NAV_TAKEOFF",
            parameters={"p7": 30},
            confirmation_token="short",
            project_id="p1",
            drone_id="d1",
            actor_id="u1",
            # No geofence_validation — Gate 3a (token length) rejects first.
        )
    assert exc_info.value.code == "CONFIRMATION_TOKEN_INVALID"


def test_pilot_refuses_mode_not_on_allowlist(hardware_enabled):
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: FakeConnection())
    token = _inject_real_token("p1", "d1")
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pilot.send_command(
            "DO_SET_MODE",
            parameters={"mode": 999},
            confirmation_token=token,
            project_id="p1",
            drone_id="d1",
            actor_id="u1",
        )
    assert exc_info.value.code == "MODE_NOT_ALLOWED"


def test_pilot_sends_takeoff_when_everything_ok(hardware_enabled):
    fake = FakeConnection()
    pilot = cmd.MavlinkCommandPilot("udpout:127.0.0.1:14550", connection_factory=lambda url: fake)
    token = _inject_real_token("p1", "d1")
    receipt = pilot.send_command(
        "NAV_TAKEOFF",
        parameters=cmd.build_takeoff_params(30),
        confirmation_token=token,
        geofence_validation=_ok_geofence,
        project_id="p1",
        drone_id="d1",
        actor_id="u1",
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
    token = _inject_real_token("p1", "d1")
    receipt = pilot.send_command(
        "NAV_TAKEOFF",
        parameters=cmd.build_takeoff_params(30),
        confirmation_token=token,
        geofence_validation=_ok_geofence,
        project_id="p1",
        drone_id="d1",
        actor_id="u1",
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
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550", owner_id="u1", project_id="p1")
    pool.register("drone-2", "Drone 2", "udpout:127.0.0.1:14551", owner_id="u1", project_id="p1")
    assert pool.size() == 2
    entries = pool.list(owner_id="u1", project_id="p1")
    assert {e["droneId"] for e in entries} == {"drone-1", "drone-2"}
    # Inter-tenant isolation — another tenant cannot see these drones
    other_entries = pool.list(owner_id="u2", project_id="p2")
    assert other_entries == []


def test_pool_idempotent_register(hardware_enabled):
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd.MavlinkCommandPilot(url, connection_factory=lambda u: FakeConnection()),
        observer_factory=lambda url: type("O", (), {"close": lambda self: None})(),
    )
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550", owner_id="u1", project_id="p1")
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550", owner_id="u1", project_id="p1")
    assert pool.size() == 1
    # Cross-tenant idempotent re-register must fail (SEC-02 isolation)
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550", owner_id="u2", project_id="p2")
    assert exc_info.value.code == "FORBIDDEN"


def test_pool_caps_at_max(hardware_enabled):
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd.MavlinkCommandPilot(url, connection_factory=lambda u: FakeConnection()),
        observer_factory=lambda url: type("O", (), {"close": lambda self: None})(),
    )
    for i in range(pool_mod.MAX_POOL_SIZE):
        pool.register(f"drone-{i}", f"Drone {i}", f"udpout:127.0.0.1:{14550 + i}", owner_id="u1", project_id="p1")
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pool.register("drone-overflow", "Drone overflow", "udpout:127.0.0.1:14600", owner_id="u1", project_id="p1")
    assert exc_info.value.code == "POOL_FULL"


def test_pool_unregister(hardware_enabled):
    pool = pool_mod.MavlinkPool(
        pilot_factory=lambda url: cmd.MavlinkCommandPilot(url, connection_factory=lambda u: FakeConnection()),
        observer_factory=lambda url: type("O", (), {"close": lambda self: None})(),
    )
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550", owner_id="u1", project_id="p1")
    assert pool.unregister("drone-1", owner_id="u1", project_id="p1") is True
    assert pool.size() == 0
    assert pool.unregister("drone-1", owner_id="u1", project_id="p1") is False  # already removed
    # Cross-tenant unregister must NOT remove another tenant's drone
    pool.register("drone-2", "Drone 2", "udpout:127.0.0.1:14550", owner_id="u1", project_id="p1")
    with pytest.raises(cmd.HardwareCommandError) as exc_info:
        pool.unregister("drone-2", owner_id="u2", project_id="p2")
    assert exc_info.value.code == "FORBIDDEN"


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
    # P0-01 fix — use the test-only cache injector so this test does not
    # require a DB session. Production callers MUST use ``set_geofence`` with
    # a real owner_id which writes to GeofenceRecord (SEC-04).
    geo.set_geofence_for_testing(gf)
    fetched = geo.get_geofence("test-1")
    assert fetched is not None
    assert fetched.project_id == "test-1"
    assert len(fetched.polygon) == 3
    assert geo.clear_geofence_cache_for_testing() is None
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
    pool.register("drone-1", "Drone 1", "udpout:127.0.0.1:14550", owner_id="u1", project_id="p1")
    pool.register("drone-2", "Drone 2", "udpout:127.0.0.1:14551", owner_id="u1", project_id="p1")
    # V3.1 #4 — e-stop is owner-scoped so a tenant only lands its own drones
    result = geo.emergency_stop_all(pool, owner_id="u1", project_id="p1")
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
    # V5 — sign_hardware_review now requires an authenticated reviewer_session.
    # Build a stub step-up session bound to a different user_id.
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    reviewer_session = StepUpSession(
        session_id="sess-test-reviewer",
        user_id="reviewer-001",  # different from user["id"]
        project_id=project_id,
        drone_id=None,
        revision_id=None,
        assurance_level="step-up",
        scope=frozenset({"approver"}),
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.sign_hardware_review(db_session, user, project_id, {
            "reviewer": "reviewer@example.com",
            "reviewToken": "x" * 16,
        }, reviewer_session=reviewer_session)
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
    # V5 — sign with an authenticated reviewer_session (different user_id).
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    reviewer_session = StepUpSession(
        session_id="sess-test-reviewer",
        user_id="reviewer-001",  # different from user["id"]
        project_id=project_id,
        drone_id=None,
        revision_id=None,
        assurance_level="step-up",
        scope=frozenset({"approver"}),
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    sign = hw_gate.sign_hardware_review(db_session, user, project_id, {
        "note": "Revue indépendante authentifiée (V5).",
    }, reviewer_session=reviewer_session)
    assert sign["signedOff"] is True
    assert sign["reviewerId"] == "reviewer-001"
    state = hw_gate.hardware_gate_state(db_session, user, project_id)
    assert state["conditions"]["hardware_review_signed"] is True


def test_hardware_review_rejects_unauthenticated_reviewer(db_session):
    """V5 R-01 — without an authenticated reviewer_session, the sign is rejected."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.sign_hardware_review(db_session, user, project_id, {
            "reviewer": "reviewer@example.com",
            "reviewToken": "x" * 16,
        })  # No reviewer_session — V5 requires it
    assert exc_info.value.code == "REVIEWER_SESSION_REQUIRED"


def test_hardware_review_rejects_reviewer_equals_operator(db_session):
    """V5 R-01 / IAM-03 — the reviewer MUST be a different user_id from the operator."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    same_user_session = StepUpSession(
        session_id="sess-same-user",
        user_id=user["id"],  # SAME as operator — must be rejected
        project_id=project_id,
        drone_id=None,
        revision_id=None,
        assurance_level="step-up",
        scope=frozenset({"approver"}),
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.sign_hardware_review(db_session, user, project_id, {}, reviewer_session=same_user_session)
    assert exc_info.value.code == "REVIEWER_MUST_DIFFER"


def test_hardware_review_rejects_reviewer_missing_approver_role(db_session):
    """V5 R-01 — the reviewer_session MUST carry the 'approver' role."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    analyst_session = StepUpSession(
        session_id="sess-analyst",
        user_id="analyst-001",
        project_id=project_id,
        drone_id=None,
        revision_id=None,
        assurance_level="step-up",
        scope=frozenset({"analyst"}),  # no 'approver' role
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.sign_hardware_review(db_session, user, project_id, {}, reviewer_session=analyst_session)
    assert exc_info.value.code == "REVIEWER_ROLE_REQUIRED"


def test_hardware_review_rejects_reviewer_wrong_project(db_session):
    """V5 R-01 / SEC-02 — the reviewer MUST be bound to the same project."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    other_project_session = StepUpSession(
        session_id="sess-other-project",
        user_id="reviewer-002",
        project_id="other-project-id",  # different project — must be rejected
        drone_id=None,
        revision_id=None,
        assurance_level="step-up",
        scope=frozenset({"approver"}),
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.sign_hardware_review(db_session, user, project_id, {}, reviewer_session=other_project_session)
    assert exc_info.value.code == "REVIEWER_PROJECT_MISMATCH"


def test_hardware_review_rejects_expired_reviewer_session(db_session):
    """V5 R-01 — expired reviewer_session is rejected."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    expired_session = StepUpSession(
        session_id="sess-expired",
        user_id="reviewer-001",
        project_id=project_id,
        drone_id=None,
        revision_id=None,
        assurance_level="step-up",
        scope=frozenset({"approver"}),
        expires_at=datetime.now(UTC) - timedelta(minutes=1),  # expired
    )
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.sign_hardware_review(db_session, user, project_id, {}, reviewer_session=expired_session)
    assert exc_info.value.code == "REVIEWER_SESSION_EXPIRED"


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
    # V5 — sign with an authenticated reviewer_session (different user_id).
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    reviewer_session = StepUpSession(
        session_id="sess-test-reviewer",
        user_id="reviewer-001",
        project_id=project_id,
        drone_id=None,
        revision_id=None,
        assurance_level="step-up",
        scope=frozenset({"approver"}),
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    hw_gate.sign_hardware_review(db_session, user, project_id, {
        "note": "Revue indépendante authentifiée (V5).",
    }, reviewer_session=reviewer_session)
    # Manually flip the drone_registered_in_pool condition.
    row, data, _ = hw_gate._ensure_hardware_gate_state(db_session, _require_project_owner_helper(db_session, user, project_id), user)
    data["conditions"]["drone_registered_in_pool"] = True
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db_session.commit()

    # V5 — issue now requires command + params (DB-persisted token with HMAC).
    issued = hw_gate.issue_hardware_confirmation_token(
        db_session, user, project_id, drones[0].id,
        command="NAV_TAKEOFF",
        params={"p7": 30.0},
    )
    assert issued["token"] and "." in issued["token"], "V5 token must be 'token_id.signature'"
    assert issued["reviewerId"] == "reviewer-001"
    assert issued["singleUse"] is True
    # Consume it.
    confirmation = hw_gate.consume_hardware_confirmation_token(issued["token"], "NAV_TAKEOFF")
    assert confirmation.consumed is True
    assert confirmation.command == "NAV_TAKEOFF"
    assert confirmation.project_id == project_id
    assert confirmation.drone_id == drones[0].id
    # Second use fails (single-use enforcement at DB level).
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.consume_hardware_confirmation_token(issued["token"], "NAV_TAKEOFF")
    assert exc_info.value.code == "TOKEN_ALREADY_USED"


def test_token_signature_tampering_rejected(db_session):
    """V5 R-02 — modifying the token's signature part MUST be rejected."""
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
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    reviewer_session = StepUpSession(
        session_id="sess-test-reviewer",
        user_id="reviewer-001",
        project_id=project_id, drone_id=None, revision_id=None,
        assurance_level="step-up", scope=frozenset({"approver"}),
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    hw_gate.sign_hardware_review(db_session, user, project_id, {}, reviewer_session=reviewer_session)
    row, data, _ = hw_gate._ensure_hardware_gate_state(db_session, _require_project_owner_helper(db_session, user, project_id), user)
    data["conditions"]["drone_registered_in_pool"] = True
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db_session.commit()
    issued = hw_gate.issue_hardware_confirmation_token(
        db_session, user, project_id, drones[0].id,
        command="NAV_TAKEOFF", params={"p7": 30.0},
    )
    # Tamper with the signature part — flip a few chars.
    token_id, signature = issued["token"].split(".", 1)
    tampered_sig = ("0" if signature[0] != "0" else "1") + signature[1:]
    tampered_token = f"{token_id}.{tampered_sig}"
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.consume_hardware_confirmation_token(tampered_token, "NAV_TAKEOFF")
    assert exc_info.value.code == "TOKEN_SIGNATURE_INVALID"


def test_token_wrong_command_rejected(db_session):
    """V5 R-02 — a token issued for NAV_TAKEOFF cannot be consumed for NAV_LAND."""
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
    from web.labbench_auth import StepUpSession
    from datetime import UTC, datetime, timedelta
    reviewer_session = StepUpSession(
        session_id="sess-test-reviewer",
        user_id="reviewer-001",
        project_id=project_id, drone_id=None, revision_id=None,
        assurance_level="step-up", scope=frozenset({"approver"}),
        expires_at=datetime.now(UTC) + timedelta(minutes=15),
    )
    hw_gate.sign_hardware_review(db_session, user, project_id, {}, reviewer_session=reviewer_session)
    row, data, _ = hw_gate._ensure_hardware_gate_state(db_session, _require_project_owner_helper(db_session, user, project_id), user)
    data["conditions"]["drone_registered_in_pool"] = True
    row.data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    db_session.commit()
    issued = hw_gate.issue_hardware_confirmation_token(
        db_session, user, project_id, drones[0].id,
        command="NAV_TAKEOFF", params={"p7": 30.0},
    )
    # Try to consume with a DIFFERENT command — must be rejected.
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.consume_hardware_confirmation_token(issued["token"], "NAV_LAND")
    assert exc_info.value.code == "TOKEN_COMMAND_MISMATCH"


def test_consume_invalid_token_raises():
    with pytest.raises(lb.LabBenchError) as exc_info:
        hw_gate.consume_hardware_confirmation_token("invalid-token", "NAV_TAKEOFF")
    assert exc_info.value.code == "TOKEN_INVALID"


def _require_project_owner_helper(db, user, project_id):
    """Helper — pull the project record."""
    record = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == user["id"]))
    return record
