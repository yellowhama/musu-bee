"""Wake/dispatch API routes (v19.A Phase 2).

Translates HTTP into musu_core.dispatch primitives:

  POST /api/dispatch/wake               — create a queued run + kick off
  GET  /api/dispatch/runs/{run_id}      — current status + event timeline
  GET  /api/dispatch/runs/{run_id}/events?since=<ISO ts>
                                         — incremental events for polling
                                           (SSE upgrade is a later cycle)

The router instance is built per-request from get_config().db_path so the
bridge does not need a singleton. execute_wake is scheduled as a
BackgroundTask so the HTTP response returns immediately with the run_id
and the actual adapter call happens off-thread.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from musu_core.config import get_config
from musu_core.db import get_db
from musu_core.dispatch import CycleDetected, enqueue_wake, execute_wake
from musu_core.router import make_router

logger = logging.getLogger(__name__)

dispatch_router = APIRouter(prefix="/api/dispatch", tags=["dispatch"])


class WakeBody(BaseModel):
    agent_id: str
    wake_reason: str
    issue_id: str | None = None
    parent_run_id: str | None = None
    wake_payload: dict[str, Any] | None = None


class WakeResponse(BaseModel):
    run_id: str
    status: str = "queued"


@dispatch_router.post("/wake", response_model=WakeResponse)
async def post_wake(body: WakeBody, bg: BackgroundTasks) -> WakeResponse:
    """Enqueue a wake and schedule its execution.

    Returns 202-style {run_id, status:'queued'} immediately. The adapter
    call runs in the background; clients poll GET /runs/{id} for status.
    """
    cfg = get_config()
    db = get_db(cfg.db_path)
    try:
        run_id = enqueue_wake(
            db,
            agent_id=body.agent_id,
            wake_reason=body.wake_reason,
            issue_id=body.issue_id,
            parent_run_id=body.parent_run_id,
            wake_payload=body.wake_payload,
        )
    except CycleDetected as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        # FK violations and similar — surface as 400 with the underlying
        # message so the caller knows which input was bad.
        raise HTTPException(status_code=400, detail=f"enqueue failed: {exc}")

    router_instance = make_router(db_path=cfg.db_path)
    bg.add_task(execute_wake, db, router_instance, run_id)
    return WakeResponse(run_id=run_id)


@dispatch_router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    """Return the run row plus its full event timeline."""
    cfg = get_config()
    db = get_db(cfg.db_path)
    rows = db.execute(
        "SELECT id, agent_id, issue_id, parent_run_id, wake_reason, "
        "       wake_payload, status, summary, error, "
        "       started_at, ended_at, created_at "
        "FROM heartbeat_runs WHERE id=?",
        (run_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"run {run_id} not found")
    events = db.execute(
        "SELECT id, event_type, payload, created_at "
        "FROM heartbeat_run_events WHERE run_id=? "
        "ORDER BY created_at ASC, id ASC",
        (run_id,),
    )
    return {
        "run": dict(rows[0]),
        "events": [dict(e) for e in events],
    }


@dispatch_router.get("/runs/{run_id}/events")
def get_run_events(run_id: str, since: str | None = None) -> dict[str, Any]:
    """Return events for a run, optionally filtered by created_at > since.

    Intended for clients polling in a loop. The `since` cursor is the
    last `created_at` the client already has; pass it back to get only
    newer events.
    """
    cfg = get_config()
    db = get_db(cfg.db_path)
    if since:
        events = db.execute(
            "SELECT id, event_type, payload, created_at "
            "FROM heartbeat_run_events "
            "WHERE run_id=? AND created_at > ? "
            "ORDER BY created_at ASC, id ASC",
            (run_id, since),
        )
    else:
        events = db.execute(
            "SELECT id, event_type, payload, created_at "
            "FROM heartbeat_run_events WHERE run_id=? "
            "ORDER BY created_at ASC, id ASC",
            (run_id,),
        )
    return {"run_id": run_id, "events": [dict(e) for e in events]}
