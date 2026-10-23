"""Tests for the modernized LabBench gate progression logic.

These tests exercise the pure server-side gate evaluation functions in
`web/labbench.py`. They run without a database; the persistence layer is
covered by `test_labbench_api.py`.
"""

from __future__ import annotations

import pytest

from web.labbench import (
    GATE_DEFINITIONS,
    _new_gate_state,
    _resolved_gates,
    _zone_progress,
)


def _all_false_conditions() -> dict:
    return {
        "registry_initialized": False,
        "n2_run_archived": False,
        "hardware_checklist_complete": False,
        "n3_ready": False,
        "arm_double_confirmed": False,
        "n3_armed": False,
        "independent_review_signed": False,
    }


def test_gate_definitions_are_ordered_and_complete():
    codes = [g["code"] for g in GATE_DEFINITIONS]
    assert codes == ["N1", "N2", "N3-READY", "N3-ARMED", "N4"]
    zones = {g["zone"] for g in GATE_DEFINITIONS}
    assert zones == {"governance", "simulation", "hardware", "bench", "audit"}


def test_resolved_gates_all_false_marks_only_n1_open():
    gates = _resolved_gates(_all_false_conditions())
    assert gates[0]["code"] == "N1"
    assert gates[0]["state"] == "open"
    assert all(g["state"] == "pending" for g in gates[1:])


def test_resolved_gates_registry_only_passes_n1_and_opens_n2():
    conditions = _all_false_conditions()
    conditions["registry_initialized"] = True
    gates = _resolved_gates(conditions)
    assert gates[0]["state"] == "passed"
    assert gates[1]["state"] == "open"
    assert gates[1]["code"] == "N2"
    assert gates[2]["state"] == "pending"


def test_resolved_gates_full_progression_all_passed():
    conditions = _all_false_conditions()
    for key in conditions:
        conditions[key] = True
    gates = _resolved_gates(conditions)
    assert all(g["state"] == "passed" for g in gates)


def test_resolved_gates_cannot_skip_ahead():
    """If N2 has not run, N3 cannot be passed even if all downstream flags are true."""
    conditions = _all_false_conditions()
    conditions["hardware_checklist_complete"] = True
    conditions["n3_ready"] = True
    conditions["arm_double_confirmed"] = True
    conditions["n3_armed"] = True
    conditions["independent_review_signed"] = True
    # registry + n2 still false
    gates = _resolved_gates(conditions)
    # N1 stays open because registry is false
    assert gates[0]["state"] == "open"
    # All subsequent gates stay pending (no gate passes until N1 does)
    assert all(g["state"] == "pending" for g in gates[1:])


def test_zone_progress_aggregates_per_zone():
    conditions = _all_false_conditions()
    conditions["registry_initialized"] = True
    conditions["n2_run_archived"] = True
    gates = _resolved_gates(conditions)
    progress = _zone_progress(gates)
    assert len(progress) == 5
    zones_by_name = {p["zone"]: p for p in progress}
    # governance + simulation fully passed
    assert zones_by_name["governance"]["passed"] is True
    assert zones_by_name["simulation"]["passed"] is True
    # hardware has N3-READY open
    assert zones_by_name["hardware"]["openCount"] == 1
    # bench + audit pending (no open items yet)
    assert zones_by_name["bench"]["openCount"] == 0
    assert zones_by_name["audit"]["openCount"] == 0


def test_new_gate_state_has_safe_defaults():
    """The default gate state must never allow physical output."""
    project = type("Project", (), {"id": "proj-test"})()
    user = {"id": "user-test", "role": "user"}
    state = _new_gate_state(project, user)
    assert state["physicalOutputEnabled"] is False
    assert state["physicalCommandsEmitted"] is False
    assert state["conditions"]["n3_armed"] is False
    assert state["armEvents"] == []
    assert state["reviewEvents"] == []


def test_zone_progress_has_stable_order():
    """The 5-zone order must be stable across renders."""
    gates = _resolved_gates(_all_false_conditions())
    progress = _zone_progress(gates)
    zones = [p["zone"] for p in progress]
    assert zones == ["governance", "simulation", "hardware", "bench", "audit"]
