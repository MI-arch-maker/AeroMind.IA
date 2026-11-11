"""Restricted administrator workspace; never grants Super-Admin operations."""
import json

from fastapi import APIRouter, Cookie, HTTPException, Response
from sqlalchemy import func, or_, select
from .database import SessionLocal
from .models import AuditEvent, Project, Drone, Simulation
from .admin import account_for_identity, project_mechanical_preview, qualification_activity
from .config import get_settings
from .oidc import _check_local_generation, _verified
from .primary_session_store import is_primary_session_active

router = APIRouter(prefix="/api/admin-console", tags=["admin-console"])


def _require_admin(token: str | None) -> dict:
    actor = _admin_actor(token)
    if actor.get("role") not in {"admin", "super_admin"}:
        raise HTTPException(403, "Console réservée aux rôles admin et super_admin.")
    return actor


def _safe_json(value: str | None) -> dict:
    try:
        parsed = json.loads(value or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError):
        return {}


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
    actor = _require_admin(admin_session)
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


@router.get("/workspace/records")
def workspace_records(
    admin_session: str | None = Cookie(default=None, alias="aeromind_admin_session"),
):
    """Return only metadata for the signed-in administrator's own workspace."""
    actor = _require_admin(admin_session)
    owner_id = actor["id"]
    with SessionLocal() as db:
        projects = list(db.scalars(
            select(Project).where(Project.user_id == owner_id)
            .order_by(Project.updated_at.desc()).limit(100)
        ))
        simulations = list(db.scalars(
            select(Simulation).where(Simulation.user_id == owner_id)
            .order_by(Simulation.created_at.desc()).limit(100)
        ))
        events = list(db.scalars(
            select(AuditEvent).where(or_(AuditEvent.user_id == owner_id,
                                         AuditEvent.project_id.in_(select(Project.id).where(Project.user_id == owner_id))))
            .order_by(AuditEvent.created_at.desc()).limit(100)
        ))
        project_names = {project.id: project.name for project in projects}
        return {
            "projects": [{
                "id": project.id,
                "name": project.name,
                "createdAt": project.created_at.isoformat() if project.created_at else None,
                "updatedAt": project.updated_at.isoformat() if project.updated_at else None,
                "hasCell": bool(project.active_drone_id),
            } for project in projects],
            "simulations": [{
                "id": simulation.id,
                "projectId": simulation.project_id,
                "projectName": project_names.get(simulation.project_id, "Projet indisponible"),
                "createdAt": simulation.created_at.isoformat() if simulation.created_at else None,
                "status": str(_safe_json(simulation.data_json).get("status", "archivé"))[:40],
            } for simulation in simulations],
            "events": [{
                "id": event.id,
                "projectId": event.project_id,
                "type": event.event_type,
                "message": event.message[:240],
                "occurredAt": event.occurred_at.isoformat() if event.occurred_at else None,
            } for event in events],
            "limits": {"perSection": 100, "payloadsIncluded": False},
        }


@router.get("/workspace/projects/{project_id}/mechanical-preview")
def workspace_project_mechanical_preview(
    project_id: str,
    response: Response,
    admin_session: str | None = Cookie(default=None, alias="aeromind_admin_session"),
):
    """Read only the selected project configuration inside the Admin's workspace."""
    actor = _require_admin(admin_session)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Vary"] = "Cookie"
    try:
        data = project_mechanical_preview(project_id, owner_id=str(actor["id"]))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if data is None:
        raise HTTPException(404, "Projet absent du workspace autorisé.")
    return data


@router.get("/qualification-activity")
def admin_qualification_activity(
    response: Response,
    level: str = "all",
    limit: int = 100,
    admin_session: str | None = Cookie(default=None, alias="aeromind_admin_session"),
):
    """Return audit metadata only; the qualification is resolved server-side."""
    actor = _require_admin(admin_session)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Vary"] = "Cookie"
    try:
        return qualification_activity(actor, level, limit)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


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
    _require_admin(admin_session)
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
