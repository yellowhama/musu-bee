"""Scheduler unit tests — request / capacity / filter / score / binder."""
from __future__ import annotations

import json
import uuid

import pytest

from musu_core.scheduler.binder import pending_per_machine, try_bind
from musu_core.scheduler.capacity import MachineCapacity, load_all_capacities
from musu_core.scheduler.filter import filter_machines
from musu_core.scheduler.request import (
    Affinity,
    Requires,
    ResourceRequest,
)
from musu_core.scheduler.score import score_machines


# ---- ResourceRequest ----

def test_resource_request_new_assigns_uuid():
    r = ResourceRequest.new(
        agent_id="a1", requires=Requires(gpu_vram_gb=4),
    )
    assert r.id  # uuid set
    assert r.status == "pending"
    assert r.bound_machine_id is None


def test_resource_request_insert_persists(backend):
    # agent must exist for FK (name unique per active agent)
    backend.execute(
        "INSERT INTO agents(id, name) VALUES (?, ?)", ("a1", "a1-name"),
    )
    r = ResourceRequest.new(
        agent_id="a1",
        requires=Requires(gpu_vram_gb=4, runtime_class="claude_local"),
        affinity=Affinity(prefer_machine="m-1"),
        priority=7,
    )
    r.insert(backend)
    rows = backend.execute(
        "SELECT * FROM resource_requests WHERE id=?", (r.id,)
    )
    assert len(rows) == 1
    row = rows[0]
    assert row["priority"] == 7
    req = ResourceRequest.from_db_row(row)
    assert req.requires.gpu_vram_gb == 4
    assert req.affinity.prefer_machine == "m-1"


# ---- MachineCapacity ----

def _setup_machine(db, machine_id: str, **caps):
    db.execute("INSERT OR IGNORE INTO machines(id) VALUES (?)", (machine_id,))
    cap = MachineCapacity(machine_id=machine_id, **caps)
    cap.upsert(db)
    return cap


def test_machine_capacity_upsert_and_load(backend):
    _setup_machine(
        backend, "m-gpu",
        gpu_vram_total_gb=8, gpu_vram_free_gb=6,
        cpu_cores=8, mem_total_gb=32,
        runtime_classes=["claude_local"],
    )
    caps = load_all_capacities(backend)
    assert len(caps) == 1
    assert caps[0].machine_id == "m-gpu"
    assert caps[0].gpu_vram_total_gb == 8
    assert caps[0].runtime_classes == ["claude_local"]


# ---- filter ----

def test_filter_drops_underprovisioned():
    req = ResourceRequest.new(
        "a", Requires(gpu_vram_gb=8, runtime_class="claude_local"),
    )
    caps = [
        MachineCapacity(
            machine_id="too-small",
            gpu_vram_total_gb=4,
            runtime_classes=["claude_local"],
        ),
        MachineCapacity(
            machine_id="ok",
            gpu_vram_total_gb=12,
            runtime_classes=["claude_local"],
        ),
    ]
    out = filter_machines(caps, req)
    assert [c.machine_id for c in out] == ["ok"]


def test_filter_drops_missing_runtime_class():
    req = ResourceRequest.new("a", Requires(runtime_class="codex_local"))
    caps = [MachineCapacity(
        machine_id="no-codex", runtime_classes=["claude_local"],
    )]
    out = filter_machines(caps, req)
    assert out == []


def test_filter_drops_offline_machines():
    req = ResourceRequest.new("a", Requires())
    caps = [
        MachineCapacity(machine_id="alive", status="online"),
        MachineCapacity(machine_id="dead", status="offline"),
    ]
    out = filter_machines(caps, req)
    assert [c.machine_id for c in out] == ["alive"]


def test_filter_honors_avoid_machine():
    req = ResourceRequest.new(
        "a", Requires(),
        affinity=Affinity(avoid_machine="m-bad"),
    )
    caps = [
        MachineCapacity(machine_id="m-bad"),
        MachineCapacity(machine_id="m-good"),
    ]
    out = filter_machines(caps, req)
    assert [c.machine_id for c in out] == ["m-good"]


