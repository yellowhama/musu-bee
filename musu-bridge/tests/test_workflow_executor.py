"""V23.4 Phase 4 T2-A' — workflow_executor unit tests.

Covers wiki/432 §3 test cases:
  T8   TOCTOU step claim race (in-process)
  T9   Executor happy path (mock execute_wake)
  T10  Executor timeout
  T11  Crash recovery
  T12  Cross-PC Pattern A pickup (mock httpx)
  T24  Peer-crash sweeper (Auditor A-MED-3 sync helper)
  T25  _is_primary env-var binding (Auditor A-LOW-2)
  T27  Peer-side terminal PATCH error handling (Auditor A-HIGH-2)
"""
from __future__ import annotations

import asyncio
import importlib
import json
import time
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from musu_core.db import Database


@pytest.fixture
def db() -> Database:
    return Database(":memory:")


def _seed_machine(db: Database, mid: str = "m-this") -> None:
    """Seed a single online machine row."""
    now = int(time.time())
    db.execute(
        "INSERT INTO machines(id, hostname, os, arch, status, last_seen_at) "
        "VALUES (?, ?, ?, ?, 'online', ?)",
        (mid, mid, "linux", "x86_64", now),
    )


def _seed_workflow_step(
    db: Database,
    *,
    wf_id: str = "wf1",
    step_id: str = "s1",
    agent_id: str = "a",
    assigned_pc: str = "m-this",
    status: str = "pending",
    started_at: int | None = None,
) -> None:
    """Helper to insert a single workflow + step row pair."""
    spec = {
        "agents": [
            {"id": agent_id, "image": "alpine", "timeoutSeconds": 60}
        ],
        "edges": [],
    }
    now = int(time.time())
    db.execute(
        "INSERT OR IGNORE INTO workflows(id, company_id, name, spec_json, "
        "status, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 'pending', ?, ?)",
        (wf_id, "co-a", "n", json.dumps(spec), now, now),
    )
    db.execute(
        "INSERT INTO workflow_steps(id, workflow_id, agent_id, assigned_pc, "
        "status, depends_on_json, started_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, '[]', ?, ?)",
        (step_id, wf_id, agent_id, assigned_pc, status, started_at, now),
    )


# ---------------------------------------------------------------------------
# T8 — TOCTOU step claim race (in-process)
# ---------------------------------------------------------------------------


def test_t8_toctou_claim_race(db: Database, monkeypatch) -> None:
    """Two simulated workers call _claim_step_toctou on same step → only one True."""
    monkeypatch.setenv("MUSU_NODE_ROLE", "primary")
    import workflow_executor
    importlib.reload(workflow_executor)

    _seed_machine(db, "m-this")
    _seed_workflow_step(db, assigned_pc="m-this")

    step = {"step_id": "s1", "workflow_id": "wf1", "agent_id": "a"}

    async def _run():
        a = await workflow_executor._claim_step_toctou(db, step, "m-this")
        b = await workflow_executor._claim_step_toctou(db, step, "m-this")
        return a, b

    a, b = asyncio.run(_run())
    assert {a, b} == {True, False}


# ---------------------------------------------------------------------------
# T9 — Executor happy path
# ---------------------------------------------------------------------------


