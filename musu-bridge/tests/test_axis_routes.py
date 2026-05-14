"""GET /api/machines, /api/machines/{id}, /api/companies/{id}/dispatch (v21.F).

Pins:
- list endpoint returns machines + capacity + inflight queue counts
- get endpoint returns single machine with active requests
- 404 on missing machine / company
- company dispatch returns agents grouped with their inflight requests
- totals reflect status breakdowns
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from musu_core.db import Database


def _seed(db):
    """Populate a clean in-memory DB with 2 machines, 1 company, 2 agents,
    a mix of resource_requests in different states."""
    # machines
    db.execute(
        "INSERT INTO machines(id, hostname, os, arch, status) "
        "VALUES (?, ?, ?, ?, ?)",
        ("m-gpu", "host-gpu", "linux", "x86_64", "online"),
    )
    db.execute(
        "INSERT INTO machines(id, hostname, os, arch, status) "
        "VALUES (?, ?, ?, ?, ?)",
        ("m-cpu", "host-cpu", "windows", "x86_64", "offline"),
    )
    # machine_capacity for m-gpu only
    db.execute(
        "INSERT INTO machine_capacity"
        "(machine_id, gpu_models_json, gpu_vram_total_gb, gpu_vram_free_gb, "
        " cpu_cores, cpu_idle_pct, mem_total_gb, mem_free_gb, "
        " runtime_classes_json) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            "m-gpu", json.dumps(["RTX 4060"]),
            8.0, 6.0, 8, 80.0, 32.0, 24.0,
            json.dumps(["claude_local"]),
        ),
    )
    # company + agents
    db.execute(
        "INSERT INTO companies(id, name) VALUES (?, ?)", ("co-a", "Alpha"),
    )
    db.execute(
        "INSERT INTO agents(id, name, company_id, status) "
        "VALUES (?, ?, ?, 'active')",
        ("agent-1", "scout", "co-a"),
    )
    db.execute(
        "INSERT INTO agents(id, name, company_id, status) "
        "VALUES (?, ?, ?, 'paused')",
        ("agent-2", "ranger", "co-a"),
    )
    # requests
    db.execute(
        "INSERT INTO resource_requests"
        "(id, company_id, agent_id, priority, status, bound_machine_id) "
        "VALUES (?, ?, ?, ?, 'bound', ?)",
        ("r-1", "co-a", "agent-1", 0, "m-gpu"),
    )
    db.execute(
        "INSERT INTO resource_requests"
        "(id, company_id, agent_id, priority, status) "
        "VALUES (?, ?, ?, ?, 'pending')",
        ("r-2", "co-a", "agent-2", 0),
    )
    db.execute(
        "INSERT INTO resource_requests"
        "(id, company_id, agent_id, priority, status, bound_machine_id) "
        "VALUES (?, ?, ?, ?, 'running', ?)",
        ("r-3", "co-a", "agent-1", 1, "m-gpu"),
    )


@pytest.fixture
def client():
    """Mount axis_router alone with a clean in-memory backend."""
    db = Database(":memory:")
    _seed(db)

    class _FakeBackend:
        def __init__(self, inner):
            self._db = inner

    fake_backend = _FakeBackend(db)

    # axis_routes._get_db imports handlers._get_backend lazily inside
    # each handler, so patch that single function.
    with patch("axis_routes._get_db", return_value=db):
        import axis_routes
        app = FastAPI()
        app.include_router(axis_routes.axis_router)
        yield TestClient(app)


def test_list_machines_returns_both(client):
    r = client.get("/api/machines")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] == 2
    ids = [m["id"] for m in body["machines"]]
    assert "m-gpu" in ids
    assert "m-cpu" in ids


def test_list_machines_includes_capacity_and_inflight(client):
    body = client.get("/api/machines").json()
    gpu = next(m for m in body["machines"] if m["id"] == "m-gpu")
    assert gpu["status"] == "online"
    assert gpu["capacity"] is not None
    assert gpu["capacity"]["gpu_vram_total_gb"] == 8.0
    assert "RTX 4060" in gpu["capacity"]["gpu_models"]
    # m-gpu has 2 bound/running requests (r-1, r-3)
    assert gpu["inflight_requests"] == 2

    cpu = next(m for m in body["machines"] if m["id"] == "m-cpu")
    assert cpu["status"] == "offline"
    assert cpu["capacity"] is None
    assert cpu["inflight_requests"] == 0


def test_get_machine_returns_active_requests(client):
    r = client.get("/api/machines/m-gpu")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == "m-gpu"
    rids = [r["id"] for r in body["active_requests"]]
    assert set(rids) == {"r-1", "r-3"}


def test_get_machine_404(client):
    r = client.get("/api/machines/m-ghost")
    assert r.status_code == 404


def test_company_dispatch_groups_agents_with_inflight(client):
    r = client.get("/api/companies/co-a/dispatch")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["company"]["id"] == "co-a"
    assert body["company"]["name"] == "Alpha"

    agents = {a["id"]: a for a in body["agents"]}
    assert set(agents.keys()) == {"agent-1", "agent-2"}

    # agent-1: 2 inflight (r-1 bound, r-3 running)
    a1_ids = [r["id"] for r in agents["agent-1"]["inflight_requests"]]
    assert set(a1_ids) == {"r-1", "r-3"}
    # agent-2: 1 inflight (r-2 pending)
    a2_ids = [r["id"] for r in agents["agent-2"]["inflight_requests"]]
    assert set(a2_ids) == {"r-2"}


def test_company_dispatch_totals(client):
    body = client.get("/api/companies/co-a/dispatch").json()
    t = body["totals"]
    assert t["agents_total"] == 2
    assert t["agents_active"] == 1
    assert t["requests_pending"] == 1     # r-2
    assert t["requests_running"] == 2     # r-1 (bound) + r-3 (running)


def test_company_dispatch_404(client):
    r = client.get("/api/companies/co-ghost/dispatch")
    assert r.status_code == 404
