"""CEOReconciler tests — Company-axis reconciler."""
from __future__ import annotations

import json

import pytest

from musu_core.controllers.ceo_reconciler import CEOReconciler
from musu_core.controllers.reconciler import ReconcileRequest


def _add_company(db, cid: str, name: str = "co") -> None:
    db.execute(
        "INSERT INTO companies(id, name) VALUES (?, ?)", (cid, name),
    )


def _add_agent(
    db, agent_id: str, company_id: str | None, *,
    adapter_config: dict | None = None,
    status: str = "active",
) -> None:
    db.execute(
        "INSERT INTO agents(id, name, company_id, status, adapter_config) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            agent_id, agent_id, company_id, status,
            json.dumps(adapter_config or {}),
        ),
    )


def _count_requests(db, company_id: str) -> int:
    rows = db.execute(
        "SELECT COUNT(*) AS n FROM resource_requests WHERE company_id=?",
        (company_id,),
    )
    return int(rows[0]["n"])


# ---- happy paths ----

@pytest.mark.asyncio
async def test_ceo_posts_requests_for_active_agents(backend):
    _add_company(backend, "co-a")
    _add_agent(backend, "agent-1", "co-a")
    _add_agent(backend, "agent-2", "co-a")

    ceo = CEOReconciler(db=backend)
    result = await ceo.reconcile(
        ReconcileRequest(table="companies", key="co-a")
    )
    assert result.error is None
    assert _count_requests(backend, "co-a") == 2


@pytest.mark.asyncio
async def test_ceo_skips_agent_with_inflight_request(backend):
    _add_company(backend, "co-a")
    _add_agent(backend, "agent-1", "co-a")

    ceo = CEOReconciler(db=backend)
    await ceo.reconcile(ReconcileRequest(table="companies", key="co-a"))
    assert _count_requests(backend, "co-a") == 1

    # Second reconcile must NOT post a duplicate — agent-1 already pending.
    await ceo.reconcile(ReconcileRequest(table="companies", key="co-a"))
    assert _count_requests(backend, "co-a") == 1


@pytest.mark.asyncio
async def test_ceo_reposts_when_previous_completes(backend):
    _add_company(backend, "co-a")
    _add_agent(backend, "agent-1", "co-a")
    ceo = CEOReconciler(db=backend)

    await ceo.reconcile(ReconcileRequest(table="companies", key="co-a"))
    assert _count_requests(backend, "co-a") == 1

    # Mark the request completed (out of the in-flight set)
    backend.execute(
        "UPDATE resource_requests SET status='completed' WHERE agent_id=?",
        ("agent-1",),
    )
    await ceo.reconcile(ReconcileRequest(table="companies", key="co-a"))
    assert _count_requests(backend, "co-a") == 2


# ---- edge cases ----

@pytest.mark.asyncio
async def test_ceo_missing_company_is_noop(backend):
    ceo = CEOReconciler(db=backend)
    result = await ceo.reconcile(
        ReconcileRequest(table="companies", key="co-ghost")
    )
    assert result.error is None
    assert result.requeue is False


@pytest.mark.asyncio
async def test_ceo_idle_company_no_agents(backend):
    _add_company(backend, "co-empty")
    ceo = CEOReconciler(db=backend)
    result = await ceo.reconcile(
        ReconcileRequest(table="companies", key="co-empty")
    )
    assert result.error is None
    assert _count_requests(backend, "co-empty") == 0


@pytest.mark.asyncio
async def test_ceo_ignores_paused_agents(backend):
    _add_company(backend, "co-a")
    _add_agent(backend, "agent-active", "co-a", status="active")
    _add_agent(backend, "agent-paused", "co-a", status="paused")

    ceo = CEOReconciler(db=backend)
    await ceo.reconcile(ReconcileRequest(table="companies", key="co-a"))
    assert _count_requests(backend, "co-a") == 1
    rows = backend.execute(
        "SELECT agent_id FROM resource_requests WHERE company_id=?",
        ("co-a",),
    )
    assert rows[0]["agent_id"] == "agent-active"


@pytest.mark.asyncio
async def test_ceo_extracts_requires_from_adapter_config(backend):
    _add_company(backend, "co-a")
    _add_agent(
        backend, "agent-gpu", "co-a",
        adapter_config={"requires": {"gpu_vram_gb": 8, "runtime_class": "claude_local"}},
    )

    ceo = CEOReconciler(db=backend)
    await ceo.reconcile(ReconcileRequest(table="companies", key="co-a"))

    rows = backend.execute(
        "SELECT requires_json FROM resource_requests WHERE agent_id=?",
        ("agent-gpu",),
    )
    req = json.loads(rows[0]["requires_json"])
    assert req["gpu_vram_gb"] == 8.0
    assert req["runtime_class"] == "claude_local"


@pytest.mark.asyncio
async def test_ceo_handles_malformed_adapter_config(backend):
    _add_company(backend, "co-a")
    # adapter_config is supposed to be JSON; insert garbage
    backend.execute(
        "INSERT INTO agents(id, name, company_id, status, adapter_config) "
        "VALUES (?, ?, ?, ?, ?)",
        ("agent-bad", "agent-bad", "co-a", "active", "not-json"),
    )
    ceo = CEOReconciler(db=backend)
    result = await ceo.reconcile(
        ReconcileRequest(table="companies", key="co-a")
    )
    # Garbage adapter_config falls back to empty Requires — request still posts.
    assert result.error is None
    assert _count_requests(backend, "co-a") == 1
