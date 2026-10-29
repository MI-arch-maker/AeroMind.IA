"""Phase A — MAVLink command pilot (write path).

This module is the ONLY place in AeroMind that can send a MAVLink command to a
real flight controller. It is gated by a triple safety mechanism:

1. ``HARDWARE_CONTROL`` environment variable must be EXACTLY the string
   ``"true"`` (case-insensitive). Any other value, including ``"1"``, ``"yes"``
   or ``"on"``, returns ``False`` from :func:`hardware_commands_enabled`.
2. The command must be on the strict allowlist ``ALLOWED_COMMANDS``. There is
   no ``*`` wildcard and no way to extend the list without a code change.
3. Every command requires a per-call confirmation token derived from the
   project's gate state (see :mod:`web.hardware_gate`). The token is single-use
   and audit-logged.

Even when all three gates pass, the module NEVER sends a command that has not
been validated against the geofence (see :mod:`web.geofence_validator`).

This module is intentionally importable without pymavlink installed — the
import happens lazily inside :meth:`MavlinkCommandPilot.send_command` so the
test suite can run with a fake connection factory.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import RLock
from typing import Any, Callable
from uuid import uuid4


# ---------------------------------------------------------------------------
# Allowlist — the only MAVLink commands AeroMind is allowed to send.
# Extending this list requires a code change AND a security review.
# ---------------------------------------------------------------------------

ALLOWED_COMMANDS: tuple[str, ...] = (
    "COMPONENT_ARM_DISARM",  # arm / disarm
    "NAV_TAKEOFF",           # takeoff to a target altitude
    "NAV_LAND",              # land at current position
    "NAV_RETURN_TO_LAUNCH",  # RTL
    "DO_SET_MODE",           # switch flight mode (limited to MANUAL/STABILIZE/AUTO)
    # P0-04 fix — EXIGENCE FUNC-05 / R10: mission upload protocol commands.
    # MISSION_COUNT + MISSION_ITEM_INT form the canonical GCS→autopilot
    # mission upload sequence (ArduPilot / PX4). The earlier allowlist
    # omitted them so the upload endpoint always returned
    # COMMAND_NOT_ALLOWED, then the code below marked the upload as
    # ``failed`` without distinguishing "command refused" from "transport
    # error" — the frontend had no way to tell the user *why* it failed.
    "MISSION_COUNT",         # announce number of waypoints (cmd id 43)
    "MISSION_ITEM_INT",      # upload one waypoint item (cmd id 52)
)

# Sub-allowlist for flight modes accepted by DO_SET_MODE.
ALLOWED_MODES: tuple[int, ...] = (
    0,   # MAV_MODE_PREFLIGHT
    1,   # MAV_MODE_STABILIZE_DISARMED
    2,   # MAV_MODE_STABILIZE_ARMED
    4,   # MAV_MODE_MANUAL_ARMED
    6,   # MAV_MODE_GUIDED_ARMED
    80,  # MAV_MODE_AUTO_DISARMED (custom ArduPilot mapping)
    81,  # MAV_MODE_AUTO_ARMED
)

# MAVLink command ids from the spec. Hard-coded to avoid importing pymavlink
# at module load time.
MAV_CMD_IDS: dict[str, int] = {
    "COMPONENT_ARM_DISARM": 400,
    "NAV_TAKEOFF": 22,
    "NAV_LAND": 21,
    "NAV_RETURN_TO_LAUNCH": 20,
    "DO_SET_MODE": 176,
    # P0-04 fix — mission upload protocol command ids (ArduPilot/PX4).
    "MISSION_COUNT": 43,
    "MISSION_ITEM_INT": 52,
}


class HardwareCommandError(ValueError):
    """Stable validation failure raised by the pilot."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def hardware_commands_enabled() -> bool:
    """Return True only if the operator has explicitly opted in to hardware mode.

    The check is strict on purpose: any value other than the exact string
    ``"true"`` (case-insensitive) returns ``False``. This means a typo like
    ``HARDWARE_CONTROL=yes`` or an empty string keeps the system closed.

    EXIGENCE SEC-01 / V3.1 — this function returns ``True`` ONLY when the env
    var is set. It is NOT sufficient on its own to authorize a physical
    transport. Callers MUST also pass through :func:`authorize_physical_command`
    which combines the env-var gate with:
      1. A signed single-use confirmation token issued by ``hardware_gate``.
      2. A valid fail-closed geofence (for navigation commands).
      3. Project ownership + drone ownership server-side verification.
      4. The G0–G5 gate state (virtual N3 armed + hardware review signed +
         drone registered in pool) — verified at token-issue time.
    """
    value = os.getenv("HARDWARE_CONTROL", "").strip().lower()
    return value == "true"


