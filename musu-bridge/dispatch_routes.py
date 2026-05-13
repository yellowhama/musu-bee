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

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from musu_core.config import get_config
from musu_core.db import get_db
from musu_core.dispatch import (
    CycleDetected,
    delegate_to_subordinate,
    enqueue_wake,
    execute_wake,
    find_ceo,
    route_user_message_to_ceo,
)
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


class CompanyMessageBody(BaseModel):
    user_id: str
    body: str


@dispatch_router.post("/company/{company_id}/message")
async def post_company_message(
    company_id: str, body: CompanyMessageBody, bg: BackgroundTasks,
) -> dict[str, Any]:
    """User → CEO chat entry point.

    Creates an issue + opening comment + queued wake for the company's
    CEO. Returns the new run_id and the issue/session ids the UI needs
    to follow up.
    """
    cfg = get_config()
    db = get_db(cfg.db_path)
    result = route_user_message_to_ceo(db, company_id, body.user_id, body.body)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    router_instance = make_router(db_path=cfg.db_path)
    bg.add_task(execute_wake, db, router_instance, result["run_id"])
    return result


class DelegateBody(BaseModel):
    role: str
    body: str


@dispatch_router.post("/runs/{run_id}/delegate")
async def post_delegate(
    run_id: str, body: DelegateBody, bg: BackgroundTasks,
) -> dict[str, Any]:
    """Agent (typically CEO) delegates a sub-task to a subordinate by role.

    Subordinate is selected as the oldest agent reporting to the parent
    run's agent, in the same company, with matching role (case-insensitive).
    409 on cycle/depth overflow, 400 on bad input.
    """
    cfg = get_config()
    db = get_db(cfg.db_path)
    try:
        result = delegate_to_subordinate(db, run_id, body.role, body.body)
    except CycleDetected as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    router_instance = make_router(db_path=cfg.db_path)
    bg.add_task(execute_wake, db, router_instance, result["run_id"])
    return result


@dispatch_router.get("/company/{company_id}/ceo")
def get_company_ceo(company_id: str) -> dict[str, str]:
    """Return the CEO agent id for the given company, or 404."""
    cfg = get_config()
    db = get_db(cfg.db_path)
    ceo_id = find_ceo(db, company_id)
    if not ceo_id:
        raise HTTPException(
            status_code=404, detail=f"company {company_id} has no CEO"
        )
    return {"company_id": company_id, "ceo_id": ceo_id}


# Status values that mean the run is finished; the stream closes after the
# final flush of one of these.
_TERMINAL_STATUSES = {"completed", "failed", "cancelled"}

# Hard stream timeout — clients that need a longer-running run should
# reconnect with the `since` cursor.
_STREAM_TIMEOUT_SEC = 30 * 60

# How often to poll for new events when no terminal status has been seen.
# Conservative because all rows live in a single SQLite DB shared with the
# rest of the bridge; bursts of polling would spike the global lock.
_STREAM_POLL_INTERVAL_SEC = 1.0


@dispatch_router.get("/runs/{run_id}/stream")
async def stream_run(run_id: str, request: Request) -> StreamingResponse:
    """SSE — initial event backlog, then new events as they appear.

    The stream emits one SSE message per event. Each message body is the
    same JSON shape returned by GET /runs/{id}/events. After the run
    reaches a terminal status (`completed` / `failed` / `cancelled`) we
    flush any remaining events, send a final `{type:'done', status:...}`,
    and close. A 30-minute hard cap stops runaway streams; clients that
    need longer reconnect with `since=<last created_at>`.
    """
    cfg = get_config()
    db = get_db(cfg.db_path)

    async def event_stream():
        # 404 inside the stream so the client gets a clean close instead of
        # a hung connection; we already returned 200 by the time this
        # generator runs, so we cannot raise HTTPException here.
        first_check = db.execute(
            "SELECT status FROM heartbeat_runs WHERE id=?", (run_id,)
        )
        if not first_check:
            yield f"data: {json.dumps({'type': 'error', 'detail': 'run not found'})}\n\n"
            return

        last_seen_ts: str | None = None
        deadline = asyncio.get_event_loop().time() + _STREAM_TIMEOUT_SEC

        while True:
            if await request.is_disconnected():
                return
            if asyncio.get_event_loop().time() > deadline:
                yield f"data: {json.dumps({'type': 'stream_timeout'})}\n\n"
                return

            # Fetch new events since the last we flushed.
            if last_seen_ts is None:
                rows = db.execute(
                    "SELECT id, event_type, payload, created_at "
                    "FROM heartbeat_run_events WHERE run_id=? "
                    "ORDER BY created_at ASC, id ASC",
                    (run_id,),
                )
            else:
                rows = db.execute(
                    "SELECT id, event_type, payload, created_at "
                    "FROM heartbeat_run_events "
                    "WHERE run_id=? AND created_at > ? "
                    "ORDER BY created_at ASC, id ASC",
                    (run_id, last_seen_ts),
                )

            for ev in rows:
                payload = {
                    "id": ev["id"],
                    "event_type": ev["event_type"],
                    "payload": json.loads(ev["payload"] or "{}"),
                    "created_at": ev["created_at"],
                }
                yield f"data: {json.dumps(payload)}\n\n"
                last_seen_ts = ev["created_at"]

            status_rows = db.execute(
                "SELECT status, summary, error FROM heartbeat_runs WHERE id=?",
                (run_id,),
            )
            if status_rows and status_rows[0]["status"] in _TERMINAL_STATUSES:
                # One more flush in case events landed between fetches.
                if last_seen_ts:
                    tail = db.execute(
                        "SELECT id, event_type, payload, created_at "
                        "FROM heartbeat_run_events "
                        "WHERE run_id=? AND created_at > ? "
                        "ORDER BY created_at ASC, id ASC",
                        (run_id, last_seen_ts),
                    )
                    for ev in tail:
                        payload = {
                            "id": ev["id"],
                            "event_type": ev["event_type"],
                            "payload": json.loads(ev["payload"] or "{}"),
                            "created_at": ev["created_at"],
                        }
                        yield f"data: {json.dumps(payload)}\n\n"
                final = {
                    "type": "done",
                    "status": status_rows[0]["status"],
                    "summary": status_rows[0]["summary"],
                    "error": status_rows[0]["error"],
                }
                yield f"data: {json.dumps(final)}\n\n"
                return

            try:
                await asyncio.sleep(_STREAM_POLL_INTERVAL_SEC)
            except asyncio.CancelledError:
                return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


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
