"""Tier classification of the native CAD pipeline, independent from kernel tests."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from web.capability_policy import CapabilityMiddleware, capability_for, Capability


def cad_policy(path: str, method: str) -> Capability:
    policy = capability_for(path, method)
    assert policy is not None
    return policy


def test_cad_reference_is_public_but_upload_is_never_public():
    for path in ("/api/cad/capabilities", "/api/cad/materials", "/api/cad/demo", "/api/cad/demo/step"):
        assert cad_policy(path, "GET").public
        assert not cad_policy(path, "POST").public
    assert cad_policy("/api/cad/demo/section", "POST").public
    assert not cad_policy("/api/cad/imports", "POST").public
    assert cad_policy("/api/cad/imports", "POST").minimum == 3
    assert cad_policy("/api/cad/models/abc/materials", "POST").minimum == 2
    assert cad_policy("/api/cad/unknown", "GET").minimum == 4


def test_anonymous_cad_import_rejected_before_handler(monkeypatch):
    monkeypatch.setattr("web.capability_policy.current_user", lambda *_: None)
    app = FastAPI()
    app.add_middleware(CapabilityMiddleware)
    called = []

    @app.post("/api/cad/imports")
    def upload():
        called.append(True)
        return {"unexpected": True}

    assert TestClient(app).post("/api/cad/imports").status_code == 401
    assert not called


def test_l1_cannot_import_or_mutate_cad(monkeypatch):
    monkeypatch.setattr("web.capability_policy.current_user", lambda *_: {"id": "alice", "role": "user", "level": "L1"})
    app = FastAPI()
    app.add_middleware(CapabilityMiddleware)

    @app.post("/api/cad/imports")
    def upload():
        return {"unexpected": True}

    @app.post("/api/cad/models/model/materials")
    def mutation():
        return {"unexpected": True}

    client = TestClient(app)
    assert client.post("/api/cad/imports").status_code == 403
    assert client.post("/api/cad/models/model/materials").status_code == 403
