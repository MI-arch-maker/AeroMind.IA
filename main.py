"""Minimal deterministic engineering engine used by the API health checks.

The implementation is intentionally simulation-only. It provides the API
contract without pretending to be a flight-certification or CFD engine.
"""


class _CompatibilityEngine:
    _known_profiles = {
        "fixed-wing": "catalogue-parametric",
        "quadcopter": "catalogue-parametric",
        "vtol": "catalogue-parametric",
    }


class AeroMindAI:
    def __init__(self) -> None:
        self.compatibility_engine = _CompatibilityEngine()

    def run_safety_check(self) -> dict[str, object]:
        return {
            "safe": True,
            "mode": "simulation",
            "hardware_control": False,
            "mission_upload": False,
            "actuator_write": False,
            "note": "Deterministic local safety contract; not a flight certification.",
        }
