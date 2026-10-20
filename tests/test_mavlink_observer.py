import unittest
from types import SimpleNamespace

import web.mavlink_observer as observer_module
from web.mavlink_observer import MavlinkObserver


class FakeMessage:
    def __init__(self, message_type, **data):
        self._message_type = message_type
        self._data = {"mavpackettype": message_type, **data}
        self._header = SimpleNamespace(srcSystem=1, srcComponent=1)

    def get_type(self):
        return self._message_type

    def to_dict(self):
        return self._data


class FakeConnection:
    def __init__(self, messages):
        self.messages = list(messages)
        self.closed = False

    def recv_match(self, blocking=False):
        return self.messages.pop(0) if self.messages else None

    def close(self):
        self.closed = True


class MavlinkObserverTest(unittest.TestCase):
    def test_consumes_heartbeat_and_read_only_telemetry(self):
        connection = FakeConnection([
            FakeMessage("HEARTBEAT", type=2, autopilot=3, base_mode=81, custom_mode=4, system_status=4),
            FakeMessage("GLOBAL_POSITION_INT", lat=485000000, lon=23000000, alt=120000, relative_alt=80000),
            FakeMessage("SYS_STATUS", voltage_battery=16000, battery_remaining=78),
            FakeMessage("FUEL_STATUS", maximum=12.0, consumed=3.0, remaining=9.0, percent_remaining=75),
            FakeMessage("ESC_STATUS", rpm=4200, temperature=68),
            FakeMessage("FENCE_STATUS", breach_status=0, breach_count=0, breach_type=0, breach_time=0),
            FakeMessage("PARAM_VALUE", param_id="FENCE_ENABLE", param_value=1.0),
        ])
        observer = MavlinkObserver(connection_factory=lambda _: connection)
        observer.connect()
        snapshot = observer.poll()

        self.assertTrue(snapshot.connected)
        self.assertTrue(snapshot.read_only)
        self.assertFalse(snapshot.hardware_commands_enabled)
        self.assertEqual(snapshot.heartbeat.system_id, 1)
        self.assertEqual(snapshot.heartbeat.autopilot, 3)
        self.assertAlmostEqual(snapshot.position["latitude_deg"], 48.5)
        self.assertEqual(snapshot.battery["battery_remaining"], 78)
        self.assertEqual(snapshot.propulsion["remaining"], 9.0)
        self.assertEqual(snapshot.propulsion["rpm"], 4200)
        self.assertEqual(snapshot.fence_status["breach_status"], 0)
        self.assertEqual(snapshot.security_parameters["FENCE_ENABLE"], 1.0)

    def test_connect_does_not_send_or_require_a_heartbeat(self):
        connection = FakeConnection([])
        observer = MavlinkObserver(connection_factory=lambda _: connection)
        snapshot = observer.connect()
        self.assertFalse(snapshot.connected)
        self.assertEqual(snapshot.messages_received, 0)
        self.assertTrue(snapshot.read_only)

    def test_invalid_poll_limit_is_rejected(self):
        observer = MavlinkObserver(connection_factory=lambda _: FakeConnection([]))
        observer.connect()
        with self.assertRaises(ValueError):
            observer.poll(0)

    def test_close_closes_transport(self):
        connection = FakeConnection([])
        observer = MavlinkObserver(connection_factory=lambda _: connection)
        observer.connect()
        observer.close()
        self.assertTrue(connection.closed)
        self.assertFalse(observer.snapshot().connected)

    def test_heartbeat_timeout_is_explicit_and_reconnect_is_bounded(self):
        connections = [FakeConnection([FakeMessage("HEARTBEAT", type=2, autopilot=3)]), FakeConnection([])]
        observer = MavlinkObserver(
            connection_factory=lambda _: connections.pop(0),
            heartbeat_timeout_s=2,
            reconnect_interval_s=0,
            max_reconnect_attempts=1,
        )
        observer.connect()
        self.assertEqual(observer.poll().status, "OBSERVING")
        observer._last_heartbeat_monotonic = 0
        original_clock = observer_module._monotonic
        observer_module._monotonic = lambda: 10
        try:
            first = observer.poll()
            self.assertEqual(first.reconnect_attempts, 1)
            self.assertEqual(first.status, "RECONNECTING")
            self.assertEqual(first.last_disconnect_reason, "HEARTBEAT_STALE")
            observer._last_heartbeat_monotonic = 0
            second = observer.poll()
            self.assertEqual(second.status, "RECONNECT_EXHAUSTED")
        finally:
            observer_module._monotonic = original_clock


if __name__ == "__main__":
    unittest.main()
