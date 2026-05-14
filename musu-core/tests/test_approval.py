"""Approval state machine (v19.C P2).

Pins:
  - request_approval_sync inserts pending row + flips run to waiting_approval
  - submit_approval('approved') resumes run + sets event
  - submit_approval('declined') cancels run + emits cancelled event
  - duplicate submit returns already_resolved (FR-007)
  - submit on a run not in waiting_approval returns error matrix
"""

from __future__ import annotations

import asyncio
import json

import pytest

from musu_core.db import Database
from musu_core.dispatch.approval import (
    load_pending_for_run,
    make_request_approval_callable,
    request_approval_sync,
    submit_approval,
)


def _seed_run(db: Database, run_id: str = "r1", status: str = "running") -> None:
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, status) "
        "VALUES (?, 'a1', 'test', ?)",
        (run_id, status),
    )


def test_request_approval_inserts_pending_and_emits_event() -> None:
    db = Database(":memory:")
    _seed_run(db)

    approval_id = request_approval_sync(db, "r1", "delete 14 files?")

    rows = db.execute(
        "SELECT id, status, prompt FROM run_approvals WHERE id=?",
        (approval_id,),
    )
    assert rows
    assert rows[0]["status"] == "pending"
    assert rows[0]["prompt"] == "delete 14 files?"

    run_rows = db.execute(
        "SELECT status FROM heartbeat_runs WHERE id='r1'"
    )
    assert run_rows[0]["status"] == "waiting_approval"

    events = db.execute(
        "SELECT event_type, payload FROM heartbeat_run_events "
        "WHERE run_id='r1' ORDER BY created_at"
    )
    types = [e["event_type"] for e in events]
    assert "approval_request" in types
    # The approval_request payload carries the approval_id.
    for e in events:
        if e["event_type"] == "approval_request":
            payload = json.loads(e["payload"])
            assert payload["approval_id"] == approval_id
            assert payload["prompt"] == "delete 14 files?"


def test_submit_approved_flips_run_back_to_running() -> None:
    db = Database(":memory:")
    _seed_run(db)
    approval_id = request_approval_sync(db, "r1", "go?")
    res = submit_approval(db, approval_id, "approved")
    assert res == {"resolved": True, "decision": "approved", "run_id": "r1"}
    run_rows = db.execute(
        "SELECT status FROM heartbeat_runs WHERE id='r1'"
    )
    assert run_rows[0]["status"] == "running"


def test_submit_declined_cancels_run_and_emits_cancelled() -> None:
    db = Database(":memory:")
    _seed_run(db)
    approval_id = request_approval_sync(db, "r1", "go?")
    res = submit_approval(db, approval_id, "declined")
    assert res["resolved"] is True
    assert res["decision"] == "declined"
    run_rows = db.execute(
        "SELECT status FROM heartbeat_runs WHERE id='r1'"
    )
    assert run_rows[0]["status"] == "cancelled"
    events = db.execute(
        "SELECT event_type FROM heartbeat_run_events WHERE run_id='r1'"
    )
    types = [e["event_type"] for e in events]
    assert "approval_resolved" in types
    assert "cancelled" in types


def test_duplicate_submit_returns_already_resolved() -> None:
    """FR-007: second submit is a no-op, first decision wins."""
    db = Database(":memory:")
    _seed_run(db)
    approval_id = request_approval_sync(db, "r1", "go?")
    first = submit_approval(db, approval_id, "approved")
    assert first["resolved"] is True

    second = submit_approval(db, approval_id, "declined")
    assert second.get("already_resolved") is True
    assert second["decision"] == "approved"

    # Run state must reflect first decision.
    run_rows = db.execute(
        "SELECT status FROM heartbeat_runs WHERE id='r1'"
    )
    # First was approved → status running (not cancelled).
    assert run_rows[0]["status"] == "running"


def test_submit_unknown_approval_returns_error() -> None:
    db = Database(":memory:")
    res = submit_approval(db, "nonexistent", "approved")
    assert res == {"error": "not found"}


def test_submit_when_run_not_waiting_approval() -> None:
    """If the run somehow left waiting_approval before resolution."""
    db = Database(":memory:")
    _seed_run(db)
    approval_id = request_approval_sync(db, "r1", "go?")
    # Force run back to running, simulating external mutation.
    db.execute(
        "UPDATE heartbeat_runs SET status='running' WHERE id='r1'"
    )
    res = submit_approval(db, approval_id, "approved")
    assert "error" in res
    assert res["error"] == "run not in waiting_approval"


def test_load_pending_for_run_returns_pending_only() -> None:
    db = Database(":memory:")
    _seed_run(db)
    # No pending — None.
    assert load_pending_for_run(db, "r1") is None
    approval_id = request_approval_sync(db, "r1", "q?")
    pending = load_pending_for_run(db, "r1")
    assert pending is not None
    assert pending["id"] == approval_id
    # After resolution, pending is empty again.
    submit_approval(db, approval_id, "approved")
    assert load_pending_for_run(db, "r1") is None


def test_request_approval_callable_returns_decision() -> None:
    """End-to-end: callable awaits, submit_approval wakes it, decision flows through."""
    db = Database(":memory:")
    _seed_run(db)
    callable_ = make_request_approval_callable(db, "r1")

    async def runner():
        # Start the await in a task, give it a tick to insert the pending row.
        task = asyncio.create_task(callable_("ok?"))
        await asyncio.sleep(0)  # let the coroutine reach the await
        pending = load_pending_for_run(db, "r1")
        assert pending is not None
        # Now resolve it.
        submit_approval(db, pending["id"], "approved")
        decision = await task
        return decision

    decision = asyncio.run(runner())
    assert decision == "approved"