# ---- score ----

def test_score_prefers_affinity():
    req = ResourceRequest.new(
        "a", Requires(),
        affinity=Affinity(prefer_machine="m-pref"),
    )
    caps = [
        MachineCapacity(machine_id="m-other"),
        MachineCapacity(machine_id="m-pref"),
    ]
    scored = score_machines(caps, req)
    assert scored[0][0].machine_id == "m-pref"


def test_score_prefers_more_free_vram():
    req = ResourceRequest.new("a", Requires())
    caps = [
        MachineCapacity(machine_id="m-loaded", gpu_vram_free_gb=1),
        MachineCapacity(machine_id="m-idle", gpu_vram_free_gb=8),
    ]
    scored = score_machines(caps, req)
    assert scored[0][0].machine_id == "m-idle"


def test_score_penalizes_pending_depth():
    req = ResourceRequest.new("a", Requires())
    caps = [
        MachineCapacity(machine_id="m-busy"),
        MachineCapacity(machine_id="m-free"),
    ]
    scored = score_machines(
        caps, req, pending_per_machine={"m-busy": 5, "m-free": 0},
    )
    assert scored[0][0].machine_id == "m-free"


# ---- binder ----

def _create_pending(db, agent_id: str = "a1") -> str:
    # name must be unique per active agent — use agent_id itself as name
    db.execute(
        "INSERT OR IGNORE INTO agents(id, name) VALUES (?, ?)",
        (agent_id, agent_id),
    )
    r = ResourceRequest.new(agent_id, Requires())
    r.insert(db)
    return r.id


def test_try_bind_returns_true_on_first_call(backend):
    backend.execute("INSERT INTO machines(id) VALUES (?)", ("m-1",))
    rid = _create_pending(backend)
    ok = try_bind(backend, rid, "m-1")
    assert ok is True
    rows = backend.execute(
        "SELECT bound_machine_id, status FROM resource_requests WHERE id=?",
        (rid,),
    )
    assert rows[0]["bound_machine_id"] == "m-1"
    assert rows[0]["status"] == "bound"


def test_try_bind_second_call_returns_false(backend):
    backend.execute(
        "INSERT INTO machines(id) VALUES (?), (?)", ("m-1", "m-2"),
    )
    rid = _create_pending(backend)
    assert try_bind(backend, rid, "m-1") is True
    assert try_bind(backend, rid, "m-2") is False
    rows = backend.execute(
        "SELECT bound_machine_id FROM resource_requests WHERE id=?", (rid,),
    )
    # First binding sticks; second is rejected.
    assert rows[0]["bound_machine_id"] == "m-1"


def test_try_bind_rejects_cancelled_row(backend):
    """A row cancelled out from under us must not be bindable.

    Audit fix: cur.rowcount, not total_changes — must remain accurate
    when the row was moved to 'cancelled' between scheduler decision
    and binder execution.
    """
    backend.execute("INSERT INTO machines(id) VALUES (?)", ("m-1",))
    rid = _create_pending(backend)
    backend.execute(
        "UPDATE resource_requests SET status='cancelled' WHERE id=?", (rid,),
    )
    ok = try_bind(backend, rid, "m-1")
    assert ok is False
    rows = backend.execute(
        "SELECT bound_machine_id, status FROM resource_requests WHERE id=?",
        (rid,),
    )
    assert rows[0]["bound_machine_id"] is None
    assert rows[0]["status"] == "cancelled"


def test_pending_per_machine_groups(backend):
    backend.execute(
        "INSERT INTO machines(id) VALUES (?), (?)", ("m-1", "m-2"),
    )
    for i, mid in enumerate(["m-1", "m-1", "m-2"]):
        rid = _create_pending(backend, agent_id=f"agent-{i}")
        try_bind(backend, rid, mid)
    counts = pending_per_machine(backend)
    assert counts == {"m-1": 2, "m-2": 1}
