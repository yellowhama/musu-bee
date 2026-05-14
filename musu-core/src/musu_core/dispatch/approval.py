"""Run-level user approvals (v19.C P2).

An adapter that needs sign-off mid-run calls

    decision = await ctx.extra["request_approval"]("About to delete 14 files. Proceed?")

The callable closes over the db + run_id and:
  1. Inserts a pending row in run_approvals.
  2. Flips the parent heartbeat_run to status='waiting_approval'.
  3. Emits an `approval_request` event.
  4. Awaits a per-approval asyncio.Event.
  5. Returns "approved" | "declined" once submit_approval flips the row.

submit_approval is the bridge-side counterpart. It updates the row, sets
the asyncio.Event so the waiting callable wakes up, and emits the
`approval_resolved` event. On decline it also transitions the parent run
to `cancelled` and emits the `cancelled` event.

Idempotency (FR-007): a second submit_approval for the same row returns
{"already_resolved": True, "decision": <first>} without mutating state.

Restart durability: this module assumes the bridge process stays alive
for the duration of an approval. If the bridge dies mid-await, the
pending row remains; recovery is out of scope for v19.C (the user can
manually retry or cancel via SQL).
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Literal

from musu_core.db import Database
from musu_core.dispatch.wake import record_event


# Per-approval wake-up events. Keyed by approval_id; the awaiting
# request_approval callable awaits one of these, and submit_approval
# sets it.
_approval_events: dict[str, asyncio.Event] = {}

# Stores the resolved decision per approval_id so the awaiting coroutine
# can read what was decided after its event fires.
_approval_decisions: dict[str, Literal["approved", "declined"]] = {}


def request_approval_sync(db: Database, run_id: str, prompt: str) -> str:
    """Create the pending row + transition run + emit event.

    Returns the new approval_id. Caller is the async request_approval
    callable that then awaits on the matching asyncio.Event.

    Constraint (in-code invariant, not schema): a given run_id has at
    most one pending row at a time. We don't re-check here because
    execute_wake only injects request_approval while status='running';
    once we flip to waiting_approval, the adapter is blocked so it
    can't call this a second time.
    """
    approval_id = uuid.uuid4().hex
    db.execute(
        "INSERT INTO run_approvals (id, run_id, prompt) VALUES (?, ?, ?)",
        (approval_id, run_id, prompt),
    )
    db.execute(
        "UPDATE heartbeat_runs SET status='waiting_approval' WHERE id=?",
        (run_id,),
    )
    record_event(
        db,
        run_id,
        "approval_request",
        {"approval_id": approval_id, "prompt": prompt},
    )
    _approval_events.setdefault(approval_id, asyncio.Event())
    return approval_id


async def wait_for_decision(approval_id: str) -> Literal["approved", "declined"]:
    """Block until submit_approval signals this approval_id."""
    ev = _approval_events.setdefault(approval_id, asyncio.Event())
    await ev.wait()
    decision = _approval_decisions.get(approval_id)
    # Cleanup so the dicts don't grow unboundedly.
    _approval_events.pop(approval_id, None)
    _approval_decisions.pop(approval_id, None)
    if decision is None:
        # Shouldn't happen — submit_approval always writes before set().
        # Treat as declined to fail safe.
        return "declined"
    return decision


def submit_approval(
    db: Database,
    approval_id: str,
    decision: Literal["approved", "declined"],
) -> dict[str, Any]:
    """Resolve a pending approval. Idempotent per FR-007.

    Returns one of:
      - {"resolved": True, "decision": <decision>, "run_id": <id>}
        on first resolution
      - {"already_resolved": True, "decision": <first_decision>}
        on duplicate
      - {"error": "not found"} if no such approval
      - {"error": "run not in waiting_approval", "status": <state>}
        if the parent run isn't in the expected state

    On declined: also transitions the parent run to 'cancelled' and
    emits a `cancelled` event.
    On either: emits an `approval_resolved` event and sets the
    asyncio.Event so the waiting adapter resumes.
    """
    rows = db.execute(
        "SELECT id, run_id, status FROM run_approvals WHERE id=?",
        (approval_id,),
    )
    if not rows:
        return {"error": "not found"}
    row = rows[0]
    existing = row["status"]
    if existing != "pending":
        return {"already_resolved": True, "decision": existing}

    run_id = row["run_id"]
    run_rows = db.execute(
        "SELECT status FROM heartbeat_runs WHERE id=?",
        (run_id,),
    )
    if not run_rows or run_rows[0]["status"] != "waiting_approval":
        return {
            "error": "run not in waiting_approval",
            "status": run_rows[0]["status"] if run_rows else "missing",
        }

    # Atomic update of the approval row gated on still-pending status.
    updated = db.execute(
        "UPDATE run_approvals "
        "SET status=?, responded_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE id=? AND status='pending' "
        "RETURNING id",
        (decision, approval_id),
    )
    if not updated:
        # Concurrent resolution beat us — re-read.
        rows2 = db.execute(
            "SELECT status FROM run_approvals WHERE id=?",
            (approval_id,),
        )
        return {"already_resolved": True, "decision": rows2[0]["status"]}

    if decision == "approved":
        # Flip run back to running. The waiting coroutine will resume
        # the adapter inside the same execute_wake call.
        db.execute(
            "UPDATE heartbeat_runs SET status='running' WHERE id=?",
            (run_id,),
        )
    else:
        # decision == "declined" — cancel the run.
        db.execute(
            "UPDATE heartbeat_runs "
            "SET status='cancelled', "
            "    ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE id=?",
            (run_id,),
        )

    # Stash the decision BEFORE setting the Event so the waiter sees it.
    _approval_decisions[approval_id] = decision
    # Only signal an existing Event. Do NOT setdefault — that would
    # create a phantom Event for a late duplicate POST after the waiter
    # has already popped, and nothing would ever clean it up. The
    # waiter is the unique creator (via request_approval_sync) and the
    # unique consumer (via wait_for_decision).
    ev = _approval_events.get(approval_id)
    if ev is not None:
        ev.set()

    record_event(
        db,
        run_id,
        "approval_resolved",
        {"approval_id": approval_id, "decision": decision},
    )
    if decision == "declined":
        record_event(
            db,
            run_id,
            "cancelled",
            {"reason": "approval_declined"},
        )

    return {"resolved": True, "decision": decision, "run_id": run_id}


def load_pending_for_run(db: Database, run_id: str) -> dict[str, Any] | None:
    """Return the single pending approval for run_id, or None."""
    rows = db.execute(
        "SELECT id, prompt, requested_at FROM run_approvals "
        "WHERE run_id=? AND status='pending' "
        "ORDER BY requested_at ASC LIMIT 1",
        (run_id,),
    )
    if not rows:
        return None
    return {
        "id": rows[0]["id"],
        "prompt": rows[0]["prompt"],
        "requested_at": rows[0]["requested_at"],
    }


def make_request_approval_callable(db: Database, run_id: str):
    """Build the closure that execute_wake injects into ctx.extra.

    The closure is `async def request_approval(prompt) -> str` — it
    inserts the pending row and awaits the per-approval event. Pulled
    into its own helper so tests can construct one against a mock DB
    without going through execute_wake.
    """

    async def _request_approval(prompt: str) -> str:
        approval_id = request_approval_sync(db, run_id, prompt)
        return await wait_for_decision(approval_id)

    return _request_approval
