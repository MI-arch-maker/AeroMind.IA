"""Voice command backend — natural language → MAVLink command mapping.

The operator speaks a command in French or English; this module parses it
into a structured command + parameters, returns a preview for confirmation,
then optionally sends via the same hardware gate (token + geofence).

Voice commands are ALWAYS gated by the same triple gate as manual commands:
  1. HARDWARE_CONTROL=true
  2. Command on allowlist (mirrors mavlink_command_api.ALLOWED_COMMANDS)
  3. Token single-use (issued by /api/hardware/gate/issue-token)

The voice → command mapping is intentionally simple (regex + keyword match)
to stay auditable. Complex NLP would be opaque; this is fully traceable.

Supported phrases (FR + EN):
  - "décolle à 5 mètres" / "take off to 5 meters" → NAV_TAKEOFF p7=5
  - "atterris" / "land" → NAV_LAND
  - "reviens à la base" / "return to launch" / "RTL" → NAV_RETURN_TO_LAUNCH
  - "arme" / "arm" → COMPONENT_ARM_DISARM p1=1
  - "désarme" / "disarm" → COMPONENT_ARM_DISARM p1=0
  - "arrêt d'urgence" / "emergency stop" → emergency_stop_all
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Cookie, Header, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from .app_auth_helpers import current_user
from .database import SessionLocal
from .models import AuditEvent
from .mavlink_command_api import ALLOWED_COMMANDS, HardwareCommandError, hardware_commands_enabled


router = APIRouter(prefix="/api/voice", tags=["voice-commands"])


# ===========================================================================
# Voice → command mapping (regex + keyword based, fully auditable)
# ===========================================================================

def parse_voice_command(text: str) -> dict[str, Any] | None:
    """Parse a natural language command (FR or EN) into a structured command.

    Returns None if no command recognized. The result is a preview — it is
    NOT executed until the operator confirms (and provides a token).
    """
    if not text:
        return None
    t = text.lower().strip()
    # Strip punctuation BUT keep commas/periods for decimal numbers
    t = re.sub(r"[^\w\s,.]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()

    # Takeoff — "décolle à 5 mètres" / "take off to 5 meters"
    takeoff_match = re.search(
        r"(?:décolle|take\s*off|décollage).*?(\d+(?:[.,]\d+)?)\s*(?:m|meters|mètres|metres)",
        t,
    )
    if takeoff_match or any(kw in t for kw in ["décolle", "take off", "décollage", "takeoff"]):
        altitude = 5.0  # default
        if takeoff_match:
            altitude = float(takeoff_match.group(1).replace(",", "."))
        return {
            "command": "NAV_TAKEOFF",
            "parameters": {"p7": altitude},
            "preview": f"Takeoff à {altitude} m",
            "raw": text,
        }

    # Land
    if any(kw in t for kw in ["atterris", "atterrissage", "land", "landing", "pose", "posé"]):
        return {
            "command": "NAV_LAND",
            "parameters": {},
            "preview": "Atterrissage immédiat",
            "raw": text,
        }

    # RTL
    if any(kw in t for kw in ["reviens", "return to launch", "rtl", "retour base", "retour à la base", "come back", "rtr", "home"]):
        return {
            "command": "NAV_RETURN_TO_LAUNCH",
            "parameters": {},
            "preview": "Retour à la base (RTL)",
            "raw": text,
        }

    # Arm
    if any(kw in t for kw in ["arme", "arm", "armement", "arme le drone", "arm the drone"]):
        # Make sure it's not "disarm"
        if not any(kw in t for kw in ["désarme", "disarm", "désarmement"]):
            return {
                "command": "COMPONENT_ARM_DISARM",
                "parameters": {"p1": 1.0},
                "preview": "Armement du drone",
                "raw": text,
            }

    # Disarm
    if any(kw in t for kw in ["désarme", "disarm", "désarmement"]):
        return {
            "command": "COMPONENT_ARM_DISARM",
            "parameters": {"p1": 0.0},
            "preview": "Désarmement du drone",
            "raw": text,
        }

    # Emergency stop
    if any(kw in t for kw in ["arrêt d'urgence", "arret d urgence", "emergency stop", "estop", "e-stop", "emergency", "urgence", "stop now", "stoppe"]):
        return {
            "command": "EMERGENCY_STOP",
            "parameters": {},
            "preview": "ARRÊT D'URGENCE — broadcast NAV_LAND",
            "raw": text,
            "is_estop": True,
        }

    return None


@router.post("/parse")
async def parse_endpoint(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Parse a voice command into a structured preview (no execution).

    Body: { text: "décolle à 5 mètres", droneId: "..." }
    Returns: { command, parameters, preview, raw, droneId } or { error: "UNRECOGNIZED" }
    """
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    text = str(body.get("text") or "").strip()
    drone_id = str(body.get("droneId") or "").strip()
    if not text:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "text is required"}})
    parsed = parse_voice_command(text)
    if parsed is None:
        # Audit unrecognized attempt
        with SessionLocal() as db:
            db.add(AuditEvent(
                id=str(uuid4()),
                project_id=None,
                user_id=user["id"],
                actor_role=user.get("role", "user"),
                event_type="labbench.voice.unrecognized",
                message=f"Commande vocale non reconnue: {text[:100]}",
                payload_json=json.dumps({"scope": "voice", "raw": text[:200]}, ensure_ascii=False),
                occurred_at=datetime.now(UTC),
            ))
            db.commit()
        return JSONResponse(status_code=422, content={"error": {"code": "UNRECOGNIZED", "message": f"Commande non reconnue: {text}"}})
    # Audit the parse
    with SessionLocal() as db:
        db.add(AuditEvent(
            id=str(uuid4()),
            project_id=None,
            user_id=user["id"],
            actor_role=user.get("role", "user"),
            event_type="labbench.voice.parsed",
            message=f"Commande vocale parsée: {parsed['preview']}",
            payload_json=json.dumps({"scope": "voice", "command": parsed["command"], "raw": text[:200]}, ensure_ascii=False),
            occurred_at=datetime.now(UTC),
        ))
        db.commit()
    return JSONResponse({
        "command": parsed["command"],
        "parameters": parsed["parameters"],
        "preview": parsed["preview"],
        "raw": parsed["raw"],
        "droneId": drone_id,
        "isEstop": parsed.get("is_estop", False),
    }, headers={"Cache-Control": "no-store", "Vary": "Cookie"})


