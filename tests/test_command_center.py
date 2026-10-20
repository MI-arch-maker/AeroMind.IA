import os
import unittest
from datetime import UTC, datetime, timedelta
from uuid import uuid4

os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "local-command-center-test-secret-32-bytes")
os.environ.setdefault("DATABASE_URL", f"sqlite:////tmp/aeromind-command-center-{os.getpid()}.db")

from fastapi.testclient import TestClient
from sqlalchemy import select

from web.app import app
from web.database import SessionLocal
from web.models import CommandRequestRecord, User
from web.oidc import _b64, _signed


class HumanCommandCenterTest(unittest.TestCase):
    def setUp(self):
        self.user_id = f"command-center-{uuid4()}"
        token = _signed(_b64(f"{self.user_id}|{self.user_id}@example.test".encode()))
        self.client = TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={token}"})
        self.client.__enter__()
        with SessionLocal() as db:
            db.add(User(id=self.user_id, email=f"{self.user_id}@example.test"))
            db.commit()

    def tearDown(self):
        self.client.__exit__(None, None, None)

    def prepare_and_present(self):
        response = self.client.post("/api/command-center/requests", json={
            "command": "simulation-hold",
            "objective": "Vérifier le maintien en scénario virtuel",
            "parameters": {},
        })
        self.assertEqual(response.status_code, 201, response.text)
        request = response.json()
        self.assertEqual(request["status"], "prepared")
        self.assertEqual(request["device"]["kind"], "simulator")
        self.assertEqual(request["device"]["connection"], "not_connected")
        self.assertEqual(len(request["request_sha256"]), 64)
        self.assertTrue(request["preconditions"]["physical_output_disabled"])
        presented = self.client.post(f"/api/command-center/requests/{request['id']}/present")
        self.assertEqual(presented.status_code, 200, presented.text)
        self.assertEqual(presented.json()["status"], "pending_approval")
        return request["id"]

    def test_requires_authentication(self):
        client = TestClient(app, headers={"host": "localhost"})
        response = client.get("/api/command-center/requests")
        self.assertEqual(response.status_code, 401)

    def test_full_human_approval_and_simulation_flow_never_calls_hardware(self):
        request_id = self.prepare_and_present()
        approved = self.client.post(f"/api/command-center/requests/{request_id}/approve")
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["status"], "approved")
        self.assertTrue(any(event["type"] == "approved" for event in approved.json()["events"]))
        result = self.client.post(f"/api/command-center/requests/{request_id}/execute-simulation")
        self.assertEqual(result.status_code, 200, result.text)
        payload = result.json()
        self.assertEqual(payload["status"], "completed_simulated")
        self.assertFalse(payload["result"]["sent_to_hardware"])
        self.assertFalse(payload["result"]["physical_effect_verified"])
        self.assertEqual(payload["result"]["evidence_level"], "synthetic_demo")
        repeated = self.client.post(f"/api/command-center/requests/{request_id}/execute-simulation")
        self.assertEqual(repeated.status_code, 409)

    def test_request_cannot_be_approved_before_it_is_presented(self):
        response = self.client.post("/api/command-center/requests", json={
            "command": "simulation-land", "objective": "Tester un atterrissage virtuel", "parameters": {},
        })
        request_id = response.json()["id"]
        premature = self.client.post(f"/api/command-center/requests/{request_id}/approve")
        self.assertEqual(premature.status_code, 409)

    def test_reject_and_cancel_are_terminal(self):
        request_id = self.prepare_and_present()
        rejected = self.client.post(f"/api/command-center/requests/{request_id}/reject", json={"reason": "Refus utilisateur"})
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(rejected.json()["status"], "rejected")
        cancel_response = self.client.post("/api/command-center/requests", json={
            "command": "simulation-pause", "objective": "Annuler la pause virtuelle", "parameters": {},
        })
        cancelled = self.client.post(f"/api/command-center/requests/{cancel_response.json()['id']}/cancel")
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["status"], "cancelled")

    def test_changed_parameters_invalidate_approval_before_simulation(self):
        request_id = self.prepare_and_present()
        approved = self.client.post(f"/api/command-center/requests/{request_id}/approve")
        self.assertEqual(approved.status_code, 200)
        with SessionLocal() as db:
            row = db.get(CommandRequestRecord, request_id)
            row.parameters_json = '{"unexpected":true}'
            db.commit()
        execution = self.client.post(f"/api/command-center/requests/{request_id}/execute-simulation")
        self.assertEqual(execution.status_code, 409)

    def test_expired_request_cannot_be_approved(self):
        request_id = self.prepare_and_present()
        with SessionLocal() as db:
            row = db.get(CommandRequestRecord, request_id)
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            db.commit()
        approval = self.client.post(f"/api/command-center/requests/{request_id}/approve")
        self.assertEqual(approval.status_code, 409)
        refreshed = self.client.get(f"/api/command-center/requests/{request_id}")
        self.assertEqual(refreshed.json()["status"], "expired")

    def test_physical_commands_and_parameters_are_rejected(self):
        physical = self.client.post("/api/command-center/requests", json={
            "command": "arm", "objective": "Armement physique demandé", "parameters": {},
        })
        self.assertEqual(physical.status_code, 422)
        parameterized = self.client.post("/api/command-center/requests", json={
            "command": "simulation-hold", "objective": "Maintien virtuel du scénario", "parameters": {"throttle": 0.2},
        })
        self.assertEqual(parameterized.status_code, 422)
        with SessionLocal() as db:
            rows = db.scalars(select(CommandRequestRecord).where(CommandRequestRecord.user_id == self.user_id)).all()
            self.assertEqual(rows, [])

    def test_other_user_cannot_read_or_approve_request(self):
        request_id = self.prepare_and_present()
        other_id = f"other-{uuid4()}"
        with SessionLocal() as db:
            db.add(User(id=other_id, email=f"{other_id}@example.test"))
            db.commit()
        token = _signed(_b64(f"{other_id}|{other_id}@example.test".encode()))
        other = TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={token}"})
        self.assertEqual(other.get(f"/api/command-center/requests/{request_id}").status_code, 404)
        self.assertEqual(other.post(f"/api/command-center/requests/{request_id}/approve").status_code, 404)

    def test_hardware_control_endpoint_remains_closed(self):
        capabilities = self.client.get("/api/capabilities").json()
        self.assertFalse(capabilities["hardware_control"])
        confirmation = {"confirm_operator": True, "confirm_safety": True}
        self.assertEqual(self.client.post("/api/control/mode", json={"mode": "HARDWARE", **confirmation}).status_code, 403)
        self.assertEqual(self.client.post("/api/control/arm", json={"mode": "HARDWARE", **confirmation}).status_code, 403)
        self.assertEqual(self.client.post("/api/control/command", json={"command": "position", "latitude": 48.8, "longitude": 2.3}).status_code, 403)


if __name__ == "__main__":
    unittest.main()
