import os
import unittest
from uuid import uuid4

os.environ.setdefault("AEROMIND_ENV", "development")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "local-workflow-e2e-secret-32-bytes-minimum")
# V6 — use setdefault so we don't override DATABASE_URL that another test
# module already set. The StaticPool fix in web/database.py makes
# :memory: SQLite work correctly (shared across connections).
os.environ.setdefault("DATABASE_URL", f"sqlite:////tmp/aeromind-workflow-unittest-{os.getpid()}.db")

from fastapi.testclient import TestClient

from web.app import app
from web.database import SessionLocal
from web.models import AdminAccountRecord, Project, User
from web.oidc import _b64, _signed


class WorkflowE2ETest(unittest.TestCase):
    def test_demo_prototype_design_simulation_hall_report_replay(self):
        user_id, project_id = "workflow-e2e-user", str(uuid4())
        with TestClient(app, headers={"host": "localhost"}) as client:
            with SessionLocal() as db:
                db.add(User(id=user_id, email="demo@example.com"))
                db.add(AdminAccountRecord(id=str(uuid4()), email="demo@example.com", data_json='{"id":"workflow-e2e-user","email":"demo@example.com","role":"demo","accountStatus":"active","level":"L1"}'))
                db.commit()
                db.add(Project(id=project_id, user_id=user_id, name="Workflow E2E", data_json="{}"))
                db.commit()
            session = _signed(_b64(f"{user_id}|demo@example.com".encode()))
            headers = {"host": "localhost", "cookie": f"aeromind_session={session}"}
            prototype_payload = {
                "project_id": project_id, "name": "ATLAS E2E", "version": "1.0.0",
                "config": {
                    "wingspan_m": 2.8, "chord_m": 0.32, "fuselage_length_m": 1.55,
                    "propeller_diameter_m": 0.42, "battery_wh": 820, "payload_kg": 1.5,
                    "cruise_speed_mps": 14.44, "wind_speed_mps": 6.67, "altitude_m": 120,
                    "max_takeoff_mass_kg": 10.5, "motor_count": 1, "airframe": "fixed-wing",
                    "design_name": "ATLAS E2E",
                },
                "requirements": [{"id": "payload", "value": 1.5, "unit": "kg"}], "sketch": {},
            }
            prototype_response = client.post("/api/workflow/prototypes", json=prototype_payload, headers=headers)
            self.assertEqual(prototype_response.status_code, 201, prototype_response.text)
            prototype = prototype_response.json()
            self.assertEqual(prototype["status"], "ready_to_simulate")
            self.assertEqual(len(prototype["input_sha256"]), 64)
            document = {
                "schema": "aeromind-engineering-document", "schema_version": 1,
                "project_id": project_id, "prototype_version_id": prototype["id"],
                "architecture": "fixed-wing", "units": "SI",
                "geometry": {"wingspan_m": 2.8, "fuselage_length_m": 1.55},
                "parameters": {"battery_wh": 820, "motor_count": 1},
                "component_instances": [{"id": "body-1", "definition_id": "fuselage-shell", "label": "Fuselage", "category": "airframe", "quantity": 1, "mass_kg": 0.55, "x_m": 0, "y_m": 0, "z_m": 0, "rotation_deg": 0, "scale": 1, "source_status": "estimate", "interfaces": []}],
                "connections": [], "validation": [], "bom": [{"component_id": "body-1", "reference": "fuselage-shell", "designation": "Fuselage", "quantity": 1, "unit_mass_kg": 0.55, "total_mass_kg": 0.55, "data_status": "estimate", "notes": "Validation requise"}],
                "assumptions": ["Document paramétrique de démonstration"], "missing_data": ["centre de gravité"], "created_at": None,
            }
            document_response = client.post(f"/api/engineering-documents/prototype-versions/{prototype['id']}", json=document, headers=headers)
            self.assertEqual(document_response.status_code, 201, document_response.text)
            loaded_document = client.get(f"/api/engineering-documents/prototype-versions/{prototype['id']}", headers=headers)
            self.assertEqual(loaded_document.status_code, 200)
            self.assertEqual(loaded_document.json()["document"]["component_instances"][0]["id"], "body-1")
            duplicate_document = client.post(f"/api/engineering-documents/prototype-versions/{prototype['id']}", json=document, headers=headers)
            self.assertEqual(duplicate_document.status_code, 409)

            scenario = {
                "scenario_id": "demo-route-01", "name": "Route E2E", "coordinate_frame": "ENU",
                "altitude_unit": "m", "speed_unit": "m/s", "seed": 42,
                "waypoints": [
                    {"id": "a", "x_m": 0, "y_m": 0, "z_m": 12, "speed_mps": 4},
                    {"id": "b", "x_m": 20, "y_m": 8, "z_m": 18, "speed_mps": 8},
                ],
            }
            invalid_scenario = {**scenario, "speed_unit": "km/h"}
            invalid_response = client.post(f"/api/workflow/prototypes/{prototype['id']}/runs", json=invalid_scenario, headers=headers)
            self.assertEqual(invalid_response.status_code, 422)
            run_response = client.post(f"/api/workflow/prototypes/{prototype['id']}/runs", json=scenario, headers=headers)
            self.assertEqual(run_response.status_code, 201, run_response.text)
            run = run_response.json()
            self.assertEqual(run["status"], "completed")
            self.assertFalse(run["result"]["physical_solver_connected"])
            self.assertEqual(run["result"]["input_units"], {"distance": "m", "altitude": "m", "speed": "m/s", "time": "s"})

            replay_response = client.post(f"/api/workflow/runs/{run['id']}/replay", headers=headers)
            self.assertEqual(replay_response.status_code, 201, replay_response.text)
            replay = replay_response.json()
            self.assertEqual(replay["replay_of"], run["id"])
            self.assertEqual(replay["result"], run["result"])

            report_response = client.post(f"/api/workflow/runs/{run['id']}/report", headers=headers)
            self.assertEqual(report_response.status_code, 201, report_response.text)
            self.assertEqual(report_response.json()["report"]["run"]["id"], run["id"])

            duplicate = client.post("/api/workflow/prototypes", json=prototype_payload, headers=headers)
            self.assertEqual(duplicate.status_code, 409, duplicate.text)


if __name__ == "__main__":
    unittest.main()
