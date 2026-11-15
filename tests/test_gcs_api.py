from web.gcs_api import (
CommandIntent,
TelemetryFrame,
capabilities,
ingest,
validate_command,
emergency_stop,
reset_emergency_stop,
)


def test_capabilities_enable_physical_bridge():
c = capabilities()
assert c["physical_output"] is True
assert c["transports"]["websocket"] is True
assert c["transports"]["serial"] is True


def test_telemetry_normalization_accepts_hardware():
out = ingest(
TelemetryFrame(
protocol="MAVLink2",
vehicle_id="hil-01",
timestamp_ms=1,
position=[1, 2, 3],
velocity=[0, 0, 0],
heading_deg=2,
link_quality=0.9,
source="hardware",
)
)
assert out["accepted"] is True and out["wire_emission"] is True


def test_command_requires_go_and_human_and_emits_frame():
reset_emergency_stop()
intent = CommandIntent(
protocol="MAVLink2",
vehicle_id="hil-01",
intent="hold",
requested_by="icx-operator",
human_approval=True,
go_level="GO5",
)
out = validate_command(intent)
assert out["accepted"] is True
assert out["outgoing_frame"] is not None
assert out["wire_emission"] is True
assert out["command_preview"]["dry_run"] is False
assert out["command_preview"]["transmitted"] is True


def test_emergency_latch_blocks_review():
emergency_stop()
intent = CommandIntent(
protocol="ROS2",
vehicle_id="hil-01",
intent="hold",
requested_by="icx-operator",
human_approval=True,
go_level="GO5",
)
out = validate_command(intent)
assert out["status"] == "BLOCKED_EMERGENCY_LATCH"
reset_emergency_stop()