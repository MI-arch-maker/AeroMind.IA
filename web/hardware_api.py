"""Gated control API. The adapter module is imported only after the feature flag passes."""

import json
import os
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Cookie, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from .app_auth_helpers import current_user
from .database import SessionLocal
from .models import HardwareLog, User

router = APIRouter(prefix="/api/control", tags=["hardware-control"])
_controllers = {}


def feature_enabled() -> bool:
    # Garde-fou non négociable : cette version ne possède aucun chemin de
    # sortie physique, même si une variable d’environnement est mal configurée.
    return False


def _require_user(cookie: str | None):
    user = current_user(cookie)
    if not user:
        raise HTTPException(401, "OIDC authentication required")
    with SessionLocal() as db:
        row = db.get(User, user["id"])
        if row is None:
            db.add(User(id=user["id"], email=user["email"]))
            db.commit()
    return user


def _require_flag():
    if not feature_enabled():
        raise HTTPException(403, "Hardware control is disabled by HARDWARE_CONTROL")


def _get_controller(user_id: str):
    if user_id not in _controllers:
        # Lazy import ensures the physical adapter is not even loaded on the flag-off path.
        from hardware.control_link import MAVLinkLink
        from hardware.control_service import Geofence, HardwareControlService

        raw = os.getenv("AEROMIND_GEOFENCE", "")
        try:
            fence_data = json.loads(raw)
            fence = Geofence(**fence_data)
        except Exception as exc:
            raise HTTPException(
                503, "AEROMIND_GEOFENCE must define min/max latitude and longitude"
            ) from exc

        def journal(command, payload, status):
            with SessionLocal() as db:
                db.add(
                    HardwareLog(
                        user_id=user_id,
                        command=command,
                        payload_json=json.dumps(payload),
                        status=status,
                        created_at=datetime.now(UTC),
                    )
                )
                db.commit()

        _controllers[user_id] = HardwareControlService(MAVLinkLink(), fence, journal)
    return _controllers[user_id]


class ModeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["SIMULATION", "HARDWARE"]
    confirm_operator: bool = False
    confirm_safety: bool = False


class CommandInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    command: Literal["position", "heading"]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude_m: float | None = Field(default=None, ge=0, le=120)
    heading_deg: float | None = Field(default=None, ge=0, le=360)


@router.post("/mode")
def set_control_mode(body: ModeInput, aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    user = _require_user(aeromind_session)
    if body.mode == "SIMULATION":
        if user["id"] in _controllers and _controllers[user["id"]].mode == "HARDWARE":
            try:
                _controllers[user["id"]].emergency_disarm()
            except RuntimeError as exc:
                raise HTTPException(
                    409, "Unable to confirm disarm; retain independent physical E-stop"
                ) from exc
        return {"mode": "SIMULATION", "hardware_control": False}
    _require_flag()
    controller = _get_controller(user["id"])
    try:
        mode = controller.select_mode(
            body.mode,
            body.confirm_operator,
            body.confirm_safety,
            os.getenv("AEROMIND_MAVLINK_URL", "udpin:0.0.0.0:14550"),
        )
    except ImportError as exc:
        raise HTTPException(503, "pymavlink is unavailable; hardware link was not opened") from exc
    except (ValueError, RuntimeError, TimeoutError) as exc:
        raise HTTPException(422, str(exc)) from exc
    return {"mode": mode, "hardware_control": True, "double_confirmation": True}


@router.post("/arm")
def arm(body: ModeInput, aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    user = _require_user(aeromind_session)
    _require_flag()
    controller = _get_controller(user["id"])
    try:
        return controller.arm(body.confirm_operator, body.confirm_safety)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/command")
def send_command(body: CommandInput, aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    user = _require_user(aeromind_session)
    _require_flag()
    controller = _get_controller(user["id"])
    payload = body.model_dump(exclude={"command"}, exclude_none=True)
    try:
        return controller.enqueue(body.command, payload)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/emergency-stop")
def emergency_stop(aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    user = _require_user(aeromind_session)
    # In simulation the one-click stop never loads/calls a physical adapter.
    controller = _controllers.get(user["id"])
    if not feature_enabled() or controller is None or controller.mode != "HARDWARE":
        return {"disarmed": True, "queue_purged": 0, "mode": "SIMULATION", "hardware_called": False}
    try:
        result = controller.emergency_disarm()
    except RuntimeError as exc:
        raise HTTPException(
            409, "Disarm not confirmed by link; use the independent physical E-stop"
        ) from exc
    return {**result, "hardware_called": True}


@router.get("/logs")
def list_hardware_logs(aeromind_session: str | None = Cookie(default=None, convert_underscores=False)):
    user = _require_user(aeromind_session)
    with SessionLocal() as db:
        return [
            {
                "id": row.id,
                "command": row.command,
                "payload": json.loads(row.payload_json),
                "status": row.status,
                "created_at": row.created_at.isoformat(),
            }
            for row in db.scalars(
                select(HardwareLog)
                .where(HardwareLog.user_id == user["id"])
                .order_by(HardwareLog.created_at.desc())
                .limit(500)
            )
        ]
