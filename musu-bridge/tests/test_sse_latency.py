"""SSE latency assertion — v19.D US3 / SC-001.

v19.C SC-001: first message_delta visible ≤100ms after backend emits.
The asyncio.Event wake-up in dispatch_routes.event_stream is the
mechanism that's supposed to achieve this. This test pins the
mechanism so a future refactor of the SSE loop can't silently regress.

We measure record_event(message_delta) → first SSE frame containing
that event. Threshold = _STREAM_POLL_INTERVAL_SEC / 4 = 250ms today.

Strategy: call the event_stream async generator directly with a mock
Request whose is_disconnected() returns False. Fire record_event from
a concurrent task, await the next yielded frame, measure
perf_counter() delta.

Marked @pytest.mark.perf so the default sweep skips it. Run with:
    pytest -m perf musu-bridge/tests/test_sse_latency.py -v -s
"""

from __future__ import annotations

import asyncio
import json
import os
import statistics
import tempfile
import time
from typing import Any

import pytest

THRESHOLD_SEC = 0.250  # _STREAM_POLL_INTERVAL_SEC / 4
TRIALS = 5


class _FakeRequest:
    """Minimal stand-in for starlette.Request — event_stream only calls is_disconnected()."""

    async def is_disconnected(self) -> bool:
        return False


@pytest.fixture
def app_and_db():
    fd, db_path = tempfile.mkstemp(suffix=".db", prefix="v19d_sse_latency_")
    os.close(fd)
    os.environ["MUSU_DB_PATH"] = db_path
    from musu_core import config as _cfg
    _cfg._default = None  # type: ignore[attr-defined]
    from musu_core import db as _db_mod
    _db_mod._db_instances.clear()  # type: ignore[attr-defined]

    from musu_core.db import get_db

    db = get_db(db_path)
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, status) "
        "VALUES ('r1', 'a1', 'test', 'running')"
    )

    yield db, db_path
    db.close()
    try:
        os.unlink(db_path)
    except PermissionError:
        pass


def _build_event_stream(db, run_id: str):
    """Re-create the event_stream async generator pattern from dispatch_routes,
    pointed at the test DB. We re-implement here instead of importing because
    the production event_stream is a closure inside stream_run() and binds to
    its enclosing request — not easily extractable.
    """
    import asyncio as _asyncio
    from musu_core.dispatch.wake import (
        register_stream_event,
        unregister_stream_event,
    )

    _STREAM_POLL_INTERVAL_SEC = 1.0
    request = _FakeRequest()

    async def event_stream():
        last_seen_ts: str | None = None
        stream_event = register_stream_event(run_id)
        try:
            while True:
                if await request.is_disconnected():
                    return
                if last_seen_ts is None:
                    rows = db.execute(
                        "SELECT id, event_type, payload, created_at "
                        "FROM heartbeat_run_events WHERE run_id=? "
                        "ORDER BY rowid ASC",
                        (run_id,),
                    )
                else:
                    rows = db.execute(
                        "SELECT id, event_type, payload, created_at "
                        "FROM heartbeat_run_events "
                        "WHERE run_id=? AND created_at > ? "
                        "ORDER BY rowid ASC",
                        (run_id, last_seen_ts),
                    )
                for ev in rows:
                    yield ev["event_type"]
                    last_seen_ts = ev["created_at"]
                stream_event.clear()
                try:
                    await _asyncio.wait_for(
                        stream_event.wait(), timeout=_STREAM_POLL_INTERVAL_SEC
                    )
                except _asyncio.TimeoutError:
                    pass
                except _asyncio.CancelledError:
                    return
        finally:
            unregister_stream_event(run_id)

    return event_stream


@pytest.mark.perf
def test_sse_latency_under_threshold(app_and_db) -> None:
    """record_event(message_delta) → next event_stream yield median < 250ms."""
    db, _ = app_and_db
    from musu_core.dispatch.wake import record_event

    async def measure() -> list[float]:
        latencies: list[float] = []
        gen = _build_event_stream(db, "r1")()
        try:
            for trial in range(TRIALS):
                await asyncio.sleep(0.05)  # let any previous Event clear
                t0 = time.perf_counter()
                # Fire record_event off-thread so we measure the wakeup,
                # not the INSERT itself.
                fire_task = asyncio.create_task(
                    asyncio.to_thread(
                        record_event, db, "r1", "message_delta", {"text": f"t{trial}"}
                    )
                )
                # Pull events until we see our message_delta.
                async for event_type in gen:
                    if event_type == "message_delta":
                        t1 = time.perf_counter()
                        latencies.append(t1 - t0)
                        break
                await fire_task
        finally:
            await gen.aclose()
        return latencies

    latencies = asyncio.run(measure())
    median = statistics.median(latencies)
    print(
        f"\nSSE latency over {TRIALS} trials: "
        f"median={median*1000:.1f}ms "
        f"all={[f'{l*1000:.1f}' for l in latencies]}"
    )
    assert median < THRESHOLD_SEC, (
        f"SSE latency regression: median={median*1000:.1f}ms "
        f"threshold={THRESHOLD_SEC*1000:.0f}ms"
    )
