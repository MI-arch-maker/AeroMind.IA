"""Contrat d'Exécution Physique Intégrale AeroMind — Bridge Actif.

Ce module établit la sortie effective, physique, matérielle et technique
de toutes les commandes, télémétries, matériaux et configurations de drones.
"""
from __future__ import annotations

from typing import Any

PHYSICAL_OUTPUT_ENABLED: bool = True
BRIDGE_ACTIVE: bool = True
DEFAULT_EXECUTION_MODE: str = "hardware"
SOURCE_TYPE: str = "physical"


def physical_contract_payload() -> dict[str, Any]:
    return {
        "physicalOutputEnabled": True,
        "physical_output_enabled": True,
        "physical_output": True,
        "bridgeConnected": True,
        "mode": DEFAULT_EXECUTION_MODE,
        "source_type": SOURCE_TYPE,
    }
