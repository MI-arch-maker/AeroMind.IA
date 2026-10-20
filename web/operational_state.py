"""Machine d'état serveur pour la vérité opérationnelle AeroMind.

N3/N4 restent volontairement indisponibles tant que les preuves et validations
réelles ne sont pas présentes. L'interface ne peut pas élever le niveau seule.
"""
from __future__ import annotations

from enum import StrEnum
from threading import Lock
from typing import Any

from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from .app_auth_helpers import current_user

router = APIRouter(prefix="/api/operational-state", tags=["operational-state"])


class OperationalMode(StrEnum):
    N2 = "N2"
    N3 = "N3"
    N4 = "N4"


class ModePhase(StrEnum):
    REQUESTED = "requested"
    CHECKING = "checking"
    AVAILABLE = "available"
    ACTIVE = "active"


class ModeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: OperationalMode
    evidence_valid: bool = False
    hardware_verified: bool = False
    signed_human_approval: bool = False
    quorum: bool = False
    permissions: bool = False
    project_bound: bool = False


_LOCK = Lock()
_STATE: dict[str, dict[str, Any]] = {}


def _key(cookie: str | None) -> str:
    user = current_user(cookie)
    if not user:
        raise HTTPException(status_code=401, detail="OIDC authentication required")
    return user["id"]


def _snapshot(user_id: str) -> dict[str, Any]:
    with _LOCK:
        state = _STATE.setdefault(user_id, {"requested": "N2", "phase": "active"})
        return {
            "requested": state["requested"],
            "phase": state["phase"],
            "active": "N2",
            "available": ["N2"],
            "truth": "N2 — Simulation synthétique",
            "server_authoritative": True,
            "preconditions": {
                "authenticated": True,
                "project_bound": False,
                "evidence_valid": False,
                "hardware_verified": False,
                "signed_human_approval": False,
                "quorum": False,
                "permissions": False,
            },
        }


@router.get("")
def get_operational_state(aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    return _snapshot(_key(aeromind_session))


@router.post("/request")
def request_operational_state(
    body: ModeRequest, aeromind_session: str | None = Cookie(default=None, convert_underscores=False)
):
    user_id = _key(aeromind_session)
    if body.mode is OperationalMode.N2:
        with _LOCK:
            _STATE[user_id] = {"requested": "N2", "phase": "active"}
        return _snapshot(user_id)

    missing: list[str] = []
    if not body.project_bound:
        missing.append("projet authentifié lié")
    if not body.hardware_verified:
        missing.append("identité matériel signée et matériel vérifié")
    if not body.evidence_valid:
        missing.append("preuve serveur valide")
    if body.mode is OperationalMode.N4:
        if not body.signed_human_approval:
            missing.append("approbation humaine signée")
        if not body.quorum:
            missing.append("quorum")
        if not body.permissions:
            missing.append("permissions")

    with _LOCK:
        _STATE[user_id] = {"requested": body.mode.value, "phase": "checking"}
    result = _snapshot(user_id)
    result["requested"] = body.mode.value
    result["phase"] = "checking"
    result["available"] = ["N2"]
    result["message"] = (
        ("N3 demandé — verrouillé" if body.mode is OperationalMode.N3 else "N4 indisponible")
        + ". Préconditions manquantes : " + ", ".join(missing)
    )
    return result
