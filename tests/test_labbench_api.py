import hashlib
import json
import os
import unittest
from urllib.parse import quote
from uuid import uuid4

os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "local-aeromind-test-secret-long-32")
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/aeromind-turbo-tests.db")

from fastapi.testclient import TestClient
from sqlalchemy import select

from web.app import app
from web.database import SessionLocal
from web.models import AdminAccountRecord, AuditEvent, LabSession, Project, Report, User
from web.oidc import _b64, _signed


SCENARIO = {
    "mode": "simulation",
    "ambientC": 21,
    "heaterPowerW": 4,
    "dutyCycle": 0.4,
    "thermalResistanceCPerW": 3.2,
    "durationSeconds": 120,
    "positionSetpointDeg": 45,
}


class LabBenchApiTest(unittest.TestCase):
    def setUp(self):
        self.user_id = f"labbench-owner-{uuid4()}"
        self.email = f"{self.user_id}@example.test"
        self.project_id = str(uuid4())
        self.token = _signed(_b64(f"{self.user_id}|{self.email}".encode()))
        self.client = TestClient(
            app,
            headers={"host": "localhost", "cookie": f"aeromind_session={self.token}"},
        )
        self.client.__enter__()
        with SessionLocal() as db:
            db.add(User(id=self.user_id, email=self.email))
            db.add(
                AdminAccountRecord(
                    id=str(uuid4()),
                    email=self.email,
                    data_json=json.dumps(
                        {
                            "id": self.user_id,
                            "email": self.email,
                            "name": "LabBench test owner",
                            "role": "user",
                            "accountStatus": "active",
                            "level": "L1",
                        }
                    ),
                )
            )
            db.flush()
            db.add(Project(id=self.project_id, user_id=self.user_id, name="LabBench test", data_json="{}"))
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
            account = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.email == self.email))
            if account is not None:
                db.delete(account)
            db.commit()

    @staticmethod
    def trpc_data(response):
        return response.json()["result"]["data"]["json"]

    def query_url(self, procedure, value):
        payload = quote(json.dumps({"json": value}, separators=(",", ":")))
        return f"/api/trpc/{procedure}?input={payload}"

    def post(self, procedure, payload):
        return self.client.post(f"/api/trpc/{procedure}", json={"json": payload})

    def test_public_status_and_synthetic_simulation_contract(self):
        status_response = self.client.get("/api/trpc/labBench.status")
        self.assertEqual(status_response.status_code, 200, status_response.text)
        status = self.trpc_data(status_response)
        self.assertTrue(status["ready"])
        self.assertEqual(status["mode"], "simulation")
        self.assertFalse(status["physicalOutputEnabled"])
        self.assertFalse(status["physicalCommandsEmitted"])
        self.assertEqual(status["project"]["proofLevel"], "N2 — Simulation")
        self.assertTrue(status["services"])
        self.assertTrue(status["requirements"])
        self.assertTrue(status["catalog"])
        self.assertEqual(status["catalog"][0]["driver"]["status"], "reference_only")

        simulation_response = self.post("labBench.runSimulation", SCENARIO)
        self.assertEqual(simulation_response.status_code, 200, simulation_response.text)
        run = self.trpc_data(simulation_response)
        self.assertEqual(run["predictedTemperatureC"], 26.12)
        self.assertEqual(run["engineVersion"], "labbench-thermal-v1.0.0")
        self.assertEqual(len(run["contentSha256"]), 64)
        self.assertTrue(run["synthetic"])
        self.assertFalse(run["physicalOutputEnabled"])
        self.assertFalse(run["physicalCommandsEmitted"])
        self.assertEqual(len(run["telemetry"]), 12)
        self.assertTrue(run["limits"])
        self.assertTrue(all(sample["quality"] == "synthetic" for sample in run["telemetry"]))

        capabilities = self.client.get("/api/capabilities").json()
        self.assertTrue(capabilities["virtual_control"])
        self.assertFalse(capabilities["hardware_control"])

    def test_registry_and_archived_run_are_authenticated_owner_scoped(self):
        anonymous = TestClient(app, headers={"host": "localhost"})
        try:
            self.assertEqual(anonymous.get(self.query_url("labBench.registry", self.project_id)).status_code, 401)
        finally:
            anonymous.close()

        seeded_response = self.post("labBench.seedRegistry", {"id": self.project_id})
        self.assertEqual(seeded_response.status_code, 200, seeded_response.text)
        seeded = self.trpc_data(seeded_response)
        self.assertTrue(seeded["seeded"])
        self.assertFalse(seeded["physicalOutputEnabled"])

        registry_response = self.client.get(self.query_url("labBench.registry", self.project_id))
        self.assertEqual(registry_response.status_code, 200, registry_response.text)
        registry = self.trpc_data(registry_response)
        self.assertEqual(registry["projectId"], self.project_id)
        self.assertEqual(len(registry["requirements"]), 3)
        self.assertEqual(registry["devices"][0]["deviceCode"], "LB01-EMU-001")
        self.assertIn("simulate.servo.setpoint", registry["drivers"][0]["allowlistJson"])
        self.assertEqual(registry["runs"], [])

        persisted_response = self.post("labBench.persistSimulation", {"id": self.project_id, **SCENARIO})
        self.assertEqual(persisted_response.status_code, 200, persisted_response.text)
        persisted = self.trpc_data(persisted_response)
        self.assertEqual(persisted["projectId"], self.project_id)
        self.assertEqual(persisted["source"], "server-archived")
        self.assertTrue(persisted["persisted"])
        self.assertEqual(len(persisted["telemetry"]), 12)
        self.assertTrue(persisted["auditEventId"])
        self.assertFalse(persisted["physicalOutputEnabled"])

        reread = self.trpc_data(self.client.get(self.query_url("labBench.registry", self.project_id)))
        self.assertEqual(len(reread["runs"]), 1)
        self.assertEqual(reread["runs"][0]["runId"], persisted["runId"])
        with SessionLocal() as db:
            self.assertEqual(len(db.scalars(select(LabSession).where(LabSession.project_id == self.project_id)).all()), 2)
            audit = db.get(AuditEvent, persisted["auditEventId"])
            self.assertIsNotNone(audit)
            self.assertEqual(json.loads(audit.payload_json)["scope"], "local-simulation-only")

        anonymous = TestClient(app, headers={"host": "localhost"})
        try:
            self.assertEqual(
                anonymous.post(
                    "/api/trpc/labBench.createReport",
                    json={"json": {"id": self.project_id, "runId": persisted["runId"]}},
                ).status_code,
                401,
            )
        finally:
            anonymous.close()

        local_preview = self.trpc_data(self.post("labBench.runSimulation", {**SCENARIO, "ambientC": 20}))
        local_run = self.post("labBench.createReport", {"id": self.project_id, "runId": local_preview["runId"]})
        self.assertEqual(local_run.status_code, 404, local_run.text)

        report_response = self.post("labBench.createReport", {"id": self.project_id, "runId": persisted["runId"]})
        self.assertEqual(report_response.status_code, 200, report_response.text)
        report = self.trpc_data(report_response)
        self.assertEqual(report["projectId"], self.project_id)
        self.assertEqual(report["runId"], persisted["runId"])
        self.assertEqual(report["source"], "server-archived")
        self.assertEqual(report["status"], "archived")
        self.assertEqual(len(report["contentSha256"]), 64)
        with SessionLocal() as db:
            report_record = db.get(Report, report["id"])
            report_payload = json.loads(report_record.data_json)
            expected_hash = hashlib.sha256(
                json.dumps({"content": report_payload["content"]}, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
            ).hexdigest()
            self.assertEqual(report_payload["contentSha256"], expected_hash)
            self.assertEqual(report["contentSha256"], expected_hash)
            self.assertIn("## Entrées archivées", report_payload["content"])
            self.assertIn(persisted["engineVersion"], report_payload["content"])
            report_audit = db.scalar(
                select(AuditEvent).where(AuditEvent.project_id == self.project_id, AuditEvent.payload_json.contains(report["id"]))
            )
            self.assertIsNotNone(report_audit)

        other_id = f"labbench-other-{uuid4()}"
        other_email = f"{other_id}@example.test"
        other_token = _signed(_b64(f"{other_id}|{other_email}".encode()))
        with SessionLocal() as db:
            db.add(User(id=other_id, email=other_email))
            db.add(AdminAccountRecord(id=str(uuid4()), email=other_email, data_json=json.dumps({"id": other_id, "email": other_email, "role": "user", "accountStatus": "active", "level": "L1"})))
            db.commit()
        other = TestClient(app, headers={"host": "localhost", "cookie": f"aeromind_session={other_token}"})
        try:
            self.assertEqual(other.get(self.query_url("labBench.registry", self.project_id)).status_code, 403)
            self.assertEqual(other.post("/api/trpc/labBench.persistSimulation", json={"json": {"id": self.project_id, **SCENARIO}}).status_code, 403)
            self.assertEqual(other.post("/api/trpc/labBench.createReport", json={"json": {"id": self.project_id, "runId": persisted["runId"]}}).status_code, 403)
        finally:
            other.close()
            with SessionLocal() as db:
                other_user = db.get(User, other_id)
                if other_user is not None:
                    db.delete(other_user)
                other_account = db.scalar(select(AdminAccountRecord).where(AdminAccountRecord.email == other_email))
                if other_account is not None:
                    db.delete(other_account)
                db.commit()

    def test_virtual_command_requires_both_confirmations_and_refuses_physical_or_out_of_range_requests(self):
        base_command = {
            "command": "simulate.servo.setpoint",
            "mode": "authorized",
            "deviceConnected": False,
            "estopVerified": False,
            "driverValidated": True,
            "positionSetpointDeg": 45,
            "physicalOutputEnabled": False,
        }
        incomplete_response = self.post("labBench.validateCommand", {**base_command, "humanConfirmed": True, "safetyConfirmed": False})
        self.assertEqual(incomplete_response.status_code, 200, incomplete_response.text)
        incomplete = self.trpc_data(incomplete_response)
        self.assertFalse(incomplete["allowed"])
        self.assertFalse(incomplete["executed"])
        self.assertFalse(incomplete["physicalCommandsEmitted"])
        self.assertIn("safetyConfirmed=true", incomplete["reason"])
        self.assertEqual(len(incomplete["receiptSha256"]), 64)

        allowed_response = self.post("labBench.validateCommand", {**base_command, "humanConfirmed": True, "safetyConfirmed": True})
        self.assertEqual(allowed_response.status_code, 200, allowed_response.text)
        allowed = self.trpc_data(allowed_response)
        self.assertTrue(allowed["allowed"])
        self.assertFalse(allowed["executed"])
        self.assertTrue(allowed["virtualPreview"])
        self.assertEqual(allowed["status"], "validated_preview_only")
        self.assertIn("ne commande ni modèle serveur ni matériel", allowed["reason"])
        self.assertEqual(allowed["positionDeg"], 45.0)
        self.assertFalse(allowed["physicalCommandsEmitted"])
        self.assertFalse(allowed["sentToHardware"])

        physical = self.post("labBench.validateCommand", {**base_command, "humanConfirmed": True, "safetyConfirmed": True, "deviceConnected": True})
        self.assertEqual(physical.status_code, 403)
        self.assertEqual(physical.json()["error"]["json"]["code"], "PHYSICAL_COMMAND_FORBIDDEN")

        out_of_range = self.post("labBench.validateCommand", {**base_command, "humanConfirmed": True, "safetyConfirmed": True, "positionSetpointDeg": 91})
        self.assertEqual(out_of_range.status_code, 400)
        self.assertEqual(out_of_range.json()["error"]["json"]["code"], "SIMULATION_INPUT_OUT_OF_RANGE")


if __name__ == "__main__":
    unittest.main()