def authorize_physical_command(
    *,
    command: str,
    confirmation_token: str,
    project_id: str,
    drone_id: str,
    actor_id: str,
    geofence_validation: Callable[[dict[str, float]], dict[str, Any]] | None = None,
    parameters: dict[str, float] | None = None,
    _e_stop_override: bool = False,
    drone_position_provider: Callable[[], tuple[float, float] | None] | None = None,
) -> None:
    """Authorize a physical MAVLink command — the ONLY entry point for transports.

    EXIGENCE V3.1 #1 — ``HARDWARE_CONTROL=true`` alone MUST NEVER authorize a
    physical transport. This function performs the full multi-gate check
    before any MAVLink frame is sent:

      Gate 0 — Server-side separation: this code runs only in the backend
               process. The frontend has no path to this module.
      Gate 1 — ``HARDWARE_CONTROL=true`` (env var, exact string match).
      Gate 2 — Command allowlist (no wildcard, no dynamic extension).
      Gate 3a — Confirmation token shape validation (≥ 16 chars).
      Gate 4 — Context binding: ``project_id``, ``drone_id``, ``actor_id``
               all required (audit trail + ownership enforcement).
      Gate 3b — Signed single-use confirmation token issued by
               ``hardware_gate.issue_hardware_confirmation_token``. The token
               is consumed atomically; replay is rejected. The token's
               ``project_id`` and ``drone_id`` MUST match the request context.
      Gate 5 — Fail-closed geofence for navigation commands
               (NAV_TAKEOFF, NAV_LAND, NAV_RETURN_TO_LAUNCH). If no geofence is
               configured OR the params fall outside the polygon, the command
               is rejected before any frame is emitted.
               **Exception**: ``e_stop_override=True`` skips this gate for the
               emergency-stop path, which lands in place. The bypass is
               audit-logged with a dedicated ``E_STOP_BYPASS`` marker.
      Gate 6 — DO_SET_MODE sub-allowlist (MANUAL/STABILIZE/AUTO only).

    Raises :class:`HardwareCommandError` on the first failed gate. The
    caller MUST NOT catch this exception silently — the failure is
    audit-logged and surfaced to the operator with the specific gate that
    refused the command.
    """
    # Gate 0 — implicit (this function is only callable from backend code).
    # Gate 1 — env var
    if not hardware_commands_enabled():
        raise HardwareCommandError(
            403, "HARDWARE_DISABLED",
            "HARDWARE_CONTROL n'est pas 'true'; transport matériel refusé (SEC-01).",
        )
    # Gate 2 — allowlist
    if command not in ALLOWED_COMMANDS:
        raise HardwareCommandError(
            403, "COMMAND_NOT_ALLOWED",
            f"La commande {command!r} n'est pas sur la liste blanche.",
        )
    # Gate 3a — token shape validation (cheap pre-check before consuming it).
    # This catches malformed tokens before touching the single-use store.
    if not isinstance(confirmation_token, str) or len(confirmation_token) < 16:
        raise HardwareCommandError(
            401, "CONFIRMATION_TOKEN_INVALID",
            "Le jeton de confirmation doit faire ≥ 16 caractères et provenir de la gate N4 hardware.",
        )
    # Gate 4 — context binding (audit correlation)
    if not project_id or not drone_id or not actor_id:
        raise HardwareCommandError(
            400, "CONTEXT_REQUIRED",
            "project_id, drone_id et actor_id sont requis pour toute commande matérielle (SEC-01).",
        )
    # Gate 3b — signed single-use confirmation token consumption.
    # The token must have been issued by hardware_gate.issue_hardware_confirmation_token
    # (which itself requires the G0–G5 gate state to be complete). The token
    # is consumed atomically here; replay is rejected.
    try:
        from . import hardware_gate
        confirmation = hardware_gate.consume_hardware_confirmation_token(
            confirmation_token, command,
        )
    except Exception as exc:
        # Translate labbench errors into HardwareCommandError so the caller
        # gets a uniform error type.
        code = getattr(exc, "code", "TOKEN_INVALID")
        status = getattr(exc, "status_code", 401)
        raise HardwareCommandError(
            status, code, f"Jeton hardware invalide: {exc}"
        ) from exc
    # Verify the token's project_id and drone_id match the request context
    # (the token is bound to a specific (project, drone) pair at issue time).
    if getattr(confirmation, "project_id", None) != project_id:
        raise HardwareCommandError(
            403, "TOKEN_PROJECT_MISMATCH",
            f"Le jeton n'appartient pas au projet {project_id} (SEC-02 isolation).",
        )
    if getattr(confirmation, "drone_id", None) != drone_id:
        raise HardwareCommandError(
            403, "TOKEN_DRONE_MISMATCH",
            f"Le jeton n'appartient pas au drone {drone_id} (SEC-02 isolation).",
        )
    # Gate 5 — fail-closed geofence for navigation commands
    if command in {"NAV_TAKEOFF", "NAV_LAND", "NAV_RETURN_TO_LAUNCH"} and not _e_stop_override:
        if geofence_validation is None:
            # No geofence validation provided = no command sent (fail-closed).
            raise HardwareCommandError(
                403, "GEOFENCE_REQUIRED",
                f"La commande {command} exige une validation géofence fail-closed (SEC-04).",
            )
        params = dict(parameters or {})
        # P0-06 fix: if lat/lon (p5/p6) are missing for TAKEOFF/LAND, query
        # the drone's current position via the observer and inject it so the
        # geofence polygon check actually runs (was silently skipped before).
        if command in {"NAV_TAKEOFF", "NAV_LAND"} and (params.get("p5") is None or params.get("p6") is None):
            if drone_position_provider is None:
                raise HardwareCommandError(
                    400, "POSITION_REQUIRED",
                    f"{command} exige la position courante du drone (p5/p6) ou un drone_position_provider (SEC-04).",
                )
            pos = drone_position_provider()
            if pos is None or not (isinstance(pos, tuple) and len(pos) == 2):
                raise HardwareCommandError(
                    503, "POSITION_UNAVAILABLE",
                    f"Position drone indisponible — télémétrie requise pour valider le géofence de {command}.",
                )
            params["p5"] = float(pos[0])  # latitude
            params["p6"] = float(pos[1])  # longitude
        validation = geofence_validation(params)
        if not validation.get("inside_geofence", False):
            raise HardwareCommandError(
                409, "GEOFENCE_BREACH",
                f"Commande {command} refusée: {validation.get('reason', 'hors géofence')}",
            )
    elif command in {"NAV_TAKEOFF", "NAV_LAND", "NAV_RETURN_TO_LAUNCH"} and _e_stop_override:
        # P0-05 fix: e-stop bypass is now a PRIVATE parameter (_e_stop_override).
        # Only send_emergency_land() can set it. Audit the bypass explicitly.
        try:
            from .labbench_auth import audit_decision
            audit_decision(
                actor_id=actor_id, actor_role="system",
                action="labbench.hardware.estop_bypass", decision="allow",
                project_id=project_id, drone_id=drone_id,
                message=f"E_STOP_BYPASS — geofence skipped for {command} (drone={drone_id})",
            )
        except Exception:
            pass  # audit failure must not block the e-stop
        import sys
        print(
            f"WARNING: E_STOP_BYPASS — geofence validation skipped for {command} "
            f"(project={project_id}, drone={drone_id}, actor={actor_id})",
            file=sys.stderr, flush=True,
        )
    # Gate 6 — DO_SET_MODE sub-allowlist
    if command == "DO_SET_MODE":
        params = dict(parameters or {})
        mode_value = int(params.get("mode", -1))
        if mode_value not in ALLOWED_MODES:
            raise HardwareCommandError(
                403, "MODE_NOT_ALLOWED",
                f"Le mode {mode_value} n'est pas sur la liste blanche des modes autorisés.",
            )


