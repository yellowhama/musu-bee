"""Two-axis (Company × Machine) HTTP surface (v21.F).

Frame v9 §3 + §4 axes:
  GET /api/machines                          — list all machines + capacity
  GET /api/machines/{machine_id}             — single machine detail
  GET /api/companies/{company_id}/dispatch   — agents + in-flight requests
                                               for a company

These are READ-ONLY, intended for the musu-bee UI Company and Machine
views. Writes still go through existing endpoints (companies/[id], etc).

Auth: reuses bridge's existing bearer-token middleware (same as
watch_routes — Request.state.authenticated is set by middleware).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

axis_router = APIRouter(prefix="/api", tags=["axis"])


def _get_db() -> Any:
    """Lazy backend import — same pattern handlers.py uses."""
    from handlers import _get_backend
    return _get_backend()._db


def _row_to_machine(row: Any, capacity: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "hostname": row["hostname"],
        "os": row["os"],
        "arch": row["arch"],
        "status": row["status"],
        "last_seen_at": row["last_seen_at"],
        "capacity": capacity,
    }


def _load_capacity(db: Any, machine_id: str) -> dict[str, Any] | None:
    rows = db.execute(
        "SELECT gpu_models_json, gpu_vram_total_gb, gpu_vram_free_gb, "
        "       cpu_cores, cpu_idle_pct, mem_total_gb, mem_free_gb, "
        "       runtime_classes_json, last_heartbeat_at "
        "FROM machine_capacity WHERE machine_id=?",
        (machine_id,),
    )
    if not rows:
        return None
    r = rows[0]
    try:
        gpu_models = json.loads(r["gpu_models_json"] or "[]")
    except (TypeError, ValueError):
        gpu_models = []
    try:
        runtime_classes = json.loads(r["runtime_classes_json"] or "[]")
    except (TypeError, ValueError):
        runtime_classes = []
    return {
        "gpu_models": gpu_models,
        "gpu_vram_total_gb": r["gpu_vram_total_gb"],
        "gpu_vram_free_gb": r["gpu_vram_free_gb"],
        "cpu_cores": r["cpu_cores"],
        "cpu_idle_pct": r["cpu_idle_pct"],
        "mem_total_gb": r["mem_total_gb"],
        "mem_free_gb": r["mem_free_gb"],
        "runtime_classes": runtime_classes,
        "last_heartbeat_at": r["last_heartbeat_at"],
    }


@axis_router.get("/machines")
async def list_machines(_request: Request) -> dict[str, Any]:
    """List every machine + its capacity snapshot + in-flight load."""
    db = _get_db()
    rows = db.execute(
        "SELECT id, hostname, os, arch, status, last_seen_at "
        "FROM machines ORDER BY id"
    )
    queue_counts = {
        r["bound_machine_id"]: int(r["n"])
        for r in db.execute(
            "SELECT bound_machine_id, COUNT(*) AS n FROM resource_requests "
            "WHERE bound_machine_id IS NOT NULL "
            "  AND status IN ('bound','running') "
            "GROUP BY bound_machine_id"
        )
    }
    out = []
    for row in rows:
        m = _row_to_machine(row, _load_capacity(db, row["id"]))
        m["inflight_requests"] = queue_counts.get(row["id"], 0)
        out.append(m)
    return {"machines": out, "count": len(out)}


@axis_router.get("/machines/{machine_id}")
async def get_machine(machine_id: str, _request: Request) -> dict[str, Any]:
    """Single machine: full state + capacity + active requests."""
    db = _get_db()
    rows = db.execute(
        "SELECT id, hostname, os, arch, status, last_seen_at "
        "FROM machines WHERE id=?",
        (machine_id,),
    )
    if not rows:
        raise HTTPException(404, detail=f"machine {machine_id!r} not found")
    machine = _row_to_machine(rows[0], _load_capacity(db, machine_id))

    request_rows = db.execute(
        "SELECT id, agent_id, company_id, priority, status, "
        "       bound_at, created_at "
        "FROM resource_requests "
        "WHERE bound_machine_id=? "
        "  AND status IN ('bound','running') "
        "ORDER BY bound_at DESC LIMIT 50",
        (machine_id,),
    )
    machine["active_requests"] = [
        {
            "id": r["id"],
            "agent_id": r["agent_id"],
            "company_id": r["company_id"],
            "priority": r["priority"],
            "status": r["status"],
            "bound_at": r["bound_at"],
            "created_at": r["created_at"],
        }
        for r in request_rows
    ]
    return machine


@axis_router.get("/companies/{company_id}/dispatch")
async def company_dispatch(
    company_id: str, _request: Request,
) -> dict[str, Any]:
    """Company-axis view: agents + their in-flight requests + recent history."""
    db = _get_db()
    co_rows = db.execute(
        "SELECT id, name FROM companies WHERE id=?", (company_id,),
    )
    if not co_rows:
        raise HTTPException(404, detail=f"company {company_id!r} not found")
    company = co_rows[0]

    agent_rows = db.execute(
        "SELECT id, name, status, adapter_type FROM agents "
        "WHERE company_id=? ORDER BY name",
        (company_id,),
    )
    agents: list[dict[str, Any]] = []
    for a in agent_rows:
        inflight = db.execute(
            "SELECT id, status, priority, bound_machine_id, created_at "
            "FROM resource_requests "
            "WHERE agent_id=? AND status IN ('pending','bound','running') "
            "ORDER BY created_at DESC LIMIT 5",
            (a["id"],),
        )
        agents.append({
            "id": a["id"],
            "name": a["name"],
            "status": a["status"],
            "adapter_type": a["adapter_type"],
            "inflight_requests": [
                {
                    "id": r["id"],
                    "status": r["status"],
                    "priority": r["priority"],
                    "bound_machine_id": r["bound_machine_id"],
                    "created_at": r["created_at"],
                }
                for r in inflight
            ],
        })

    # Totals for the company axis header
    totals = {
        "agents_total": len(agents),
        "agents_active": sum(1 for a in agents if a["status"] == "active"),
        "requests_pending": int(db.execute(
            "SELECT COUNT(*) AS n FROM resource_requests "
            "WHERE company_id=? AND status='pending'",
            (company_id,),
        )[0]["n"]),
        "requests_running": int(db.execute(
            "SELECT COUNT(*) AS n FROM resource_requests "
            "WHERE company_id=? AND status IN ('bound','running')",
            (company_id,),
        )[0]["n"]),
    }

    return {
        "company": {"id": company["id"], "name": company["name"]},
        "agents": agents,
        "totals": totals,
    }