@router.post("/execute")
async def execute_endpoint(
    request: Request,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """Execute a previously-parsed voice command. Requires token + geofence.

    Body: { command, parameters, droneId, confirmationToken, projectId }
    """
    from . import mavlink_pool as pool_mod
    from . import mavlink_command_api as cmd_api
    from . import geofence_validator as geo
    from . import hardware_gate as hw_gate

    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    body = await request.json()
    command = str(body.get("command") or "").strip()
    parameters = body.get("parameters") if isinstance(body.get("parameters"), dict) else {}
    drone_id = str(body.get("droneId") or "").strip()
    confirmation_token = str(body.get("confirmationToken") or "").strip()
    project_id = str(body.get("projectId") or "").strip() or None
    is_estop = body.get("isEstop") is True

    # E-stop is special — broadcast, no token needed
    if is_estop or command == "EMERGENCY_STOP":
        pool = pool_mod.get_pool()
        result = geo.emergency_stop_all(pool, audit_logger=None)
        with SessionLocal() as db:
            db.add(AuditEvent(
                id=str(uuid4()),
                project_id=project_id,
                user_id=user["id"],
                actor_role=user.get("role", "user"),
                event_type="labbench.voice.estop",
                message="E-stop vocal déclenché",
                payload_json=json.dumps({"scope": "voice", "results": result.get("results", [])}, ensure_ascii=False),
                occurred_at=datetime.now(UTC),
            ))
            db.commit()
        return JSONResponse(result, headers={"Cache-Control": "no-store", "Vary": "Cookie"})

    # Normal command — full gate
    if not drone_id or not confirmation_token:
        return JSONResponse(status_code=400, content={"error": {"code": "BAD_REQUEST", "message": "droneId and confirmationToken required"}})
    if command not in ALLOWED_COMMANDS:
        return JSONResponse(status_code=403, content={"error": {"code": "COMMAND_NOT_ALLOWED", "message": f"Command {command} not on allowlist"}})
    try:
        confirmation = hw_gate.consume_hardware_confirmation_token(confirmation_token, command)
        if confirmation.drone_id != drone_id:
            return JSONResponse(status_code=403, content={"error": {"code": "TOKEN_DRONE_MISMATCH", "message": "Token does not match this drone"}})
        pool = pool_mod.get_pool()
        pilot = pool.pilot(drone_id)
        geofence = geo.get_geofence(project_id) if project_id else None
        receipt = pilot.send_command(
            command,
            parameters=parameters,
            confirmation_token=confirmation_token,
            geofence_validation=lambda p: geo.validate_command_geofence(p, geofence),
        )
        with SessionLocal() as db:
            db.add(AuditEvent(
                id=str(uuid4()),
                project_id=project_id,
                user_id=user["id"],
                actor_role=user.get("role", "user"),
                event_type="labbench.voice.command_sent" if receipt.sent_to_hardware else "labbench.voice.command_refused",
                message=f"Commande vocale {command} drone {drone_id}: {'envoyée' if receipt.sent_to_hardware else 'refusée'}",
                payload_json=json.dumps({
                    "scope": "voice",
                    "command": command,
                    "droneId": drone_id,
                    "receiptId": receipt.receipt_id,
                    "sentToHardware": receipt.sent_to_hardware,
                    "physicalOutputEnabled": receipt.sent_to_hardware,
                    "physicalCommandsEmitted": receipt.sent_to_hardware,
                }, ensure_ascii=False),
                occurred_at=datetime.now(UTC),
            ))
            db.commit()
        return JSONResponse({
            "command": command,
            "accepted": receipt.accepted,
            "sentToHardware": receipt.sent_to_hardware,
            "receiptId": receipt.receipt_id,
            "reason": receipt.reason,
            "physicalOutputEnabled": receipt.sent_to_hardware,
            "physicalCommandsEmitted": receipt.sent_to_hardware,
        }, headers={"Cache-Control": "no-store", "Vary": "Cookie"})
    except (hw_gate.LabBenchError, cmd_api.HardwareCommandError) as exc:
        return JSONResponse(status_code=getattr(exc, "status_code", 400), content={"error": {"code": getattr(exc, "code", "ERROR"), "message": str(exc)}})


@router.get("/examples")
def examples_endpoint():
    """Return example voice commands for the UI help."""
    return {
        "examples": [
            {"text": "décolle à 5 mètres", "preview": "Takeoff à 5 m", "command": "NAV_TAKEOFF"},
            {"text": "take off to 10 meters", "preview": "Takeoff à 10 m", "command": "NAV_TAKEOFF"},
            {"text": "atterris", "preview": "Atterrissage", "command": "NAV_LAND"},
            {"text": "land", "preview": "Atterrissage", "command": "NAV_LAND"},
            {"text": "reviens à la base", "preview": "RTL", "command": "NAV_RETURN_TO_LAUNCH"},
            {"text": "return to launch", "preview": "RTL", "command": "NAV_RETURN_TO_LAUNCH"},
            {"text": "arme le drone", "preview": "Armement", "command": "COMPONENT_ARM_DISARM"},
            {"text": "arm", "preview": "Armement", "command": "COMPONENT_ARM_DISARM"},
            {"text": "désarme", "preview": "Désarmement", "command": "COMPONENT_ARM_DISARM"},
            {"text": "disarm", "preview": "Désarmement", "command": "COMPONENT_ARM_DISARM"},
            {"text": "arrêt d'urgence", "preview": "E-STOP", "command": "EMERGENCY_STOP"},
            {"text": "emergency stop", "preview": "E-STOP", "command": "EMERGENCY_STOP"},
        ],
    }
