from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException

import web.mavlink_telemetry_api as telemetry_api
import web.ops_control_api as ops_api


class _Observer:
    def __init__(self, last_heartbeat_at):
        self.last_heartbeat_at = last_heartbeat_at

    def poll(self):
        return SimpleNamespace(status="CONNECTED", last_heartbeat_at=self.last_heartbeat_at)


def test_old_heartbeat_past_offline_threshold_is_offline(monkeypatch):
    monkeypatch.setenv("AEROMIND_MAVLINK_HEARTBEAT_TIMEOUT_S", "5")
    observer = _Observer(datetime.now(UTC) - timedelta(seconds=130))
    assert telemetry_api._classify_state(observer) == "offline"


def test_heartbeat_between_stale_and_offline_threshold_is_stale(monkeypatch):
    monkeypatch.setenv("AEROMIND_MAVLINK_HEARTBEAT_TIMEOUT_S", "5")
    observer = _Observer(datetime.now(UTC) - timedelta(seconds=35))
    assert telemetry_api._classify_state(observer) == "stale"


def test_hardware_mode_requires_explicit_project_id(monkeypatch):
    monkeypatch.setattr(ops_api, "current_user_or_401", lambda _request: {"role": "super_admin"})
    monkeypatch.setenv("HARDWARE_CONTROL", "false")
    with pytest.raises(HTTPException) as exc:
        ops_api.set_operation_mode(ops_api.ModeChangeRequest(mode="HARDWARE"), object())
    assert exc.value.status_code == 412
    assert "project_id" in exc.value.detail
    assert __import__("os").environ["HARDWARE_CONTROL"] == "false"


def test_unavailable_gate_store_fails_closed(monkeypatch):
    monkeypatch.setattr(ops_api, "current_user_or_401", lambda _request: {"role": "super_admin"})

    class _BrokenSession:
        def __enter__(self):
            raise RuntimeError("database unavailable")

        def __exit__(self, *_args):
            return False

    monkeypatch.setattr(ops_api, "SessionLocal", _BrokenSession)
    monkeypatch.setenv("HARDWARE_CONTROL", "false")
    body = ops_api.ModeChangeRequest(mode="HARDWARE", project_id="project-a")
    with pytest.raises(HTTPException) as exc:
        ops_api.set_operation_mode(body, object())
    assert exc.value.status_code == 503
    assert __import__("os").environ["HARDWARE_CONTROL"] == "false"


def test_switching_to_sitl_always_disables_hardware_flag(monkeypatch):
    monkeypatch.setattr(ops_api, "current_user_or_401", lambda _request: {"role": "super_admin", "email": "test"})
    monkeypatch.setenv("HARDWARE_CONTROL", "true")
    ops_api.set_operation_mode(ops_api.ModeChangeRequest(mode="SITL"), object())
    assert __import__("os").environ["HARDWARE_CONTROL"] == "false"
    assert __import__("os").environ["AEROMIND_SITL_ACTIVE"] == "true"
