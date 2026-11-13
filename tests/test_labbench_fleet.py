"""Tests for the multi-drone (fleet) support in LabBench 01 v3.

These tests exercise the per-drone gate state and fleet simulation
end-to-end against an in-memory SQLite database, with a fake OIDC user.
"""

from __future__ import annotations

import json
import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Force SQLite in-memory before importing the app modules.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")

from web.database import Base  # noqa: E402
from web import labbench as lb  # noqa: E402
from web.models import Drone, Project, User  # noqa: E402


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


def _make_user_project_drones(db, n_drones: int = 2):
    user_id = f"user-{uuid4()}"
    db.add(User(id=user_id, email=f"{user_id}@example.com"))
    db.flush()
    project_id = str(uuid4())
    db.add(Project(id=project_id, user_id=user_id, name="Projet flotte", data_json="{}"))
    db.flush()
    drones = []
    for i in range(n_drones):
        drone_id = str(uuid4())
        drone = Drone(
            id=drone_id,
            user_id=user_id,
            project_id=project_id,
            name=f"Drone {i + 1}",
            config_json=json.dumps({"airframe": "multirotor", "motor_count": 4}),
        )
        db.add(drone)
        drones.append(drone)
    db.commit()
    user = {"id": user_id, "role": "user"}
    return user, project_id, drones


def test_per_drone_gate_state_starts_all_open(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=2)
    state = lb.per_drone_gate_state(db_session, user, project_id, drones[0].id)
    assert state["droneId"] == drones[0].id
    assert state["droneName"] == "Drone 1"
    # All gates should be pending except N1 which is open
    codes = [g["code"] for g in state["gates"]]
    assert codes == ["N1", "N2", "N3-READY", "N3-ARMED", "N4"]
    assert state["gates"][0]["state"] == "open"
    assert all(g["state"] == "pending" for g in state["gates"][1:])
    assert state["physicalOutputEnabled"] is False
    assert state["physicalCommandsEmitted"] is False


def test_per_drone_gate_state_independent_per_drone(db_session):
    """Arm N3 on drone A — drone B should stay unaffected."""
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=2)
    # Bootstrap the project registry so N1 is passed.
    lb.seed_registry(db_session, user, project_id)
    # Persist N2 runs for both drones via fleet simulation.
    fleet = lb.run_fleet_simulation(db_session, user, project_id, {
        "scenarios": [
            {"droneId": drones[0].id, "ambientC": 20, "heaterPowerW": 4, "dutyCycle": 0.4, "thermalResistanceCPerW": 3.2, "durationSeconds": 60, "positionSetpointDeg": 45},
            {"droneId": drones[1].id, "ambientC": 25, "heaterPowerW": 3, "dutyCycle": 0.3, "thermalResistanceCPerW": 2.5, "durationSeconds": 60, "positionSetpointDeg": 30},
        ],
    })
    assert fleet["fleetSize"] == 2
    assert all(r.get("runId") for r in fleet["results"])
    # Complete hardware checklist for drone A only.
    lb.complete_hardware_checklist_drone(db_session, user, project_id, drones[0].id, {
        "deviceIdentified": True,
        "driverValidated": True,
        "calibrationSimulated": True,
    })
    # Arm drone A.
    arm = lb.arm_n3_gate_drone(db_session, user, project_id, drones[0].id, {
        "humanConfirmed": True,
        "safetyConfirmed": True,
        "secondOperatorCode": "secret123",
    })
    assert arm["armed"] is True
    assert arm["physicalOutputEnabled"] is False
    # Drone A: N3-ARMED passed; Drone B: still N3-READY open.
    state_a = lb.per_drone_gate_state(db_session, user, project_id, drones[0].id)
    state_b = lb.per_drone_gate_state(db_session, user, project_id, drones[1].id)
    gate_a = {g["code"]: g["state"] for g in state_a["gates"]}
    gate_b = {g["code"]: g["state"] for g in state_b["gates"]}
    assert gate_a["N3-ARMED"] == "passed"
    assert gate_b["N3-ARMED"] == "pending"
    assert gate_b["N3-READY"] == "open"  # checklist not completed for B