def test_submit_approved_with_waiter_uses_inprocess_path() -> None:
    """v19.D FR-002: when an in-process waiter exists, NO resume wake is enqueued.

    Regression guard — v19.D added the orphan path but the v19.C
    in-process behavior must remain unchanged when a waiter is alive.
    """
    from musu_core.dispatch.approval import _approval_events
    import asyncio as _asyncio

    db = Database(":memory:")
    _seed_run(db)
    approval_id = request_approval_sync(db, "r1", "ok?")
    # request_approval_sync already registered the Event; assert it.
    assert approval_id in _approval_events

    res = submit_approval(db, approval_id, "approved")
    assert res["resolved"] is True
    assert res["decision"] == "approved"
    # CRITICAL: no resumed marker, no resume_run_id.
    assert res.get("resumed") is not True
    assert "resume_run_id" not in res

    # No new heartbeat_run with wake_reason='approval_resumed' exists.
    rows = db.execute(
        "SELECT id FROM heartbeat_runs WHERE wake_reason='approval_resumed'"
    )
    assert not rows, (
        "non-orphan approved path must not enqueue a resume wake — "
        "the existing coroutine resumes via Event.set()"
    )

    # And the Event was signaled (we don't have a waiter here, but the
    # decision was stashed so a hypothetical waiter would see it).
    from musu_core.dispatch.approval import _approval_decisions
    assert _approval_decisions.get(approval_id) == "approved"

    # Cleanup so subsequent tests start with clean dicts.
    _approval_events.pop(approval_id, None)
    _approval_decisions.pop(approval_id, None)


# v19.F Phase B — counter increment assertions on the 3 branches.

def test_submit_approval_in_memory_path_increments_counter() -> None:
    """Non-orphan path (in-memory waiter registered) bumps
    approvals_resolved_in_memory by 1."""
    from musu_core.dispatch.approval import _approval_events, _approval_decisions
    from musu_core.dispatch.counters import (
        COUNTER_APPROVALS_RESOLVED_IN_MEMORY,
        read_counters,
    )

    db = Database(":memory:")
    _seed_run(db)
    approval_id = request_approval_sync(db, "r1", "ok?")
    assert approval_id in _approval_events  # waiter registered

    counters_before = read_counters(db)
    submit_approval(db, approval_id, "approved")
    counters_after = read_counters(db)

    assert (
        counters_after[COUNTER_APPROVALS_RESOLVED_IN_MEMORY]
        == counters_before[COUNTER_APPROVALS_RESOLVED_IN_MEMORY] + 1
    )
    # Orphan counters untouched.
    assert (
        counters_after["approvals_resolved_orphan_resume"]
        == counters_before["approvals_resolved_orphan_resume"]
    )
    assert (
        counters_after["approvals_declined_orphan"]
        == counters_before["approvals_declined_orphan"]
    )

    _approval_events.pop(approval_id, None)
    _approval_decisions.pop(approval_id, None)


def test_submit_approval_orphan_approved_increments_counter() -> None:
    """Orphan + approved path bumps approvals_resolved_orphan_resume."""
    from musu_core.dispatch.approval import _approval_events
    from musu_core.dispatch.counters import (
        COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME,
        read_counters,
    )

    db = Database(":memory:")
    _seed_run(db)
    approval_id = request_approval_sync(db, "r1", "ok?")
    # Simulate bridge restart: drop the waiter Event.
    _approval_events.pop(approval_id, None)

    counters_before = read_counters(db)
    result = submit_approval(db, approval_id, "approved")
    assert result.get("resumed") is True  # orphan branch taken
    counters_after = read_counters(db)

    assert (
        counters_after[COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME]
        == counters_before[COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME] + 1
    )
    assert (
        counters_after["approvals_resolved_in_memory"]
        == counters_before["approvals_resolved_in_memory"]
    )
    assert (
        counters_after["approvals_declined_orphan"]
        == counters_before["approvals_declined_orphan"]
    )


def test_submit_approval_orphan_declined_increments_counter() -> None:
    """Orphan + declined path bumps approvals_declined_orphan."""
    from musu_core.dispatch.approval import _approval_events
    from musu_core.dispatch.counters import (
        COUNTER_APPROVALS_DECLINED_ORPHAN,
        read_counters,
    )

    db = Database(":memory:")
    _seed_run(db)
    approval_id = request_approval_sync(db, "r1", "ok?")
    _approval_events.pop(approval_id, None)  # simulate bridge restart

    counters_before = read_counters(db)
    result = submit_approval(db, approval_id, "declined")
    assert result["resolved"] is True
    assert result.get("resumed") is not True  # declined doesn't resume
    counters_after = read_counters(db)

    assert (
        counters_after[COUNTER_APPROVALS_DECLINED_ORPHAN]
        == counters_before[COUNTER_APPROVALS_DECLINED_ORPHAN] + 1
    )
    assert (
        counters_after["approvals_resolved_in_memory"]
        == counters_before["approvals_resolved_in_memory"]
    )
    assert (
        counters_after["approvals_resolved_orphan_resume"]
        == counters_before["approvals_resolved_orphan_resume"]
    )
