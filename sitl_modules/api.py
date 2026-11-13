"""Simulation-only SITL endpoints.

This module deliberately exposes telemetry metadata only. It never opens a
MAVLink connection and never emits actuator commands.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from .propulsion_model import new_state, step
from .geofence import GeofenceZone, check_point

router = APIRouter(prefix="/api/sitl", tags=["sitl"])


class PropulsionSimulationRequest(BaseModel):
    engine_type: str = "piston"
    dt_s: float = Field(default=1.0, gt=0, le=10)
    throttle: float = Field(default=0.5, ge=0, le=1)
    fuel_capacity_kg: float = Field(default=12.0, gt=0, le=10000)
    battery_wh: float = Field(default=0.0, ge=0, le=1000000)
    fuel_remaining_kg: float | None = Field(default=None, ge=0, le=10000)
    battery_remaining_wh: float | None = Field(default=None, ge=0, le=1000000)
    cylinder_temp_c: float = Field(default=20.0, ge=-80, le=600)
    exhaust_temp_c: float = Field(default=20.0, ge=-80, le=1500)
    elapsed_s: float = Field(default=0.0, ge=0, le=1e9)
    incidents: list[str] = Field(default_factory=list, max_length=3)


class GeofenceZoneRequest(BaseModel):
    zone_id: str = Field(min_length=1, max_length=40)
    name: str = Field(default="Zone interdite SIM", max_length=80)
    polygon: list[tuple[float, float]] = Field(min_length=3, max_length=100)


class GeofenceCheckRequest(BaseModel):
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    zones: list[GeofenceZoneRequest] = Field(default_factory=list, max_length=50)


@router.post("/propulsion/step")
def propulsion_step(request: PropulsionSimulationRequest) -> dict[str, object]:
    """Un pas stateless de simulation, sans écriture MAVLink ni contrôle réel."""
    try:
        state = new_state(request.engine_type, request.fuel_capacity_kg, request.battery_wh)
        if request.fuel_remaining_kg is not None:
            state.fuel_remaining_kg = min(request.fuel_capacity_kg, request.fuel_remaining_kg)
        if request.battery_remaining_wh is not None:
            state.battery_remaining_wh = min(request.battery_wh, request.battery_remaining_wh)
        state.cylinder_temp_c = request.cylinder_temp_c
        state.exhaust_temp_c = request.exhaust_temp_c
        state.elapsed_s = request.elapsed_s
        step(state, request.dt_s, request.throttle, incidents=request.incidents)
        return {"mode": "simulation", "hardware_control": False, "telemetry_write": False, "state": state.as_dict()}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/geofence/check")
def geofence_check(request: GeofenceCheckRequest) -> dict[str, object]:
    """Vérifie un point local contre des polygones; ne communique pas avec le véhicule."""
    try:
        zones = [GeofenceZone(zone_id=z.zone_id, name=z.name, polygon=tuple(z.polygon)) for z in request.zones]
        result = check_point((request.x, request.y), zones)
        result.update({"mode": "simulation", "mission_upload": False})
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/status")
def status() -> dict[str, object]:
    return {
        "available": True,
        "mode": "simulation",
        "transport": "safe-python",
        "hardware_control": False,
        "mission_upload": False,
        "telemetry_write": False,
    }
