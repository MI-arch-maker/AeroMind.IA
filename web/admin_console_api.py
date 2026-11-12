"""Restricted administrator workspace; never grants Super-Admin operations."""
import json

from fastapi import APIRouter, Body, Cookie, HTTPException, Response
from sqlalchemy import func, or_, select
from .database import SessionLocal
from .models import AdminAccountEvent, AuditEvent, Project, Drone, Simulation, User
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


@router.get("/restoration-archive/projects/{project_id}")
def export_restoration_archive(
    project_id: str,
    response: Response,
    admin_session: str | None = Cookie(default=None, alias="aeromind_admin_session"),
):
    """Export project metadata and its drone fleet for Super-Admin recovery."""
    import json
    from .admin import _event
    from .restoration_archive import make_archive

    actor = _admin_actor(admin_session)
    if actor.get("role") != "super_admin":
        raise HTTPException(403, "La création d’archives de restauration est réservée au Super-Admin.")
    with SessionLocal() as db:
        project = db.get(Project, project_id)
        if project is None:
            raise HTTPException(404, "Projet introuvable.")
        try:
            project_data = json.loads(project.data_json or "{}")
        except (TypeError, json.JSONDecodeError) as exc:
            raise HTTPException(409, "Données de projet corrompues; archive non créée.") from exc
        if not isinstance(project_data, dict):
            raise HTTPException(409, "Données de projet invalides; archive non créée.")
        drone_rows = db.scalars(select(Drone).where(Drone.user_id == project.user_id, or_(Drone.project_id == project_id, Drone.id == project.active_drone_id)).order_by(Drone.id)).all()
        drones = []
        for drone in drone_rows:
            try:
                drone_data = json.loads(drone.config_json or "{}")
            except (TypeError, json.JSONDecodeError) as exc:
                raise HTTPException(409, f"Configuration du drone {drone.id} invalide; archive non créée.") from exc
            if not isinstance(drone_data, dict):
                raise HTTPException(409, f"Configuration du drone {drone.id} invalide; archive non créée.")
            drones.append({"id": drone.id, "userId": drone.user_id, "projectId": project.id, "name": drone.name, "data": drone_data})
        project_archive = {"id": project.id, "userId": project.user_id, "name": project.name, "data": project_data, "activeDroneId": project.active_drone_id}
        try:
            archive = make_archive(project_archive, drones)
        except ValueError as exc:
            raise HTTPException(413, str(exc)) from exc
        db.add(_event(db, "restoration.archive.exported", actor, project.id, {"droneCount": len(drones), "sha256": archive["sha256"]}))
        db.commit()
    response.headers["Cache-Control"] = "no-store"
    response.headers["Vary"] = "Cookie"
    return archive


@router.post("/restoration-archive/restore")
def restore_restoration_archive(
    response: Response,
    archive: dict = Body(...),
    admin_session: str | None = Cookie(default=None, alias="aeromind_admin_session"),
):
    """Restore project metadata and drone configs from a verified archive."""
    import json
    from .admin import _event
    from .models import now_utc
    from .restoration_archive import validate_archive

    actor = _admin_actor(admin_session)
    if actor.get("role") != "super_admin":
        raise HTTPException(403, "La restauration d’archives est réservée au Super-Admin.")
    try:
        checked = validate_archive(archive)
    except (ValueError, TypeError, OverflowError) as exc:
        raise HTTPException(400, str(exc)) from exc
    project_data = checked["project"]
    drone_data = checked["drones"]
    project_id = project_data["id"]
    owner_id = project_data["userId"]
    with SessionLocal() as db:
        if db.get(Project, project_id) is not None:
            raise HTTPException(409, "Ce projet existe déjà; restauration refusée pour éviter tout écrasement.")
        if db.get(User, owner_id) is None:
            raise HTTPException(409, "Le propriétaire d’origine est absent; aucune restauration effectuée.")
        archived_ids = [item["id"] for item in drone_data]
        if archived_ids and db.scalar(select(Drone.id).where(Drone.id.in_(archived_ids))) is not None:
            raise HTTPException(409, "Un ou plusieurs identifiants de drone existent déjà; archive non appliquée.")
        record = Project(
            id=project_id, user_id=owner_id, name=project_data["name"][:200],
            data_json=json.dumps(project_data["data"], ensure_ascii=False, allow_nan=False),
            active_drone_id=project_data.get("activeDroneId"), created_at=now_utc(), updated_at=now_utc(),
        )
        db.add(record)
        for drone in drone_data:
            db.add(Drone(
                id=drone["id"], user_id=owner_id, project_id=project_id,
                name=drone["name"][:200],
                config_json=json.dumps(drone["data"], ensure_ascii=False, allow_nan=False),
            ))
        db.add(_event(db, "restoration.archive.restored", actor, project_id, {"droneCount": len(drone_data), "sha256": checked["sha256"]}))
        try:
            db.commit()
        except Exception as exc:
            db.rollback()
            raise HTTPException(409, "La base a refusé l’archive; aucune restauration n’a été validée.") from exc
    if response is not None:
        response.headers["Cache-Control"] = "no-store"
        response.headers["Vary"] = "Cookie"
    return {"restored": True, "projectId": project_id, "projectName": project_data["name"], "droneCount": len(drone_data), "restoredScope": "project-and-drone-fleet", "notRestored": ["missions", "runs", "rapports", "sessions et autres journaux"]}
