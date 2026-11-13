from __future__ import annotations

import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "i" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")

from web.database import Base
from web.models import Project, User
from web.institutional_gates import (
    InstitutionalGateError,
    create_request,
    decide_gate,
    decide_gate_05,
    execute_in_simulation,
    request_view,
    verify_transmission,
)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    db = Session()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


@pytest.fixture()
def project(db_session):
    user = User(id="operator-1", email="operator@example.test")
    db_session.add(user)
    db_session.add(User(id="gate-01", email="g1@example.test"))
    db_session.add(User(id="gate-02", email="g2@example.test"))
    db_session.add(User(id="gate-03", email="g3@example.test"))
    db_session.add(User(id="gate-04", email="g4@example.test"))
    db_session.add(User(id="super-admin", email="super@example.test"))
    project = Project(id=str(uuid4()), user_id=user.id, name="Institutionnel", data_json="{}")
    db_session.add(project)
    db_session.commit()
    return project


def _request(db_session, project):
    request = create_request(
        db_session,
        project_id=project.id,
        requester_id="operator-1",
        requester_role="operator",
        virtual_command="simulation-arm",
        parameters={"throttle": 0.25},
    )
    db_session.commit()
    return request


def test_simulation_stays_available_before_gate_05(db_session, project):
    request = _request(db_session, project)
    execute_in_simulation(db_session, request_id=request.id, actor_id="operator-1", actor_role="operator")
    db_session.commit()
    view = request_view(db_session, request)
    assert view["simulationOnly"] is True
    assert view["physicalOutputEnabled"] is False
    assert any(event["eventType"] == "institutional.simulation.executed" for event in view["events"])


def test_gate_roles_are_explicit_and_sequential(db_session, project):
    request = _request(db_session, project)
    with pytest.raises(InstitutionalGateError) as denied:
        decide_gate(db_session, request_id=request.id, gate="GATE_01", decision="approve", actor_id="operator-1", actor_roles={"approver"})
    assert denied.value.code == "INSTITUTIONAL_ROLE_REQUIRED"
    with pytest.raises(InstitutionalGateError) as skipped:
        decide_gate(db_session, request_id=request.id, gate="GATE_02", decision="approve", actor_id="gate-02", actor_roles={"gate_02_reviewer"})
    assert skipped.value.code == "INSTITUTIONAL_SEQUENCE_REQUIRED"


def test_full_transmission_and_super_admin_decision_never_authorizes_hardware(db_session, project):
    request = _request(db_session, project)
    for gate, actor, role in (
        ("GATE_01", "gate-01", "gate_01_reviewer"),
        ("GATE_02", "gate-02", "gate_02_reviewer"),
        ("GATE_03", "gate-03", "gate_03_reviewer"),
    ):
        decide_gate(db_session, request_id=request.id, gate=gate, decision="approve", actor_id=actor, actor_roles={role})
    _, transmission = decide_gate(db_session, request_id=request.id, gate="GATE_04", decision="approve", actor_id="gate-04", actor_roles={"gate_04_reviewer"})
    assert transmission and transmission.startswith("AM-TR-")
    with pytest.raises(InstitutionalGateError) as invalid:
        verify_transmission(db_session, request_id=request.id, transmission_code="AM-TR-tampered", actor_id="super-admin", actor_roles={"super_admin"})
    assert invalid.value.code == "TRANSMISSION_INVALID"
    # The valid check is repeated deliberately: a failed check never turns into an approval.
    verify_transmission(db_session, request_id=request.id, transmission_code=transmission, actor_id="super-admin", actor_roles={"super_admin"})
    decide_gate_05(db_session, request_id=request.id, decision="approve", transmission_code=transmission, actor_id="super-admin", actor_roles={"super_admin"})
    db_session.commit()
    view = request_view(db_session, request)
    assert view["status"] == "approved_gate_05"
    assert view["physicalAuthorizationGranted"] is False
    assert view["physicalOutputEnabled"] is False
    assert any(event["gate"] == "GATE_05" and event["actorRole"] == "super_admin" for event in view["events"])


def test_gate_05_is_not_delegable_to_generic_approver(db_session, project):
    request = _request(db_session, project)
    for gate, actor, role in (
        ("GATE_01", "gate-01", "gate_01_reviewer"),
        ("GATE_02", "gate-02", "gate_02_reviewer"),
        ("GATE_03", "gate-03", "gate_03_reviewer"),
    ):
        decide_gate(db_session, request_id=request.id, gate=gate, decision="approve", actor_id=actor, actor_roles={role})
    _, transmission = decide_gate(db_session, request_id=request.id, gate="GATE_04", decision="approve", actor_id="gate-04", actor_roles={"gate_04_reviewer"})
    with pytest.raises(InstitutionalGateError) as denied:
        decide_gate_05(db_session, request_id=request.id, decision="approve", transmission_code=transmission or "", actor_id="gate-04", actor_roles={"approver"})
    assert denied.value.code == "INSTITUTIONAL_ROLE_REQUIRED"


def test_cumulative_levels_control_gates_and_super_admin_keeps_gate_05(db_session, project):
    request = _request(db_session, project)
    decide_gate(db_session, request_id=request.id, gate="GATE_01", decision="approve", actor_id="l1", actor_roles={"reader"})
    decide_gate(db_session, request_id=request.id, gate="GATE_02", decision="approve", actor_id="l2", actor_roles={"designer"})
    decide_gate(db_session, request_id=request.id, gate="GATE_03", decision="approve", actor_id="l3", actor_roles={"analyst"})
    _, transmission = decide_gate(db_session, request_id=request.id, gate="GATE_04", decision="approve", actor_id="admin", actor_roles={"admin"})
    assert transmission and transmission.startswith("AM-TR-")
    decide_gate_05(db_session, request_id=request.id, decision="approve", transmission_code=transmission, actor_id="super-admin", actor_roles={"super_admin"})
    assert request.status == "approved_gate_05"
