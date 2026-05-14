"""Direct test coverage for stream_events (v19.F Phase A / US1).

v19.E lifted event_stream to module-level stream_events but only the
perf test exercises it — and only the wake-up signaling path. This
file closes the silent-bug gap by directly asserting each envelope
shape and early-exit path.

Pattern mirrors test_sse_latency.py: tmp DB fixture, _FakeRequest
stand-in, asyncio.run wrapping inside sync pytest functions.
"""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import time

import pytest


class _FakeRequest:
    """Stays connected — is_disconnected always False."""

    async def is_disconnected(self) -> bool:
        return False


class _DisconnectingRequest:
    """Connected on first check, disconnected after that — simulates
    a client closing the connection between loop iterations."""

    def __init__(self) -> None:
        self._calls = 0

    async def is_disconnected(self) -> bool:
        self._calls += 1
        return self._calls > 1


@pytest.fixture
def db_fixture():
    """Fresh file-backed DB with one agent + one running heartbeat_run."""
    fd, db_path = tempfile.mkstemp(suffix=".db", prefix="v19f_stream_events_")
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


def _parse_frame(frame: str) -> dict:
    """Parse an SSE 'data: <json>\\n\\n' frame to a dict.

    Raises if the frame isn't well-formed — tests use this to assert
    shape directly."""
    assert frame.startswith("data: "), f"not an SSE data frame: {frame!r}"
    body = frame[len("data: "):].rstrip("\n")
    return json.loads(body)


def test_404_envelope_when_run_id_missing(db_fixture) -> None:
    """C1: stream for non-existent run yields error envelope + closes."""
    db, _ = db_fixture
    from dispatch_routes import stream_events

    async def run() -> list[dict]:
        gen = stream_events(db, "does-not-exist", _FakeRequest())
        frames: list[dict] = []
        try:
            async for frame in gen:
                frames.append(_parse_frame(frame))
                if len(frames) >= 1:
                    break
        finally:
            await gen.aclose()
        return frames

    frames = asyncio.run(run())
    assert len(frames) == 1
    assert frames[0] == {"type": "error", "detail": "run not found"}


def test_initial_flush_emits_events_in_seq_order(db_fixture) -> None:
    """C2: pre-existing events flushed in seq (= INSERT) order."""
    db, _ = db_fixture
    from dispatch_routes import stream_events
    from musu_core.dispatch.wake import record_event

    record_event(db, "r1", "a")
    record_event(db, "r1", "b")
    record_event(db, "r1", "c")

    async def run() -> list[str]:
        gen = stream_events(db, "r1", _DisconnectingRequest())
        types: list[str] = []
        try:
            async for frame in gen:
                obj = _parse_frame(frame)
                if "event_type" in obj:
                    types.append(obj["event_type"])
                if len(types) >= 3:
                    break
        finally:
            await gen.aclose()
        return types

    types = asyncio.run(run())
    assert types == ["a", "b", "c"]


def test_incremental_event_visible_after_record(db_fixture) -> None:
    """C3: record_event after stream opens reaches the generator."""
    db, _ = db_fixture
    from dispatch_routes import stream_events
    from musu_core.dispatch.wake import record_event

    async def run() -> tuple[str, float]:
        gen = stream_events(db, "r1", _FakeRequest())
        try:
            await asyncio.sleep(0.05)
            t0 = time.perf_counter()
            fire = asyncio.create_task(
                asyncio.to_thread(record_event, db, "r1", "incremental")
            )
            async for frame in gen:
                obj = _parse_frame(frame)
                if obj.get("event_type") == "incremental":
                    latency = time.perf_counter() - t0
                    await fire
                    return obj["event_type"], latency
            raise AssertionError("incremental event never arrived")
        finally:
            await gen.aclose()

    event_type, latency = asyncio.run(run())
    assert event_type == "incremental"
    assert latency < 0.25, f"incremental flush too slow: {latency*1000:.1f}ms"


def test_is_disconnected_closes_stream_cleanly(db_fixture) -> None:
    """C4: request flipping to disconnected ends the stream without
    yielding extra envelopes."""
    db, _ = db_fixture
    from dispatch_routes import stream_events
    from musu_core.dispatch.wake import record_event

    record_event(db, "r1", "only-event")

    async def run() -> list[dict]:
        gen = stream_events(db, "r1", _DisconnectingRequest())
        frames: list[dict] = []
        try:
            async for frame in gen:
                frames.append(_parse_frame(frame))
        finally:
            await gen.aclose()
        return frames

    frames = asyncio.run(run())
    # We get the seeded event then the loop's next is_disconnected check
    # returns True and the generator returns. No timeout/done envelope.
    assert len(frames) == 1
    assert frames[0].get("event_type") == "only-event"


def test_terminal_status_yields_done_envelope(db_fixture) -> None:
    """C5: heartbeat_runs.status -> completed produces done envelope
    + tail flush + clean close."""
    db, _ = db_fixture
    from dispatch_routes import stream_events
    from musu_core.dispatch.wake import record_event

    record_event(db, "r1", "e1")
    record_event(db, "r1", "e2")

    async def run() -> list[dict]:
        gen = stream_events(db, "r1", _FakeRequest())
        frames: list[dict] = []
        try:
            # Pull the 2 events first.
            async for frame in gen:
                obj = _parse_frame(frame)
                frames.append(obj)
                if len(frames) == 2:
                    # Now mark the run done — the next loop iteration
                    # will see terminal status and emit done envelope.
                    db.execute(
                        "UPDATE heartbeat_runs SET status='completed', "
                        "summary='ok' WHERE id='r1'"
                    )
                if obj.get("type") == "done":
                    break
        finally:
            await gen.aclose()
        return frames

    frames = asyncio.run(run())
    assert [f.get("event_type") for f in frames[:2]] == ["e1", "e2"]
    final = frames[-1]
    assert final["type"] == "done"
    assert final["status"] == "completed"
    assert final["summary"] == "ok"


def test_stream_timeout_envelope_on_deadline(db_fixture) -> None:
    """C6: stream_timeout_sec=0.1 produces timeout envelope after deadline."""
    db, _ = db_fixture
    from dispatch_routes import stream_events

    async def run() -> dict:
        gen = stream_events(
            db, "r1", _FakeRequest(), stream_timeout_sec=0.1
        )
        try:
            async for frame in gen:
                obj = _parse_frame(frame)
                if obj.get("type") == "stream_timeout":
                    return obj
            raise AssertionError("stream_timeout envelope never arrived")
        finally:
            await gen.aclose()

    t0 = time.perf_counter()
    envelope = asyncio.run(run())
    elapsed = time.perf_counter() - t0
    assert envelope == {"type": "stream_timeout"}
    # Should fire within ~poll_interval after the 0.1s deadline. Give
    # generous margin for CI slowness.
    assert elapsed < 2.0, f"stream_timeout fired too late: {elapsed:.2f}s"
