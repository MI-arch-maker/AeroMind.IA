import os
import json
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
from web.models import AdminAccountRecord, CommandRequestRecord, User
from web.oidc import _b64, _signed


class HumanCommandCenterTest(unittest.TestCase):
    def setUp(self):
        self.user_id = f"command-center-{uuid4()}"
        token = _signed(_b64(f"{self.user_id}|{self.user_id}@example.test".encode()))
        self.client = TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={token}"})
        self.client.__enter__()
        with SessionLocal() as db:
            email = f"{self.user_id}@example.test"
            db.add(User(id=self.user_id, email=email))
            db.add(AdminAccountRecord(id=str(uuid4()), email=email, data_json=json.dumps({"id": str(uuid4()), "email": email, "name": "Test user", "role": "user", "accountStatus": "active", "level": "L1"})))
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

    def test_two_distinct_human_approvals_required_before_simulation(self):
        request_id = self.prepare_and_present()
        first = self.client.post(f"/api/command-center/requests/{request_id}/approve")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json()["status"], "pending_second_approval")
        self.assertEqual(first.json()["approval_policy"]["required_human_approvals"], 2)
        self.assertTrue(any(event["type"] == "approved_first" for event in first.json()["events"]))
        self.assertEqual(self.client.post(f"/api/command-center/requests/{request_id}/execute-simulation").status_code, 409)
        reviewer_id = f"reviewer-{uuid4()}"
        reviewer_email = f"{reviewer_id}@example.test"
        alias_id = f"reviewer-alias-{uuid4()}"
        owner_email = f"{self.user_id}@example.test"
        with SessionLocal() as db:
            db.add(AdminAccountRecord(id=str(uuid4()), email=reviewer_email, data_json=json.dumps({"id": reviewer_id, "name": "Réviseur", "email": reviewer_email, "role": "surveillant", "accountStatus": "active", "level": "L2"})))
            owner_account = db.query(AdminAccountRecord).filter(AdminAccountRecord.email == owner_email).first()
            owner_data = json.loads(owner_account.data_json)
            owner_data["role"] = "surveillant"
            owner_account.data_json = json.dumps(owner_data)
            db.commit()
        token = _signed(_b64(f"{reviewer_id}|{reviewer_email}".encode()))
        alias_token = _signed(_b64(f"{alias_id}|{owner_email}".encode()))
        reviewer = TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={token}"})
        alias = TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={alias_token}"})
        with reviewer, alias:
            self.assertEqual(alias.post(f"/api/command-center/requests/{request_id}/approve-second").status_code, 403)
            inbox = reviewer.get("/api/command-center/approvals")
            self.assertEqual(inbox.status_code, 200, inbox.text)
            self.assertIn(request_id, [item["id"] for item in inbox.json()["items"]])
            approved = reviewer.post(f"/api/command-center/requests/{request_id}/approve-second")
            self.assertEqual(approved.status_code, 200, approved.text)
            self.assertEqual(approved.json()["status"], "approved")
            self.assertTrue(any(event["type"] == "approved_second" for event in approved.json()["events"]))
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
            other_email = f"{other_id}@example.test"
            db.add(User(id=other_id, email=other_email))
            db.add(AdminAccountRecord(id=str(uuid4()), email=other_email, data_json=json.dumps({"id": other_id, "email": other_email, "role": "user", "accountStatus": "active", "level": "L1"})))
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