def test_disarm_drone_resets_only_that_drone(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=2)
    lb.seed_registry(db_session, user, project_id)
    lb.run_fleet_simulation(db_session, user, project_id, {
        "scenarios": [
            {"droneId": drones[0].id, "ambientC": 20, "heaterPowerW": 4, "dutyCycle": 0.4, "thermalResistanceCPerW": 3.2, "durationSeconds": 60, "positionSetpointDeg": 45},
            {"droneId": drones[1].id, "ambientC": 25, "heaterPowerW": 3, "dutyCycle": 0.3, "thermalResistanceCPerW": 2.5, "durationSeconds": 60, "positionSetpointDeg": 30},
        ],
    })
    for d in drones:
        lb.complete_hardware_checklist_drone(db_session, user, project_id, d.id, {
            "deviceIdentified": True, "driverValidated": True, "calibrationSimulated": True,
        })
        lb.arm_n3_gate_drone(db_session, user, project_id, d.id, {
            "humanConfirmed": True, "safetyConfirmed": True, "secondOperatorCode": "secret123",
        })
    # Disarm drone 0 only.
    lb.disarm_n3_gate_drone(db_session, user, project_id, drones[0].id)
    state_a = lb.per_drone_gate_state(db_session, user, project_id, drones[0].id)
    state_b = lb.per_drone_gate_state(db_session, user, project_id, drones[1].id)
    gate_a = {g["code"]: g["state"] for g in state_a["gates"]}
    gate_b = {g["code"]: g["state"] for g in state_b["gates"]}
    assert gate_a["N3-ARMED"] == "open"  # disarmed → open (still ready)
    assert gate_b["N3-ARMED"] == "passed"  # drone B still armed


def test_fleet_gate_state_aggregates_per_drone_states(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=3)
    lb.seed_registry(db_session, user, project_id)
    fleet = lb.fleet_gate_state(db_session, user, project_id)
    assert fleet["fleetSize"] == 3
    assert fleet["maxFleetSize"] == lb.MAX_FLEET_SIZE
    # Project-level gate N1 is "passed" only if passed for ALL drones.
    n1 = next(g for g in fleet["gatesAggregate"] if g["code"] == "N1")
    # registry is project-scoped, so all drones share the same registry → all pass N1.
    assert n1["state"] == "passed"
    # N2 is "open" until at least one drone has archived an N2 run.
    n2 = next(g for g in fleet["gatesAggregate"] if g["code"] == "N2")
    assert n2["state"] == "open"


def test_fleet_simulation_caps_at_max_fleet_size(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=lb.MAX_FLEET_SIZE + 1)
    # Note: too many drones for one project; fleet_gate_state should reject.
    with pytest.raises(lb.LabBenchError) as exc_info:
        lb.fleet_gate_state(db_session, user, project_id)
    assert exc_info.value.code == "FLEET_TOO_LARGE"


def test_fleet_simulation_rejects_unknown_drone_id(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    lb.seed_registry(db_session, user, project_id)
    with pytest.raises(lb.LabBenchError) as exc_info:
        lb.run_fleet_simulation(db_session, user, project_id, {
            "scenarios": [
                {"droneId": "unknown-uuid", "ambientC": 20, "heaterPowerW": 4, "dutyCycle": 0.4, "thermalResistanceCPerW": 3.2, "durationSeconds": 60, "positionSetpointDeg": 45},
            ],
        })
    assert exc_info.value.code == "NOT_FOUND"


def test_fleet_simulation_rejects_physical_output_payload(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    with pytest.raises(lb.LabBenchError) as exc_info:
        lb.run_fleet_simulation(db_session, user, project_id, {
            "physicalOutputEnabled": True,
            "scenarios": [{"droneId": drones[0].id}],
        })
    assert exc_info.value.code == "PHYSICAL_COMMAND_FORBIDDEN"


def test_arm_drone_requires_n3_ready(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    # Try to arm without N3-READY — should fail.
    with pytest.raises(lb.LabBenchError) as exc_info:
        lb.arm_n3_gate_drone(db_session, user, project_id, drones[0].id, {
            "humanConfirmed": True, "safetyConfirmed": True, "secondOperatorCode": "secret123",
        })
    assert exc_info.value.code == "GATE_NOT_READY"


def test_arm_drone_requires_double_confirmation(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    with pytest.raises(lb.LabBenchError) as exc_info:
        lb.arm_n3_gate_drone(db_session, user, project_id, drones[0].id, {
            "humanConfirmed": True, "safetyConfirmed": False, "secondOperatorCode": "secret123",
        })
    assert exc_info.value.code == "ARM_CONFIRMATION_MISSING"


def test_arm_drone_requires_second_operator_code(db_session):
    user, project_id, drones = _make_user_project_drones(db_session, n_drones=1)
    with pytest.raises(lb.LabBenchError) as exc_info:
        lb.arm_n3_gate_drone(db_session, user, project_id, drones[0].id, {
            "humanConfirmed": True, "safetyConfirmed": True, "secondOperatorCode": "short",
        })
    assert exc_info.value.code == "ARM_SECOND_OPERATOR_CODE_REQUIRED"