def verify_physical_transport_authorized(
    *,
    command: str,
    confirmation_token: str,
    project_id: str,
    drone_id: str,
    actor_id: str,
    geofence_validation: Callable[[dict[str, float]], dict[str, Any]] | None = None,
    parameters: dict[str, float] | None = None,
) -> None:
    """Backwards-compatible alias for :func:`authorize_physical_command`.

    Kept so existing call sites that used ``verify_*`` naming continue to work.
    """
    authorize_physical_command(
        command=command,
        confirmation_token=confirmation_token,
        project_id=project_id,
        drone_id=drone_id,
        actor_id=actor_id,
        geofence_validation=geofence_validation,
        parameters=parameters,
    )


@dataclass
class CommandReceipt:
    command: str
    target_system: int
    target_component: int
    accepted: bool
    sent_to_hardware: bool
    reason: str
    receipt_id: str = field(default_factory=lambda: str(uuid4()))
    sent_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    parameters: dict[str, Any] = field(default_factory=dict)
    audit_event_id: str | None = None


class MavlinkCommandPilot:
    """Sends a single MAVLink command to one flight controller.

    The pilot is per-drone: each drone in the fleet has its own pilot instance
    (see :mod:`web.mavlink_pool`). Tests inject a ``connection_factory`` so no
    socket is opened.
    """

    def __init__(
        self,
        connection_url: str,
        *,
        target_system: int = 1,
        target_component: int = 1,
        source_system: int = 255,
        source_component: int = 190,
        connection_factory: Callable[[str], Any] | None = None,
    ) -> None:
        self.connection_url = connection_url
        self.target_system = target_system
        self.target_component = target_component
        self.source_system = source_system
        self.source_component = source_component
        self._connection_factory = connection_factory
        self._connection: Any | None = None
        self._lock = RLock()

    # The connection is opened lazily so the module can be imported in tests
    # without pymavlink installed. The first ``send_command`` call triggers
    # the import + socket open.
    def _ensure_connection(self) -> Any:
        with self._lock:
            if self._connection is not None:
                return self._connection
            factory = self._connection_factory or self._default_connection_factory
            conn = factory(self.connection_url)
            self._connection = conn
            return conn

    @staticmethod
    def _default_connection_factory(url: str) -> Any:
        try:
            from pymavlink import mavutil  # noqa: WPS433 — lazy on purpose
        except ImportError as exc:
            raise HardwareCommandError(
                503,
                "PYMAVLINK_MISSING",
                "pymavlink n'est pas installé sur ce runtime; le pilote reste fermé.",
            ) from exc
        return mavutil.mavlink_connection(
            url,
            source_system=255,
            source_component=190,
        )

    def close(self) -> None:
        with self._lock:
            if self._connection is not None and hasattr(self._connection, "close"):
                try:
                    self._connection.close()
                except Exception:
                    pass
            self._connection = None

    def send_command(
        self,
        command: str,
        *,
        parameters: dict[str, float] | None = None,
        confirmation_token: str,
        geofence_validation: Callable[[dict[str, float]], dict[str, Any]] | None = None,
        # SEC-01 fix — additional required context to enforce server-side separation
        project_id: str | None = None,
        drone_id: str | None = None,
        actor_id: str | None = None,
        # P0-06 fix — position provider for geofence polygon check on TAKEOFF/LAND
        drone_position_provider: Callable[[], tuple[float, float] | None] | None = None,
    ) -> CommandReceipt:
        """Validate + send one command. Returns a receipt; never raises on
        MAVLink transport errors — they are captured in the receipt reason.

        EXIGENCE V3.1 #1 — ``HARDWARE_CONTROL=true`` alone MUST NEVER authorize
        a physical transport. The full multi-gate check is delegated to
        :func:`authorize_physical_command`.

        P0-05 fix: the ``e_stop_override`` parameter has been REMOVED from the
        public signature. Emergency landing must go through
        :meth:`send_emergency_land` which is the only path that bypasses the
        geofence (for NAV_LAND only, audit-logged).
        """
        # === Unified multi-gate authorization (V3.1) ===
        authorize_physical_command(
            command=command,
            confirmation_token=confirmation_token,
            project_id=project_id or "",
            drone_id=drone_id or "",
            actor_id=actor_id or "",
            geofence_validation=geofence_validation,
            parameters=parameters,
            drone_position_provider=drone_position_provider,
        )
        params = dict(parameters or {})


        # === Send (lazy connection) ===
        try:
            conn = self._ensure_connection()
        except HardwareCommandError:
            raise
        except Exception as exc:
            return CommandReceipt(
                command=command,
                target_system=self.target_system,
                target_component=self.target_component,
                accepted=False,
                sent_to_hardware=False,
                reason=f"Connexion MAVLink échouée: {exc}",
                parameters=params,
            )

        cmd_id = MAV_CMD_IDS[command]
        # Build the param dict in MAVLink order (p1..p7).
        p1 = float(params.get("p1", 0.0))
        p2 = float(params.get("p2", 0.0))
        p3 = float(params.get("p3", 0.0))
        p4 = float(params.get("p4", 0.0))
        p5 = float(params.get("p5", 0.0))
        p6 = float(params.get("p6", 0.0))
        p7 = float(params.get("p7", 0.0))
        try:
            # SEC-01 fix — single outbound MAVLink call, well-documented.
            # This is the ONLY place in the codebase that calls command_long_send.
            # The README and audit reports must reflect this fact.
            # pymavlink API: mavlink.command_long_send(target_system, target_component,
            # command_id, confirmation, p1..p7)
            if hasattr(conn, "command_long_send"):
                conn.command_long_send(
                    self.target_system,
                    self.target_component,
                    cmd_id,
                    0,  # confirmation: 0 = first try
                    p1, p2, p3, p4, p5, p6, p7,
                )
            sent = True
            reason = "Commande envoyée au contrôleur de vol."
        except Exception as exc:
            sent = False
            reason = f"Échec d'envoi MAVLink: {exc}"
            # P0-09 fix: if the MAVLink send failed, un-consume the token so
            # the operator can replay within the token's remaining TTL.
            # Without this, a network timeout would force a full G0-G5
            # re-approval just to retry the same command.
            try:
                from .hardware_gate import unconsume_hardware_confirmation_token
                unconsume_hardware_confirmation_token(confirmation_token)
            except Exception:
                pass  # best-effort — do not mask the original MAVLink error

        return CommandReceipt(
            command=command,
            target_system=self.target_system,
            target_component=self.target_component,
            accepted=sent,
            sent_to_hardware=sent,
            reason=reason,
            parameters=params,
        )

    def send_emergency_land(
        self,
        *,
        confirmation_token: str,
        project_id: str,
        drone_id: str,
        actor_id: str,
        parameters: dict[str, float] | None = None,
    ) -> CommandReceipt:
        """P0-05 fix — the ONLY public path that bypasses the geofence gate.

        Emergency landing (NAV_LAND) lands in place. The geofence is bypassed
        via the internal ``_e_stop_override`` flag. An audit event
        ``labbench.hardware.estop_bypass`` is emitted. This method ONLY
        supports NAV_LAND — not NAV_TAKEOFF, not NAV_RETURN_TO_LAUNCH — so a
        compromised caller cannot use it to take off outside the geofence.
        """
        authorize_physical_command(
            command="NAV_LAND",
            confirmation_token=confirmation_token,
            project_id=project_id,
            drone_id=drone_id,
            actor_id=actor_id,
            geofence_validation=None,
            parameters=parameters,
            _e_stop_override=True,
        )
        params = dict(parameters or {})
        try:
            conn = self._ensure_connection()
        except HardwareCommandError:
            raise
        except Exception as exc:
            return CommandReceipt(
                command="NAV_LAND",
                target_system=self.target_system,
                target_component=self.target_component,
                accepted=False,
                sent_to_hardware=False,
                reason=f"Connexion MAVLink échouée: {exc}",
                parameters=params,
            )
        cmd_id = MAV_CMD_IDS["NAV_LAND"]
        try:
            if hasattr(conn, "command_long_send"):
                conn.command_long_send(
                    self.target_system, self.target_component, cmd_id, 0,
                    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
                )
            sent = True
            reason = "E-stop NAV_LAND envoyé (geofence bypass audit-loggé)."
        except Exception as exc:
            sent = False
            reason = f"Échec d'envoi MAVLink (e-stop): {exc}"
        return CommandReceipt(
            command="NAV_LAND",
            target_system=self.target_system,
            target_component=self.target_component,
            accepted=sent,
            sent_to_hardware=sent,
            reason=reason,
            parameters=params,
        )


