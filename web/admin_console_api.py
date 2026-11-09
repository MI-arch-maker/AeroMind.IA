"""Restricted administrator workspace; never grants Super-Admin operations."""
from fastapi import APIRouter, Cookie, HTTPException, Response
from sqlalchemy import func, select
from .database import SessionLocal
from .models import Project, Drone, Simulation
from .admin import account_for_identity
from .config import get_settings
from .oidc import _check_local_generation, _verified
from .primary_session_store import is_primary_session_active

router = APIRouter(prefix="/api/admin-console", tags=["admin-console"])


def _admin_actor(token: str | None) -> dict:
    if not token:
        raise HTTPException(401, "Authentification console requise.")
    try:
        if not is_primary_session_active(token):
            raise HTTPException(401, "Session console révoquée ou expirée.")
        verified = _verified(token)
        _check_local_generation(verified)
        import base64
        subject, email = base64.urlsafe_b64decode(verified + '=' * (-len(verified) % 4)).decode().split('|', 1)
        email = email.casefold()
        account = account_for_identity(email, subject)
        if not account:
            raise HTTPException(403, "Compte inactif ou absent du registre privé.")
        if get_settings().is_superadmin_email(email):
            account = {**account, "role": "super_admin"}
        return {**account, "id": account.get("accountId") or subject, "email": email}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(401, "Session console invalide.") from exc


@router.get("/overview")
def overview(
    admin_session: str | None = Cookie(default=None, alias="aeromind_admin_session"),
):
    actor = _admin_actor(admin_session)
    if actor.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(403, "Console réservée aux rôles admin et super_admin.")
    owner_id = actor["id"]
    with SessionLocal() as db:
        projects = db.scalar(select(func.count(Project.id)).where(Project.user_id == owner_id)) or 0
        drones = db.scalar(select(func.count(Drone.id)).where(Drone.user_id == owner_id)) or 0
        simulations = db.scalar(select(func.count(Simulation.id)).where(Simulation.user_id == owner_id)) or 0
    return {
        "role": actor["role"],
        "account": {"id": owner_id, "name": actor.get("name"), "email": actor.get("email")},
        "workspace": {"projects": projects, "cells": drones, "simulations": simulations},
        "billing": {"enabled": False, "mode": "private-governance"},
        "physicalOutput": {"enabled": False, "requiresHumanAuthorization": True},
    }


@router.post("/logout")
def logout(
    response: Response,
    admin_session: str | None = Cookie(default=None, alias="aeromind_admin_session"),
):
    if admin_session:
        from .primary_session_store import revoke_primary_session
        revoke_primary_session(admin_session)
    response.delete_cookie("aeromind_admin_session", path="/api/admin-console")
    return {"logged_out": True}


@router.post("/llm/validate")
async def validate_internal_llm(
    admin_session: str | None = Cookie(default=None, alias="aeromind_admin_session"),
):
    """Run a minimal real request against the approved internal gateway.

    The response intentionally omits the base URL, credential and model output.
    This endpoint only accepts the separate administrator-console session.
    """
    actor = _admin_actor(admin_session)
    if actor.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(403, "Validation du gateway réservée aux administrateurs.")
    settings = get_settings()
    if settings.llm_deployment != "aeromind":
        raise HTTPException(409, "Le déploiement AeroMind interne n’est pas sélectionné.")
    if not settings.llm_configured:
        raise HTTPException(503, "Gateway interne incomplet: vérifiez URL autorisée, modèle et secret dédié.")
    from .copilot import complete_chat
    try:
        result = await complete_chat([{"role": "user", "content": "Réponds uniquement par OK."}])
    except HTTPException as exc:
        raise HTTPException(502, "Le gateway AeroMind interne n’a pas validé le test de complétion.") from exc
    if result.get("provider") != "aeromind-managed" or not str(result.get("content", "")).strip():
        raise HTTPException(502, "Le gateway n’a pas retourné une réponse de modèle interne valide.")
    return {"status": "connected", "deployment": "aeromind", "model": settings.aeromind_llm_model}
