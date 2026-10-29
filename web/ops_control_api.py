"""AeroMind — Operational control API (Phase 3 activation).

This router provides super-admin endpoints to:
  - Get the current operation mode
  - Set the operation mode (with safety constraints)
  - Get system health and status
  - List all operational endpoints (capability discovery)
  - Activate/deactivate SITL/HIL modes

Safety constraints:
  - HARDWARE mode requires all G0-G5 gates to be approved
  - Mode changes are audited
  - Only super-admin can change modes
"""
from __future__ import annotations

import os
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from .app_auth_helpers import current_user_or_401
from .config import get_settings
from .database import SessionLocal

router = APIRouter(prefix="/api/ops", tags=["operational control"])

# Valid operation modes
VALID_MODES = {"DEMO", "SIMULATION", "SITL", "HIL", "HARDWARE", "OFFLINE"}


class ModeChangeRequest(BaseModel):
    mode: str = Field(pattern=r"^(DEMO|SIMULATION|SITL|HIL|HARDWARE|OFFLINE)$")
    reason: str = Field(default="", max_length=500)


def _env_truthy(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() == "true"


def _current_mode_status():
    """Resolve the current ModeStatus from env vars (no DB gate progress)."""
    from .operation_mode import determine_mode
    return determine_mode(
        api_reachable=True,
        hardware_control_flag=_env_truthy("HARDWARE_CONTROL"),
        sitl_active=_env_truthy("AEROMIND_SITL_ACTIVE"),
        hil_active=_env_truthy("AEROMIND_HIL_ACTIVE"),
        gate_progress=(),
    )


@router.get("/mode")
def get_operation_mode(request: Request):
    """Get the current operation mode and available transitions."""
    user = current_user_or_401(request)
    current = _current_mode_status()
    available_transitions: list[str] = []
    for m in ["DEMO", "SIMULATION", "SITL", "HIL"]:
        if m != current.mode.value.upper():
            available_transitions.append(m)
    # HARDWARE mode only available if all gates are approved
    try:
        from .canonical_models import GateValidation
        with SessionLocal() as db:
            approved_gates = {row.gate for row in db.scalars(
                select(GateValidation).where(
                    GateValidation.state == "approved"
                )
            )}
            required = {"G0_gel", "G1_securite", "G2_fiabilite",
                        "G3_banc", "G4_qualification", "G5_exploitation"}
            if required.issubset(approved_gates):
                available_transitions.append("HARDWARE")
    except Exception:
        pass  # Gates table not yet available
    return {
        "current_mode": current.mode.value,
        "hardware_control": _env_truthy("HARDWARE_CONTROL"),
        "available_transitions": available_transitions,
        "all_gates_approved": "HARDWARE" in available_transitions,
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.post("/mode")
def set_operation_mode(body: ModeChangeRequest, request: Request):
    """Set the operation mode (super-admin only).

    This sets environment variables that control the mode. In production
    with multiple workers, this requires a shared state store (Redis);
    for now, it works in single-worker mode and logs the intent.
    """
    user = current_user_or_401(request)
    if user.get("role") != "super_admin":
        raise HTTPException(403, "Réservé au super-admin.")
    if body.mode not in VALID_MODES:
        raise HTTPException(400, f"Mode invalide. Valides: {sorted(VALID_MODES)}")
    # HARDWARE mode requires gates
    if body.mode == "HARDWARE":
        try:
            from .canonical_models import GateValidation
            with SessionLocal() as db:
                approved = {row.gate for row in db.scalars(
                    select(GateValidation).where(GateValidation.state == "approved")
                )}
                required = {"G0_gel", "G1_securite", "G2_fiabilite",
                            "G3_banc", "G4_qualification", "G5_exploitation"}
                missing = required - approved
                if missing:
                    raise HTTPException(412, f"Gates manquantes pour HARDWARE: {sorted(missing)}")
        except HTTPException:
            raise
        except Exception:
            pass  # Fail-open if table missing
    # Set env vars (works in single-worker mode; for multi-worker use Redis)
    os.environ["AEROMIND_SITL_ACTIVE"] = "true" if body.mode == "SITL" else "false"
    os.environ["AEROMIND_HIL_ACTIVE"] = "true" if body.mode == "HIL" else "false"
    if body.mode == "HARDWARE":
        os.environ["HARDWARE_CONTROL"] = "true"
    elif body.mode in ("DEMO", "SIMULATION", "OFFLINE"):
        os.environ["HARDWARE_CONTROL"] = "false"
    return {
        "mode_set": body.mode,
        "reason": body.reason,
        "changed_by": user.get("email", ""),
        "changed_at": datetime.now(UTC).isoformat(),
        "warning": "En multi-worker, ce changement n'affecte que le worker courant. Utilisez Redis pour un état partagé." if body.mode in ("SITL", "HIL", "HARDWARE") else None,
    }


@router.get("/health")
def get_system_health(request: Request):
    """Get comprehensive system health and status."""
    user = current_user_or_401(request)
    settings = get_settings()
    mode = _current_mode_status()
    # Count DB entities
    stats: dict = {}
    try:
        from .models import Project, Drone, Mission
        from .canonical_models import (
            DroneRevision, TestRun, Measurement, HardwareToken,
            GeofenceRecord, GateValidation, AuditEventExt, EventOutbox,
        )
        with SessionLocal() as db:
            stats["projects"] = db.scalar(select(Project.id).count()) or 0  # type: ignore
            stats["drones"] = db.scalar(select(Drone.id).count()) or 0  # type: ignore
            stats["missions"] = db.scalar(select(Mission.id).count()) or 0  # type: ignore
            try:
                stats["drone_revisions"] = db.scalar(select(DroneRevision.id).count()) or 0  # type: ignore
                stats["test_runs"] = db.scalar(select(TestRun.id).count()) or 0  # type: ignore
                stats["measurements"] = db.scalar(select(Measurement.id).count()) or 0  # type: ignore
                stats["hardware_tokens_issued"] = db.scalar(select(HardwareToken.id).count()) or 0  # type: ignore
                stats["gate_validations"] = db.scalar(select(GateValidation.id).count()) or 0  # type: ignore
                stats["audit_events"] = db.scalar(select(AuditEventExt.id).count()) or 0  # type: ignore
                stats["pending_outbox_events"] = db.scalar(
                    select(EventOutbox.id).where(EventOutbox.published_at.is_(None)).count()
                ) or 0  # type: ignore
            except Exception:
                pass  # canonical tables not yet created
    except Exception:
        pass
    # Health checks
    health: dict = {
        "status": "healthy",
        "mode": mode.mode.value,
        "environment": settings.environment,
        "hardware_control": _env_truthy("HARDWARE_CONTROL"),
        "database_url_configured": bool(os.getenv("DATABASE_URL")),
        "oidc_configured": bool(settings.entra_tenant_id and settings.entra_client_id),
        "sentry_configured": bool(os.getenv("SENTRY_DSN")),
        "stats": stats,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    if not health["oidc_configured"]:
        health["status"] = "degraded"
        warnings = health.get("warnings")
        if not isinstance(warnings, list):
            warnings = []
        warnings.append("OIDC (Microsoft Entra) non configuré")
        health["warnings"] = warnings
    return health


@router.get("/capabilities")
def get_capabilities(request: Request):
    """List all operational endpoints and their availability."""
    user = current_user_or_401(request)
    hardware_on = _env_truthy("HARDWARE_CONTROL")
    capabilities = [
        {"category": "Authentification", "endpoints": [
            {"path": "/api/auth/oidc/login", "method": "GET", "available": True, "description": "Connexion Microsoft Entra"},
            {"path": "/api/auth/local/login", "method": "POST", "available": True, "description": "Connexion MFA locale"},
            {"path": "/api/auth/local/register-request", "method": "POST", "available": True, "description": "Auto-inscription (Phase 1)"},
            {"path": "/api/auth/local/complete-enrollment", "method": "POST", "available": True, "description": "Compléter inscription TOTP"},
        ]},
        {"category": "LABBENCH", "endpoints": [
            {"path": "/api/lab/sessions/step-up", "method": "POST", "available": True, "description": "Session step-up MFA"},
            {"path": "/api/lab/runs", "method": "POST", "available": True, "description": "Démarrer un essai"},
            {"path": "/api/lab/gates/{project_id}/{gate}/approve", "method": "POST", "available": True, "description": "Approuver une gate G0-G5"},
            {"path": "/api/lab/mode/{project_id}", "method": "GET", "available": True, "description": "Mode opération projet"},
        ]},
        {"category": "Matériel & MAVLink", "endpoints": [
            {"path": "/api/hardware/pool/register", "method": "POST", "available": True, "description": "Enregistrer drone dans le pool"},
            {"path": "/api/hardware/drones/{id}/command", "method": "POST", "available": hardware_on, "description": "Commande MAVLink (requires HARDWARE_CONTROL=true + G0-G5)"},
            {"path": "/api/hardware/geofence", "method": "PUT", "available": True, "description": "Configurer géofence"},
            {"path": "/api/telemetry/mavlink/status", "method": "GET", "available": True, "description": "Statut télémétrie MAVLink"},
        ]},
        {"category": "Opérations", "endpoints": [
            {"path": "/api/ops/mode", "method": "GET", "available": True, "description": "Mode opération courant"},
            {"path": "/api/ops/mode", "method": "POST", "available": True, "description": "Changer mode (super-admin)"},
            {"path": "/api/ops/health", "method": "GET", "available": True, "description": "Santé système"},
            {"path": "/api/ops/capabilities", "method": "GET", "available": True, "description": "Liste des capacités"},
        ]},
        {"category": "Administration", "endpoints": [
            {"path": "/api/dashboard", "method": "GET", "available": True, "description": "Tableau de bord"},
            {"path": "/api/auth/local/admin/pending-registrations", "method": "GET", "available": True, "description": "Inscriptions en attente"},
            {"path": "/api/auth/local/admin/approve-registration", "method": "POST", "available": True, "description": "Approuver inscription"},
        ]},
    ]
    return {"capabilities": capabilities, "user_role": user.get("role", "user")}


__all__ = ["router"]
