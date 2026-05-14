"""Const VI: scheduler-loop overhead bench.

Pass criterion: per-bind median < 50ms, P95 < 200ms.
Setup: 1 machine, N=200 pending requests, all viable. Drive
SchedulerReconciler once per request. Measure wall-clock per-reconcile.

This is *not* a load test of concurrency — that's covered by 21.A T7
(4 concurrent reconcilers). This measures the scheduler's own cost:
load → filter → score → try_bind → optionally notify.

Run only via:  pytest -m slow tests/test_scheduler_overhead.py
"""
from __future__ import annotations

import asyncio
import statistics
import time

import pytest

from musu_core.controllers.reconciler import ReconcileRequest
from musu_core.scheduler.capacity import MachineCapacity
from musu_core.scheduler.loop import SchedulerReconciler
from musu_core.scheduler.request import Requires, ResourceRequest


def _setup_one_machine(db) -> None:
    db.execute(
        "INSERT INTO machines(id, hostname, status) VALUES (?, ?, 'online')",
        ("m-bench", "Bench-RTX4060"),
    )
    MachineCapacity(
        machine_id="m-bench",
        gpu_models=["RTX 4060"],
        gpu_vram_total_gb=8.0,
        gpu_vram_free_gb=8.0,
        cpu_cores=8,
        cpu_idle_pct=80.0,
        mem_total_gb=32.0,
        mem_free_gb=24.0,
        runtime_classes=["claude_local"],
    ).upsert(db)


def _setup_agents(db, n: int) -> list[str]:
    db.execute(
        "INSERT INTO companies(id, name) VALUES (?, ?)", ("co-bench", "Bench"),
    )
    ids: list[str] = []
    for i in range(n):
        aid = f"agent-{i:04d}"
        db.execute(
            "INSERT INTO agents(id, name, company_id) VALUES (?, ?, ?)",
            (aid, aid, "co-bench"),
        )
        ids.append(aid)
    return ids


@pytest.mark.slow
@pytest.mark.asyncio
async def test_scheduler_overhead_median_under_50ms(backend):
    """Const VI: scheduler overhead per bind."""
    n = 200
    _setup_one_machine(backend)
    agent_ids = _setup_agents(backend, n)

    request_ids: list[str] = []
    for aid in agent_ids:
        r = ResourceRequest.new(
            agent_id=aid,
            requires=Requires(gpu_vram_gb=1.0, runtime_class="claude_local"),
            company_id="co-bench",
        )
        r.insert(backend)
        request_ids.append(r.id)

    rec = SchedulerReconciler(db=backend, watch_dispatcher=None)

    latencies_ms: list[float] = []
    for rid in request_ids:
        t0 = time.perf_counter()
        await rec.reconcile(
            ReconcileRequest(table="resource_requests", key=rid)
        )
        latencies_ms.append((time.perf_counter() - t0) * 1000.0)

    latencies_ms.sort()
    n_obs = len(latencies_ms)
    median = statistics.median(latencies_ms)
    # nearest-rank percentile: ceil(p * n) - 1, clipped to [0, n-1]
    p95 = latencies_ms[min(n_obs - 1, max(0, -(-n_obs * 95 // 100) - 1))]
    p99 = latencies_ms[min(n_obs - 1, max(0, -(-n_obs * 99 // 100) - 1))]
    mn = latencies_ms[0]
    mx = latencies_ms[-1]

    print(
        f"\n[scheduler overhead n={n}] "
        f"min={mn:.1f} median={median:.1f} p95={p95:.1f} "
        f"p99={p99:.1f} max={mx:.1f} ms"
    )

    # Const VI pass criteria
    assert median < 50.0, f"median {median:.1f}ms exceeds 50ms budget"
    assert p95 < 200.0, f"P95 {p95:.1f}ms exceeds 200ms budget"

    # Sanity: all should have bound to m-bench
    rows = backend.execute(
        "SELECT COUNT(*) AS n FROM resource_requests "
        "WHERE bound_machine_id='m-bench' AND status='bound'"
    )
    assert rows[0]["n"] == n
