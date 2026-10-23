"""API de contrôle AeroMind : VIRTUAL seulement, sans chemin physique."""

from typing import Literal

from fastapi import APIRouter, Cookie, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .app_auth_helpers import current_user
from .database import SessionLocal
from .models import User
from .virtual_control import VirtualControlError, controller_for

router = APIRouter(prefix="/api/control", tags=["virtual-control"])

# Alias de compatibilité lu par certaines versions de web.app. Il ne contient
# que des VirtualControlService, sans pilote ni contrôleur matériel. Le mode
# "VIRTUAL" n'est jamais assimilé à HARDWARE par cette API.
from .virtual_control import _sessions as _controllers


def feature_enabled() -> bool:
    # Garde-fou non négociable : AeroMind n'ouvre aucune sortie physique, même
    # si HARDWARE_CONTROL ou tout autre flag d'environnement est positionné.
    return False


def _require_user(cookie: str | None):
    user = current_user(cookie)
    if not user:
        raise HTTPException(401, "OIDC authentication required")
    if user.get("role") == "visitor":
        raise HTTPException(
            403,
            "Visitor accounts use the explicit local simulation and cannot create a server virtual-control session.",
        )
    with SessionLocal() as db:
        row = db.get(User, user["id"])
        if row is None:
            db.add(User(id=user["id"], email=user["email"]))
            db.commit()
    return user


def _hardware_refused() -> None:
    # Ne consulter aucun flag et n'importer aucun pilote : HARDWARE est fermé
    # par conception, pas par configuration.
    raise HTTPException(
        403,
        "HARDWARE is permanently unavailable: AeroMind only controls a virtual model.",
    )


class ModeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["SIMULATION", "VIRTUAL", "HARDWARE"]
    # Requis seulement pour VIRTUAL : SIMULATION reste un désarmement simple.
    action_id: str | None = Field(default=None, min_length=8, max_length=128)
    expected_revision: int | None = Field(default=None, ge=0)
    # Ces deux confirmations sont deux attestations explicites du même humain,
    # pas un processus de double approbation inter-comptes.
    confirm_operator: bool = False
    confirm_safety: bool = False


class CommandInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    command: Literal["position", "heading"]
    # Setpoint local au scénario : jamais une géolocalisation terrestre.
    x_m: float | None = Field(default=None, ge=-500, le=500)
    y_m: float | None = Field(default=None, ge=-500, le=500)
    altitude_m: float | None = Field(default=None, ge=0, le=120)
    heading_deg: float | None = Field(default=None, ge=0, le=360)
    confirm_command: bool = False
    action_id: str | None = Field(default=None, min_length=8, max_length=128)
    expected_revision: int | None = Field(default=None, ge=0)
    # Compatibilité de validation avec l'ancien contrat. Ces entrées ne sont
    # jamais interprétées ni enregistrées : l'endpoint les refuse explicitement.
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def validate_virtual_setpoint(self):
        legacy_coordinates = self.latitude is not None or self.longitude is not None
        if self.command == "position" and not legacy_coordinates:
            if self.x_m is None or self.y_m is None or self.altitude_m is None:
                raise ValueError("position requires x_m, y_m and altitude_m in the virtual local frame")
            if self.heading_deg is not None:
                raise ValueError("position does not accept heading_deg; send a separate heading command")
        if self.command == "heading" and not legacy_coordinates:
            if self.heading_deg is None:
                raise ValueError("heading requires heading_deg")
            if self.x_m is not None or self.y_m is not None or self.altitude_m is not None:
                raise ValueError("heading only accepts heading_deg")
        return self


@router.post("/mode")
def set_control_mode(
    body: ModeInput,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
):
    user = _require_user(aeromind_session)
    if body.mode == "HARDWARE":
        _hardware_refused()
    controller = controller_for(user["id"])
    try:
        if body.mode == "VIRTUAL":
            return controller.activate(
                body.confirm_operator,
                body.confirm_safety,
                body.action_id,
                body.expected_revision,
            )
        return controller.select_simulation()
    except VirtualControlError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/arm")
def arm(
    body: ModeInput,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
):
    user = _require_user(aeromind_session)
    if body.mode == "HARDWARE":
        _hardware_refused()
    if body.mode != "VIRTUAL":
        raise HTTPException(409, "Select VIRTUAL before virtual arming.")
    try:
        return controller_for(user["id"]).arm(
            body.confirm_operator,
            body.confirm_safety,
            body.action_id,
            body.expected_revision,
        )
    except VirtualControlError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/command")
def send_command(
    body: CommandInput,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
):
    user = _require_user(aeromind_session)
    if body.latitude is not None or body.longitude is not None:
        # Ne jamais transformer des coordonnées géographiques en coordonnées du
        # jumeau : ce serait ambigu et pourrait ressembler à une commande réelle.
        raise HTTPException(
            403,
            "Geographic coordinates are disabled; use the documented virtual local frame only.",
        )
    payload = {
        key: value
        for key, value in body.model_dump(
            exclude={
                "command", "confirm_command", "action_id", "expected_revision",
                "latitude", "longitude",
            },
            exclude_none=True,
        ).items()
    }
    try:
        return controller_for(user["id"]).command(
            body.command,
            payload,
            body.confirm_command,
            body.action_id,
            body.expected_revision,
        )
    except VirtualControlError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/emergency-stop")
def emergency_stop(
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
):
    user = _require_user(aeromind_session)
    # Un clic crée au besoin une session vierge, puis purge/désarme exclusivement
    # son modèle virtuel. Aucun chemin ne peut appeler un lien externe.
    return controller_for(user["id"]).emergency_stop()


@router.get("/state")
def get_virtual_state(
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
):
    """État courant de la session VIRTUAL, révision comprise, sans effet de bord."""
    user = _require_user(aeromind_session)
    return controller_for(user["id"]).state()


@router.get("/logs")
def list_virtual_logs(
    limit: int = Query(default=50, ge=1, le=100),
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
):
    user = _require_user(aeromind_session)
    return controller_for(user["id"]).logs(limit)
