from fastapi import FastAPI
from fastapi.testclient import TestClient
import asyncio

from web.capability_policy import CapabilityMiddleware, capability_for
from web.config import Settings
from web.copilot import complete_chat


def _client_for(monkeypatch, level: str, role: str = "user") -> TestClient:
    monkeypatch.setattr(
        "web.capability_policy.current_user",
        lambda _cookie, _authorization: {"id": "test-user", "role": role, "level": level},
    )
    app = FastAPI()
    app.add_middleware(CapabilityMiddleware)

    @app.post("/api/engineering/simulations/internal")
    def internal_simulation():
        return {"ok": True}

    @app.get("/api/engineering/unreviewed-endpoint")
    def unreviewed_endpoint():
        return {"ok": True}

    @app.post("/api/hardware/drones/test/command")
    def physical_command():
        return {"ok": True}

    @app.get("/api/ops/health")
    def system_health():
        return {"ok": True}

    @app.get("/api/ops/capabilities")
    def system_capabilities():
        return {"ok": True}

    return TestClient(app)


def test_l1_l2_l3_capability_thresholds_are_enforced_in_asgi_middleware(monkeypatch):
    assert _client_for(monkeypatch, "L1").post("/api/engineering/simulations/internal").status_code == 403
    assert _client_for(monkeypatch, "L2").post("/api/engineering/simulations/internal").status_code == 200


def test_unknown_engineering_route_fails_closed_for_l1_l3(monkeypatch):
    assert _client_for(monkeypatch, "L3").get("/api/engineering/unreviewed-endpoint").status_code == 403
    assert _client_for(monkeypatch, "L4", role="admin").get("/api/engineering/unreviewed-endpoint").status_code == 200


def test_physical_routes_remain_outside_l1_l3(monkeypatch):
    assert _client_for(monkeypatch, "L3").post("/api/hardware/drones/test/command").status_code == 403
    # L4 still has to pass the original route's physical interlocks in production.
    assert _client_for(monkeypatch, "L4", role="admin").post("/api/hardware/drones/test/command").status_code == 200


def test_trpc_mutations_cannot_be_called_with_get():
    policy = capability_for("/api/trpc/labBench.runSimulation", "GET")
    assert policy is not None
    assert policy.method_not_allowed is True
    assert capability_for("/api/trpc/auth.logout", "GET").method_not_allowed is True


def test_superadmin_monitor_and_mechanical_preview_are_l5_read_only_queries():
    for procedure in ("qualificationActivity", "projectMechanicalPreview"):
        policy = capability_for(f"/api/trpc/superAdmin.{procedure}", "GET")
        assert policy is not None
        assert policy.minimum == 5
        assert policy.method_not_allowed is False
        assert capability_for(f"/api/trpc/superAdmin.{procedure}", "POST").minimum == 5


def test_unclassified_api_and_trpc_routes_fail_closed_but_health_is_explicitly_public():
    assert capability_for("/api/new-simulation-engine", "POST").minimum == 4
    assert capability_for("/api/trpc/newEngineering.mutate", "POST").minimum == 4
    assert capability_for("/api/trpc/newEngineering.mutate", "GET").method_not_allowed is True
    assert capability_for("/api/health", "GET") is None
    assert capability_for("/api/admin-console/llm/validate", "POST") is None


def test_tier_matrix_maps_expected_domains_and_default_denials():
    assert capability_for("/api/projects", "POST").minimum == 1
    assert capability_for("/api/projects/p1/drones", "POST").minimum == 2
    assert capability_for("/api/engineering/evidence/certificate", "POST").minimum == 3
    assert capability_for("/api/workflow/runs/r1/replay", "POST").minimum == 3
    assert capability_for("/api/lab/runs", "POST").minimum == 2
    assert capability_for("/api/missions/m1/upload", "POST").minimum == 4
    assert capability_for("/api/ops/health", "GET").minimum == 5
    assert capability_for("/api/ops/capabilities", "GET").minimum == 5


def test_internal_llm_uses_only_its_dedicated_credential_and_model(monkeypatch):
    settings = Settings(
        session_secret="x" * 40,
        openai_api_key="external-secret-must-not-be-used",
        llm_deployment="aeromind",
        aeromind_llm_base="https://llm.internal.example/v1",
        aeromind_llm_allowed_hosts="llm.internal.example",
        aeromind_llm_model="aeromind-private-model",
        aeromind_llm_api_key="internal-only-secret",
    )
    captured = {}

    class Reply:
        def raise_for_status(self):
            return None

        def json(self):
            return {"model": "aeromind-private-model", "choices": [{"message": {"content": "OK"}}]}

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, *, headers, json):
            captured.update(url=url, headers=headers, payload=json)
            return Reply()

    monkeypatch.setattr("web.copilot.get_settings", lambda: settings)
    monkeypatch.setattr("web.copilot.httpx.AsyncClient", Client)
    result = asyncio.run(complete_chat([{"role": "user", "content": "Test"}]))
    assert result["provider"] == "aeromind-managed"
    assert captured["url"] == "https://llm.internal.example/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer internal-only-secret"
    assert captured["payload"]["model"] == "aeromind-private-model"



def test_system_wide_observability_is_reserved_for_admin_levels(monkeypatch):
    assert _client_for(monkeypatch, "L3").get("/api/ops/health").status_code == 403
    assert _client_for(monkeypatch, "L3").get("/api/ops/capabilities").status_code == 403
    assert _client_for(monkeypatch, "L4", role="admin").get("/api/ops/health").status_code == 403
    assert _client_for(monkeypatch, "L4", role="admin").get("/api/ops/capabilities").status_code == 403
    assert _client_for(monkeypatch, "L5", role="super_admin").get("/api/ops/health").status_code == 200
    assert _client_for(monkeypatch, "L5", role="super_admin").get("/api/ops/capabilities").status_code == 200
