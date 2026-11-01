from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from web import engineering_connectors_api as api
from web import engineering_jobs as jobs
from web.database import Base
from web.models import Drone, EngineeringArtifact, EngineeringJob, EngineeringSimulationRun, Project, User


class EngineeringApiFlowTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="aeromind-api-flow-")
        self.storage = Path(self.temp.name) / "private-storage"
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.SessionTesting = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        with self.SessionTesting() as db:
            db.add(User(id="user-1", email="owner@example.test"))
            db.add(Project(id="project-1", user_id="user-1", name="Test project", data_json="{}"))
            db.add(Drone(id="cell-1", user_id="user-1", project_id="project-1", name="Cell 1", config_json="{}"))
            db.add(Project(id="project-2", user_id="user-1", name="Other project", data_json="{}"))
            db.add(Drone(id="cell-2", user_id="user-1", project_id="project-2", name="Cell 2", config_json="{}"))
            db.commit()

        self.env_patch = patch.dict(os.environ, {
            "AEROMIND_ENV": "test",
            "AEROMIND_ENGINEERING_INLINE_WORKER": "true",
            "AEROMIND_ENGINEERING_WORKER_ENABLED": "false",
            "AEROMIND_ENGINEERING_STORAGE_DIR": str(self.storage),
            "AEROMIND_ENGINEERING_REQUIRE_AV_SCAN": "false",
            "HARDWARE_CONTROL": "false",
        })
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

        self.owner_patch = patch.object(api, "owner", side_effect=lambda *_args, **_kwargs: "user-1")
        self.owner_patch.start()
        self.addCleanup(self.owner_patch.stop)

        def get_project(db, user_id: str, project_id: str):
            project = db.scalar(select(Project).where(Project.id == project_id, Project.user_id == user_id))
            if project is None:
                raise HTTPException(404, "Project not found")
            return project

        self.project_patch = patch.object(api, "get_project", side_effect=get_project)
        self.project_patch.start()
        self.addCleanup(self.project_patch.stop)

        self.worker_session_patch = patch.object(jobs, "SessionLocal", self.SessionTesting)
        self.worker_session_patch.start()
        self.addCleanup(self.worker_session_patch.stop)

        app = FastAPI()
        app.include_router(api.router)

        def override_get_db():
            with self.SessionTesting() as db:
                yield db

        app.dependency_overrides[api.get_db] = override_get_db
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.temp.cleanup)

    def test_csv_dry_run_commit_export_and_download(self) -> None:
        content = (
            "part_id,revision,name,quantity,quantity_unit,material_id,unit_mass_kg,source_ref\n"
            "P-1,A,wing-rib,2,ea,AL-6061,0.25,design-01\n"
        )
        response = self.client.post(
            "/api/engineering/files/import-jobs",
            data={
                "project_id": "project-1",
                "profile_id": "aeromind.bom.v1",
                "dialect_id": "utf8-comma-v1",
                "dry_run": "true",
                "cell_id": "cell-1",
            },
            files={"file": ("../../wing.csv", content, "text/plain")},
            headers={"Idempotency-Key": "import-flow-001"},
        )
        self.assertEqual(response.status_code, 202, response.text)
        initial = response.json()
        self.assertEqual(initial["cell_id"], "cell-1")
        self.assertEqual(initial["physical_output_enabled"], False)

        job_response = self.client.get(f"/api/engineering/jobs/{initial['job_id']}")
        self.assertEqual(job_response.status_code, 200, job_response.text)
        job = job_response.json()
        self.assertEqual(job["status"], "awaiting_review")
        self.assertEqual(job["artifact_status"], "validated")
        self.assertEqual(job["cell_id"], "cell-1")
        self.assertEqual(job["report"]["accepted_records"], 1)
        self.assertFalse(job["report"]["geometry_imported"])

        report_response = self.client.get(f"/api/engineering/jobs/{initial['job_id']}/report")
        self.assertEqual(report_response.status_code, 200, report_response.text)
        digest = report_response.json()["input_sha256"]
        commit = self.client.post(
            f"/api/engineering/jobs/{initial['job_id']}/commit",
            json={"confirm": True, "expected_input_sha256": digest},
        )
        self.assertEqual(commit.status_code, 200, commit.text)
        self.assertEqual(commit.json()["status"], "completed")
        self.assertEqual(commit.json()["artifact_status"], "committed")

        export = self.client.post(
            "/api/engineering/files/export-jobs",
            json={"project_id": "project-1", "source_job_id": initial["job_id"], "export_format": "spreadsheet-safe"},
            headers={"Idempotency-Key": "export-flow-001"},
        )
        self.assertEqual(export.status_code, 202, export.text)
        export_job = self.client.get(f"/api/engineering/jobs/{export.json()['job_id']}").json()
        self.assertEqual(export_job["status"], "completed")
        download = self.client.get(f"/api/engineering/jobs/{export.json()['job_id']}/download")
        self.assertEqual(download.status_code, 200, download.text)
        self.assertIn("part_id,revision,name", download.text)
        self.assertIn("wing-rib", download.text)
        self.assertIn("nosniff", download.headers.get("x-content-type-options", ""))

    def test_idempotent_internal_simulation_and_external_sitl_not_run(self) -> None:
        body = {"project_id": "project-1", "scenario_id": "propulsion.piston-demo.v1"}
        first = self.client.post("/api/engineering/simulations/internal", json=body, headers={"Idempotency-Key": "sim-001"})
        replay = self.client.post("/api/engineering/simulations/internal", json=body, headers={"Idempotency-Key": "sim-001"})
        self.assertEqual(first.status_code, 201, first.text)
        self.assertEqual(replay.status_code, 201, replay.text)
        self.assertEqual(replay.json()["run_id"], first.json()["run_id"])
        self.assertTrue(replay.json()["idempotent_replay"])
        self.assertEqual(first.json()["evidence_level"], "educational_model")
        self.assertFalse(first.json()["physical_output_enabled"])

        external = self.client.post(
            "/api/engineering/simulations/external-sitl",
            json={"project_id": "project-1", "target_id": "px4-copter-sitl"},
            headers={"Idempotency-Key": "sitl-001"},
        )
        self.assertEqual(external.status_code, 409)
        self.assertEqual(external.json()["detail"]["status"], "not_run")
        self.assertFalse(external.json()["detail"]["physical_output_enabled"])
        with self.SessionTesting() as db:
            self.assertEqual(db.query(EngineeringSimulationRun).count(), 1)

    def test_cell_from_another_project_is_rejected(self) -> None:
        response = self.client.post(
            "/api/engineering/files/import-jobs",
            data={"project_id": "project-1", "cell_id": "cell-2", "profile_id": "aeromind.bom.v1", "dry_run": "true"},
            files={"file": ("part.csv", "unused", "text/csv")},
            headers={"Idempotency-Key": "import-wrong-cell-001"},
        )
        self.assertEqual(response.status_code, 404)
        if self.storage.exists():
            self.assertEqual(list(self.storage.glob("*.source")), [])
        with self.SessionTesting() as db:
            self.assertEqual(db.query(EngineeringArtifact).count(), 0)
            self.assertEqual(db.query(EngineeringJob).count(), 0)

    def test_unowned_project_is_rejected_before_file_persistence(self) -> None:
        response = self.client.post(
            "/api/engineering/files/import-jobs",
            data={"project_id": "other-project", "profile_id": "aeromind.bom.v1", "dry_run": "true"},
            files={"file": ("part.csv", "unused", "text/csv")},
            headers={"Idempotency-Key": "import-forbidden-001"},
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(self.storage.exists())
        with self.SessionTesting() as db:
            self.assertEqual(db.query(EngineeringArtifact).count(), 0)
            self.assertEqual(db.query(EngineeringJob).count(), 0)


if __name__ == "__main__":
    unittest.main()
