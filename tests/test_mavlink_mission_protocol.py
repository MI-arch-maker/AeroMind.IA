"""Tests for the MAVLink mission upload protocol (web.mavlink_mission_protocol).

These tests exercise the protocol end-to-end with a fake autopilot that
exposes the pymavlink-shaped send methods (mission_count_send,
mission_item_int_send) and the recv_match API. The fake autopilot is
scripted to:
  * Request each item in order, OR
  * Reject the upload with a MISSION_ACK error code, OR
  * Time out (never send a final ACK), OR
  * Refuse to even request items.

Each case verifies that the protocol returns the correct
MissionUploadResult(state='uploaded' | 'failed', error=...) and that
the protocol NEVER declares 'uploaded' without a final
MAV_MISSION_ACCEPTED ACK.

The HARDWARE_CONTROL env var is monkeypatched to 'true' for the success
cases (the protocol checks it as a defence-in-depth gate); the false case
verifies the protocol refuses to run when hardware is disabled.
"""
from __future__ import annotations

import os
import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "test")

from web.mavlink_mission_protocol import (  # noqa: E402
    WaypointItem, upload_mission, MissionUploadResult,
    MAV_MISSION_ACCEPTED, MAV_MISSION_DENIED, MAV_MISSION_INVALID,
)


class FakeFrame:
    """A MAVLink-shaped frame for testing."""

    def __init__(self, type_name: str, **fields):
        self._type = type_name
        for k, v in fields.items():
            setattr(self, k, v)

    def get_type(self) -> str:
        return self._type


class FakeAutopilot:
    """A scripted autopilot for mission upload protocol tests.

    Each instance holds a queue of frames to deliver via recv_match. The
    caller pre-loads the queue with MISSION_REQUEST_INT / MISSION_REQUEST /
    MISSION_ACK frames in the order the autopilot is supposed to send them.

    The instance also records every send_mission_count / mission_item_int_send
    call so the test can assert the GCS sent the expected sequence.
    """

    def __init__(self, frames: list[FakeFrame] | None = None):
        self._frames = list(frames or [])
        self.mission_count_sent: list[tuple[int, int, int]] = []
        self.mission_item_int_sent: list[tuple] = []

    def mission_count_send(self, target_system: int, target_component: int, count: int) -> None:
        self.mission_count_sent.append((target_system, target_component, count))

    def mission_item_int_send(self, target_system, target_component, seq, frame,
                              command, current, autocontinue,
                              p1, p2, p3, p4, x, y, z) -> None:
        self.mission_item_int_sent.append((
            target_system, target_component, seq, frame, command, current, autocontinue,
            p1, p2, p3, p4, x, y, z,
        ))

    def recv_match(self, *, blocking: bool, type: str | None = None, timeout: float = 0.0):
        """Return the next frame ONLY if it matches ``type`` (real pymavlink).

        The fake respects queue order: if the next frame is not of the
        requested ``type``, it returns None (the protocol's caller will then
        retry). This mirrors how pymavlink's recv_match behaves when
        filtering by ``type=`` — frames of other types remain on the wire
        and are not silently consumed.
        """
        if not self._frames:
            return None
        next_frame = self._frames[0]
        if type is None or next_frame.get_type() == type:
            return self._frames.pop(0)
        return None


def _waypoints(n: int) -> list[WaypointItem]:
    return [
        WaypointItem(
            seq=i,
            x=int(48.0 * 1e7) + i,
            y=int(2.0 * 1e7) + i,
            z=10.0 + i,
        )
        for i in range(n)
    ]


@pytest.fixture(autouse=True)
def hardware_enabled(monkeypatch):
    monkeypatch.setenv("HARDWARE_CONTROL", "true")
    yield
    monkeypatch.delenv("HARDWARE_CONTROL", raising=False)


# ─────────────────────────────────────────────────────────────────────────────
# Happy path: full ACK sequence
# ─────────────────────────────────────────────────────────────────────────────

