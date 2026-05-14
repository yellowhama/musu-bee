"""SSE latency assertion — v19.D US3 / SC-001, rewritten for v19.E US2.

v19.C SC-001: first message_delta visible <=100ms after backend emits.
The asyncio.Event wake-up in dispatch_routes.stream_events is the
mechanism that's supposed to achieve this. This test pins the
mechanism so a future refactor of the SSE loop can't silently regress.

v19.E US2: this test now imports the *production* stream_events
function directly from dispatch_routes instead of re-implementing it.
That guarantees any future regression in the production code path
reaches the perf test, not just a parallel re-impl.

We measure record_event(message_delta) -> first SSE frame containing
that event. Threshold = _STREAM_POLL_INTERVAL_SEC / 4 = 250ms today.

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

import pytest

THRESHOLD_SEC = 0.250  # _STREAM_POLL_INTERVAL_SEC / 4
TRIALS = 5


class _FakeRequest:
    """Minimal stand-in for starlette.Request — stream_events only calls
    is_disconnected() on it (structural protocol)."""

    async def is_disconnected(self) -> bool:
        return False


@pytest.fixture
def app_and_db():
    fd, db_path = tempfile.mkstemp(suffix=".db", prefix="v19e_sse_latency_")
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


def _parse_event_type(frame: str) -> str | None:
    """Extract event_type from an SSE 'data: <json>\\n\\n' frame.

    Returns None for non-event frames (error/done/stream_timeout
    envelopes have a 'type' field instead of 'event_type')."""
    if not frame.startswith("data: "):
        return None
    body = frame[len("data: "):].rstrip("\n")
    try:
        obj = json.loads(body)
    except json.JSONDecodeError:
        return None
    return obj.get("event_type")


@pytest.mark.perf
def test_sse_latency_under_threshold(app_and_db) -> None:
    """record_event(message_delta) -> next stream_events yield median < 250ms."""
    db, _ = app_and_db
    from musu_core.dispatch.wake import record_event
    from dispatch_routes import stream_events

    async def measure() -> list[float]:
        latencies: list[float] = []
        gen = stream_events(db, "r1", _FakeRequest())
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
                # Pull frames until we see our message_delta.
                async for frame in gen:
                    if _parse_event_type(frame) == "message_delta":
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
