"""Frame v9 §5 acceptance: 4 companies share 1 GPU.

Scenario from frame v9 §5 ("야 줄서. 야 너는 저쪽 4060 써"):
    User has 2 machines:
        m-gpu : RTX 4060, 8 GB VRAM, claude_local runtime
        m-cpu : no GPU, claude_local runtime
    4 companies (samsung, hyundai, sk, lg) each spawn an agent that
    needs gpu_vram_gb=4 + runtime_class=claude_local.

Expected scheduler behavior:
    - All 4 ResourceRequests must bind to m-gpu (m-cpu has no VRAM).
    - m-cpu is filtered out for *every* request (gpu_vram_total_gb=0 < 4).
    - First-come-first-served within equal priority — assigns by
      pending pickup order, no starvation.
    - Higher-priority request jumps the line.
"""
from __future__ import annotations

import asyncio

import pytest

from musu_core.controllers.reconciler import ReconcileRequest
from musu_core.scheduler.binder import pending_per_machine
from musu_core.scheduler.capacity import MachineCapacity
from musu_core.scheduler.loop import SchedulerReconciler
from musu_core.scheduler.request import (
    Affinity,
    Requires,
    ResourceRequest,
)


# ---- helpers ----

def _setup_two_machines(db) -> None:
    """Create m-gpu (8GB VRAM) and m-cpu (no GPU). Both online."""
    db.execute(
        "INSERT INTO machines(id, hostname, status) VALUES (?, ?, 'online')",
        ("m-gpu", "Workstation-RTX4060"),
    )
    db.execute(
        "INSERT INTO machines(id, hostname, status) VALUES (?, ?, 'online')",
        ("m-cpu", "Laptop-NoGPU"),
    )
    MachineCapacity(
        machine_id="m-gpu",
        gpu_models=["RTX 4060"],
        gpu_vram_total_gb=8.0,
        gpu_vram_free_gb=8.0,
        cpu_cores=8,
        cpu_idle_pct=80.0,
        mem_total_gb=32.0,
        mem_free_gb=24.0,
        runtime_classes=["claude_local"],
    ).upsert(db)
    MachineCapacity(
        machine_id="m-cpu",
        gpu_models=[],
        gpu_vram_total_gb=0.0,
        gpu_vram_free_gb=0.0,
        cpu_cores=4,
        cpu_idle_pct=60.0,
        mem_total_gb=16.0,
        mem_free_gb=8.0,
        runtime_classes=["claude_local"],
    ).upsert(db)


def _setup_four_companies(db) -> dict[str, str]:
    """Create 4 companies + 1 agent each. Returns {company: agent_id}."""
    companies = {}
    for name in ("samsung", "hyundai", "sk", "lg"):
        company_id = f"co-{name}"
        agent_id = f"agent-{name}"
        db.execute(
            "INSERT INTO companies(id, name) VALUES (?, ?)",
            (company_id, name),
        )
        db.execute(
            "INSERT INTO agents(id, name, company_id) VALUES (?, ?, ?)",
            (agent_id, f"{name}-bot", company_id),
        )
        companies[name] = agent_id
    return companies


def _post_request(
    db, agent_id: str, company_id: str | None = None, priority: int = 0,
) -> str:
    r = ResourceRequest.new(
        agent_id=agent_id,
        requires=Requires(gpu_vram_gb=4.0, runtime_class="claude_local"),
        company_id=company_id,
        priority=priority,
    )
    r.insert(db)
    return r.id


async def _run_reconciler(db, request_id: str) -> None:
    """Drive one reconcile pass for the given request."""
    rec = SchedulerReconciler(db=db, watch_dispatcher=None)
    await rec.reconcile(
        ReconcileRequest(table="resource_requests", key=request_id)
    )


# ---- tests ----

@pytest.mark.asyncio
async def test_four_companies_share_one_gpu(backend):
    """All 4 requests bind to m-gpu; m-cpu is filtered out for every one."""
    _setup_two_machines(backend)
    companies = _setup_four_companies(backend)

    request_ids: dict[str, str] = {}
    for name, agent_id in companies.items():
        rid = _post_request(backend, agent_id, company_id=f"co-{name}")
        request_ids[name] = rid

    # Reconcile each request in order.
    for rid in request_ids.values():
        await _run_reconciler(backend, rid)

    rows = backend.execute(
        "SELECT id, bound_machine_id, status FROM resource_requests"
    )
    by_id = {r["id"]: r for r in rows}

    # 1. All 4 are bound.
    for name, rid in request_ids.items():
        row = by_id[rid]
        assert row["status"] == "bound", (
            f"{name}: status={row['status']} (expected bound)"
        )
        # 2. All bind to m-gpu (m-cpu has no VRAM).
        assert row["bound_machine_id"] == "m-gpu", (
            f"{name}: bound to {row['bound_machine_id']} (expected m-gpu)"
        )

    # 3. Queue depth on m-gpu = 4, m-cpu = 0 (nothing routed there).
    pending = pending_per_machine(backend)
    assert pending == {"m-gpu": 4}


