import json
import os
import unittest
from urllib.parse import quote
from uuid import uuid4

os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "local-audit-test-secret-32-bytes-long")
os.environ.setdefault("DATABASE_URL", f"sqlite:////tmp/aeromind-validation-audit-{os.getpid()}.db")

from fastapi.testclient import TestClient
from web.app import app
from web.database import SessionLocal
from web.models import AdminAccountRecord, AuditEvent, Project, User
from web.oidc import _b64, _signed


class ValidationAuditTest(unittest.TestCase):
    def setUp(self):
        self.user_id = f"audit-owner-{uuid4()}"
        self.email = f"{self.user_id}@example.test"
        self.project_id = str(uuid4())
        self.token = _signed(_b64(f"{self.user_id}|{self.email}".encode()))
        self.client = TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={self.token}"})
        self.client.__enter__()
        with SessionLocal() as db:
            db.add(User(id=self.user_id, email=self.email))
            db.add(AdminAccountRecord(id=str(uuid4()), email=self.email, data_json=json.dumps({"id": self.user_id, "email": self.email, "role": "user", "accountStatus": "active", "level": "L1"})))
            db.flush()
            db.add(Project(id=self.project_id, user_id=self.user_id, name="Audit test", data_json="{}"))
            db.commit()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        with SessionLocal() as db:
            project = db.get(Project, self.project_id)
            if project is not None:
                db.delete(project)
            user = db.get(User, self.user_id)
            if user is not None:
                db.delete(user)
            allowlist = db.query(AdminAccountRecord).filter(AdminAccountRecord.email == self.email).first()
            if allowlist is not None:
                db.delete(allowlist)
            db.commit()

    def event_payload(self, event_id=None, details=None):
        return {
            "json": {
                "id": self.project_id,
                "eventId": str(event_id or uuid4()),
                "eventType": "validation.checkpoint",
                "message": "Revue des contrôles enregistrée · 2/2 conformes",
                "details": details or {
                    "scope": "local-simulation-only",
                    "physicalOutputEnabled": False,
                    "summary": {"total": 2, "passed": 2, "failed": 0},
                },
                "occurredAt": "2026-10-21T10:00:00.000Z",
            }
        }

    def list_url(self):
        encoded = quote(json.dumps({"json": self.project_id}, separators=(",", ":")))
        return f"/api/trpc/auditEvents.list?input={encoded}"

    def test_records_and_reads_project_scoped_event_through_trpc_get(self):
        event_id = str(uuid4())
        response = self.client.post("/api/trpc/auditEvents.record", json=self.event_payload(event_id))
        self.assertEqual(response.status_code, 200, response.text)
        saved = response.json()["result"]["data"]["json"]
        self.assertEqual(saved["id"], event_id)
        self.assertEqual(saved["projectId"], self.project_id)
        self.assertFalse(saved["payload"]["physicalOutputEnabled"])

        listed = self.client.get(self.list_url())
        self.assertEqual(listed.status_code, 200, listed.text)
        rows = listed.json()["result"]["data"]["json"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["message"], saved["message"])
        self.assertEqual(rows[0]["occurredAt"], "2026-10-21T10:00:00+00:00")

    def test_retry_with_same_identifier_is_idempotent(self):
        event_id = str(uuid4())
        first = self.client.post("/api/trpc/auditEvents.record", json=self.event_payload(event_id))
        second = self.client.post("/api/trpc/auditEvents.record", json=self.event_payload(event_id))
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        with SessionLocal() as db:
            rows = db.query(AuditEvent).filter_by(project_id=self.project_id).all()
            self.assertEqual(len(rows), 1)

    def test_owner_scope_and_simulation_guard_are_enforced(self):
        other_id = f"audit-other-{uuid4()}"
        other_email = f"{other_id}@example.test"
        other_token = _signed(_b64(f"{other_id}|{other_email}".encode()))
        with SessionLocal() as db:
            db.add(User(id=other_id, email=other_email))
            db.add(AdminAccountRecord(id=str(uuid4()), email=other_email, data_json=json.dumps({"id": other_id, "email": other_email, "role": "user", "accountStatus": "active", "level": "L1"})))
            db.commit()
        other = TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={other_token}"})
        try:
            self.assertEqual(other.get(self.list_url()).status_code, 403)
            self.assertEqual(other.post("/api/trpc/auditEvents.record", json=self.event_payload()).status_code, 403)
        finally:
            other.close()
            with SessionLocal() as db:
                other_user = db.get(User, other_id)
                if other_user is not None:
                    db.delete(other_user)
                other_allowlist = db.query(AdminAccountRecord).filter(AdminAccountRecord.email == other_email).first()
                if other_allowlist is not None:
                    db.delete(other_allowlist)
                db.commit()

        unsafe_details = {"scope": "hardware", "physicalOutputEnabled": True}
        rejected = self.client.post("/api/trpc/auditEvents.record", json=self.event_payload(details=unsafe_details))
        self.assertEqual(rejected.status_code, 400)
        self.assertEqual(self.client.get(self.list_url()).json()["result"]["data"]["json"], [])

    def test_audit_api_requires_authentication(self):
        anonymous = TestClient(app, headers={"host": "localhost"})
        self.assertEqual(anonymous.get(self.list_url()).status_code, 401)
        self.assertEqual(anonymous.post("/api/trpc/auditEvents.record", json=self.event_payload()).status_code, 401)
        anonymous.close()

    def test_malformed_get_input_is_rejected(self):
        response = self.client.get("/api/trpc/auditEvents.list?input=not-json")
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
