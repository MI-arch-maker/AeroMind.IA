"""Service de contrôle VIRTUAL exclusivement logiciel pour AeroMind.

Aucun adaptateur, port, lien de télémétrie ou pilote matériel n'est importé ici.
Les sessions et leur journal sont volontairement en mémoire, bornés et cloisonnés
par identité authentifiée.
"""

from __future__ import annotations

from collections import OrderedDict, deque
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import RLock
from typing import Any

MAX_VIRTUAL_SESSIONS = 128
MAX_VIRTUAL_JOURNAL_ENTRIES = 100
MAX_PENDING_COMMANDS = 32
MAX_CONSUMED_ACTION_IDS = 256

# Repère volontairement local et synthétique : il ne représente aucune latitude,
# longitude, adresse ou zone physique.
VIRTUAL_GEOFENCE: dict[str, Any] = {
    "coordinate_system": "local-virtual-meters",
    "origin": "synthetic scenario origin; not a geographic coordinate",
    "x_m": {"min": -500, "max": 500},
    "y_m": {"min": -500, "max": 500},
    "altitude_m": {"min": 0, "max": 120},
}


class VirtualControlError(ValueError):
    """Violation d'état ou de confirmation du contrat virtuel."""


@dataclass
class VirtualControlService:
    """État d'une seule session utilisateur dans le jumeau virtuel."""

    mode: str = "SIMULATION"
    virtual_active: bool = False
    armed: bool = False
    stopped: bool = False
    position: dict[str, float] | None = None
    heading_deg: float | None = None
    revision: int = 0
    _sequence: int = 0
    _pending: deque[dict[str, Any]] = field(default_factory=lambda: deque(maxlen=MAX_PENDING_COMMANDS))
    _journal: deque[dict[str, Any]] = field(
        default_factory=lambda: deque(maxlen=MAX_VIRTUAL_JOURNAL_ENTRIES)
    )
    _consumed_action_ids: deque[str] = field(default_factory=deque)
    _consumed_action_id_set: set[str] = field(default_factory=set)
    _lock: RLock = field(default_factory=RLock, repr=False)

    def _state(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "revision": self.revision,
            "virtual_active": self.virtual_active,
            "armed": self.armed,
            "stopped": self.stopped,
            "physical_output": False,
            "pending_commands": len(self._pending),
            "virtual_geofence": deepcopy(VIRTUAL_GEOFENCE),
            "setpoint": {
                "position": deepcopy(self.position),
                "heading_deg": self.heading_deg,
            },
        }

    def _record(self, event: str, payload: dict[str, Any], status: str) -> dict[str, Any]:
        self._sequence += 1
        receipt = {
            "id": f"VCTRL-{self._sequence:06d}",
            "revision": self.revision,
            "event": event,
            "payload": deepcopy(payload),
            "status": status,
            "created_at": datetime.now(UTC).isoformat(),
            "scope": "virtual-only",
            "physical_output": False,
        }
        self._journal.append(receipt)
        return deepcopy(receipt)

    def _consume_action(self, action_id: str | None, expected_revision: int | None) -> None:
        """Vérifie atomiquement l'optimistic-lock et rend l'identifiant inutilisable."""
        if not action_id or not action_id.strip() or expected_revision is None:
            raise VirtualControlError("action_id and expected_revision are required for a VIRTUAL action.")
        if action_id in self._consumed_action_id_set:
            raise VirtualControlError("Duplicate action_id refused: this VIRTUAL action was already consumed.")
        if expected_revision != self.revision:
            raise VirtualControlError(
                f"Stale VIRTUAL action refused: expected revision {expected_revision}, current revision is {self.revision}."
            )
        self._consumed_action_ids.append(action_id)
        self._consumed_action_id_set.add(action_id)
        while len(self._consumed_action_ids) > MAX_CONSUMED_ACTION_IDS:
            expired = self._consumed_action_ids.popleft()
            self._consumed_action_id_set.discard(expired)

    def state(self) -> dict[str, Any]:
        with self._lock:
            return self._state()

    def activate(
        self,
        confirm_operator: bool,
        confirm_safety: bool,
        action_id: str | None,
        expected_revision: int | None,
    ) -> dict[str, Any]:
        """Active explicitement le jumeau; les confirmations sont d'usage unique."""
        with self._lock:
            if not (confirm_operator and confirm_safety):
                raise VirtualControlError(
                    "L’activation VIRTUAL exige les deux confirmations explicites du même opérateur."
                )
            self._consume_action(action_id, expected_revision)
            self.mode = "VIRTUAL"
            self.virtual_active = True
            self.armed = False
            # Un arrêt d'urgence n'est levé que par cette activation explicite.
            self.stopped = False
            self.revision += 1
            receipt = self._record(
                "virtual_activation",
                {"confirm_operator": True, "confirm_safety": True},
                "accepted",
            )
            return {**self._state(), "receipt": receipt, "confirmations_consumed": True}

    def select_simulation(self) -> dict[str, Any]:
        """Revient au banc SIMULATION passif et désarme systématiquement."""
        with self._lock:
            self.mode = "SIMULATION"
            self.virtual_active = False
            self.armed = False
            self._pending.clear()
            self.revision += 1
            receipt = self._record("simulation_selected", {}, "accepted")
            return {**self._state(), "receipt": receipt, "confirmations_consumed": False}

    def arm(
        self,
        confirm_operator: bool,
        confirm_safety: bool,
        action_id: str | None,
        expected_revision: int | None,
    ) -> dict[str, Any]:
        """Arme seulement le modèle virtuel après une nouvelle paire de confirmations."""
        with self._lock:
            if self.stopped:
                raise VirtualControlError(
                    "Arrêt d’urgence actif : réactivez explicitement VIRTUAL avant tout armement."
                )
            if self.mode != "VIRTUAL" or not self.virtual_active:
                raise VirtualControlError("Activez d’abord le mode VIRTUAL avant l’armement virtuel.")
            if not (confirm_operator and confirm_safety):
                raise VirtualControlError(
                    "L’armement VIRTUAL exige une nouvelle paire de confirmations explicites."
                )
            self._consume_action(action_id, expected_revision)
            self.armed = True
            self.revision += 1
            receipt = self._record(
                "virtual_arm",
                {"confirm_operator": True, "confirm_safety": True},
                "accepted",
            )
            return {**self._state(), "receipt": receipt, "confirmations_consumed": True}

    def command(
        self,
        command: str,
        payload: dict[str, float],
        confirm_command: bool,
        action_id: str | None,
        expected_revision: int | None,
    ) -> dict[str, Any]:
        """Applique un setpoint synthétique immédiatement, sans sortie externe."""
        with self._lock:
            if self.stopped:
                raise VirtualControlError(
                    "Arrêt d’urgence actif : aucune reprise automatique n’est autorisée."
                )
            if self.mode != "VIRTUAL" or not self.virtual_active or not self.armed:
                raise VirtualControlError(
                    "Commande VIRTUAL refusée : activez puis armez explicitement le jumeau."
                )
            if not confirm_command:
                raise VirtualControlError(
                    "Confirmez le setpoint courant : cette confirmation est consommée après chaque commande."
                )
            self._consume_action(action_id, expected_revision)
            if command == "position":
                self.position = {
                    "x_m": payload["x_m"],
                    "y_m": payload["y_m"],
                    "altitude_m": payload["altitude_m"],
                }
            elif command == "heading":
                self.heading_deg = payload["heading_deg"]
            else:  # Défense en profondeur; l'API Pydantic borne déjà la liste.
                raise VirtualControlError("Commande virtuelle inconnue.")

            queued = {"command": command, "payload": deepcopy(payload)}
            self._pending.append(queued)
            # Le moteur de démonstration est synchrone : il consomme exactement
            # son propre setpoint, sans file persistante ni exécutant autonome.
            self._pending.pop()
            self.revision += 1
            receipt = self._record(command, payload, "applied_virtual")
            return {
                **self._state(),
                "receipt": receipt,
                "command_confirmation_consumed": True,
            }

    def emergency_stop(self) -> dict[str, Any]:
        """Purge, désarme et interdit toute reprise implicite."""
        with self._lock:
            purged = len(self._pending)
            self._pending.clear()
            self.mode = "SIMULATION"
            self.virtual_active = False
            self.armed = False
            self.stopped = True
            self.revision += 1
            receipt = self._record("emergency_stop", {"queue_purged": purged}, "stopped")
            return {
                **self._state(),
                "disarmed": True,
                "queue_purged": purged,
                "hardware_called": False,
                "receipt": receipt,
                "confirmations_invalidated": True,
            }

    def logs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            # newest first, bounded regardless of a caller-supplied limit
            safe_limit = max(1, min(limit, MAX_VIRTUAL_JOURNAL_ENTRIES))
            return [deepcopy(row) for row in list(self._journal)[-safe_limit:][::-1]]


_sessions: OrderedDict[str, VirtualControlService] = OrderedDict()
_sessions_lock = RLock()


def controller_for(user_id: str) -> VirtualControlService:
    """Retourne une session cloisonnée; l'éviction LRU conserve la mémoire bornée."""
    with _sessions_lock:
        controller = _sessions.get(user_id)
        if controller is None:
            controller = VirtualControlService()
            _sessions[user_id] = controller
            while len(_sessions) > MAX_VIRTUAL_SESSIONS:
                _sessions.popitem(last=False)
        else:
            _sessions.move_to_end(user_id)
        return controller
