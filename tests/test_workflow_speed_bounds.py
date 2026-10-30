import pytest
from pydantic import ValidationError

from web.workflow import CanonicalConfig


def payload(speed_mps: float) -> dict:
    return {
        "wingspan_m": 3,
        "chord_m": 0.4,
        "fuselage_length_m": 1.5,
        "propeller_diameter_m": 0.5,
        "battery_wh": 1000,
        "payload_kg": 1,
        "cruise_speed_mps": speed_mps,
        "wind_speed_mps": 0,
        "altitude_m": 100,
        "max_takeoff_mass_kg": 8,
        "motor_count": 1,
        "airframe": "fixed-wing",
        "design_name": "Concept de test",
    }


def test_si_speed_contract_covers_500_kmh_as_simulation_input():
    config = CanonicalConfig.model_validate(payload(500 / 3.6))
    assert config.cruise_speed_mps == pytest.approx(500 / 3.6)


def test_si_speed_contract_rejects_values_above_200_mps():
    with pytest.raises(ValidationError):
        CanonicalConfig.model_validate(payload(200.01))
