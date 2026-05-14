"""MachineReconciler tests — Machine-axis reconciler."""
from __future__ import annotations

import pytest

from musu_core.controllers.machine_reconciler import MachineReconciler
from musu_core.controllers.reconciler import ReconcileRequest
from musu_core.scheduler.binder import try_bind
from musu_core.scheduler.request import Requires, ResourceRequest


def _add_machine(db, mid: str, status: str = "online") -> None:
    db.execute(
        "INSERT INTO machines(id, hostname, status) VALUES (?, ?, ?)",
        (mid, f"host-{mid}", status),
    )


def _post_pending(db, agent_id: str = "a1") -> str:
    db.execute(
        "INSERT OR IGNORE INTO agents(id, name) VALUES (?, ?)",
        (agent_id, agent_id),
    )
    r = ResourceRequest.new(agent_id=agent_id, requires=Requires())
    r.insert(db)
    return r.id


# ---- happy paths ----

@pytest.mark.asyncio
async def test_machine_online_is_noop(backend):
    _add_machine(backend, "m-1", status="online")
    rid = _post_pending(backend)
    try_bind(backend, rid, "m-1")

    rec = MachineReconciler(db=backend)
    result = await rec.reconcile(
        ReconcileRequest(table="machines", key="m-1")
    )
    assert result.error is None
    rows = backend.execute(
        "SELECT status, bound_machine_id FROM resource_requests WHERE id=?",
        (rid,),
    )
    # Online → request stays bound.
    assert rows[0]["status"] == "bound"
    assert rows[0]["bound_machine_id"] == "m-1"


@pytest.mark.asyncio
async def test_machine_draining_is_noop(backend):
    _add_machine(backend, "m-1", status="draining")
    rid = _post_pending(backend)
    try_bind(backend, rid, "m-1")
    # Now mark draining
    backend.execute(
        "UPDATE machines SET status='draining' WHERE id=?", ("m-1",),
    )

    rec = MachineReconciler(db=backend)
    await rec.reconcile(ReconcileRequest(table="machines", key="m-1"))

    rows = backend.execute(
        "SELECT status FROM resource_requests WHERE id=?", (rid,),
    )
    # Draining doesn't reclaim — in-flight finishes.
    assert rows[0]["status"] == "bound"


@pytest.mark.asyncio
async def test_machine_offline_reclaims_bound_requests(backend):
    _add_machine(backend, "m-1", status="online")
    rid1 = _post_pending(backend, agent_id="a1")
    rid2 = _post_pending(backend, agent_id="a2")
    try_bind(backend, rid1, "m-1")
    try_bind(backend, rid2, "m-1")

    backend.execute(
        "UPDATE machines SET status='offline' WHERE id=?", ("m-1",),
    )
    rec = MachineReconciler(db=backend)
    result = await rec.reconcile(
        ReconcileRequest(table="machines", key="m-1")
    )
    assert result.error is None

    rows = backend.execute(
        "SELECT id, status, bound_machine_id FROM resource_requests"
    )
    for row in rows:
        assert row["status"] == "pending"
        assert row["bound_machine_id"] is None


@pytest.mark.asyncio
async def test_machine_offline_reclaims_running_requests(backend):
    _add_machine(backend, "m-1", status="online")
    rid = _post_pending(backend)
    try_bind(backend, rid, "m-1")
    backend.execute(
        "UPDATE resource_requests SET status='running' WHERE id=?", (rid,),
    )

    backend.execute(
        "UPDATE machines SET status='offline' WHERE id=?", ("m-1",),
    )
    rec = MachineReconciler(db=backend)
    await rec.reconcile(ReconcileRequest(table="machines", key="m-1"))

    rows = backend.execute(
        "SELECT status, bound_machine_id FROM resource_requests WHERE id=?",
        (rid,),
    )
    assert rows[0]["status"] == "pending"
    assert rows[0]["bound_machine_id"] is None


@pytest.mark.asyncio
async def test_machine_offline_does_not_touch_completed_requests(backend):
    """A completed request should NOT be re-queued just because its machine died."""
    _add_machine(backend, "m-1", status="online")
    rid = _post_pending(backend)
    try_bind(backend, rid, "m-1")
    backend.execute(
        "UPDATE resource_requests SET status='completed' WHERE id=?",
        (rid,),
    )

    backend.execute(
        "UPDATE machines SET status='offline' WHERE id=?", ("m-1",),
    )
    rec = MachineReconciler(db=backend)
    await rec.reconcile(ReconcileRequest(table="machines", key="m-1"))

    rows = backend.execute(
        "SELECT status, bound_machine_id FROM resource_requests WHERE id=?",
        (rid,),
    )
    # Completed stays completed; bound_machine_id is the historical record.
    assert rows[0]["status"] == "completed"
    assert rows[0]["bound_machine_id"] == "m-1"


# ---- edge cases ----

@pytest.mark.asyncio
async def test_machine_missing_is_noop(backend):
    rec = MachineReconciler(db=backend)
    result = await rec.reconcile(
        ReconcileRequest(table="machines", key="m-ghost")
    )
    assert result.error is None
    assert result.requeue is False


@pytest.mark.asyncio
async def test_machine_offline_idempotent(backend):
    """Re-running reclaim should be a no-op (no double-reclaim, no error)."""
    _add_machine(backend, "m-1", status="online")
    rid = _post_pending(backend)
    try_bind(backend, rid, "m-1")
    backend.execute(
        "UPDATE machines SET status='offline' WHERE id=?", ("m-1",),
    )
    rec = MachineReconciler(db=backend)
    await rec.reconcile(ReconcileRequest(table="machines", key="m-1"))
    # Second pass: row is already pending; reclaim WHERE clause matches nothing.
    await rec.reconcile(ReconcileRequest(table="machines", key="m-1"))

    rows = backend.execute(
        "SELECT status FROM resource_requests WHERE id=?", (rid,),
    )
    assert rows[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_machine_offline_only_reclaims_its_own_bindings(backend):
    _add_machine(backend, "m-1", status="online")
    _add_machine(backend, "m-2", status="online")
    rid1 = _post_pending(backend, agent_id="a1")
    rid2 = _post_pending(backend, agent_id="a2")
    try_bind(backend, rid1, "m-1")
    try_bind(backend, rid2, "m-2")

    backend.execute(
        "UPDATE machines SET status='offline' WHERE id=?", ("m-1",),
    )
    rec = MachineReconciler(db=backend)
    await rec.reconcile(ReconcileRequest(table="machines", key="m-1"))

    rows = {
        r["id"]: r for r in backend.execute(
            "SELECT id, status, bound_machine_id FROM resource_requests"
        )
    }
    assert rows[rid1]["status"] == "pending"
    assert rows[rid1]["bound_machine_id"] is None
    # m-2's binding is untouched
    assert rows[rid2]["status"] == "bound"
    assert rows[rid2]["bound_machine_id"] == "m-2"
