"""End-to-end execute_wake tests — streaming + approval combined (v19.D P2).

v19.C unit-tested each piece (BaseAdapter.execute_streaming,
request_approval callable, submit_approval state machine) in isolation
but never wired them together through execute_wake. These tests pin the
combined behavior so a future refactor of wake.py can't silently regress
the live path.

Strategy: build a fake Router that calls a fake adapter inline. The
fake adapter:
  1. Emits a message_delta via on_delta.
  2. Awaits ctx.extra['request_approval'](prompt).
  3. Emits a second message_delta after the approval resolves.
  4. Returns success (or raises for the failure test).

A helper task fires submit_approval against the run after the
request_approval row appears, simulating the user clicking yes.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from musu_core.adapters.base import AdapterContext, AdapterResult
from musu_core.db import Database
from musu_core.dispatch.approval import (
    _approval_decisions,
    _approval_events,
    load_pending_for_run,
    submit_approval,
)
from musu_core.dispatch.wake import enqueue_wake, execute_wake


def _clear_inprocess() -> None:
    _approval_events.clear()
    _approval_decisions.clear()


class _FakeRouterResult:
    """Duck-typed RouteResult."""

    def __init__(self, success: bool, summary: str, error: str | None = None):
        self.run_id = "x"
        self.agent_id = "a1"
        self.success = success
        self.summary = summary
        self.session_id = None
        self.error = error
        self.adapter_result = AdapterResult(
            run_id="x", success=success, summary=summary, error=error,
        )


class _FakeRouter:
    """Calls the wrapped fake adapter coroutine with the on_delta and ctx.

    Mimics Router.route_streaming's surface: constructs the AdapterContext
    from RouteRequest and forwards on_delta to the adapter. The adapter
    is responsible for emitting deltas + awaiting approval + producing
    AdapterResult.
    """

    def __init__(self, fake_adapter):
        self._adapter = fake_adapter

    async def route_streaming(self, req, on_delta):
        # Build a minimal AdapterContext — enough for the adapter to use
        # ctx.extra['request_approval'].
        ctx = AdapterContext(
            run_id="x",
            prompt=req.prompt,
            agent_id=req.agent_id,
            agent_name="tester",
            agent_role="ceo",
            adapter_type="fake",
            extra=req.extra,
        )
        try:
            result = await self._adapter(ctx, on_delta)
        except Exception as exc:  # noqa: BLE001
            return _FakeRouterResult(False, "", error=f"adapter raised: {exc!r}")
        return _FakeRouterResult(result.success, result.summary, error=result.error)


def _seed(db: Database, run_id: str = "r1") -> None:
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    # Use enqueue_wake so wake_payload is properly JSON-encoded.
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, wake_payload, status) "
        "VALUES (?, 'a1', 'user_message', ?, 'queued')",
        (run_id, json.dumps({"prompt": "hello"})),
    )


def _event_types(db: Database, run_id: str) -> list[str]:
    # v30 seq column is the authoritative insertion-order indicator
    # (created_at is ms-only; id is uuid hex, not temporal).
    rows = db.execute(
        "SELECT event_type FROM heartbeat_run_events "
        "WHERE run_id=? ORDER BY seq ASC",
        (run_id,),
    )
    return [r["event_type"] for r in rows]


async def _resolve_pending_after_delay(db: Database, run_id: str, decision: str) -> None:
    """Polls for a pending approval row + resolves it. Mimics the user's POST /approve."""
    for _ in range(50):  # up to ~500ms
        pending = load_pending_for_run(db, run_id)
        if pending is not None:
            submit_approval(db, pending["id"], decision)
            return
        await asyncio.sleep(0.01)
    raise RuntimeError("no pending approval appeared in time")


def test_streaming_with_approval_happy_path() -> None:
    """Adapter streams → awaits approval → streams more → completes."""
    db = Database(":memory:")
    _seed(db)
    _clear_inprocess()

    async def fake_adapter(ctx, on_delta):
        on_delta("hello ")
        decision = await ctx.extra["request_approval"]("go?")
        assert decision == "approved"
        on_delta("world")
        return AdapterResult(run_id=ctx.run_id, success=True, summary="hello world")

    async def runner():
        # Resolver task races with execute_wake.
        resolver = asyncio.create_task(
            _resolve_pending_after_delay(db, "r1", "approved")
        )
        await execute_wake(db, _FakeRouter(fake_adapter), "r1")
        await resolver

    asyncio.run(runner())

    types = _event_types(db, "r1")
    # Required subsequence: wake_started → message_delta → approval_request
    # → approval_resolved → message_delta → completed.
    expected = [
        "wake_started",
        "message_delta",
        "approval_request",
        "approval_resolved",
        "message_delta",
        "completed",
    ]
    # The actual sequence may have extra events (none today, but we
    # compare as subsequence to keep the assertion robust).
    idx = 0
    for t in types:
        if idx < len(expected) and t == expected[idx]:
            idx += 1
    assert idx == len(expected), (
        f"missing expected subsequence. got={types}, want_subseq={expected}"
    )

    rows = db.execute("SELECT status, summary FROM heartbeat_runs WHERE id='r1'")
    assert rows[0]["status"] == "completed"
    assert rows[0]["summary"] == "hello world"


def test_streaming_with_approval_then_adapter_fails() -> None:
    """Adapter raises after request_approval returns — timeline ends in failed."""
    db = Database(":memory:")
    _seed(db)
    _clear_inprocess()

    async def fake_adapter(ctx, on_delta):
        on_delta("hi ")
        decision = await ctx.extra["request_approval"]("ok?")
        assert decision == "approved"
        raise RuntimeError("adapter blew up after approval")

    async def runner():
        resolver = asyncio.create_task(
            _resolve_pending_after_delay(db, "r1", "approved")
        )
        await execute_wake(db, _FakeRouter(fake_adapter), "r1")
        await resolver

    asyncio.run(runner())

    types = _event_types(db, "r1")
    assert "approval_resolved" in types
    assert "failed" in types
    assert "completed" not in types, (
        f"failed adapter should NOT produce a completed event. timeline={types}"
    )

    rows = db.execute("SELECT status FROM heartbeat_runs WHERE id='r1'")
    assert rows[0]["status"] == "failed"