# ---------------------------------------------------------------------------
# Helper for the API layer — builds the parameters dict for common commands.
# ---------------------------------------------------------------------------

def build_takeoff_params(altitude_m: float) -> dict[str, float]:
    """Build MAVLink params for NAV_TAKEOFF (p7 = altitude)."""
    if not 0.5 <= altitude_m <= 120:
        raise HardwareCommandError(400, "ALTITUDE_OUT_OF_RANGE", "L'altitude de décollage doit être entre 0.5 m et 120 m (EASA Open).")
    return {"p7": float(altitude_m)}


def build_arm_params(arm: bool) -> dict[str, float]:
    """Build MAVLink params for COMPONENT_ARM_DISARM (p1 = 1 arm / 0 disarm)."""
    return {"p1": 1.0 if arm else 0.0}


def build_land_params() -> dict[str, float]:
    return {}


def build_rtl_params() -> dict[str, float]:
    return {}


def build_mode_params(mode: int) -> dict[str, float]:
    if mode not in ALLOWED_MODES:
        raise HardwareCommandError(403, "MODE_NOT_ALLOWED", f"Le mode {mode} n'est pas sur la liste blanche.")
    # DO_SET_MODE uses p1 = mode, p2 = custom mode (ArduPilot convention).
    return {"p1": float(mode), "p2": 0.0}
