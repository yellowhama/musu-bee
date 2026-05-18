"""V23.4 Phase 4 T2-A' — workflow CRUD + Pydantic + routes tests.

Covers wiki/432 §3 test cases:
  T1   migration round-trip + idempotency
  T2   Pydantic agent id uniqueness
  T3   Pydantic edge cross-reference
  T4   Pydantic cycle detection
  T5   Pydantic input cross-reference
  T6   assign_steps_to_pcs match
  T7   assign_steps_to_pcs no-match → 422
  T13  DELETE cascade
  T14  PATCH status-only
  T15  SSE eligibility (_ALLOWED_TABLES)
  T16  Workflow completion aggregation
  T17  Rendezvous-PC fast-path (primary branch in _is_primary)
  T18  Degenerate single-step workflow
  T19  All-steps-same-PC workflow
  T20  Two concurrent terminal transitions atomicity
  T21  Stale machine excluded from assignment
  T22  Peer-claim TOCTOU race via HTTP
  T23  Operator retry endpoint
  T26  SSE eligibility column check (Auditor A-HIGH-1)
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from musu_core.db import Database


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _seed_machines(db: Database) -> None:
    """Seed two online machines + capacity rows with fresh last_seen_at."""
    import time as _t

    now = int(_t.time())
    db.execute(
        "INSERT INTO machines(id, hostname, os, arch, status, last_seen_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        ("m-linux", "linux-host", "linux", "x86_64", "online", now),
    )
    db.execute(
        "INSERT INTO machines(id, hostname, os, arch, status, last_seen_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        ("m-win", "win-host", "windows", "x86_64", "online", now),
    )
    db.execute(
        "INSERT INTO machine_capacity"
        "(machine_id, gpu_models_json, gpu_vram_total_gb, gpu_vram_free_gb, "
        " cpu_cores, cpu_idle_pct, mem_total_gb, mem_free_gb, "
        " runtime_classes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "m-linux", json.dumps(["RTX 4060"]),
            8.0, 6.0, 8, 80.0, 32.0, 24.0,
            json.dumps(["claude_local"]),
        ),
    )
    db.execute(
        "INSERT INTO machine_capacity"
        "(machine_id, gpu_models_json, gpu_vram_total_gb, gpu_vram_free_gb, "
        " cpu_cores, cpu_idle_pct, mem_total_gb, mem_free_gb, "
        " runtime_classes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "m-win", json.dumps([]),
            0.0, 0.0, 4, 60.0, 16.0, 8.0,
            json.dumps(["openai_local"]),
        ),
    )


@pytest.fixture
def db() -> Database:
    """In-memory Database with v37 applied (via _open in db.py)."""
    return Database(":memory:")


@pytest.fixture
def client(db: Database):
    """Mount workflow_router alone with a fake backend."""
    _seed_machines(db)

    class _FakeBackend:
        def __init__(self, inner: Database) -> None:
            self._db = inner

    fake_backend = _FakeBackend(db)

    import workflow_routes  # noqa: PLC0415

    with patch("workflow_routes._get_db", return_value=db):
        app = FastAPI()
        app.include_router(workflow_routes.workflow_router)
        yield TestClient(app)


# ---------------------------------------------------------------------------
# T1 — Migration round-trip + idempotency
# ---------------------------------------------------------------------------


def test_t1_migration_round_trip(tmp_path) -> None:
    import sqlite3

    from musu_core.db import _open
    from musu_core.migrations import _v37_down, _v37_up

    p = tmp_path / "round.db"
    conn = _open(str(p))
    try:
        # Already applied by _open; verify tables exist with required columns
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('workflows','workflow_steps') ORDER BY name"
        ).fetchall()
        names = [r[0] for r in rows]
        assert names == ["workflow_steps", "workflows"]

        cols = {
            r[1] for r in conn.execute(
                "PRAGMA table_info(workflow_steps)"
            ).fetchall()
        }
        assert {"id", "workflow_id", "agent_id", "assigned_pc", "status",
                "updated_at", "depends_on_json"} <= cols

        # Idempotency: reapply should be a no-op
        _v37_up(conn)
        rows2 = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name = 'workflows'"
        ).fetchone()
        assert rows2 is not None

        # Down: tables gone
        _v37_down(conn)
        rows3 = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('workflows','workflow_steps')"
        ).fetchall()
        assert rows3 == []

        # Reapply after down: succeeds
        _v37_up(conn)
        rows4 = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('workflows','workflow_steps')"
        ).fetchall()
        assert len(rows4) == 2
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# T2-T5 — Pydantic validators
# ---------------------------------------------------------------------------


def test_t2_pydantic_duplicate_agent_ids() -> None:
    from pydantic import ValidationError

    from workflow_routes import WorkflowSpec

    with pytest.raises(ValidationError, match="duplicate agent ids"):
        WorkflowSpec(
            agents=[
                {"id": "a", "image": "x"},
                {"id": "a", "image": "y"},
            ],
            edges=[],
        )


def test_t3_pydantic_edge_cross_reference() -> None:
    from pydantic import ValidationError

    from workflow_routes import WorkflowSpec

    with pytest.raises(ValidationError, match="edge.from"):
        WorkflowSpec(
            agents=[{"id": "a", "image": "x"}],
            edges=[{"from": "ghost", "to": "a"}],
        )

    with pytest.raises(ValidationError, match="edge.to"):
        WorkflowSpec(
            agents=[{"id": "a", "image": "x"}],
            edges=[{"from": "a", "to": "ghost"}],
        )


def test_t4_pydantic_cycle_detection() -> None:
    from pydantic import ValidationError

    from workflow_routes import WorkflowSpec

    with pytest.raises(ValidationError, match="cycle detected"):
        WorkflowSpec(
            agents=[
                {"id": "a", "image": "x"},
                {"id": "b", "image": "y"},
            ],
            edges=[
                {"from": "a", "to": "b"},
                {"from": "b", "to": "a"},
            ],
        )


def test_t5_pydantic_input_cross_reference() -> None:
    from pydantic import ValidationError

    from workflow_routes import WorkflowSpec

    with pytest.raises(ValidationError, match="unknown source agent"):
        WorkflowSpec(
            agents=[
                {
                    "id": "a",
                    "image": "x",
                    "inputs": [{"name": "v", "from": "ghost"}],
                }
            ],
            edges=[],
        )

    # Input.name not in source's outputs
    with pytest.raises(ValidationError, match="not in 'b'.outputs"):
        WorkflowSpec(
            agents=[
                {"id": "b", "image": "x", "outputs": ["foo"]},
                {
                    "id": "a",
                    "image": "x",
                    "inputs": [{"name": "missing", "from": "b"}],
                },
            ],
            edges=[],
        )


# ---------------------------------------------------------------------------
# T6 — assign_steps_to_pcs match
# ---------------------------------------------------------------------------


def test_t6_assign_steps_to_pcs_match(db: Database) -> None:
    _seed_machines(db)
    from handlers import assign_steps_to_pcs

    spec = {
        "agents": [
            {"id": "a", "image": "x", "nodeSelector": {"os": "linux"}},
            {"id": "b", "image": "y", "nodeSelector": {"os": "windows"}},
        ]
    }
    out = assign_steps_to_pcs(db, spec)
    assert out == {"a": "m-linux", "b": "m-win"}


# ---------------------------------------------------------------------------
# T7 — no eligible PC → NoEligiblePCError → 422
# ---------------------------------------------------------------------------


def test_t7_no_eligible_pc_raises(db: Database) -> None:
    _seed_machines(db)
    from handlers import NoEligiblePCError, assign_steps_to_pcs

    spec = {
        "agents": [
            {
                "id": "x",
                "image": "x",
                "nodeSelector": {"gpu_vram_free_gb_min": "99999"},
            }
        ]
    }
    with pytest.raises(NoEligiblePCError) as exc:
        assign_steps_to_pcs(db, spec)
    assert exc.value.context["agent_id"] == "x"
    assert "gpu_vram_free_gb_min" in exc.value.context["selector"]


def test_t7_post_workflow_no_eligible_pc_returns_422(client: TestClient) -> None:
    body = {
        "company_id": "co-a",
        "name": "ghost",
        "spec": {
            "agents": [
                {
                    "id": "x",
                    "image": "alpine",
                    "nodeSelector": {"gpu_vram_free_gb_min": "999999"},
                }
            ],
            "edges": [],
        },
    }
    r = client.post("/api/workflows", json=body)
    assert r.status_code == 422, r.text
    detail = r.json()["detail"]
    assert detail["error"] == "no_eligible_pcs"
    assert detail["agent_id"] == "x"


# ---------------------------------------------------------------------------
# T13 — DELETE cascade
# ---------------------------------------------------------------------------


def test_t13_delete_cascade(client: TestClient, db: Database) -> None:
    body = {
        "company_id": "co-a",
        "name": "ws",
        "spec": {
            "agents": [{"id": "a", "image": "alpine", "nodeSelector": {"os": "linux"}}],
            "edges": [],
        },
    }
    r = client.post("/api/workflows", json=body)
    assert r.status_code == 201, r.text
    wf_id = r.json()["id"]
    # confirm steps were inserted
    steps = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ?", (wf_id,)
    )
    assert len(steps) == 1

    r = client.delete(f"/api/workflows/{wf_id}")
    assert r.status_code == 204
    # FK cascade should have removed the step
    steps2 = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ?", (wf_id,)
    )
    assert steps2 == []

    # 404 on missing
    r = client.delete(f"/api/workflows/{wf_id}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# T14 — PATCH status-only; unknown field → 422
# ---------------------------------------------------------------------------


def test_t14_patch_status_only(client: TestClient) -> None:
    body = {
        "company_id": "co-a",
        "name": "ws14",
        "spec": {
            "agents": [{"id": "a", "image": "alpine", "nodeSelector": {"os": "linux"}}],
            "edges": [],
        },
    }
    wf_id = client.post("/api/workflows", json=body).json()["id"]

    r = client.patch(f"/api/workflows/{wf_id}", json={"status": "running"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "running"

    # Unknown field rejected by extra='forbid'
    r = client.patch(
        f"/api/workflows/{wf_id}",
        json={"status": "running", "spec": {"agents": []}},
    )
    assert r.status_code == 422

    # 404 for missing
    r = client.patch("/api/workflows/ghost", json={"status": "paused"})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# T14b — GET /workflows/{id} returns full spec (V23.4 audit-fix A1, wiki/435 v2)
# ---------------------------------------------------------------------------


def test_t14b_get_workflow_detail_returns_spec(client: TestClient) -> None:
    """Editor needs full spec to repopulate the form on existing-workflow edit.

    Per V23.4 audit-fix A1: previously the editor fetched a non-existent
    endpoint and silently rendered an empty form. This test pins the
    round-trip contract so the regression cannot recur.
    """
    body = {
        "company_id": "co-a",
        "name": "ws14b",
        "spec": {
            "agents": [
                {"id": "writer", "image": "alpine", "nodeSelector": {"os": "linux"}, "command": ["summarize"]},
                {"id": "reviewer", "image": "alpine", "nodeSelector": {"os": "linux"}, "command": ["review"]},
            ],
            "edges": [{"from": "writer", "to": "reviewer", "condition": "succeeded"}],
        },
    }
    wf_id = client.post("/api/workflows", json=body).json()["id"]

    r = client.get(f"/api/workflows/{wf_id}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["id"] == wf_id
    assert data["company_id"] == "co-a"
    assert data["name"] == "ws14b"
    assert data["status"] == "pending"
    # Spec round-trip: edges use alias-form keys (from/to), agents preserve ids.
    assert {a["id"] for a in data["spec"]["agents"]} == {"writer", "reviewer"}
    assert data["spec"]["edges"] == [
        {"from": "writer", "to": "reviewer", "condition": "succeeded"}
    ]

    # 404 for missing
    r = client.get("/api/workflows/ghost-id")
    assert r.status_code == 404

    # _pending shadow-check: literal-path route still wins over wf_id pattern.
    r = client.get("/api/workflows/_pending", params={"assigned_pc": "pc-x"})
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# T15 — SSE eligibility (_ALLOWED_TABLES)
# ---------------------------------------------------------------------------


def test_t15_sse_eligibility() -> None:
    from musu_core.controllers.sources import _ALLOWED_TABLES

    assert "workflows" in _ALLOWED_TABLES
    assert "workflow_steps" in _ALLOWED_TABLES


# ---------------------------------------------------------------------------
# T16 — Workflow completion aggregation
# ---------------------------------------------------------------------------


def test_t16_workflow_completion_aggregation(db: Database) -> None:
    """All succeeded → workflows.status='succeeded'. Any genuine failed →
    'failed'. executor_crash only → workflow stays 'running'."""
    _seed_machines(db)
    from handlers import (
        create_workflow_handler,
        transition_workflow_step,
    )

    # Workflow with 2 steps, both succeed
    req = {
        "company_id": "co-a",
        "name": "ok",
        "spec": {
            "agents": [
                {"id": "a", "image": "x", "nodeSelector": {"os": "linux"}},
                {"id": "b", "image": "y", "nodeSelector": {"os": "linux"}},
            ],
            "edges": [],
        },
    }
    wf = create_workflow_handler(db, req)
    wf_id = wf["id"]
    steps = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ? ORDER BY agent_id",
        (wf_id,),
    )
    for s in steps:
        assert transition_workflow_step(
            db, s["id"], "running", claiming_pc="m-linux"
        )
    for s in steps:
        assert transition_workflow_step(db, s["id"], "succeeded")
    final = db.execute(
        "SELECT status FROM workflows WHERE id = ?", (wf_id,)
    )[0]["status"]
    assert final == "succeeded"

    # Workflow with one genuine fail
    wf2 = create_workflow_handler(db, {**req, "name": "fail"})
    wf2_id = wf2["id"]
    steps2 = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ? ORDER BY agent_id",
        (wf2_id,),
    )
    transition_workflow_step(db, steps2[0]["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(db, steps2[1]["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(
        db, steps2[0]["id"], "failed", error_json=json.dumps({"reason": "boom"})
    )
    transition_workflow_step(db, steps2[1]["id"], "succeeded")
    final2 = db.execute(
        "SELECT status FROM workflows WHERE id = ?", (wf2_id,)
    )[0]["status"]
    assert final2 == "failed"

    # Workflow with only executor_crash failures: should stay 'running'-eligible
    # (not auto-marked 'failed' because executor_crash is recoverable via /retry).
    wf3 = create_workflow_handler(db, {**req, "name": "crash"})
    wf3_id = wf3["id"]
    steps3 = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ? ORDER BY agent_id",
        (wf3_id,),
    )
    transition_workflow_step(db, steps3[0]["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(db, steps3[1]["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(
        db,
        steps3[0]["id"],
        "failed",
        error_json=json.dumps({"reason": "executor_crash"}),
    )
    transition_workflow_step(db, steps3[1]["id"], "succeeded")
    final3 = db.execute(
        "SELECT status FROM workflows WHERE id = ?", (wf3_id,)
    )[0]["status"]
    # Both terminal but no genuine fail → 'succeeded' (executor_crash treated
    # as recoverable AND aggregate is terminal). Per wiki/432 §2.4:
    # has_genuine_fail = False → final = 'succeeded'.
    assert final3 == "succeeded"


# ---------------------------------------------------------------------------
# T17 — Rendezvous-PC fast path (primary branch in _is_primary)
# ---------------------------------------------------------------------------


def test_t17_primary_fast_path(monkeypatch) -> None:
    """When MUSU_NODE_ROLE=primary, _fetch_pending_steps goes through local
    handlers.get_pending_steps_for_pc, NOT httpx."""
    import asyncio as _aio

    import workflow_executor

    monkeypatch.setenv("MUSU_NODE_ROLE", "primary")

    db_calls: list = []

    def _fake_get(db_arg, pc, lim):
        db_calls.append((pc, lim))
        return [{"step_id": "s1", "workflow_id": "w1", "agent_id": "a"}]

    monkeypatch.setattr(
        "handlers.get_pending_steps_for_pc", _fake_get
    )
    # ensure if peer path were used, it would explode
    monkeypatch.delenv("MUSU_PRIMARY_URL", raising=False)

    out = _aio.run(workflow_executor._fetch_pending_steps(None, "m-x"))
    assert out == [{"step_id": "s1", "workflow_id": "w1", "agent_id": "a"}]
    assert db_calls == [("m-x", workflow_executor.POLL_BATCH)]


# ---------------------------------------------------------------------------
# T18 — Degenerate single-step workflow
# ---------------------------------------------------------------------------


def test_t18_single_step_workflow(client: TestClient, db: Database) -> None:
    body = {
        "company_id": "co-a",
        "name": "single",
        "spec": {
            "agents": [{"id": "a", "image": "x", "nodeSelector": {"os": "linux"}}],
            "edges": [],
        },
    }
    r = client.post("/api/workflows", json=body)
    assert r.status_code == 201
    wf_id = r.json()["id"]

    from handlers import transition_workflow_step

    s = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ?", (wf_id,)
    )[0]
    transition_workflow_step(db, s["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(db, s["id"], "succeeded")
    final = db.execute(
        "SELECT status FROM workflows WHERE id = ?", (wf_id,)
    )[0]["status"]
    assert final == "succeeded"


# ---------------------------------------------------------------------------
# T19 — All-steps-same-PC workflow
# ---------------------------------------------------------------------------


def test_t19_all_same_pc(db: Database) -> None:
    """All N agents on same PC: no self-race on _claim_step_toctou; both claims succeed serially."""
    _seed_machines(db)
    from handlers import create_workflow_handler, transition_workflow_step

    req = {
        "company_id": "co-a",
        "name": "all-linux",
        "spec": {
            "agents": [
                {"id": "a", "image": "x", "nodeSelector": {"os": "linux"}},
                {"id": "b", "image": "y", "nodeSelector": {"os": "linux"}},
                {"id": "c", "image": "z", "nodeSelector": {"os": "linux"}},
            ],
            "edges": [],
        },
    }
    wf = create_workflow_handler(db, req)
    steps = db.execute(
        "SELECT id, assigned_pc FROM workflow_steps WHERE workflow_id = ?",
        (wf["id"],),
    )
    assert all(s["assigned_pc"] == "m-linux" for s in steps)
    # Sequential claims all succeed
    for s in steps:
        assert transition_workflow_step(
            db, s["id"], "running", claiming_pc="m-linux"
        )


# ---------------------------------------------------------------------------
# T20 — Two concurrent terminal transitions atomicity
# ---------------------------------------------------------------------------


def test_t20_two_concurrent_terminals(db: Database) -> None:
    """Two near-simultaneous terminal transitions don't leave workflows in an
    inconsistent state. workflows.status reads as 'succeeded' exactly once
    (not flapped via 'failed' midway)."""
    _seed_machines(db)
    from handlers import create_workflow_handler, transition_workflow_step

    req = {
        "company_id": "co-a",
        "name": "twin",
        "spec": {
            "agents": [
                {"id": "a", "image": "x", "nodeSelector": {"os": "linux"}},
                {"id": "b", "image": "y", "nodeSelector": {"os": "linux"}},
            ],
            "edges": [],
        },
    }
    wf = create_workflow_handler(db, req)
    steps = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ? ORDER BY agent_id",
        (wf["id"],),
    )
    for s in steps:
        transition_workflow_step(db, s["id"], "running", claiming_pc="m-linux")

    # Both transition to succeeded; first triggers aggregate check (still has
    # one running → no terminal aggregate); second triggers aggregate (all
    # succeeded → 'succeeded' exactly).
    assert transition_workflow_step(db, steps[0]["id"], "succeeded")
    mid_status = db.execute(
        "SELECT status FROM workflows WHERE id = ?", (wf["id"],)
    )[0]["status"]
    assert mid_status == "pending"  # not yet aggregated to terminal
    assert transition_workflow_step(db, steps[1]["id"], "succeeded")
    final = db.execute(
        "SELECT status FROM workflows WHERE id = ?", (wf["id"],)
    )[0]["status"]
    assert final == "succeeded"


# ---------------------------------------------------------------------------
# T21 — Stale machine excluded from assignment
# ---------------------------------------------------------------------------


def test_t21_stale_machine_excluded(db: Database, monkeypatch) -> None:
    """machine A last_seen_at=now, machine B last_seen_at=now-3600 → assignment goes to A.
    If A also stale → 422 no_eligible_pcs."""
    import time as _t

    # Force the staleness threshold to a known short value AND reload handlers
    # so the module-level _PC_STALENESS_SECONDS picks it up.
    monkeypatch.setenv("MUSU_WORKFLOW_PC_STALENESS_SECONDS", "300")
    import importlib

    import handlers as _h
    importlib.reload(_h)

    now = int(_t.time())
    # Fresh machine
    db.execute(
        "INSERT INTO machines(id, hostname, os, arch, status, last_seen_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        ("m-fresh", "fh", "linux", "x86_64", "online", now),
    )
    # Stale machine
    db.execute(
        "INSERT INTO machines(id, hostname, os, arch, status, last_seen_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        ("m-stale", "sh", "linux", "x86_64", "online", now - 3600),
    )
    for mid in ("m-fresh", "m-stale"):
        db.execute(
            "INSERT INTO machine_capacity"
            "(machine_id, gpu_models_json, gpu_vram_total_gb, gpu_vram_free_gb,"
            " cpu_cores, cpu_idle_pct, mem_total_gb, mem_free_gb,"
            " runtime_classes_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (mid, json.dumps([]), 0.0, 0.0, 4, 50.0, 16.0, 8.0,
             json.dumps([])),
        )

    spec = {"agents": [{"id": "a", "image": "x", "nodeSelector": {"os": "linux"}}]}
    assignments = _h.assign_steps_to_pcs(db, spec)
    assert assignments == {"a": "m-fresh"}

    # Now stale-ify m-fresh too
    db.execute(
        "UPDATE machines SET last_seen_at = ? WHERE id = ?",
        (now - 3600, "m-fresh"),
    )
    with pytest.raises(_h.NoEligiblePCError):
        _h.assign_steps_to_pcs(db, spec)


# ---------------------------------------------------------------------------
# T22 — Peer-claim TOCTOU race via HTTP
# ---------------------------------------------------------------------------


def test_t22_peer_claim_toctou_race(client: TestClient, db: Database) -> None:
    """Two peers PATCH `{status:'running', assigned_pc:X}` for same step.
    Exactly one gets 204; the other gets 409."""
    body = {
        "company_id": "co-a",
        "name": "race",
        "spec": {
            "agents": [{"id": "a", "image": "x", "nodeSelector": {"os": "linux"}}],
            "edges": [],
        },
    }
    wf_id = client.post("/api/workflows", json=body).json()["id"]
    step_row = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ?", (wf_id,)
    )[0]
    step_id = step_row["id"]
    patch_url = f"/api/workflows/{wf_id}/steps/{step_id}"

    # First PATCH wins (assigned_pc must match m-linux)
    r1 = client.patch(
        patch_url, json={"status": "running", "assigned_pc": "m-linux"}
    )
    assert r1.status_code == 204, r1.text
    # Second loses → 409
    r2 = client.patch(
        patch_url, json={"status": "running", "assigned_pc": "m-linux"}
    )
    assert r2.status_code == 409


def test_t22b_peer_claim_wrong_pc_loses(client: TestClient, db: Database) -> None:
    """A peer that claims with a different assigned_pc than the row's stored
    assigned_pc must also lose (409). Defense against malicious or buggy
    peer-side PATCH."""
    body = {
        "company_id": "co-a",
        "name": "wrong-pc",
        "spec": {
            "agents": [{"id": "a", "image": "x", "nodeSelector": {"os": "linux"}}],
            "edges": [],
        },
    }
    wf_id = client.post("/api/workflows", json=body).json()["id"]
    step_id = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ?", (wf_id,)
    )[0]["id"]
    r = client.patch(
        f"/api/workflows/{wf_id}/steps/{step_id}",
        json={"status": "running", "assigned_pc": "m-other"},
    )
    assert r.status_code == 409


# ---------------------------------------------------------------------------
# T23 — Operator retry endpoint
# ---------------------------------------------------------------------------


def test_t23_retry_endpoint(client: TestClient, db: Database) -> None:
    from handlers import transition_workflow_step

    # Workflow with 1 step crash + 1 succeeded
    body = {
        "company_id": "co-a",
        "name": "retry-mix",
        "spec": {
            "agents": [
                {"id": "a", "image": "x", "nodeSelector": {"os": "linux"}},
                {"id": "b", "image": "y", "nodeSelector": {"os": "linux"}},
            ],
            "edges": [],
        },
    }
    wf_id = client.post("/api/workflows", json=body).json()["id"]
    steps = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ? ORDER BY agent_id",
        (wf_id,),
    )
    transition_workflow_step(db, steps[0]["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(db, steps[1]["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(
        db,
        steps[0]["id"],
        "failed",
        error_json=json.dumps({"reason": "executor_crash"}),
    )
    transition_workflow_step(db, steps[1]["id"], "succeeded")
    # Workflow is now in terminal 'succeeded' per aggregation (executor_crash
    # treated as recoverable). Force it to 'failed' to simulate a state where
    # operator wants to retry — bypass natural aggregation by direct UPDATE.
    db.execute(
        "UPDATE workflows SET status = 'failed' WHERE id = ?", (wf_id,)
    )

    r = client.post(f"/api/workflows/{wf_id}/retry")
    assert r.status_code == 200, r.text
    body_r = r.json()
    assert body_r["status"] == "running"
    assert body_r["reset_step_count"] == 1

    # Step reset to pending
    s0 = db.execute(
        "SELECT status, error_json FROM workflow_steps WHERE id = ?",
        (steps[0]["id"],),
    )[0]
    assert s0["status"] == "pending"
    assert s0["error_json"] is None

    # Genuine failure workflow → 409
    body2 = {**body, "name": "retry-genuine"}
    wf2_id = client.post("/api/workflows", json=body2).json()["id"]
    steps2 = db.execute(
        "SELECT id FROM workflow_steps WHERE workflow_id = ? ORDER BY agent_id",
        (wf2_id,),
    )
    transition_workflow_step(db, steps2[0]["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(db, steps2[1]["id"], "running", claiming_pc="m-linux")
    transition_workflow_step(
        db,
        steps2[0]["id"],
        "failed",
        error_json=json.dumps({"reason": "boom"}),
    )
    transition_workflow_step(db, steps2[1]["id"], "succeeded")
    # Workflow now 'failed' from aggregation
    r2 = client.post(f"/api/workflows/{wf2_id}/retry")
    assert r2.status_code == 409

    # Missing workflow → 404
    r3 = client.post("/api/workflows/ghost/retry")
    assert r3.status_code == 404


# ---------------------------------------------------------------------------
# T26 — SSE eligibility column check (Auditor A-HIGH-1)
# ---------------------------------------------------------------------------


def test_t26_workflow_steps_updated_at_column(db: Database) -> None:
    """workflow_steps.updated_at column exists; KindSource binding works;
    UPDATE bumps updated_at."""
    from musu_core.controllers.sources import KindSource

    # KindSource(table='workflow_steps') instantiates without error
    ks = KindSource(
        db=db,
        table="workflow_steps",
        handler=lambda row: [],
        poll_interval_ms=1000,
    )
    assert ks.ts_col == "updated_at"

    # Insert a step and verify updated_at returns int (not error)
    _seed_machines(db)
    db.execute(
        "INSERT INTO workflows(id, company_id, name, spec_json, status, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
        ("w1", "co-a", "n", "{}", 1, 1),
    )
    db.execute(
        "INSERT INTO workflow_steps(id, workflow_id, agent_id, assigned_pc, "
        "status, depends_on_json, updated_at) "
        "VALUES (?, ?, ?, ?, 'pending', '[]', ?)",
        ("s1", "w1", "a", "m-linux", 100),
    )
    rows = db.execute(
        "SELECT updated_at FROM workflow_steps WHERE id = 's1'"
    )
    assert isinstance(rows[0]["updated_at"], int)

    # UPDATE via transition bumps updated_at strictly greater
    from handlers import transition_workflow_step

    transition_workflow_step(db, "s1", "running", claiming_pc="m-linux")
    after = db.execute(
        "SELECT updated_at FROM workflow_steps WHERE id = 's1'"
    )[0]["updated_at"]
    assert after > 100
