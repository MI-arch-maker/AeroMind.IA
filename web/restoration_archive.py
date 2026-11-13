"""Portable, checksummed restoration archives for project metadata and drone fleets."""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

ARCHIVE_FORMAT = "aeromind-restoration-archive"
ARCHIVE_VERSION = 1
MAX_ARCHIVE_BYTES = 5 * 1024 * 1024
MAX_DRONES = 500


def _canonical_bytes(value: dict[str, Any]) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def make_archive(project: dict[str, Any], drones: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a portable archive from sanitized project and drone records."""
    if len(drones) > MAX_DRONES:
        raise ValueError("La flotte dépasse la limite d’archive autorisée.")
    payload: dict[str, Any] = {
        "format": ARCHIVE_FORMAT,
        "version": ARCHIVE_VERSION,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "scope": "project-and-drone-fleet",
        "project": project,
        "drones": drones,
        "limitations": [
            "Restaure les métadonnées du projet et les configurations des drones uniquement.",
            "Les missions, runs, rapports, sessions et journaux supprimés ne sont pas inclus.",
        ],
    }
    payload["sha256"] = hashlib.sha256(_canonical_bytes(payload)).hexdigest()
    if len(_canonical_bytes(payload)) > MAX_ARCHIVE_BYTES:
        raise ValueError("L’archive dépasse la taille maximale de 5 Mio.")
    return payload


def validate_archive(value: Any) -> dict[str, Any]:
    """Validate envelope, checksum, identity consistency, and bounded JSON data."""
    if not isinstance(value, dict):
        raise ValueError("Le fichier n’est pas une archive AeroMind valide.")
    if len(_canonical_bytes(value)) > MAX_ARCHIVE_BYTES:
        raise ValueError("L’archive dépasse la taille maximale de 5 Mio.")
    if value.get("format") != ARCHIVE_FORMAT or value.get("version") != ARCHIVE_VERSION:
        raise ValueError("Format ou version d’archive non pris en charge.")
    checksum = value.get("sha256")
    if not isinstance(checksum, str) or len(checksum) != 64:
        raise ValueError("Empreinte SHA-256 manquante ou invalide.")
    payload = {key: item for key, item in value.items() if key != "sha256"}
    actual = hashlib.sha256(_canonical_bytes(payload)).hexdigest()
    if not hmac.compare_digest(checksum, actual):
        raise ValueError("L’empreinte de l’archive ne correspond pas à son contenu.")
    project = value.get("project")
    drones = value.get("drones")
    if not isinstance(project, dict) or not isinstance(drones, list) or len(drones) > MAX_DRONES:
        raise ValueError("Contenu projet/flotte invalide.")
    project_id = project.get("id")
    owner_id = project.get("userId")
    if not isinstance(project_id, str) or not project_id or len(project_id) > 36:
        raise ValueError("Identifiant de projet invalide.")
    if not isinstance(owner_id, str) or not owner_id or len(owner_id) > 255:
        raise ValueError("Identifiant de propriétaire invalide.")
    if not isinstance(project.get("name"), str) or not isinstance(project.get("data"), dict):
        raise ValueError("Métadonnées de projet invalides.")
    drone_ids: set[str] = set()
    for drone in drones:
        if not isinstance(drone, dict):
            raise ValueError("Enregistrement de drone invalide.")
        drone_id = drone.get("id")
        if not isinstance(drone_id, str) or not drone_id or len(drone_id) > 36 or drone_id in drone_ids:
            raise ValueError("Identifiant de drone absent, dupliqué ou invalide.")
        if drone.get("projectId") != project_id or drone.get("userId") != owner_id:
            raise ValueError("La flotte ne correspond pas au projet/propriétaire de l’archive.")
        if not isinstance(drone.get("name"), str) or not isinstance(drone.get("data"), dict):
            raise ValueError("Nom ou configuration de drone invalide.")
        drone_ids.add(drone_id)
    active_id = project.get("activeDroneId")
    if active_id is not None and active_id not in drone_ids:
        raise ValueError("Le drone actif n’appartient pas à la flotte archivée.")
    return value
