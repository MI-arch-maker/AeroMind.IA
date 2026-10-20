import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sitl_modules.api import router
from sitl_modules.geofence import GeofenceZone, check_point
from sitl_modules.propulsion_model import new_state, step

app = FastAPI()
app.include_router(router)
client = TestClient(app)


def test_injected_overheat_raises_engine_temperature_and_alert():
    state = new_state("piston", 3)
    step(state, 10, 0.8, incidents=["overheat"])
    assert state.cylinder_temp_c > 220
    assert "INCIDENT_SURCHAUFFE_INJECTE" in state.as_dict()["alerts"]


def test_fuel_leak_increases_flow_and_fuel_consumption():
    nominal = new_state("piston", 3)
    leaking = new_state("piston", 3)
    step(nominal, 1, 0.5)
    step(leaking, 1, 0.5, incidents=["fuel_leak"])
    assert leaking.fuel_remaining_kg < nominal.fuel_remaining_kg
    assert "FUITE_CARBURANT_INJECTEE" in leaking.as_dict()["alerts"]


def test_hybrid_partial_failure_is_only_valid_for_hybrid():
    state = new_state("hybrid", 3, 500)
    step(state, 1, 0.8, incidents=["hybrid_partial"])
    assert state.battery_remaining_wh > 0
    assert "PANNE_HYBRIDE_PARTIELLE" in state.as_dict()["alerts"]
    with pytest.raises(ValueError):
        step(new_state("piston"), 1, 0.5, incidents=["hybrid_partial"])


def test_fuel_starvation_clamps_remaining_mass_and_flow():
    state = new_state("piston", 0.00001)
    step(state, 10, 1)
    assert state.fuel_remaining_kg == 0
    assert state.fuel_flow_kg_s == 0
    assert "PANNE_SÈCHE" in state.as_dict()["alerts"]


def test_geofence_detects_inside_outside_and_boundary():
    zone = GeofenceZone("z1", ((20, 20), (40, 20), (40, 40), (20, 40)), "Exclusion")
    assert check_point((30, 30), [zone])["inside_restricted_zone"] is True
    assert check_point((10, 10), [zone])["inside_restricted_zone"] is False
    assert check_point((20, 30), [zone])["inside_restricted_zone"] is True


def test_geofence_api_and_propulsion_api_never_enable_hardware():
    fence = client.post("/api/sitl/geofence/check", json={
        "x": 30, "y": 30,
        "zones": [{"zone_id": "z1", "name": "Exclusion", "polygon": [[20, 20], [40, 20], [40, 40], [20, 40]]}],
    })
    engine = client.post("/api/sitl/propulsion/step", json={
        "engine_type": "hybrid", "dt_s": 1, "throttle": 0.5,
        "fuel_capacity_kg": 4, "battery_wh": 100, "incidents": ["hybrid_partial"],
    })
    assert fence.status_code == 200 and fence.json()["inside_restricted_zone"] is True
    assert fence.json()["hardware_control"] is False
    assert engine.status_code == 200
    assert engine.json()["hardware_control"] is False
    assert engine.json()["telemetry_write"] is False
    assert engine.json()["state"]["alerts"]


def test_invalid_geofence_polygon_is_rejected():
    with pytest.raises(ValueError):
        GeofenceZone("bad", ((-1, 0), (1, 0), (1, 1)))