def test_t9_executor_happy_path(db: Database, monkeypatch) -> None:
    """Seed pending step + mock execute_wake to write heartbeat_runs.status='completed'
    → executor transitions step to 'succeeded' and workflow.status → 'succeeded'."""
    monkeypatch.setenv("MUSU_NODE_ROLE", "primary")
    import workflow_executor
    importlib.reload(workflow_executor)

    _seed_machine(db, "m-this")
    # heartbeat_runs.agent_id has FK → agents(id); seed the agent.
    db.execute(
        "INSERT INTO agents(id, name, status) VALUES (?, ?, 'active')",
        ("a", "test-agent"),
    )
    _seed_workflow_step(db, assigned_pc="m-this")

    # Mock execute_wake: insert a heartbeat_runs row with status='completed'
    async def _fake_execute_wake(db_arg, router_arg, run_id):
        db.execute(
            "INSERT OR REPLACE INTO heartbeat_runs"
            "(id, agent_id, status, wake_reason, summary, error) "
            "VALUES (?, ?, 'completed', 'workflow_step', 'ok', NULL)",
            (run_id, "a"),
        )

    def _fake_enqueue_wake(db_arg, agent_id, wake_reason, wake_payload=None, **_):
        import uuid
        rid = uuid.uuid4().hex
        db.execute(
            "INSERT INTO heartbeat_runs(id, agent_id, status, wake_reason, "
            "wake_payload) VALUES (?, ?, 'queued', ?, ?)",
            (rid, agent_id, wake_reason, json.dumps(wake_payload or {})),
        )
        return rid

    monkeypatch.setattr(
        "musu_core.dispatch.wake.execute_wake", _fake_execute_wake
    )
    monkeypatch.setattr(
        "musu_core.dispatch.wake.enqueue_wake", _fake_enqueue_wake
    )

    step = {
        "step_id": "s1",
        "workflow_id": "wf1",
        "agent_id": "a",
        "input_json": None,
    }

    async def _run():
        # Claim first
        await workflow_executor._claim_step_toctou(db, step, "m-this")
        await workflow_executor._execute_step(db, MagicMock(), step, 60)

    asyncio.run(_run())
    final = db.execute(
        "SELECT status FROM workflow_steps WHERE id = 's1'"
    )[0]["status"]
    assert final == "succeeded"
    wf_final = db.execute(
        "SELECT status FROM workflows WHERE id = 'wf1'"
    )[0]["status"]
    assert wf_final == "succeeded"


# ---------------------------------------------------------------------------
# T10 — Executor timeout
# ---------------------------------------------------------------------------


def test_t10_executor_timeout(db: Database, monkeypatch) -> None:
    """Mock execute_wake to asyncio.sleep(10); timeoutSeconds=1 → step 'timeout'."""
    monkeypatch.setenv("MUSU_NODE_ROLE", "primary")
    import workflow_executor
    importlib.reload(workflow_executor)

    _seed_machine(db, "m-this")
    db.execute(
        "INSERT INTO agents(id, name, status) VALUES (?, ?, 'active')",
        ("a", "test-agent"),
    )
    _seed_workflow_step(db, assigned_pc="m-this")

    async def _slow_wake(db_arg, router_arg, run_id):
        await asyncio.sleep(10)

    def _fake_enqueue_wake(db_arg, agent_id, wake_reason, wake_payload=None, **_):
        import uuid
        rid = uuid.uuid4().hex
        db.execute(
            "INSERT INTO heartbeat_runs(id, agent_id, status, wake_reason, "
            "wake_payload) VALUES (?, ?, 'queued', ?, ?)",
            (rid, agent_id, wake_reason, json.dumps(wake_payload or {})),
        )
        return rid

    monkeypatch.setattr(
        "musu_core.dispatch.wake.execute_wake", _slow_wake
    )
    monkeypatch.setattr(
        "musu_core.dispatch.wake.enqueue_wake", _fake_enqueue_wake
    )

    step = {
        "step_id": "s1",
        "workflow_id": "wf1",
        "agent_id": "a",
        "input_json": None,
    }

    async def _run():
        await workflow_executor._claim_step_toctou(db, step, "m-this")
        await workflow_executor._execute_step(db, MagicMock(), step, 1)

    asyncio.run(_run())
    row = db.execute(
        "SELECT status, error_json FROM workflow_steps WHERE id = 's1'"
    )[0]
    assert row["status"] == "timeout"
    assert "spec_timeout" in (row["error_json"] or "")


# ---------------------------------------------------------------------------
# T11 — Crash recovery
# ---------------------------------------------------------------------------


