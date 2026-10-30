"""V5 LOT B / R-04 — DB-backed anonymous workspace persistence tests.

Verifies that:
  - Workspaces persist across simulated worker restart (in-memory cache cleared)
  - Two anonymous browsers have isolated workspaces
  - TTL is enforced (expired workspaces are lazily purged)
  - The shared 'default' key is rejected
  - The in-memory cache is only a fallback when the DB is unavailable
"""
from __future__ import annotations

import os
import re
import tempfile
from datetime import UTC, datetime, timedelta

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("AEROMIND_SESSION_SECRET", "x" * 32)
os.environ.setdefault("AEROMIND_ENV", "development")

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from web.database import Base
from web import canonical_models  # noqa: F401 — register canonical tables
from web.models import AnonymousWorkspace
import web.app as app_mod


@pytest.fixture
def workspace_db(tmp_path, monkeypatch):
    """Isolated file-based SQLite + patched global SessionLocal.

    Patches ``web.database.SessionLocal`` so the workspace helpers in
    ``web.app`` write to the SAME test DB.
    """
    db_path = tmp_path / "ws.db"
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    from web import database as _db_mod
    monkeypatch.setattr(_db_mod, "engine", engine)
    monkeypatch.setattr(_db_mod, "SessionLocal", Session)
    # Clear the in-memory cache between tests
    app_mod._local_workspaces.clear()
    yield Session, engine
    engine.dispose()
    app_mod._local_workspaces.clear()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _key(letter: str) -> str:
    """Build a 43-char alphanumeric workspace key (matches backend regex)."""
    return letter * 43


