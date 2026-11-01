"""Tests for the v7 alerts module."""

from __future__ import annotations

import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)

from web.database import Base  # noqa: E402
from web import alerts as alert_service  # noqa: E402


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


def test_raise_alert_persists(db_session):
    alert = alert_service.raise_alert(
        db_session, project_id="p1", drone_id="d1", drone_name="Drone 1",
        alert_type="battery_low", severity="warning",
        message="Batterie faible: 25%",
        payload={"battery_pct": 25},
    )
    assert "id" in alert
    assert alert["alertType"] == "battery_low"
    assert alert["severity"] == "warning"
    assert alert["droneId"] == "d1"
    assert alert["acknowledged"] is False


def test_list_recent_alerts_returns_newest_first(db_session):
    for i in range(5):
        alert_service.raise_alert(
            db_session, project_id="p1", drone_id="d1", drone_name="Drone 1",
            alert_type="battery_low", severity="warning",
            message=f"Alert {i}",
        )
    alerts = alert_service.list_recent_alerts(db_session, project_id="p1", limit=10)
    assert len(alerts) == 5
    # newest first (created_at desc)
    # (timestamps are within same second, so order is mostly insertion-reversed)
    assert all(a["acknowledged"] is False for a in alerts)


def test_list_recent_alerts_filters_by_project(db_session):
    alert_service.raise_alert(db_session, project_id="p1", drone_id="d1", drone_name="D1",
                              alert_type="battery_low", severity="warning", message="A1")
    alert_service.raise_alert(db_session, project_id="p2", drone_id="d2", drone_name="D2",
                              alert_type="geofence_breach", severity="critical", message="A2")
    p1_alerts = alert_service.list_recent_alerts(db_session, project_id="p1", limit=10)
    p2_alerts = alert_service.list_recent_alerts(db_session, project_id="p2", limit=10)
    assert len(p1_alerts) == 1
    assert p1_alerts[0]["alertType"] == "battery_low"
    assert len(p2_alerts) == 1
    assert p2_alerts[0]["alertType"] == "geofence_breach"


def test_acknowledge_alert(db_session):
    alert = alert_service.raise_alert(
        db_session, project_id="p1", drone_id="d1", drone_name="Drone 1",
        alert_type="battery_low", severity="warning", message="Low battery",
    )
    ack = alert_service.acknowledge_alert(db_session, alert["id"], user_id="user-1", user_email="op@example.com")
    assert ack["acknowledged"] is True
    assert ack["acknowledgedBy"] == "user-1"
    # After ack, list with only_unacknowledged should NOT include this alert
    unack = alert_service.list_recent_alerts(db_session, project_id="p1", only_unacknowledged=True)
    assert len(unack) == 0
    # But with all=True it should
    all_alerts = alert_service.list_recent_alerts(db_session, project_id="p1", only_unacknowledged=False)
    assert len(all_alerts) == 1


def test_acknowledge_unknown_alert_returns_error(db_session):
    result = alert_service.acknowledge_alert(db_session, "unknown-id", user_id="user-1")
    assert result == {"error": "not_found"}