def test_t11_crash_recovery(db: Database, monkeypatch) -> None:
    """Stale 'running' step for THIS_MACHINE_ID → crash recovery marks failed
    with reason='executor_crash'. Other PCs' running steps untouched."""
    monkeypatch.setenv("MUSU_NODE_ROLE", "primary")
    import workflow_executor
    importlib.reload(workflow_executor)

    _seed_machine(db, "m-this")
    _seed_machine(db, "m-other")
    _seed_workflow_step(
        db, step_id="s_mine", assigned_pc="m-this", status="running",
        started_at=int(time.time()) - 100,
    )
    _seed_workflow_step(
        db,
        wf_id="wf2",
        step_id="s_other",
        agent_id="b",
        assigned_pc="m-other",
        status="running",
        started_at=int(time.time()) - 100,
    )

    async def _run():
        await workflow_executor._crash_recovery(db, "m-this")

    asyncio.run(_run())
    mine = db.execute(
        "SELECT status, error_json FROM workflow_steps WHERE id = 's_mine'"
    )[0]
    assert mine["status"] == "failed"
    assert "executor_crash" in (mine["error_json"] or "")

    other = db.execute(
        "SELECT status FROM workflow_steps WHERE id = 's_other'"
    )[0]
    assert other["status"] == "running"  # untouched


# ---------------------------------------------------------------------------
# T12 — Cross-PC Pattern A pickup (mock httpx)
# ---------------------------------------------------------------------------


def test_t12_pattern_a_peer_path(monkeypatch) -> None:
    """Peer mode: _fetch_pending_steps calls httpx GET; _claim_step_toctou
    calls httpx PATCH; _report_step_result calls httpx PATCH."""
    monkeypatch.setenv("MUSU_NODE_ROLE", "peer")
    monkeypatch.setenv("MUSU_PRIMARY_URL", "http://primary.example/")
    monkeypatch.setenv("MUSU_TOKEN", "peer-token")
    import workflow_executor
    importlib.reload(workflow_executor)

    captured: dict[str, list] = {"get": [], "patch": []}

    def _resp(status: int, json_body=None, url: str = "http://primary.example/"):
        # Response must have a request attached for raise_for_status() to work.
        req = httpx.Request("GET", url)
        return httpx.Response(status, json=json_body, request=req)

    class _FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def get(self, url, params=None, headers=None):
            captured["get"].append((url, params, headers))
            return _resp(
                200,
                json_body=[
                    {
                        "step_id": "s-peer",
                        "workflow_id": "wf-peer",
                        "agent_id": "a",
                    }
                ],
                url=url,
            )

        async def patch(self, url, json=None, headers=None):
            captured["patch"].append((url, json, headers))
            return _resp(204, url=url)

    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)

    async def _run():
        steps = await workflow_executor._fetch_pending_steps(None, "m-peer")
        # Claim
        claim_ok = await workflow_executor._claim_step_toctou(
            None, steps[0], "m-peer"
        )
        # Report
        reported = await workflow_executor._report_step_result(
            None, steps[0], "succeeded", result_json="done"
        )
        return steps, claim_ok, reported

    steps, claim_ok, reported = asyncio.run(_run())
    assert len(steps) == 1
    assert claim_ok is True
    assert reported is True
    assert len(captured["get"]) == 1
    assert "/api/workflows/_pending" in captured["get"][0][0]
    assert captured["get"][0][2]["Authorization"].startswith("Bearer ")
    assert len(captured["patch"]) == 2  # claim + report
    # claim body carries assigned_pc (Critic M1 symmetry)
    claim_body = captured["patch"][0][1]
    assert claim_body["status"] == "running"
    assert claim_body["assigned_pc"] == "m-peer"


# ---------------------------------------------------------------------------
# T24 — Peer-crash sweeper (Auditor A-MED-3 sync helper)
# ---------------------------------------------------------------------------


