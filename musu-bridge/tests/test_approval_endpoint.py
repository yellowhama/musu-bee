"""POST /api/dispatch/runs/{id}/approve — status code matrix.

Mounts only the dispatch_router on a fresh FastAPI app so we don't pull
in the full server.py middleware stack (auth, rate limit, CSRF — all
irrelevant to this endpoint's logic).
"""

from __future__ import annotations

import os
import tempfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def app_and_db():
    """Fresh DB file + FastAPI app exposing only the dispatch router.

    Yields (TestClient, Database). The DB has one agent + one heartbeat
    run already seeded so the approve endpoint has something to act on.
    """
    fd, db_path = tempfile.mkstemp(suffix=".db", prefix="v19c_approve_")
    os.close(fd)
    # Point bridge config at this DB BEFORE importing dispatch_routes.
    os.environ["MUSU_DB_PATH"] = db_path
    # Reset cached config so it re-reads MUSU_DB_PATH.
    from musu_core import config as _cfg
    _cfg._default = None  # type: ignore[attr-defined]
    # Reset the get_db instance cache too — it keys by path, but a stale
    # entry from a prior test's now-deleted path would prevent fresh init.
    from musu_core import db as _db_mod
    _db_mod._db_instances.clear()  # type: ignore[attr-defined]

    from musu_core.db import get_db

    # Import after env is set so get_config picks up the new path.
    import dispatch_routes
    # The dispatch_router is module-level; rebuild the app each fixture
    # call to avoid state bleeding between tests.
    app = FastAPI()
    app.include_router(dispatch_routes.dispatch_router)
    client = TestClient(app)

    db = get_db(db_path)
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, status) "
        "VALUES ('r1', 'a1', 'test', 'running')"
    )
    yield client, db
    db.close()
    try:
        os.unlink(db_path)
    except PermissionError:
        pass


def _seed_pending(db, run_id="r1", prompt="ok?"):
    """Directly insert a pending approval + flip run to waiting_approval."""
    from musu_core.dispatch.approval import request_approval_sync

    return request_approval_sync(db, run_id, prompt)


def test_approve_yes_returns_approved(app_and_db) -> None:
    client, db = app_and_db
    _seed_pending(db)
    r = client.post("/api/dispatch/runs/r1/approve", json={"decision": "yes"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] == "approved"
    assert body["resumed"] is True


def test_approve_no_returns_declined(app_and_db) -> None:
    client, db = app_and_db
    _seed_pending(db)
    r = client.post("/api/dispatch/runs/r1/approve", json={"decision": "no"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["decision"] == "declined"
    assert body["cancelled"] is True


def test_approve_idempotent_second_call_returns_first_decision(app_and_db) -> None:
    """FR-007: a second resolve returns already_resolved with the first answer."""
    client, db = app_and_db
    _seed_pending(db)
    r1 = client.post("/api/dispatch/runs/r1/approve", json={"decision": "yes"})
    assert r1.status_code == 200

    r2 = client.post("/api/dispatch/runs/r1/approve", json={"decision": "no"})
    assert r2.status_code == 200, r2.text
    body = r2.json()
    assert body["already_resolved"] is True
    assert body["decision"] == "approved"


def test_approve_unknown_run_returns_404(app_and_db) -> None:
    client, _ = app_and_db
    r = client.post(
        "/api/dispatch/runs/nonexistent/approve", json={"decision": "yes"}
    )
    assert r.status_code == 404


def test_approve_no_pending_returns_404(app_and_db) -> None:
    """Run exists but has no pending approval."""
    client, _ = app_and_db
    r = client.post("/api/dispatch/runs/r1/approve", json={"decision": "yes"})
    assert r.status_code == 404


def test_approve_invalid_decision_returns_400(app_and_db) -> None:
    client, db = app_and_db
    _seed_pending(db)
    r = client.post(
        "/api/dispatch/runs/r1/approve", json={"decision": "maybe"}
    )
    assert r.status_code == 400


def test_approve_run_not_waiting_approval_returns_409(app_and_db) -> None:
    """Pending approval exists but run was forced back to running."""
    client, db = app_and_db
    _seed_pending(db)
    db.execute(
        "UPDATE heartbeat_runs SET status='running' WHERE id='r1'"
    )
    r = client.post(
        "/api/dispatch/runs/r1/approve", json={"decision": "yes"}
    )
    assert r.status_code == 409, r.text