@pytest.mark.asyncio
async def test_cpu_only_machine_filtered_when_gpu_required(backend):
    """A request that *needs* GPU must skip m-cpu even if it's the only choice."""
    _setup_two_machines(backend)
    # remove m-gpu so only m-cpu is online
    backend.execute("UPDATE machines SET status='offline' WHERE id=?", ("m-gpu",))

    backend.execute(
        "INSERT INTO companies(id, name) VALUES (?, ?)", ("co-x", "X"),
    )
    backend.execute(
        "INSERT INTO agents(id, name, company_id) VALUES (?, ?, ?)",
        ("agent-x", "x-bot", "co-x"),
    )
    rid = _post_request(backend, "agent-x", company_id="co-x")

    await _run_reconciler(backend, rid)

    rows = backend.execute(
        "SELECT bound_machine_id, status FROM resource_requests WHERE id=?",
        (rid,),
    )
    # Filtered → stays pending (reconciler asked for requeue_after_ms).
    assert rows[0]["status"] == "pending"
    assert rows[0]["bound_machine_id"] is None


@pytest.mark.asyncio
async def test_priority_jumps_the_line(backend):
    """A high-priority request should bind before low-priority queue depth piles up."""
    _setup_two_machines(backend)
    companies = _setup_four_companies(backend)

    # 3 low-priority requests pre-bound to m-gpu so queue depth > 0
    for name in ("samsung", "hyundai", "sk"):
        rid = _post_request(
            backend, companies[name], company_id=f"co-{name}", priority=0,
        )
        await _run_reconciler(backend, rid)

    # High-priority request — still goes to m-gpu (only viable machine)
    high_rid = _post_request(
        backend, companies["lg"], company_id="co-lg", priority=10,
    )
    await _run_reconciler(backend, high_rid)

    rows = backend.execute(
        "SELECT bound_machine_id, status FROM resource_requests WHERE id=?",
        (high_rid,),
    )
    assert rows[0]["status"] == "bound"
    assert rows[0]["bound_machine_id"] == "m-gpu"


@pytest.mark.asyncio
async def test_affinity_prefer_machine_honored_when_viable(backend):
    """If two GPUs exist, prefer_machine wins the score tiebreak."""
    _setup_two_machines(backend)
    # Add a second GPU machine
    backend.execute(
        "INSERT INTO machines(id, hostname, status) VALUES (?, ?, 'online')",
        ("m-gpu2", "Workstation-RTX4070"),
    )
    MachineCapacity(
        machine_id="m-gpu2",
        gpu_models=["RTX 4070"],
        gpu_vram_total_gb=12.0,
        gpu_vram_free_gb=12.0,
        cpu_cores=12,
        cpu_idle_pct=80.0,
        mem_total_gb=64.0,
        mem_free_gb=48.0,
        runtime_classes=["claude_local"],
    ).upsert(db=backend)

    backend.execute(
        "INSERT INTO companies(id, name) VALUES (?, ?)", ("co-a", "A"),
    )
    backend.execute(
        "INSERT INTO agents(id, name, company_id) VALUES (?, ?, ?)",
        ("agent-a", "a-bot", "co-a"),
    )

    # Without prefer: bigger free VRAM (m-gpu2) wins
    r1 = ResourceRequest.new(
        agent_id="agent-a",
        requires=Requires(gpu_vram_gb=4.0, runtime_class="claude_local"),
        company_id="co-a",
    )
    r1.insert(backend)
    await _run_reconciler(backend, r1.id)
    rows = backend.execute(
        "SELECT bound_machine_id FROM resource_requests WHERE id=?", (r1.id,),
    )
    assert rows[0]["bound_machine_id"] == "m-gpu2"

    # With prefer=m-gpu: affinity +50 outweighs +VRAM bonus difference
    r2 = ResourceRequest.new(
        agent_id="agent-a",
        requires=Requires(gpu_vram_gb=4.0, runtime_class="claude_local"),
        affinity=Affinity(prefer_machine="m-gpu"),
        company_id="co-a",
    )
    r2.insert(backend)
    await _run_reconciler(backend, r2.id)
    rows = backend.execute(
        "SELECT bound_machine_id FROM resource_requests WHERE id=?", (r2.id,),
    )
    assert rows[0]["bound_machine_id"] == "m-gpu"


@pytest.mark.asyncio
async def test_offline_machine_filtered(backend):
    """status='offline' on a machine → not eligible even if capacity meets reqs."""
    _setup_two_machines(backend)
    backend.execute(
        "UPDATE machines SET status='offline' WHERE id=?", ("m-gpu",),
    )
    backend.execute(
        "INSERT INTO companies(id, name) VALUES (?, ?)", ("co-x", "X"),
    )
    backend.execute(
        "INSERT INTO agents(id, name, company_id) VALUES (?, ?, ?)",
        ("agent-x", "x-bot", "co-x"),
    )
    # CPU-only request — m-cpu *would* qualify, but no gpu_vram required
    r = ResourceRequest.new(
        agent_id="agent-x",
        requires=Requires(runtime_class="claude_local"),  # no GPU needed
        company_id="co-x",
    )
    r.insert(backend)
    await _run_reconciler(backend, r.id)

    rows = backend.execute(
        "SELECT bound_machine_id, status FROM resource_requests WHERE id=?",
        (r.id,),
    )
    # m-cpu is the only online machine, so it wins
    assert rows[0]["status"] == "bound"
    assert rows[0]["bound_machine_id"] == "m-cpu"