def test_t24_peer_crash_sweep_once(db: Database, monkeypatch) -> None:
    """Rendezvous DB has step status='running' assigned_pc=PEER_B started_at older
    than MUSU_WORKFLOW_PEER_TIMEOUT_S → _peer_crash_sweep_once times it out.
    updated_at bumped (Auditor A-HIGH-1)."""
    monkeypatch.setenv("MUSU_WORKFLOW_PEER_TIMEOUT_S", "100")
    import workflow_executor
    importlib.reload(workflow_executor)

    _seed_machine(db, "m-peer-b")
    _seed_workflow_step(
        db,
        step_id="stale",
        assigned_pc="m-peer-b",
        status="running",
        started_at=int(time.time()) - 200,  # > 100s ago
    )
    _seed_workflow_step(
        db,
        wf_id="wf-fresh",
        step_id="fresh",
        agent_id="b",
        assigned_pc="m-peer-b",
        status="running",
        started_at=int(time.time()) - 5,  # well under threshold
    )

    pre_updated = db.execute(
        "SELECT updated_at FROM workflow_steps WHERE id = 'stale'"
    )[0]["updated_at"]
    time.sleep(1.1)  # ensure strftime('%s') ticks
    swept = workflow_executor._peer_crash_sweep_once(db)
    assert len(swept) == 1
    assert swept[0]["id"] == "stale"
    assert swept[0]["assigned_pc"] == "m-peer-b"

    row = db.execute(
        "SELECT status, error_json, updated_at "
        "FROM workflow_steps WHERE id = 'stale'"
    )[0]
    assert row["status"] == "timeout"
    assert "peer_timeout" in (row["error_json"] or "")
    assert row["updated_at"] > pre_updated

    # Fresh row untouched
    fresh = db.execute(
        "SELECT status FROM workflow_steps WHERE id = 'fresh'"
    )[0]
    assert fresh["status"] == "running"


# ---------------------------------------------------------------------------
# T25 — _is_primary env-var binding (Auditor A-LOW-2)
# ---------------------------------------------------------------------------


def test_t25_is_primary_env_binding(monkeypatch) -> None:
    """MUSU_NODE_ROLE=primary (or unset) → True; =peer → False."""
    import workflow_executor

    monkeypatch.delenv("MUSU_NODE_ROLE", raising=False)
    assert workflow_executor._is_primary() is True

    monkeypatch.setenv("MUSU_NODE_ROLE", "primary")
    assert workflow_executor._is_primary() is True

    monkeypatch.setenv("MUSU_NODE_ROLE", "peer")
    monkeypatch.setenv("MUSU_PRIMARY_URL", "http://x")
    assert workflow_executor._is_primary() is False


# ---------------------------------------------------------------------------
# T27 — Peer-side terminal PATCH error handling (Auditor A-HIGH-2)
# ---------------------------------------------------------------------------


def test_t27_peer_terminal_patch_status_codes(monkeypatch) -> None:
    """Peer-side _report_step_result branch on HTTP status:
      204 → True; 404 → True (workflow gone); 5xx → False (retry);
      transport error → False (retry).
    """
    monkeypatch.setenv("MUSU_NODE_ROLE", "peer")
    monkeypatch.setenv("MUSU_PRIMARY_URL", "http://primary.example")
    monkeypatch.setenv("MUSU_TOKEN", "tok")
    import workflow_executor
    importlib.reload(workflow_executor)

    step = {"step_id": "s1", "workflow_id": "wf1", "agent_id": "a"}

    class _RespClient:
        def __init__(self, status_code: int) -> None:
            self.status_code = status_code

        def __call__(self, *a, **k):
            return self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def patch(self, *a, **k):
            req = httpx.Request("PATCH", "http://primary.example/x")
            return httpx.Response(self.status_code, request=req)

    # 204 → True
    monkeypatch.setattr(httpx, "AsyncClient", _RespClient(204))
    assert asyncio.run(
        workflow_executor._report_step_result(None, step, "succeeded")
    ) is True

    # 404 → True (workflow gone — drop state)
    monkeypatch.setattr(httpx, "AsyncClient", _RespClient(404))
    assert asyncio.run(
        workflow_executor._report_step_result(None, step, "succeeded")
    ) is True

    # 503 → False (retry next iteration)
    monkeypatch.setattr(httpx, "AsyncClient", _RespClient(503))
    assert asyncio.run(
        workflow_executor._report_step_result(None, step, "succeeded")
    ) is False

    # ConnectError → False
    class _TransportFailClient:
        def __call__(self, *a, **k):
            return self

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def patch(self, *a, **k):
            raise httpx.ConnectError("simulated")

    monkeypatch.setattr(httpx, "AsyncClient", _TransportFailClient())
    assert asyncio.run(
        workflow_executor._report_step_result(None, step, "succeeded")
    ) is False