def test_upload_mission_full_success():
    waypoints = _waypoints(3)
    autopilot = FakeAutopilot(frames=[
        FakeFrame("MISSION_REQUEST_INT", seq=0),
        FakeFrame("MISSION_REQUEST_INT", seq=1),
        FakeFrame("MISSION_REQUEST_INT", seq=2),
        FakeFrame("MISSION_ACK", type=MAV_MISSION_ACCEPTED),
    ])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "uploaded", f"got state={result.state}, error={result.error}"
    assert result.items_total == 3
    assert result.items_sent == 3
    assert result.ack_type == MAV_MISSION_ACCEPTED
    assert result.ack_label == "ACCEPTED"
    assert result.requests_received == 3
    # Verify GCS sent MISSION_COUNT exactly once with the right count
    assert len(autopilot.mission_count_sent) == 1
    assert autopilot.mission_count_sent[0] == (1, 1, 3)
    # Verify GCS sent MISSION_ITEM_INT for each requested seq
    assert len(autopilot.mission_item_int_sent) == 3
    sent_seqs = [item[5] for item in autopilot.mission_item_int_sent]
    # mission_item_int_send signature: (sys, comp, seq, frame, cmd, current, autocontinue, ...)
    # seq is at index 2 — fix the assertion to use the right index
    sent_seqs = [item[2] for item in autopilot.mission_item_int_sent]
    assert sorted(sent_seqs) == [0, 1, 2]


def test_upload_mission_handles_out_of_order_requests():
    """ArduPilot may request items out of order during retries. Verify the
    protocol handles this correctly by sending the requested item each time."""
    waypoints = _waypoints(3)
    autopilot = FakeAutopilot(frames=[
        FakeFrame("MISSION_REQUEST_INT", seq=2),
        FakeFrame("MISSION_REQUEST_INT", seq=0),
        FakeFrame("MISSION_REQUEST_INT", seq=1),
        FakeFrame("MISSION_REQUEST_INT", seq=1),  # duplicate — ArduPilot retry
        FakeFrame("MISSION_ACK", type=MAV_MISSION_ACCEPTED),
    ])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "uploaded", f"got state={result.state}, error={result.error}"
    assert result.requests_received == 4
    assert result.items_sent == 3  # only 3 unique items sent
    sent_seqs = [item[2] for item in autopilot.mission_item_int_sent]
    assert sorted(sent_seqs) == [0, 1, 1, 2]  # 1 was sent twice (retry)


def test_upload_mission_handles_legacy_mission_request():
    """Older autopilots (e.g. ArduCopter 3.x) use the legacy MISSION_REQUEST
    frame instead of MISSION_REQUEST_INT. The protocol must accept both."""
    waypoints = _waypoints(2)
    autopilot = FakeAutopilot(frames=[
        FakeFrame("MISSION_REQUEST", seq=0),
        FakeFrame("MISSION_REQUEST", seq=1),
        FakeFrame("MISSION_ACK", type=MAV_MISSION_ACCEPTED),
    ])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "uploaded", f"got state={result.state}, error={result.error}"
    assert result.requests_received == 2


# ─────────────────────────────────────────────────────────────────────────────
# Failure paths: never declare 'uploaded' without proper ACK
# ─────────────────────────────────────────────────────────────────────────────

def test_upload_mission_no_ack_returns_failed():
    """Autopilot never sends MISSION_ACK → protocol must time out and fail."""
    waypoints = _waypoints(2)
    autopilot = FakeAutopilot(frames=[
        FakeFrame("MISSION_REQUEST_INT", seq=0),
        FakeFrame("MISSION_REQUEST_INT", seq=1),
        # no ACK — the protocol must fail
    ])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "failed"
    assert "ACK_TIMEOUT" in result.error
    assert result.items_sent == 2
    assert result.items_total == 2


def test_upload_mission_no_requests_returns_failed():
    """Autopilot accepts MISSION_COUNT but never requests items → fail."""
    waypoints = _waypoints(3)
    autopilot = FakeAutopilot(frames=[])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "failed"
    assert "PARTIAL_UPLOAD" in result.error or "ACK_TIMEOUT" in result.error
    assert result.items_sent == 0
    assert result.items_total == 3


