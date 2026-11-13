import os
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")

import pytest
from fastapi import HTTPException

from web.mission_planner import (
    _validate_upload_waypoint_commands,
    _validate_waypoint_coordinates,
)


def test_wgs84_accepts_boundary_and_optional_draft_pair():
    assert _validate_waypoint_coordinates(-90, -180, 1) == (-90.0, -180.0)
    assert _validate_waypoint_coordinates(90, 180, 2) == (90.0, 180.0)
    assert _validate_waypoint_coordinates(None, None, 3) == (None, None)


@pytest.mark.parametrize(
    "latitude,longitude",
    [
        (90.0001, 0),
        (0, -180.0001),
        (float("nan"), 0),
        (0, float("inf")),
        (None, 2),
        (True, 2),
    ],
)
def test_wgs84_rejects_invalid_pairs(latitude, longitude):
    with pytest.raises(HTTPException) as error:
        _validate_waypoint_coordinates(latitude, longitude, 1)
    assert error.value.status_code == 400


def test_upload_refuses_commands_without_an_exact_mavlink_mapping():
    _validate_upload_waypoint_commands([SimpleNamespace(command="NAV_WAYPOINT")])
    with pytest.raises(HTTPException) as error:
        _validate_upload_waypoint_commands([SimpleNamespace(command="NAV_LAND")])
    assert error.value.status_code == 409
    assert "mapping MAVLink non implémenté" in str(error.value.detail)
