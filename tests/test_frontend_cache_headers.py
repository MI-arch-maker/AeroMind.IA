from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from fastapi.staticfiles import StaticFiles

from web import app as web_app


@pytest.fixture
def static_client(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>current build</title>")
    (dist / "sw.js").write_text("self.addEventListener('activate', () => {});")
    (dist / "assets" / "index-a1b2c3.js").write_text("console.log('current bundle');")
    monkeypatch.setattr(web_app, "FRONTEND_DIR", dist)
    monkeypatch.setattr(web_app, "FRONTEND_INDEX", dist / "index.html")
    for route in web_app.app.routes:
        if getattr(route, "path", None) == "/assets":
            route.app = StaticFiles(directory=dist / "assets")
    return TestClient(web_app.app, headers={"host": "localhost"})


def test_html_and_service_worker_are_not_sticky(static_client):
    for path in ("/", "/simulation-analyses", "/sw.js"):
        response = static_client.get(path)
        assert response.status_code == 200
        assert "no-store" in response.headers["cache-control"]
        assert "no-cache" in response.headers["cache-control"]


def test_fingerprinted_assets_remain_immutable(static_client):
    response = static_client.get("/assets/index-a1b2c3.js")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_missing_hashed_asset_is_not_replaced_by_spa_html(static_client):
    response = static_client.get("/assets/vendor-ui-oldhash.js")
    assert response.status_code == 404
    assert "text/html" not in response.headers.get("content-type", "")


def test_service_worker_retires_old_cache_first_strategy():
    source = Path("frontend/client/public/sw.js").read_text()
    assert "self.registration.unregister()" in source
    assert "caches.delete(name)" in source
    assert "respondWith" not in source


def test_client_updates_existing_worker_without_registering_a_new_one():
    source = Path("frontend/client/src/main.tsx").read_text()
    assert "getRegistrations()" in source
    assert "registration.update()" in source
    assert "serviceWorker.register(" not in source