def _payload(draft: str) -> dict:
    return {"physicalOutputEnabled": False, "draft": draft, "updatedAt": "2026-10-25T00:00:00Z"}


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_workspace_persists_across_worker_restart(workspace_db):
    """V5 LOT B / R-04 — a PUT followed by a cache-clear GET returns the same payload."""
    Session, _ = workspace_db
    key = _key("A")
    # PUT
    app_mod._workspace_db_put(key, _payload("alpha"))
    # GET (canonical DB read; cache is refreshed)
    fetched1 = app_mod._workspace_db_get(key)
    assert fetched1 is not None
    assert fetched1["draft"] == "alpha"
    # Simulate worker restart — clear in-memory cache
    app_mod._local_workspaces.clear()
    # GET after simulated worker restart
    fetched2 = app_mod._workspace_db_get(key)
    assert fetched2 is not None, "Workspace MUST survive cache reset via DB persistence"
    assert fetched2["draft"] == "alpha"
    # Verify the row is in the DB
    with Session() as db:
        row = db.scalar(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
        assert row is not None
        assert row.expires_at is not None

def test_workspace_get_prefers_canonical_db_over_stale_worker_cache(workspace_db):
    """A warm worker cache must not mask a newer write from another worker."""
    Session, _ = workspace_db
    key = _key("C")
    app_mod._workspace_db_put(key, _payload("canonical-v1"))
    # Simulate another worker committing a newer row while this worker keeps
    # an older process-local cache entry.
    with Session() as db:
        row = db.scalar(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
        assert row is not None
        row.data_json = __import__("json").dumps(_payload("canonical-v2"))
        db.commit()
    app_mod._local_workspaces[key] = _payload("stale-worker-v1")

    fetched = app_mod._workspace_db_get(key)
    assert fetched is not None
    assert fetched["draft"] == "canonical-v2"
    assert app_mod._local_workspaces[key]["draft"] == "canonical-v2"


def test_workspace_isolation_two_browsers(workspace_db):
    """V5 LOT B / R-04 — two browsers with distinct keys have isolated workspaces."""
    Session, _ = workspace_db
    key_a = _key("A")
    key_b = _key("B")
    app_mod._workspace_db_put(key_a, _payload("draft-A"))
    app_mod._workspace_db_put(key_b, _payload("draft-B"))
    # Cross-key read must NOT leak
    fetched_a = app_mod._workspace_db_get(key_a)
    fetched_b = app_mod._workspace_db_get(key_b)
    assert fetched_a["draft"] == "draft-A"
    assert fetched_b["draft"] == "draft-B"
    # Clear cache, verify DB still isolates
    app_mod._local_workspaces.clear()
    fetched_a2 = app_mod._workspace_db_get(key_a)
    fetched_b2 = app_mod._workspace_db_get(key_b)
    assert fetched_a2["draft"] == "draft-A"
    assert fetched_b2["draft"] == "draft-B"
    # A's PUT cannot touch B's storage
    app_mod._workspace_db_put(key_a, _payload("draft-A-v2"))
    fetched_b3 = app_mod._workspace_db_get(key_b)
    assert fetched_b3["draft"] == "draft-B"


def test_workspace_default_key_rejected_by_shape():
    """V5 LOT B / R-04 — the shared 'default' key is rejected by the shape validator."""
    assert not app_mod._is_valid_workspace_key("default")
    assert not app_mod._is_valid_workspace_key("short")
    assert not app_mod._is_valid_workspace_key("")
    assert app_mod._is_valid_workspace_key(_key("A"))
    assert app_mod._is_valid_workspace_key(_key("B"))


def test_workspace_ttl_enforced(workspace_db, monkeypatch):
    """V5 LOT B / R-04 — expired workspaces are lazily purged on next GET."""
    Session, _ = workspace_db
    key = _key("T")
    # PUT with the default 7-day TTL
    app_mod._workspace_db_put(key, _payload("ttl-test"))
    # Verify it's retrievable
    assert app_mod._workspace_db_get(key) is not None
    # Manually expire the row in the DB
    with Session() as db:
        row = db.scalar(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    # Clear cache so GET must hit the DB
    app_mod._local_workspaces.clear()
    # GET — should return None because the row is expired (lazy purge)
    fetched = app_mod._workspace_db_get(key)
    assert fetched is None
    # The row should have been purged by the lazy purge in _workspace_db_get
    with Session() as db:
        row_after = db.scalar(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
        assert row_after is None, "Expired row should be lazily purged"


def test_workspace_sliding_ttl_refreshed_on_put(workspace_db):
    """V5 LOT B / R-04 — each PUT refreshes the TTL (sliding expiration)."""
    Session, _ = workspace_db
    key = _key("S")
    app_mod._workspace_db_put(key, _payload("slide-1"))
    with Session() as db:
        row1 = db.scalar(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
        first_expires = row1.expires_at
    # Wait a tiny bit, then PUT again
    import time
    time.sleep(0.05)
    app_mod._workspace_db_put(key, _payload("slide-2"))
    with Session() as db:
        row2 = db.scalar(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key))
        second_expires = row2.expires_at
    assert second_expires > first_expires, "TTL must be refreshed on PUT"


def test_workspace_update_in_place(workspace_db):
    """V5 LOT B / R-04 — a PUT to an existing key updates the row, doesn't create a duplicate."""
    Session, _ = workspace_db
    key = _key("U")
    app_mod._workspace_db_put(key, _payload("v1"))
    app_mod._workspace_db_put(key, _payload("v2"))
    app_mod._workspace_db_put(key, _payload("v3"))
    with Session() as db:
        rows = db.scalars(select(AnonymousWorkspace).where(AnonymousWorkspace.id == key)).all()
        assert len(rows) == 1, "PUT to existing key should UPDATE, not INSERT"
        assert rows[0].data_json.count("v3") == 1
    app_mod._local_workspaces.clear()
    fetched = app_mod._workspace_db_get(key)
    assert fetched["draft"] == "v3"


def test_workspace_quota_enforced_in_memory(workspace_db, monkeypatch):
    """V5 LOT B / R-04 — the in-memory cache is bounded to MAX_ANONYMOUS_WORKSPACES."""
    # Set a low cap for testing
    monkeypatch.setattr(app_mod, "MAX_ANONYMOUS_WORKSPACES", 3)
    # PUT 4 distinct keys — the oldest should be evicted from the cache
    keys = [_key(c) for c in "ABCD"]
    for i, k in enumerate(keys):
        app_mod._workspace_db_put(k, _payload(f"d-{i}"))
    # The DB still has all 4 (quota is on the in-memory cache only)
    fetched_d = app_mod._workspace_db_get(keys[3])
    assert fetched_d is not None
    # The cache should have at most MAX_ANONYMOUS_WORKSPACES entries
    assert len(app_mod._local_workspaces) <= 3


def test_workspace_db_unavailable_degrades_gracefully(workspace_db, monkeypatch):
    """V5 LOT B / R-04 — if the DB is unavailable, the workspace helpers degrade
    to in-memory-only mode (with a warning) instead of crashing."""
    # Break the SessionLocal so DB writes fail
    def _broken_session():
        raise RuntimeError("DB unavailable")
    from web import database as _db_mod
    monkeypatch.setattr(_db_mod, "SessionLocal", _broken_session)
    # PUT — should NOT raise (degrades to in-memory only)
    key = _key("X")
    app_mod._workspace_db_put(key, _payload("degraded"))
    # In-memory cache has it
    assert app_mod._local_workspaces.get(key) is not None
    # GET — returns from cache (DB fallback fails silently)
    fetched = app_mod._workspace_db_get(key)
    assert fetched is not None
    assert fetched["draft"] == "degraded"
    # Clear cache → DB fallback fails → returns None (not crash)
    app_mod._local_workspaces.clear()
    fetched2 = app_mod._workspace_db_get(key)
    assert fetched2 is None
