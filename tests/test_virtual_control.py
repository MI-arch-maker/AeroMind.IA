import json
import os
import unittest
from uuid import uuid4

os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "virtual-control-test-secret-at-least-32-bytes")
os.environ.setdefault("DATABASE_URL", f"sqlite:////tmp/aeromind-virtual-control-{os.getpid()}.db")

from fastapi.testclient import TestClient

from web.app import app
from web.database import SessionLocal
from web.hardware_api import feature_enabled
from web.models import AdminAccountRecord, User
from web.oidc import _b64, _signed


class VirtualControlApiTest(unittest.TestCase):
    def setUp(self):
        self.user_id = f"virtual-control-{uuid4()}"
        self.email = f"{self.user_id}@example.test"
        self.client = self._client_for(self.user_id, self.email)
        self.client.__enter__()
        self._ensure_account(self.user_id, self.email)

    def tearDown(self):
        self.client.__exit__(None, None, None)

    @staticmethod
    def _client_for(user_id: str, email: str) -> TestClient:
        token = _signed(_b64(f"{user_id}|{email}".encode()))
        return TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={token}"})

    @staticmethod
    def _ensure_account(user_id: str, email: str, role: str = "user"):
        with SessionLocal() as db:
            if db.get(User, user_id) is None:
                db.add(User(id=user_id, email=email))
            if db.query(AdminAccountRecord).filter(AdminAccountRecord.email == email).first() is None:
                db.add(AdminAccountRecord(
                    id=str(uuid4()),
                    email=email,
                    data_json=json.dumps({
                        "id": user_id,
                        "name": "Opérateur virtuel",
                        "email": email,
                        "role": role,
                        "accountStatus": "active",
                        "level": "L1",
                    }),
                ))
            db.commit()

    @staticmethod
    def confirmations():
        return {"confirm_operator": True, "confirm_safety": True}

    @staticmethod
    def action(revision: int):
        return {"action_id": str(uuid4()), "expected_revision": revision}

    def current_state(self):
        response = self.client.get("/api/control/state")
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def activate_and_arm(self):
        activated = self.client.post("/api/control/mode", json={
            "mode": "VIRTUAL", **self.confirmations(), **self.action(self.current_state()["revision"]),
        })
        self.assertEqual(activated.status_code, 200, activated.text)
        armed = self.client.post("/api/control/arm", json={
            "mode": "VIRTUAL", **self.confirmations(), **self.action(activated.json()["revision"]),
        })
        self.assertEqual(armed.status_code, 200, armed.text)
        return armed.json()

    def test_hardware_is_permanently_closed_even_when_environment_flag_is_set(self):
        previous = os.environ.get("HARDWARE_CONTROL")
        os.environ["HARDWARE_CONTROL"] = "true"
        try:
            self.assertFalse(feature_enabled())
            self.assertEqual(
                self.client.post("/api/control/mode", json={"mode": "HARDWARE", **self.confirmations()}).status_code,
                403,
            )
            self.assertEqual(
                self.client.post("/api/control/arm", json={"mode": "HARDWARE", **self.confirmations()}).status_code,
                403,
            )
        finally:
            if previous is None:
                os.environ.pop("HARDWARE_CONTROL", None)
            else:
                os.environ["HARDWARE_CONTROL"] = previous

    def test_all_virtual_service_routes_require_an_authenticated_user(self):
        with TestClient(app, headers={"host": "localhost"}) as visitor:
            self.assertEqual(visitor.post("/api/control/mode", json={"mode": "VIRTUAL", **self.confirmations()}).status_code, 401)
            self.assertEqual(visitor.post("/api/control/arm", json={"mode": "VIRTUAL", **self.confirmations()}).status_code, 401)
            self.assertEqual(visitor.post("/api/control/command", json={"command": "heading", "heading_deg": 90, "confirm_command": True}).status_code, 401)
            self.assertEqual(visitor.post("/api/control/emergency-stop").status_code, 401)
            self.assertEqual(visitor.get("/api/control/logs").status_code, 401)

    def test_visitor_account_is_directed_to_the_local_non_recorded_simulation(self):
        visitor_id = f"virtual-visitor-{uuid4()}"
        visitor_email = f"{visitor_id}@example.test"
        self._ensure_account(visitor_id, visitor_email, role="visitor")
        with self._client_for(visitor_id, visitor_email) as visitor:
            response = visitor.post("/api/control/mode", json={"mode": "VIRTUAL", **self.confirmations(), **self.action(0)})
            self.assertEqual(response.status_code, 403)
            self.assertIn("local simulation", json.dumps(response.json()))

    def test_activation_and_arming_are_distinct_confirmation_steps(self):
        refused = self.client.post("/api/control/mode", json={"mode": "VIRTUAL", "confirm_operator": True})
        self.assertEqual(refused.status_code, 409)
        missing_action = self.client.post("/api/control/mode", json={"mode": "VIRTUAL", **self.confirmations()})
        self.assertEqual(missing_action.status_code, 409)
        activated = self.client.post("/api/control/mode", json={
            "mode": "VIRTUAL", **self.confirmations(), **self.action(self.current_state()["revision"]),
        })
        self.assertEqual(activated.status_code, 200, activated.text)
        self.assertEqual(activated.json()["mode"], "VIRTUAL")
        self.assertTrue(activated.json()["virtual_active"])
        self.assertFalse(activated.json()["armed"])
        self.assertFalse(activated.json()["physical_output"])
        self.assertTrue(activated.json()["confirmations_consumed"])
        arm_refused = self.client.post("/api/control/arm", json={"mode": "VIRTUAL", "confirm_operator": True, **self.action(activated.json()["revision"])})
        self.assertEqual(arm_refused.status_code, 409)
        armed = self.client.post("/api/control/arm", json={
            "mode": "VIRTUAL", **self.confirmations(), **self.action(activated.json()["revision"]),
        })
        self.assertEqual(armed.status_code, 200, armed.text)
        self.assertTrue(armed.json()["armed"])
        self.assertEqual(armed.json()["receipt"]["scope"], "virtual-only")

    def test_virtual_action_ids_and_revisions_reject_replay_and_stale_races(self):
        revision = self.current_state()["revision"]
        action = self.action(revision)
        first = self.client.post("/api/control/mode", json={"mode": "VIRTUAL", **self.confirmations(), **action})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["revision"], revision + 1)
        replay = self.client.post("/api/control/mode", json={"mode": "VIRTUAL", **self.confirmations(), **action})
        self.assertEqual(replay.status_code, 409)
        stale = self.client.post("/api/control/arm", json={"mode": "VIRTUAL", **self.confirmations(), **self.action(revision)})
        self.assertEqual(stale.status_code, 409)
        current = self.current_state()
        self.assertEqual(current["revision"], revision + 1)
        self.assertFalse(current["armed"])

    def test_bounded_virtual_setpoints_require_command_confirmation(self):
        self.activate_and_arm()
        unconfirmed = self.client.post("/api/control/command", json={
            "command": "position", "x_m": 10, "y_m": -4, "altitude_m": 20, **self.action(self.current_state()["revision"]),
        })
        self.assertEqual(unconfirmed.status_code, 409)
        position = self.client.post("/api/control/command", json={
            "command": "position", "x_m": 10, "y_m": -4, "altitude_m": 20, "confirm_command": True, **self.action(self.current_state()["revision"]),
        })
        self.assertEqual(position.status_code, 200, position.text)
        self.assertEqual(position.json()["setpoint"]["position"], {"x_m": 10.0, "y_m": -4.0, "altitude_m": 20.0})
        self.assertTrue(position.json()["command_confirmation_consumed"])
        heading = self.client.post("/api/control/command", json={
            "command": "heading", "heading_deg": 360, "confirm_command": True, **self.action(position.json()["revision"]),
        })
        self.assertEqual(heading.status_code, 200, heading.text)
        self.assertEqual(heading.json()["setpoint"]["heading_deg"], 360.0)
        out_of_bounds = self.client.post("/api/control/command", json={
            "command": "position", "x_m": 501, "y_m": 0, "altitude_m": 20, "confirm_command": True, **self.action(heading.json()["revision"]),
        })
        self.assertEqual(out_of_bounds.status_code, 422)
        self.assertIsInstance(out_of_bounds.json()["detail"], list)

    def test_geographic_coordinates_are_never_reused_as_virtual_coordinates(self):
        response = self.client.post("/api/control/command", json={
            "command": "position", "latitude": 48.8, "longitude": 2.3, "confirm_command": True,
        })
        self.assertEqual(response.status_code, 403)
        # Le middleware global normalise HTTPException dans une enveloppe error.
        self.assertIn("Geographic coordinates", json.dumps(response.json()))

    def test_emergency_stop_purges_disarms_and_never_auto_resumes(self):
        self.activate_and_arm()
        stopped = self.client.post("/api/control/emergency-stop")
        self.assertEqual(stopped.status_code, 200, stopped.text)
        result = stopped.json()
        self.assertTrue(result["disarmed"])
        self.assertTrue(result["stopped"])
        self.assertFalse(result["armed"])
        self.assertFalse(result["virtual_active"])
        self.assertFalse(result["hardware_called"])
        self.assertTrue(result["confirmations_invalidated"])
        no_resume = self.client.post("/api/control/command", json={
            "command": "heading", "heading_deg": 90, "confirm_command": True, **self.action(result["revision"]),
        })
        self.assertEqual(no_resume.status_code, 409)
        reactivated = self.client.post("/api/control/mode", json={
            "mode": "VIRTUAL", **self.confirmations(), **self.action(result["revision"]),
        })
        self.assertEqual(reactivated.status_code, 200)
        self.assertFalse(reactivated.json()["armed"])

    def test_virtual_journal_is_bounded_and_never_crosses_user_sessions(self):
        self.activate_and_arm()
        own_logs = self.client.get("/api/control/logs?limit=100")
        self.assertEqual(own_logs.status_code, 200, own_logs.text)
        self.assertGreaterEqual(len(own_logs.json()), 2)
        self.assertTrue(all(row["scope"] == "virtual-only" for row in own_logs.json()))

        other_id = f"virtual-control-other-{uuid4()}"
        other_email = f"{other_id}@example.test"
        self._ensure_account(other_id, other_email)
        with self._client_for(other_id, other_email) as other:
            response = other.get("/api/control/logs")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), [])


if __name__ == "__main__":
    unittest.main()
