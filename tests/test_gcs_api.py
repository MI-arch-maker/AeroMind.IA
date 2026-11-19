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
        )
    )
    assert out["vehicle_id"] == "hil-01"
