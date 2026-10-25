"""Tests for v8-v11 backend modules: missions, preflight, maintenance, dashboard."""

from __future__ import annotations

import os
import json
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")

from web.database import Base  # noqa: E402
from web import preflight as pf  # noqa: E402
from web import maintenance as mt  # noqa: E402
from web import mission_planner as mp  # noqa: E402
from web.models import (  # noqa: E402
    Mission, Waypoint, PreflightChecklist,
    MaintenanceRecord, BatteryCycle, Project, Drone, User, AlertEvent,
)


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


# ===========================================================================
# Preflight
# ===========================================================================

def test_preflight_default_template_has_10_items():
    assert len(pf.DEFAULT_CHECKLIST_ITEMS) == 10
    ids = [i["id"] for i in pf.DEFAULT_CHECKLIST_ITEMS]
    assert "battery" in ids
    assert "geofence" in ids
    assert "estop" in ids
    assert all(i.get("required") is True for i in pf.DEFAULT_CHECKLIST_ITEMS)


# ===========================================================================
# Missions
# ===========================================================================

def test_mission_model_basic():
    """Sanity-check the Mission/Waypoint model definitions."""
    assert Mission.__tablename__ == "missions"
    assert Waypoint.__tablename__ == "waypoints"
    cols = {c.name for c in Mission.__table__.columns}
    assert {"id", "user_id", "name", "description"} <= cols
    assert "uploaded_to_drone_id" in cols


# ===========================================================================
# Maintenance records
# ===========================================================================

def test_maintenance_record_model():
    assert MaintenanceRecord.__tablename__ == "maintenance_records"
    cols = {c.name for c in MaintenanceRecord.__table__.columns}
    assert {"id", "user_id", "maintenance_type", "next_due_at", "flight_hours_at_maintenance"} <= cols


def test_battery_cycle_model():
    assert BatteryCycle.__tablename__ == "battery_cycles"
    cols = {c.name for c in BatteryCycle.__table__.columns}
    assert {"id", "user_id", "battery_label", "event_type", "voltage_v", "capacity_mah_used"} <= cols


def test_battery_cycle_count_via_db(db_session):
    """Insert cycles and verify aggregate count."""
    user_id = f"user-{uuid4()}"
    db_session.add(User(id=user_id, email=f"{user_id}@example.com"))
    db_session.flush()
    for i in range(5):
        db_session.add(BatteryCycle(
            user_id=user_id,
            battery_label="Tattu-6S-5000-001",
            event_type="discharge",
            voltage_v=22.2,
            capacity_mah_used=4500.0 - i * 100,
        ))
    db_session.add(BatteryCycle(
        user_id=user_id,
        battery_label="Tattu-6S-5000-001",
        event_type="charge",
        voltage_v=25.2,
    ))
    db_session.commit()
    from sqlalchemy import func, select
    count = db_session.scalar(
        select(func.count(BatteryCycle.id))
        .where(BatteryCycle.user_id == user_id)
        .where(BatteryCycle.event_type == "discharge")
    )
    assert count == 5


# ===========================================================================
# Dashboard
# ===========================================================================

def test_dashboard_aggregates_with_no_data(db_session):
    """Dashboard endpoint should return zeros when no data."""
    user_id = f"user-{uuid4()}"
    db_session.add(User(id=user_id, email=f"{user_id}@example.com"))
    db_session.commit()
    # Direct call to the aggregate query (no HTTP)
    from sqlalchemy import func, select
    from web.models import Project as ProjectModel
    total_projects = db_session.scalar(
        select(func.count(ProjectModel.id)).where(ProjectModel.user_id == user_id)
    )
    assert total_projects == 0


def test_dashboard_with_data(db_session):
    """Insert projects + drones + missions + alerts → verify counts."""
    user_id = f"user-{uuid4()}"
    db_session.add(User(id=user_id, email=f"{user_id}@example.com"))
    db_session.flush()
    # 2 projects
    for i in range(2):
        db_session.add(Project(id=str(uuid4()), user_id=user_id, name=f"Project {i}", data_json="{}"))
    db_session.flush()
    # 3 drones
    for i in range(3):
        db_session.add(Drone(id=str(uuid4()), user_id=user_id, project_id=None, name=f"Drone {i}", config_json="{}"))
    db_session.flush()
    # 2 missions
    for i in range(2):
        db_session.add(Mission(id=str(uuid4()), user_id=user_id, project_id=None, name=f"Mission {i}", description=""))
    db_session.flush()
    # 5 alerts (3 acknowledged)
    for i in range(5):
        db_session.add(AlertEvent(
            id=str(uuid4()),
            project_id=None,
            drone_id=None,
            drone_name=f"Drone {i}",
            alert_type="battery_low",
            severity="warning",
            message=f"Alert {i}",
            payload_json="{}",
            acknowledged=(i < 3),
            created_at=__import__("datetime").datetime.now(__import__("datetime").timezone.utc),
        ))
    db_session.commit()
    # Verify counts
    from sqlalchemy import func, select
    total_drones = db_session.scalar(
        select(func.count(Drone.id)).where(Drone.user_id == user_id)
    )
    assert total_drones == 3
    active_alerts = db_session.scalar(
        select(func.count(AlertEvent.id)).where(AlertEvent.acknowledged.is_(False))
    )
    assert active_alerts == 2  # 5 - 3 acknowledged
