from web.gcs_api import CommandIntent, TelemetryFrame, capabilities, ingest, validate_command, emergency_stop, reset_emergency_stop, state

def test_capabilities_disable_physical_transports():
    c=capabilities()
    assert c['physical_output'] is False
    assert c['transports']['udp'] is False
    assert c['transports']['serial'] is False
    assert c['transports']['websocket'] is False

def test_telemetry_normalization_is_read_only():
    out=ingest(TelemetryFrame(protocol='MAVLink2',vehicle_id='sitl',timestamp_ms=1,position=[1,2,3],velocity=[0,0,0],heading_deg=2,link_quality=.9,source='fixture'))
    assert out['accepted'] is True and out['wire_emission'] is False

def test_command_requires_go_and_human_but_never_emits():
    reset_emergency_stop()
    intent=CommandIntent(protocol='MAVLink2',vehicle_id='sitl',intent='hold',requested_by='test',human_approval=True,go_level='GO5')
    out=validate_command(intent)
    assert out['accepted'] is True
    assert out['outgoing_frame'] is None
    assert out['wire_emission'] is False
    assert out['command_preview']['dry_run'] is True
    assert out['command_preview']['transmitted'] is False

def test_emergency_latch_blocks_review():
    emergency_stop()
    intent=CommandIntent(protocol='ROS2',vehicle_id='sitl',intent='hold',requested_by='test',human_approval=True,go_level='GO5')
    out=validate_command(intent)
    assert out['status']=='BLOCKED_EMERGENCY_LATCH'
    reset_emergency_stop()
