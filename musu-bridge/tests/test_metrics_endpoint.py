"""GET /api/dispatch/metrics — v19.F Phase B observability.

Asserts the endpoint returns the three v31 counters and that they
reflect mutations made via the counters module.
"""

from __future__ import annotations

import os
import tempfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def app_and_db():
    fd, db_path = tempfile.mkstemp(suffix=".db", prefix="v19f_metrics_")
    os.close(fd)
    os.environ["MUSU_DB_PATH"] = db_path
    from musu_core import config as _cfg
    _cfg._default = None  # type: ignore[attr-defined]
    from musu_core import db as _db_mod
    _db_mod._db_instances.clear()  # type: ignore[attr-defined]

    from musu_core.db import get_db

    import dispatch_routes
    app = FastAPI()
    app.include_router(dispatch_routes.dispatch_router)
    client = TestClient(app)

    db = get_db(db_path)
    yield client, db
    db.close()
    try:
        os.unlink(db_path)
    except PermissionError:
        pass


def test_metrics_returns_three_seed_counters(app_and_db) -> None:
    client, _ = app_and_db
    resp = client.get("/api/dispatch/metrics")
    assert resp.status_code == 200
    body = resp.json()
    assert "counters" in body
    counters = body["counters"]
    assert counters == {
        "approvals_resolved_in_memory": 0,
        "approvals_resolved_orphan_resume": 0,
        "approvals_declined_orphan": 0,
    }


def test_metrics_reflects_incremented_counter(app_and_db) -> None:
    client, db = app_and_db
    from musu_core.dispatch.counters import (
        COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME,
        increment_counter,
    )
    increment_counter(db, COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME)
    increment_counter(db, COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME)

    resp = client.get("/api/dispatch/metrics")
    counters = resp.json()["counters"]
    assert counters["approvals_resolved_orphan_resume"] == 2
    assert counters["approvals_resolved_in_memory"] == 0
    assert counters["approvals_declined_orphan"] == 0


def test_metrics_after_orphan_approved_flow(app_and_db) -> None:
    """Run an actual submit_approval through the orphan-approved branch
    and assert the counter visible via /metrics reflects it."""
    client, db = app_and_db
    from musu_core.dispatch.approval import submit_approval

    # Seed: agent + run waiting_approval + pending approval row.
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs "
        "(id, agent_id, wake_reason, wake_payload, status) "
        "VALUES ('r1', 'a1', 'test', '{\"prompt\":\"hi\"}', 'waiting_approval')"
    )
    db.execute(
        "INSERT INTO run_approvals (id, run_id, prompt, status) "
        "VALUES ('a-orphan', 'r1', 'go?', 'pending')"
    )

    # No _approval_events entry registered = orphan path.
    result = submit_approval(db, "a-orphan", "approved")
    assert result.get("resumed") is True

    resp = client.get("/api/dispatch/metrics")
    counters = resp.json()["counters"]
    assert counters["approvals_resolved_orphan_resume"] == 1
    assert counters["approvals_resolved_in_memory"] == 0
    assert counters["approvals_declined_orphan"] == 0
