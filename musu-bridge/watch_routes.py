"""Watch dispatcher HTTP surface (v21.B).

Two endpoints:
  POST /api/watch/notify     — cross-machine push from a peer bridge
  GET  /api/watch/subscribe  — SSE stream of events for a single table

The bridge holds one process-global WatchDispatcher (created lazily on
first endpoint hit). musu_core.controllers code running in the same
process shares this dispatcher via `get_watch_dispatcher()`.

Auth: reuses the bridge's existing bearer-token middleware. Endpoint
handlers receive a Request whose `state.authenticated` is already True
by the time they run (musu-bridge middleware enforces this).
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from musu_core.controllers.sources import _ALLOWED_TABLES
from musu_core.controllers.watch import WatchDispatcher, WatchOp

logger = logging.getLogger(__name__)

watch_router = APIRouter(prefix="/api/watch", tags=["watch"])


# Process-global dispatcher. Lazy-init on first access.
_dispatcher: Optional[WatchDispatcher] = None
_dispatcher_lock = asyncio.Lock()


async def get_watch_dispatcher() -> WatchDispatcher:
    """Return the process-global WatchDispatcher, creating it if needed."""
    global _dispatcher
    if _dispatcher is None:
        async with _dispatcher_lock:
            if _dispatcher is None:
                _dispatcher = WatchDispatcher()
    return _dispatcher


def reset_watch_dispatcher_for_tests() -> None:
    """Test hook — drop the process-global dispatcher.

    musu-bridge tests reset between cases; without this, a closed
    dispatcher from a prior test would refuse new subscribers.
    """
    global _dispatcher
    if _dispatcher is not None:
        _dispatcher.close()
    _dispatcher = None


class WatchNotifyBody(BaseModel):
    table: str
    key: str
    op: WatchOp = "update"


@watch_router.post("/notify")
async def watch_notify(body: WatchNotifyBody, request: Request) -> dict:
    """Cross-machine push — peer bridge writes locally then POSTs here.

    The body is validated against the watch allowlist (same as
    in-process subscribe), then forwarded to the local dispatcher.
    Returns immediately; subscribers receive on their own loop.
    """
    if body.table not in _ALLOWED_TABLES:
        raise HTTPException(
            status_code=400,
            detail=f"table {body.table!r} not in allowlist",
        )
    if body.op not in ("create", "update", "delete"):
        raise HTTPException(
            status_code=400, detail=f"op {body.op!r} invalid",
        )
    dispatcher = await get_watch_dispatcher()
    dispatcher.notify(body.table, body.key, body.op)
    return {"status": "ok", "table": body.table, "key": body.key}


@watch_router.get("/subscribe")
async def watch_subscribe(table: str, request: Request) -> StreamingResponse:
    """SSE stream of watch events for one table.

    Used by control plane to subscribe to a remote bridge's events.
    Each event is emitted as `data: <json>\\n\\n`. Stream terminates
    when client disconnects or when the dispatcher closes.
    """
    if table not in _ALLOWED_TABLES:
        raise HTTPException(
            status_code=400, detail=f"table {table!r} not in allowlist",
        )
    dispatcher = await get_watch_dispatcher()
    sub = dispatcher.subscribe(table)

    async def gen() -> AsyncGenerator[bytes, None]:
        try:
            async for event in sub:
                if await request.is_disconnected():
                    break
                payload = json.dumps({
                    "table": event.table,
                    "key": event.key,
                    "op": event.op,
                    "ts": event.ts,
                })
                yield f"data: {payload}\n\n".encode("utf-8")
        finally:
            sub.unsubscribe()

    return StreamingResponse(gen(), media_type="text/event-stream")
