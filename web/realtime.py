"""Real-time multi-operator collaboration (WebSocket).

When multiple operators are connected to the same project, they see each
other's actions in real-time:
  - Drone arm/disarm events
  - Gate state changes
  - Command sent/refused
  - Alert raised
  - Operator presence (who's online)

Implementation: a single WebSocket endpoint /api/realtime/ws per project.
The server maintains an in-memory set of connected clients per project_id;
when an event is published (via publish_event), it's broadcast to all
clients on that project.

Ownership: each event carries the actor's user_id + email. The frontend
shows "Operator X armed drone Y at HH:MM:SS" in a live feed.

Security: the WebSocket is authenticated via the aeromind_session cookie
(checked on connect). No re-auth per message — the connection is the auth.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Cookie, Header, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState

from .app_auth_helpers import current_user
from .mavlink_command_api import hardware_commands_enabled


router = APIRouter(prefix="/api/realtime", tags=["realtime"])


# In-memory connection registry: project_id → set of WebSocket connections
# Each connection is a dict { ws, user_id, user_email, connected_at }
_connections: dict[str, set[dict[str, Any]]] = {}


def _register(project_id: str, ws: WebSocket, user_id: str, user_email: str) -> dict[str, Any]:
    conn = {"ws": ws, "user_id": user_id, "user_email": user_email, "connected_at": datetime.now(UTC)}
    _connections.setdefault(project_id, set()).add(conn)
    return conn


def _unregister(project_id: str, conn: dict[str, Any]) -> None:
    if project_id in _connections:
        _connections[project_id].discard(conn)
        if not _connections[project_id]:
            del _connections[project_id]


def publish_event(project_id: str | None, event_type: str, payload: dict[str, Any], actor_id: str, actor_email: str | None = None) -> None:
    """Broadcast an event to all connected operators on the project.

    Called by other modules (mission_planner, hardware_gate, alerts, etc.)
    when they want to notify other operators of a state change.
    """
    event = {
        "type": event_type,
        "projectId": project_id,
        "actorId": actor_id,
        "actorEmail": actor_email,
        "payload": payload,
        "timestamp": datetime.now(UTC).isoformat(),
    }
    msg = json.dumps(event, ensure_ascii=False)
    # Broadcast to project-specific connections
    targets = []
    if project_id and project_id in _connections:
        targets.extend(_connections[project_id])
    # Also broadcast to connections with no project (dashboard view)
    if None in _connections:
        targets.extend(_connections[None])
    for conn in targets:
        ws = conn["ws"]
        if ws.client_state == WebSocketState.CONNECTED:
            try:
                asyncio.create_task(ws.send_text(msg))
            except Exception:
                pass


def get_online_operators(project_id: str | None = None) -> list[dict[str, Any]]:
    """Return the list of currently connected operators (for the UI presence indicator)."""
    result = []
    if project_id and project_id in _connections:
        for conn in _connections[project_id]:
            result.append({
                "userId": conn["user_id"],
                "userEmail": conn["user_email"],
                "connectedAt": conn["connected_at"].astimezone(UTC).isoformat(),
            })
    elif project_id is None:
        for pid, conns in _connections.items():
            for conn in conns:
                result.append({
                    "userId": conn["user_id"],
                    "userEmail": conn["user_email"],
                    "projectId": pid,
                    "connectedAt": conn["connected_at"].astimezone(UTC).isoformat(),
                })
    return result


@router.get("/online")
def online_endpoint(
    request: Any = None,
    project_id: str | None = None,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
    authorization: str | None = Header(default=None),
):
    """REST endpoint to list currently connected operators."""
    user = current_user(aeromind_session, authorization)
    if not user:
        return JSONResponse(status_code=401, content={"error": {"code": "UNAUTHORIZED", "message": "OIDC authentication required"}})
    return JSONResponse({"operators": get_online_operators(project_id)}, headers={"Cache-Control": "no-store"})


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    project_id: str | None = None,
    aeromind_session: str | None = Cookie(default=None, convert_underscores=False),
):
    """WebSocket endpoint for real-time multi-operator collaboration.

    Connect with: ws://host/api/realtime/ws?projectId=... (cookie auth)
    Receives: broadcast events from other operators (arm, disarm, command, alert, etc.)
    Sends: nothing (server-push only); the client can send ping messages.
    """
    # Authenticate via cookie
    user = current_user(aeromind_session, None)
    if not user:
        await ws.close(code=4401, reason="OIDC authentication required")
        return
    await ws.accept()
    conn = _register(project_id or "__global__", ws, user["id"], user.get("email", "unknown"))

    # Send initial presence
    presence = {
        "type": "presence",
        "projectId": project_id,
        "operators": get_online_operators(project_id),
        "timestamp": datetime.now(UTC).isoformat(),
    }
    try:
        await ws.send_text(json.dumps(presence, ensure_ascii=False))
    except Exception:
        pass

    # Notify others that a new operator joined
    publish_event(project_id, "operator_joined", {"operatorEmail": user.get("email")}, user["id"], user.get("email"))

    try:
        while True:
            # Listen for client messages (ping / heartbeat)
            data = await ws.receive_text()
            # Echo ping back
            if data == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _unregister(project_id or "__global__", conn)
        publish_event(project_id, "operator_left", {"operatorEmail": user.get("email")}, user["id"], user.get("email"))
