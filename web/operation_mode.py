"""Operation mode tracking — DEMO / SIMULATION / SITL / HARDWARE (EXIGENCE C-002).

The cahier des charges requires three exclusive modes plus a degraded/offline
state. Each measurement, command, result and screen must expose its mode,
its source, its timestamp and its persistence status.

This module is the SINGLE source of truth for operation mode determination.

Modes:
  DEMO        — synthetic data only ; no persistence ; UI badge visible
  SIMULATION  — local simulation engine ; persisted to server DB
  SITL        — software-in-the-loop with ArduPilot SITL ; persisted
  HIL         — hardware-in-the-loop on a controlled bench ; persisted
  HARDWARE    — physical drone control ; ONLY after G5 approval
  OFFLINE     — backend unavailable ; read-only or local draft only

EXIGENCE C-001 — HARDWARE mode requires all gates G0..G5 to be approved.
EXIGENCE SYNC-06 — OFFLINE forbids physical commands.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Literal


class OperationMode(str, Enum):
    DEMO = "demo"
    SIMULATION = "simulation"
    SITL = "sitl"
    HIL = "hil"
    HARDWARE = "hardware"
    OFFLINE = "offline"


# Required source types per mode (EXIGENCE SYNC-07)
MODE_TO_SOURCE_TYPE = {
    OperationMode.DEMO:       "synthetic",
    OperationMode.SIMULATION: "synthetic",
    OperationMode.SITL:       "sitl",
    OperationMode.HIL:        "hil",
    OperationMode.HARDWARE:   "physical",
}


@dataclass(frozen=True)
class ModeStatus:
    """Snapshot of the current operation mode for a project/drone.

    EXIGENCE SYNC-07 — every measurement/result carries:
      - source_type (synthetic/SITL/HIL/physical)
      - persisted (bool)
      - engine_version (str)
      - timestamp_utc (ISO 8601)
      - quality (unknown/good/warn/fail)
    """
    mode: OperationMode
    source_type: str
    persisted: bool
    engine_version: str
    timestamp_utc: datetime
    quality: Literal["unknown", "good", "warn", "fail"]
    api_reachable: bool
    websocket_connected: bool
    last_sync_at: datetime | None
    gate_progress: tuple[str, ...]   # gates approved so far (e.g. ('G0_gel', 'G1_securite'))

    def to_dict(self) -> dict:
        return {
            "mode": self.mode.value,
            "source_type": self.source_type,
            "persisted": self.persisted,
            "engine_version": self.engine_version,
            "timestamp_utc": self.timestamp_utc.isoformat(),
            "quality": self.quality,
            "api_reachable": self.api_reachable,
            "websocket_connected": self.websocket_connected,
            "last_sync_at": self.last_sync_at.isoformat() if self.last_sync_at else None,
            "gate_progress": list(self.gate_progress),
        }


def determine_mode(
    *,
    api_reachable: bool,
    hardware_control_flag: bool,
    sitl_active: bool,
    hil_active: bool,
    gate_progress: tuple[str, ...] = (),
) -> ModeStatus:
    """Determine the current operation mode based on environment + gates.

    EXIGENCE C-001 — HARDWARE requires HARDWARE_CONTROL=true AND all gates G0..G5.
    If gates are missing, the mode stays SIMULATION even if HARDWARE_CONTROL=true.
    """
    all_gates = ("G0_gel", "G1_securite", "G2_fiabilite", "G3_banc",
                 "G4_qualification", "G5_exploitation")
    gates_approved = tuple(g for g in gate_progress if g in all_gates)

    if not api_reachable:
        return ModeStatus(
            mode=OperationMode.OFFLINE,
            source_type="synthetic",
            persisted=False,
            engine_version="offline",
            timestamp_utc=datetime.now(UTC),
            quality="warn",
            api_reachable=False,
            websocket_connected=False,
            last_sync_at=None,
            gate_progress=gates_approved,
        )

    if hardware_control_flag and set(all_gates).issubset(set(gates_approved)):
        return ModeStatus(
            mode=OperationMode.HARDWARE,
            source_type="physical",
            persisted=True,
            engine_version="hardware-1.0",
            timestamp_utc=datetime.now(UTC),
            quality="good",
            api_reachable=True,
            websocket_connected=True,
            last_sync_at=datetime.now(UTC),
            gate_progress=gates_approved,
        )

    if hardware_control_flag and not set(all_gates).issubset(set(gates_approved)):
        # HARDWARE_CONTROL=true but gates missing — fall back to SITL/HIL/SIMULATION
        # EXIGENCE C-001: "Le seul flag HARDWARE_CONTROL ne constitue jamais une autorisation suffisante."
        if hil_active:
            mode = OperationMode.HIL
            source = "hil"
        elif sitl_active:
            mode = OperationMode.SITL
            source = "sitl"
        else:
            mode = OperationMode.SIMULATION
            source = "synthetic"
        return ModeStatus(
            mode=mode,
            source_type=source,
            persisted=True,
            engine_version="aeromind-1.0",
            timestamp_utc=datetime.now(UTC),
            quality="warn",
            api_reachable=True,
            websocket_connected=True,
            last_sync_at=datetime.now(UTC),
            gate_progress=gates_approved,
        )

    if hil_active:
        return ModeStatus(
            mode=OperationMode.HIL,
            source_type="hil",
            persisted=True,
            engine_version="aeromind-hil-1.0",
            timestamp_utc=datetime.now(UTC),
            quality="good",
            api_reachable=True,
            websocket_connected=True,
            last_sync_at=datetime.now(UTC),
            gate_progress=gates_approved,
        )

    if sitl_active:
        return ModeStatus(
            mode=OperationMode.SITL,
            source_type="sitl",
            persisted=True,
            engine_version="aeromind-sitl-1.0",
            timestamp_utc=datetime.now(UTC),
            quality="good",
            api_reachable=True,
            websocket_connected=True,
            last_sync_at=datetime.now(UTC),
            gate_progress=gates_approved,
        )

    # Default: simulation
    return ModeStatus(
        mode=OperationMode.SIMULATION,
        source_type="synthetic",
        persisted=True,
        engine_version="aeromind-1.0",
        timestamp_utc=datetime.now(UTC),
        quality="good",
        api_reachable=True,
        websocket_connected=True,
        last_sync_at=datetime.now(UTC),
        gate_progress=gates_approved,
    )


def assert_no_physical_command(mode: ModeStatus) -> None:
    """Helper — raise if the current mode allows physical commands.

    EXIGENCE PHY-05 — Aucun déclenchement automatique de moteurs par l'UI ou par un test.
    EXIGENCE C-001 — Toutes sorties MAVLink matérielles restent bloquées par défaut.
    """
    if mode.mode == OperationMode.HARDWARE:
        from fastapi import HTTPException, status
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail=f"Mode HARDWARE actif (gates={list(mode.gate_progress)}) — commande nécessite jeton signé (SEC-03)",
        )


def assert_persisted_or_demo(mode: ModeStatus, persisted: bool) -> None:
    """Helper — verify that a result is correctly labeled as persisted or demo.

    EXIGENCE SYNC-07 — impossible d'afficher 'réel' pour une valeur synthétique.
    EXIGENCE C-002 — chaque mesure porte son mode et son statut de persistance.
    """
    if mode.mode == OperationMode.DEMO and persisted:
        raise ValueError("Données DEMO ne peuvent pas être marquées persisted=true")
    if mode.mode in (OperationMode.SITL, OperationMode.HIL, OperationMode.HARDWARE) and not persisted:
        raise ValueError(f"Mode {mode.mode.value} exige persisted=true")


__all__ = [
    "OperationMode", "ModeStatus", "determine_mode",
    "assert_no_physical_command", "assert_persisted_or_demo",
    "MODE_TO_SOURCE_TYPE",
]
