"""Read-only HTTP projection of the MAVLink observer."""
from __future__ import annotations

import os
from dataclasses import asdict
from threading import Lock

from fastapi import APIRouter

from .mavlink_observer import MavlinkObserver

router = APIRouter(prefix="/api/telemetry/mavlink", tags=["mavlink-read-only"])
_observer: MavlinkObserver | None = None
_observer_lock = Lock()


def get_observer() -> MavlinkObserver:
    global _observer
    with _observer_lock:
        if _observer is None:
            _observer = MavlinkObserver(
                connection_url=os.getenv("AEROMIND_MAVLINK_OBSERVER_URL", "udpin:127.0.0.1:14551"),
                heartbeat_timeout_s=float(os.getenv("AEROMIND_MAVLINK_HEARTBEAT_TIMEOUT_S", "5")),
                reconnect_interval_s=float(os.getenv("AEROMIND_MAVLINK_RECONNECT_INTERVAL_S", "5")),
            )
        return _observer


@router.get("/status")
def status() -> dict[str, object]:
    """Poll and expose observation data; this endpoint has no write path."""
    observer = get_observer()
    snapshot = observer.poll()
    return asdict(snapshot)
