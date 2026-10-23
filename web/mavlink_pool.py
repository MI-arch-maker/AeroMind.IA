"""Phase B — Per-drone MAVLink worker pool.

Each drone in the fleet has its own :class:`MavlinkCommandPilot` and its own
background observer thread. The pool is bounded by ``MAX_FLEET_SIZE`` (12)
and refuses to register a connection that would exceed the cap.

The pool is intentionally simple — no asyncio, no external broker. It uses
plain threads + a RLock because the rest of AeroMind is sync FastAPI. The
worker pattern is:

  1. ``register(drone_id, connection_url)`` → create a :class:`PoolEntry`
  2. ``pilot(drone_id)`` → returns the :class:`MavlinkCommandPilot`
  3. ``unregister(drone_id)`` → close + remove the entry

Heartbeats are observed by :class:`MavlinkObserver` (read-only) — the pool
never sends a heartbeat, only the autopilot does.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import RLock
from typing import Any, Callable

from .mavlink_command_api import (
    HardwareCommandError,
    MavlinkCommandPilot,
    hardware_commands_enabled,
)
from .mavlink_observer import MavlinkObserver


MAX_POOL_SIZE = 12  # Same cap as MAX_FLEET_SIZE in labbench.py


@dataclass
class PoolEntry:
    drone_id: str
    drone_name: str
    connection_url: str
    pilot: MavlinkCommandPilot
    observer: MavlinkObserver
    registered_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    last_status: str = "registered"


class MavlinkPool:
    """Per-drone MAVLink worker pool (capped at MAX_POOL_SIZE)."""

    def __init__(
        self,
        *,
        pilot_factory: Callable[[str], MavlinkCommandPilot] | None = None,
        observer_factory: Callable[[str], MavlinkObserver] | None = None,
    ) -> None:
        self._entries: dict[str, PoolEntry] = {}
        self._lock = RLock()
        self._pilot_factory = pilot_factory
        self._observer_factory = observer_factory

    def size(self) -> int:
        with self._lock:
            return len(self._entries)

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            return [
                {
                    "droneId": e.drone_id,
                    "droneName": e.drone_name,
                    "connectionUrl": e.connection_url,
                    "registeredAt": e.registered_at,
                    "lastStatus": e.last_status,
                    "hardwareCommandsEnabled": hardware_commands_enabled(),
                }
                for e in self._entries.values()
            ]

    def register(
        self,
        drone_id: str,
        drone_name: str,
        connection_url: str,
    ) -> PoolEntry:
        with self._lock:
            if not drone_id or not connection_url:
                raise HardwareCommandError(400, "BAD_REQUEST", "droneId et connectionUrl sont requis")
            if drone_id in self._entries:
                # Idempotent re-register: return the existing entry.
                return self._entries[drone_id]
            if len(self._entries) >= MAX_POOL_SIZE:
                raise HardwareCommandError(
                    409,
                    "POOL_FULL",
                    f"Le pool matériel est saturé (max {MAX_POOL_SIZE} drones).",
                )
            pilot = (
                self._pilot_factory(connection_url)
                if self._pilot_factory is not None
                else MavlinkCommandPilot(connection_url)
            )
            observer = (
                self._observer_factory(connection_url)
                if self._observer_factory is not None
                else MavlinkObserver(connection_url=connection_url)
            )
            entry = PoolEntry(
                drone_id=drone_id,
                drone_name=drone_name,
                connection_url=connection_url,
                pilot=pilot,
                observer=observer,
            )
            self._entries[drone_id] = entry
            return entry

    def entry(self, drone_id: str) -> PoolEntry:
        with self._lock:
            entry = self._entries.get(drone_id)
            if entry is None:
                raise HardwareCommandError(404, "DRONE_NOT_REGISTERED", f"Le drone {drone_id} n'est pas dans le pool matériel")
            return entry

    def pilot(self, drone_id: str) -> MavlinkCommandPilot:
        return self.entry(drone_id).pilot

    def observer(self, drone_id: str) -> MavlinkObserver:
        return self.entry(drone_id).observer

    def unregister(self, drone_id: str) -> bool:
        with self._lock:
            entry = self._entries.pop(drone_id, None)
            if entry is None:
                return False
            try:
                entry.pilot.close()
            except Exception:
                pass
            try:
                entry.observer.close()
            except Exception:
                pass
            return True

    def close_all(self) -> None:
        with self._lock:
            for drone_id in list(self._entries.keys()):
                self.unregister(drone_id)


# Singleton — one pool per process.
_pool: MavlinkPool | None = None
_pool_lock = RLock()


def get_pool() -> MavlinkPool:
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = MavlinkPool()
        return _pool


def reset_pool(pool: MavlinkPool | None = None) -> None:
    """Test helper — replace the singleton pool (or clear it)."""
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.close_all()
        _pool = pool