def test_upload_mission_rejected_ack_returns_failed():
    """Autopilot sends MISSION_ACK with type=DENIED → fail with the label."""
    waypoints = _waypoints(2)
    autopilot = FakeAutopilot(frames=[
        FakeFrame("MISSION_REQUEST_INT", seq=0),
        FakeFrame("MISSION_REQUEST_INT", seq=1),
        FakeFrame("MISSION_ACK", type=MAV_MISSION_DENIED),
    ])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "failed"
    assert result.ack_type == MAV_MISSION_DENIED
    assert result.ack_label == "DENIED"
    assert "DENIED" in result.error


def test_upload_mission_early_ack_rejected_returns_failed():
    """Autopilot sends MISSION_ACK immediately with error (e.g. mission
    rejected because it has too many items)."""
    waypoints = _waypoints(2)
    autopilot = FakeAutopilot(frames=[
        FakeFrame("MISSION_ACK", type=MAV_MISSION_INVALID),
    ])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "failed"
    assert result.ack_type == MAV_MISSION_INVALID
    assert result.ack_label == "INVALID"
    assert "EARLY_ACK" in result.error


def test_upload_mission_no_waypoints_returns_failed():
    """Upload with zero waypoints is rejected before any MAVLink call."""
    autopilot = FakeAutopilot(frames=[])
    result = upload_mission(autopilot, [])
    assert result.state == "failed"
    assert result.error == "NO_WAYPOINTS"
    assert result.items_total == 0
    # No MAVLink frame was sent
    assert autopilot.mission_count_sent == []
    assert autopilot.mission_item_int_sent == []


def test_upload_mission_out_of_range_seq_recorded_as_failure():
    """If the autopilot requests an out-of-range sequence, the protocol
    records the failure but continues; the eventual ACK determines the
    final state."""
    waypoints = _waypoints(2)
    autopilot = FakeAutopilot(frames=[
        FakeFrame("MISSION_REQUEST_INT", seq=99),  # out of range
        FakeFrame("MISSION_REQUEST_INT", seq=0),
        FakeFrame("MISSION_REQUEST_INT", seq=1),
        FakeFrame("MISSION_ACK", type=MAV_MISSION_ACCEPTED),
    ])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "uploaded"
    assert len(result.failures) == 1
    assert "hors plage" in result.failures[0]["reason"]


def test_upload_mission_hardware_disabled_returns_failed(monkeypatch):
    """Without HARDWARE_CONTROL=true, the protocol refuses to even start."""
    monkeypatch.delenv("HARDWARE_CONTROL", raising=False)
    waypoints = _waypoints(2)
    autopilot = FakeAutopilot(frames=[])
    result = upload_mission(autopilot, waypoints)
    assert result.state == "failed"
    assert result.error == "HARDWARE_DISABLED"
    assert result.items_total == 2
    # No MAVLink frame was sent
    assert autopilot.mission_count_sent == []
    assert autopilot.mission_item_int_sent == []


def test_upload_mission_transport_missing_methods_returns_failed():
    """A connection that does not expose mission_count_send is rejected."""
    class InertConnection:
        def recv_match(self, **kw):
            return None
    waypoints = _waypoints(2)
    result = upload_mission(InertConnection(), waypoints)
    assert result.state == "failed"
    assert "TRANSPORT_INCOMPATIBLE" in result.error or "MISSION_COUNT_SEND_FAILED" in result.error


# ─────────────────────────────────────────────────────────────────────────────
# WaypointItem shape
# ─────────────────────────────────────────────────────────────────────────────

def test_waypoint_item_default_values():
    """Verify the default MAV frame is GLOBAL_RELATIVE_ALT_INT (3) and the
    default command is NAV_WAYPOINT (16)."""
    wp = WaypointItem(seq=0, x=480000000, y=20000000, z=10.0)
    assert wp.seq == 0
    assert wp.frame == 3
    assert wp.command == 16
    assert wp.current == 0
    assert wp.autocontinue == 1
    assert wp.x == 480000000
    assert wp.y == 20000000
    assert wp.z == 10.0
