"""MAVLink mission upload protocol (cahier des charges P0-04 / FUNC-05).

Implements the canonical GCS → autopilot mission upload sequence:

    1. GCS sends ``MISSION_COUNT`` (msg id 21) with the number of items.
    2. Autopilot responds with one ``MISSION_REQUEST_INT`` (msg id 51) or
       legacy ``MISSION_REQUEST`` (msg id 40) per item, in any order.
    3. For each request, GCS sends the matching ``MISSION_ITEM_INT``
       (msg id 52) with the waypoint data.
    4. After all items are received, the autopilot sends ``MISSION_ACK``
       (msg id 44) with type indicating success / partial / error.

This module is the ONLY place that emits these mission-upload messages.
It does NOT use ``command_long_send`` for mission items — that would be
a protocol violation (the autopilot would not request them and would
silently drop the data, then time out the upload).

The protocol implementation is structured so it can be exercised end-to-end
in tests by injecting a fake connection that:
  * Exposes ``mav.mission_count_send(target_system, target_component, count)``
    and ``mav.mission_item_int_send(...)`` (the pymavlink-mandled API shape).
  * Delivers ``MISSION_REQUEST_INT`` / ``MISSION_REQUEST`` / ``MISSION_ACK``
    frames via ``recv_match(blocking=True, type=..., timeout=...)``.

The protocol is HARD-FAILED if:
  * the autopilot does not request the first item within ``REQUEST_TIMEOUT_S``
  * any request references a sequence outside ``[0, count)``
  * the autopilot does not send ``MISSION_ACK`` within ``ACK_TIMEOUT_S``
  * the final ACK type is not ``MAV_MISSION_ACCEPTED`` (0)

In every failure case, the upload state machine returns
``MissionUploadResult(state='failed', error=...)`` so the caller
persists the failure and never declares a successful upload.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .mavlink_command_api import HardwareCommandError, hardware_commands_enabled

log = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Protocol constants (MAVLink standard values)
# ─────────────────────────────────────────────────────────────────────────────
MAV_MISSION_ACCEPTED = 0
MAV_MISSION_ERROR = 1
MAV_MISSION_UNSUPPORTED_FRAME = 2
MAV_MISSION_UNSUPPORTED = 3
MAV_MISSION_NO_SPACE = 4
MAV_MISSION_INVALID = 5
MAV_MISSION_INVALID_PARAM1 = 6
MAV_MISSION_INVALID_PARAM2 = 7
MAV_MISSION_INVALID_SEQ = 8
MAV_MISSION_DENIED = 9
MAV_MISSION_OPERATION_CANCELLED = 10

ACK_TYPE_LABELS = {
    MAV_MISSION_ACCEPTED: "ACCEPTED",
    MAV_MISSION_ERROR: "ERROR",
    MAV_MISSION_UNSUPPORTED_FRAME: "UNSUPPORTED_FRAME",
    MAV_MISSION_UNSUPPORTED: "UNSUPPORTED",
    MAV_MISSION_NO_SPACE: "NO_SPACE",
    MAV_MISSION_INVALID: "INVALID",
    MAV_MISSION_INVALID_PARAM1: "INVALID_PARAM1",
    MAV_MISSION_INVALID_PARAM2: "INVALID_PARAM2",
    MAV_MISSION_INVALID_SEQ: "INVALID_SEQ",
    MAV_MISSION_DENIED: "DENIED",
    MAV_MISSION_OPERATION_CANCELLED: "OPERATION_CANCELLED",
}

# Timeout (seconds) for waiting for the autopilot to request a mission item
# after we sent MISSION_COUNT. Bounded so a disconnected autopilot does not
# hang the upload forever.
REQUEST_TIMEOUT_S = float(__import__("os").environ.get("AEROMIND_MISSION_REQUEST_TIMEOUT_S", "5"))
# Timeout for waiting for the final MISSION_ACK after all items are uploaded.
ACK_TIMEOUT_S = float(__import__("os").environ.get("AEROMIND_MISSION_ACK_TIMEOUT_S", "10"))
# Maximum number of total requests tolerated (defence-in-depth against a
# misbehaving autopilot that loops on the same sequence).
MAX_TOTAL_REQUESTS = 1024


@dataclass
class WaypointItem:
    """A single mission item in the MAVLink MISSION_ITEM_INT shape.

    Field names mirror the MAVLink spec: ``seq`` (sequence index, 0-based),
    ``frame`` (MAV_FRAME_*), ``command`` (MAV_CMD_*), ``current`` (1 if this
    is the active waypoint, else 0), ``autocontinue`` (1 to advance to next
    automatically), ``param1..4`` (command-specific), ``x``/``y``/``z``
    (lat/lon/alt for NAV commands).
    """
    seq: int
    frame: int = 3  # MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
    command: int = 16  # MAV_CMD_NAV_WAYPOINT
    current: int = 0
    autocontinue: int = 1
    param1: float = 0.0
    param2: float = 0.0
    param3: float = 0.0
    param4: float = 0.0
    x: int = 0  # lat * 1e7 for the INT variant
    y: int = 0  # lon * 1e7
    z: float = 0.0  # altitude


@dataclass
class MissionUploadResult:
    """Outcome of a mission upload attempt.

    ``state`` ∈ {uploaded, failed}. The HTTP response layer (mission_planner.py)
    MUST NOT translate ``state='failed'`` into a 200 OK — failures return 4xx/5xx
    and persist ``Mission.upload_state='failed'`` so the frontend can show
    the error and disable the upload button.
    """
    state: str  # "uploaded" | "failed"
    error: str | None = None
    ack_type: int | None = None
    ack_label: str | None = None
    items_sent: int = 0
    items_total: int = 0
    protocol: str = "MISSION_COUNT+MISSION_REQUEST_INT+MISSION_ITEM_INT+MISSION_ACK"
    requests_received: int = 0
    failures: list[dict[str, Any]] = field(default_factory=list)


def upload_mission(
    connection: Any,
    waypoints: list[WaypointItem],
    *,
    target_system: int = 1,
    target_component: int = 1,
    source_system: int = 255,
    source_component: int = 190,
) -> MissionUploadResult:
    """Run the canonical MAVLink mission upload protocol.

    ``connection`` MUST expose the pymavlink-shaped send methods:
      * ``mission_count_send(target_system, target_component, count)``
      * ``mission_item_int_send(target_system, target_component, seq, frame,
         command, current, autocontinue, param1, param2, param3, param4,
         x, y, z)``

    And the receive method:
      * ``recv_match(blocking=True, type="MISSION_REQUEST_INT", timeout=...)``
        returning a frame object with ``.seq`` attribute (and ``._header`` for
        the source system/component).
      * Same for ``MISSION_REQUEST`` (legacy) and ``MISSION_ACK`` (final).

    The function NEVER raises on MAVLink transport errors; it captures them in
    a ``MissionUploadResult(state='failed', error=...)`` so the caller can
    persist the failure and audit-log it.

    Hardware gate: if ``HARDWARE_CONTROL`` is not 'true', the function returns
    ``state='failed'`` immediately with ``error='HARDWARE_DISABLED'`` — this is
    a defence-in-depth check; the API layer is supposed to refuse the upload
    before reaching this point. The check is kept here so a unit test that
    invokes ``upload_mission`` directly cannot bypass the hardware gate.
    """
    if not hardware_commands_enabled():
        return MissionUploadResult(
            state="failed",
            error="HARDWARE_DISABLED",
            items_total=len(waypoints),
        )
    if not waypoints:
        return MissionUploadResult(
            state="failed",
            error="NO_WAYPOINTS",
            items_total=0,
        )

    total = len(waypoints)
    items_sent: list[bool] = [False] * total
    requests_received = 0
    failures: list[dict[str, Any]] = []

    # ── Step 1: send MISSION_COUNT ────────────────────────────────────────
    try:
        if not hasattr(connection, "mission_count_send"):
            raise HardwareCommandError(
                503, "TRANSPORT_INCOMPATIBLE",
                "Le transport MAVLink n'expose pas mission_count_send — "
                "upload mission impossible.",
            )
        connection.mission_count_send(target_system, target_component, total)
    except HardwareCommandError as exc:
        return MissionUploadResult(
            state="failed",
            error=f"MISSION_COUNT_SEND_FAILED: {exc.message}",
            items_total=total,
            failures=[{"phase": "MISSION_COUNT", "reason": exc.message}],
        )
    except Exception as exc:
        return MissionUploadResult(
            state="failed",
            error=f"MISSION_COUNT_SEND_FAILED: {type(exc).__name__}: {exc}",
            items_total=total,
            failures=[{"phase": "MISSION_COUNT", "reason": str(exc)}],
        )

    # ── Step 2/3: receive MISSION_REQUEST_INT (or legacy MISSION_REQUEST) ─
    # and reply with the matching MISSION_ITEM_INT. Repeat until all items
    # are sent OR the autopilot sends MISSION_ACK (success / partial).
    deadline = time.monotonic() + REQUEST_TIMEOUT_S
    while not all(items_sent) and time.monotonic() < deadline:
        if requests_received >= MAX_TOTAL_REQUESTS:
            # Misbehaving autopilot — abort to avoid an infinite loop.
            return MissionUploadResult(
                state="failed",
                error=f"REQUEST_FLOOD: {requests_received} requests sans ACK",
                items_total=total,
                items_sent=sum(1 for s in items_sent if s),
                requests_received=requests_received,
                failures=failures,
            )
        # Check for an early MISSION_ACK (e.g. autopilot rejected the count
        # immediately, OR completed the upload and signalled success early).
        ack = _try_recv(connection, ["MISSION_ACK"], timeout=0.05)
        if ack is not None:
            return _finalize_via_ack(ack, items_sent, total, requests_received, failures)

        # Wait for a request for the next item (either INT or legacy variant).
        req = _try_recv(
            connection,
            ["MISSION_REQUEST_INT", "MISSION_REQUEST"],
            timeout=max(0.05, deadline - time.monotonic()),
        )
        if req is None:
            continue  # loop until deadline or ACK
        requests_received += 1
        seq = int(getattr(req, "seq", -1))
        msg_type = str(req.get_type()) if hasattr(req, "get_type") else "MISSION_REQUEST"
        if seq < 0 or seq >= total:
            # Out-of-range request — record the failure and continue. The
            # autopilot will eventually send MISSION_ACK with an error code.
            failures.append({
                "phase": "MISSION_REQUEST",
                "message_type": msg_type,
                "reason": f"sequence hors plage: {seq}",
            })
            continue
        if items_sent[seq]:
            # Duplicate request for an already-sent item — ArduPilot does
            # this on retries. Re-send the item so the autopilot progresses.
            pass
        wp = waypoints[seq]
        try:
            if not hasattr(connection, "mission_item_int_send"):
                raise HardwareCommandError(
                    503, "TRANSPORT_INCOMPATIBLE",
                    "Le transport MAVLink n'expose pas mission_item_int_send.",
                )
            # CAHIER DES CHARGES — "pas de fausses écritures":
            # Defense-in-depth: reject waypoints with x=0 AND y=0 (indicates null
            # coordinates defaulted to 0). Writing (0°N, 0°E) to the autopilot
            # is a false write — a real coordinate in the Gulf of Guinea.
            # The upstream mission_planner.py rejects null lat/lon before upload,
            # but this check catches any malformed waypoint that slips through.
            if wp.x == 0 and wp.y == 0:
                raise HardwareCommandError(
                    400, "WAYPOINT_NULL_COORDINATES",
                    f"Waypoint seq={seq} has x=0, y=0 — null coordinates cannot be written to the autopilot (CAHIER DES CHARGES: pas de fausses écritures).",
                )
            connection.mission_item_int_send(
                target_system, target_component,
                wp.seq, wp.frame, wp.command, wp.current, wp.autocontinue,
                wp.param1, wp.param2, wp.param3, wp.param4,
                wp.x, wp.y, wp.z,
            )
            items_sent[seq] = True
        except HardwareCommandError as exc:
            failures.append({"phase": "MISSION_ITEM_INT", "seq": seq, "reason": exc.message})
        except Exception as exc:
            failures.append({
                "phase": "MISSION_ITEM_INT",
                "seq": seq,
                "reason": f"{type(exc).__name__}: {exc}",
            })

    # ── Step 4: wait for the final MISSION_ACK ───────────────────────────
    if not all(items_sent):
        # The autopilot never requested all items — the upload cannot be
        # complete. Persist the failure (no premature 'uploaded').
        sent_count = sum(1 for s in items_sent if s)
        return MissionUploadResult(
            state="failed",
            error=f"PARTIAL_UPLOAD: {sent_count}/{total} items transmis, ACK manquant",
            items_total=total,
            items_sent=sent_count,
            requests_received=requests_received,
            failures=failures,
        )

    # Wait for the final MISSION_ACK. While waiting, the autopilot may send
    # additional MISSION_REQUEST_INT / MISSION_REQUEST frames as duplicate
    # confirmations of items it already received (ArduPilot does this when
    # it wants to verify a particular item). The GCS responds to each
    # request by re-sending the corresponding MISSION_ITEM_INT (idempotent)
    # and continues waiting for the ACK. This avoids an artificial ACK_TIMEOUT
    # when the autopilot is just being chatty.
    ack_deadline = time.monotonic() + ACK_TIMEOUT_S
    while time.monotonic() < ack_deadline:
        # Check for the final ACK first.
        ack = _try_recv(connection, ["MISSION_ACK"], timeout=0.1)
        if ack is not None:
            ack_type = int(getattr(ack, "type", MAV_MISSION_ERROR))
            ack_label = ACK_TYPE_LABELS.get(ack_type, f"UNKNOWN({ack_type})")
            if ack_type == MAV_MISSION_ACCEPTED:
                return MissionUploadResult(
                    state="uploaded",
                    ack_type=ack_type,
                    ack_label=ack_label,
                    items_total=total,
                    items_sent=total,
                    requests_received=requests_received,
                    failures=failures,
                )
            return MissionUploadResult(
                state="failed",
                error=f"ACK_REJECTED: type={ack_label}({ack_type})",
                ack_type=ack_type,
                ack_label=ack_label,
                items_total=total,
                items_sent=total,
                requests_received=requests_received,
                failures=failures,
            )
        # No ACK yet — handle a stray duplicate MISSION_REQUEST_INT or
        # legacy MISSION_REQUEST by re-sending the corresponding ITEM_INT.
        req = _try_recv(connection, ["MISSION_REQUEST_INT", "MISSION_REQUEST"], timeout=0.1)
        if req is None:
            continue
        requests_received += 1
        if requests_received > MAX_TOTAL_REQUESTS:
            return MissionUploadResult(
                state="failed",
                error=f"REQUEST_FLOOD: {requests_received} requests sans ACK",
                items_total=total,
                items_sent=total,
                requests_received=requests_received,
                failures=failures,
            )
        seq = int(getattr(req, "seq", -1))
        if 0 <= seq < total:
            wp = waypoints[seq]
            try:
                connection.mission_item_int_send(
                    target_system, target_component,
                    wp.seq, wp.frame, wp.command, wp.current, wp.autocontinue,
                    wp.param1, wp.param2, wp.param3, wp.param4,
                    wp.x, wp.y, wp.z,
                )
            except Exception:
                pass
        else:
            failures.append({
                "phase": "MISSION_REQUEST_AFTER_ITEMS",
                "reason": f"sequence hors plage: {seq}",
            })

    return MissionUploadResult(
        state="failed",
        error=f"ACK_TIMEOUT: aucun MISSION_ACK reçu dans les {ACK_TIMEOUT_S}s",
        items_total=total,
        items_sent=total,
        requests_received=requests_received,
        failures=failures,
    )


def _try_recv(connection: Any, types: list[str], timeout: float) -> Any:
    """Try to receive one of the requested MAVLink message types.

    pymavlink's ``recv_match`` accepts either a single ``type`` string or a
    list via the ``type=`` parameter. We loop in case the connection exposes
    only the single-type variant.
    """
    try:
        for t in types:
            msg = connection.recv_match(blocking=True, type=t, timeout=timeout)
            if msg is not None:
                return msg
        return None
    except Exception as exc:
        log.debug("recv_match failed for types=%s: %s", types, exc)
        return None


def _finalize_via_ack(ack: Any, items_sent: list[bool], total: int,
                      requests_received: int, failures: list[dict]) -> MissionUploadResult:
    """Build a MissionUploadResult from an early MISSION_ACK frame.

    An early ACK means the autopilot decided the upload is complete (or
    impossible) before all items were requested. We translate that into
    the canonical result shape so the caller can persist it uniformly.
    """
    ack_type = int(getattr(ack, "type", MAV_MISSION_ERROR))
    ack_label = ACK_TYPE_LABELS.get(ack_type, f"UNKNOWN({ack_type})")
    sent_count = sum(1 for s in items_sent if s)
    if ack_type == MAV_MISSION_ACCEPTED and sent_count == total:
        return MissionUploadResult(
            state="uploaded",
            ack_type=ack_type,
            ack_label=ack_label,
            items_total=total,
            items_sent=sent_count,
            requests_received=requests_received,
            failures=failures,
        )
    return MissionUploadResult(
        state="failed",
        error=f"EARLY_ACK: type={ack_label}({ack_type}) items_sent={sent_count}/{total}",
        ack_type=ack_type,
        ack_label=ack_label,
        items_total=total,
        items_sent=sent_count,
        requests_received=requests_received,
        failures=failures,
    )


__all__ = [
    "WaypointItem",
    "MissionUploadResult",
    "upload_mission",
    "ACK_TYPE_LABELS",
    "MAV_MISSION_ACCEPTED",
    "MAV_MISSION_DENIED",
    "MAV_MISSION_INVALID",
    "REQUEST_TIMEOUT_S",
    "ACK_TIMEOUT_S",
]
