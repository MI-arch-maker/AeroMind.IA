"""Modèle de propulsion paramétrique destiné exclusivement au banc SIM.

Ce modèle pédagogique n'est ni un modèle certifié, ni une source de commande
pour un véhicule réel. Les paramètres doivent être identifiés pour tout usage
scientifique et les sorties ne doivent pas piloter d'actionneurs.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass, field
from typing import Literal

EngineType = Literal["piston", "jet", "hybrid"]

@dataclass
class PropulsionState:
    engine_type: EngineType = "piston"
    fuel_capacity_kg: float = 12.0
    fuel_remaining_kg: float = 12.0
    throttle: float = 0.0
    rpm: float = 0.0
    cylinder_temp_c: float = 20.0
    exhaust_temp_c: float = 20.0
    battery_wh: float = 0.0
    battery_remaining_wh: float = 0.0
    hybrid_mode: str = "thermal"
    thrust_n: float = 0.0
    fuel_flow_kg_s: float = 0.0
    elapsed_s: float = 0.0
    active_incidents: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        result = asdict(self)
        result["fuel_pct"] = round(100 * self.fuel_remaining_kg / self.fuel_capacity_kg, 1) if self.fuel_capacity_kg else 0.0
        alerts = []
        if self.fuel_remaining_kg <= 0.0:
            alerts.append("PANNE_SÈCHE")
        if self.cylinder_temp_c >= 220.0 or self.exhaust_temp_c >= 850.0:
            alerts.append("SURCHAUFFE_MOTEUR")
        if self.engine_type == "hybrid":
            alerts.append(f"MODE_HYBRIDE_{self.hybrid_mode.upper()}")
        incident_alerts = {
            "overheat": "INCIDENT_SURCHAUFFE_INJECTE",
            "fuel_leak": "FUITE_CARBURANT_INJECTEE",
            "hybrid_partial": "PANNE_HYBRIDE_PARTIELLE",
        }
        alerts.extend(incident_alerts[item] for item in self.active_incidents)
        result["alerts"] = alerts
        result["simulation_only"] = True
        return result

def step(state: PropulsionState, dt_s: float, throttle: float, *,
         piston_power_kw: float = 12.0, specific_fuel_consumption_kg_kwh: float = 0.32,
         jet_max_thrust_n: float = 180.0, jet_idle_fraction: float = 0.06,
         jet_fuel_kg_s_full: float = 0.018, battery_power_kw: float = 4.0,
         hybrid_assist: bool = True, incidents: tuple[str, ...] | list[str] = ()) -> PropulsionState:
    """Avance un pas déterministe; accepte seulement des paramètres bornés."""
    if not 0 < dt_s <= 10:
        raise ValueError("dt_s doit être dans ]0, 10].")
    if not 0 <= throttle <= 1:
        raise ValueError("throttle doit être compris entre 0 et 1.")
    allowed_incidents = {"overheat", "fuel_leak", "hybrid_partial"}
    if not set(incidents) <= allowed_incidents:
        raise ValueError("incident non pris en charge")
    if "hybrid_partial" in incidents and state.engine_type != "hybrid":
        raise ValueError("hybrid_partial requiert une propulsion hybride")
    state.active_incidents = sorted(set(incidents))
    state.throttle = throttle
    state.elapsed_s += dt_s
    if state.engine_type == "piston":
        state.fuel_flow_kg_s = max(0.00001, piston_power_kw * (0.18 + 0.82 * throttle) * specific_fuel_consumption_kg_kwh / 3600) if state.fuel_remaining_kg > 0 else 0.0
        state.thrust_n = 0.0  # poussée propulsive non calculée sans hélice/aérodynamique
        state.rpm = 700 + 5300 * throttle if state.fuel_remaining_kg > 0 else 0.0
        state.cylinder_temp_c += ((70 + 150 * throttle + (250 if "overheat" in incidents else 0)) - state.cylinder_temp_c) * min(1, dt_s / 18)
    elif state.engine_type == "jet":
        state.fuel_flow_kg_s = jet_fuel_kg_s_full * (jet_idle_fraction + (1 - jet_idle_fraction) * throttle) if state.fuel_remaining_kg > 0 else 0.0
        state.thrust_n = jet_max_thrust_n * throttle if state.fuel_remaining_kg > 0 else 0.0
        state.rpm = 0.0  # régime de turbine doit être fourni séparément par capteur réel
        target_egt = 250 + 650 * throttle + (500 if "overheat" in incidents else 0) if state.fuel_remaining_kg > 0 else 20
        state.exhaust_temp_c += (target_egt - state.exhaust_temp_c) * min(1, dt_s / 25)
    elif state.engine_type == "hybrid":
        requested_electric_kw = battery_power_kw * throttle * (0.5 if "hybrid_partial" in incidents else 1.0) if hybrid_assist else 0.0
        electric_kw = min(requested_electric_kw, state.battery_remaining_wh * 3600 / dt_s / 1000)
        state.battery_remaining_wh = max(0.0, state.battery_remaining_wh - electric_kw * dt_s / 3600 * 1000)
        thermal_fraction = max(0.0, throttle - (0.35 if electric_kw > 0 else 0.0))
        state.fuel_flow_kg_s = max(0.00001, piston_power_kw * (0.18 + 0.82 * thermal_fraction) * specific_fuel_consumption_kg_kwh / 3600) if state.fuel_remaining_kg > 0 else 0.0
        state.thrust_n = 0.0
        state.rpm = (700 + 5300 * thermal_fraction) if state.fuel_remaining_kg > 0 else 0.0
        state.cylinder_temp_c += ((70 + 150 * thermal_fraction + (250 if "overheat" in incidents else 0)) - state.cylinder_temp_c) * min(1, dt_s / 18)
        state.hybrid_mode = "assist" if electric_kw > 0 else "thermal"
    else:
        raise ValueError("engine_type non pris en charge")
    if "fuel_leak" in incidents and state.fuel_remaining_kg > 0:
        state.fuel_flow_kg_s += min(state.fuel_remaining_kg / dt_s, max(0.0001, state.fuel_capacity_kg * 0.002))
    state.fuel_remaining_kg = max(0.0, state.fuel_remaining_kg - state.fuel_flow_kg_s * dt_s)
    state.fuel_flow_kg_s = state.fuel_flow_kg_s if state.fuel_remaining_kg > 0 else 0.0
    return state

def new_state(engine_type: EngineType = "piston", fuel_capacity_kg: float = 12.0,
              battery_wh: float = 0.0) -> PropulsionState:
    if engine_type not in ("piston", "jet", "hybrid"):
        raise ValueError("engine_type doit être piston, jet ou hybrid")
    if not 0 < fuel_capacity_kg <= 10000 or not 0 <= battery_wh <= 1_000_000:
        raise ValueError("capacité hors limites SIM")
    return PropulsionState(engine_type=engine_type, fuel_capacity_kg=fuel_capacity_kg,
                           fuel_remaining_kg=fuel_capacity_kg, battery_wh=battery_wh,
                           battery_remaining_wh=battery_wh)
