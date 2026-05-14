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

Restart durability (v19.D): if the bridge dies mid-await, the awaiting
coroutine is gone but the DB rows persist. When the user later submits
yes/no for that approval, submit_approval detects the absence of the
waiter Event in _approval_events and:
  - On approved → calls enqueue_resume_wake to spawn a fresh
    heartbeat_run with wake_reason='approval_resumed' that re-invokes
    the adapter with the decision in wake_payload.
  - On declined → the existing decline path already cancelled the run,
    no resume needed.
See contracts/orphan-resume.md (specs/002-dispatch-durability/) for
the full algorithm.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Literal

from musu_core.db import Database
from musu_core.dispatch.wake import enqueue_wake, record_event


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
    # CRITICAL ORDERING: register the in-process Event BEFORE emitting
    # the approval_request event. The dashboard's SSE stream may flush
    # the approval_request the instant it lands; if a user POST arrives
    # before _approval_events.setdefault runs, submit_approval would
    # mis-classify the run as orphan and enqueue a duplicate resume
    # wake while the original adapter coroutine hangs forever waiting
    # for an Event that will never get registered.
    _approval_events.setdefault(approval_id, asyncio.Event())
    record_event(
        db,
        run_id,
        "approval_request",
        {"approval_id": approval_id, "prompt": prompt},
    )
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


def enqueue_resume_wake(
    db: Database,
    original_run_id: str,
    approval_id: str,
) -> str:
    """Spawn a new heartbeat_run that resumes the original after orphaned approval.

    Called by submit_approval when the in-process waiter Event is gone
    (bridge restarted between request_approval_sync and the user's
    response) AND the decision is "approved". Declined orphans don't
    resume — the cancelled status set in submit_approval is terminal.

    Reads the original run's wake_payload (for the prompt fallback) and
    the approval row (for the request prompt text). Builds the four-key
    wake_payload per contracts/orphan-resume.md and calls enqueue_wake
    with parent_run_id pointing at the original.

    Returns the new (resume) run_id. Caller dispatches it via
    BackgroundTasks (same pattern as initial wake creation).
    """
    # Fetch the original run's wake_payload for the prompt fallback.
    orig_rows = db.execute(
        "SELECT agent_id, wake_payload, issue_id FROM heartbeat_runs WHERE id=?",
        (original_run_id,),
    )
    if not orig_rows:
        raise ValueError(f"original run {original_run_id} not found")
    orig = orig_rows[0]
    try:
        orig_payload = json.loads(orig["wake_payload"] or "{}")
    except json.JSONDecodeError:
        orig_payload = {}

    # Fetch the approval prompt text.
    appr_rows = db.execute(
        "SELECT prompt FROM run_approvals WHERE id=?",
        (approval_id,),
    )
    if not appr_rows:
        raise ValueError(f"approval {approval_id} not found")
    approval_prompt = appr_rows[0]["prompt"]

    resume_payload = {
        "prompt": orig_payload.get("prompt", ""),
        "approval_decision": "approved",
        "approval_prompt": approval_prompt,
        "is_approval_resume": True,
    }
    # Carry forward issue_id if the original had one so the resume can
    # link back via the same issue thread.
    if orig["issue_id"]:
        # enqueue_wake takes issue_id as a separate kwarg, but keep it in
        # payload too for adapter introspection consistency.
        resume_payload.setdefault("issue_id", orig["issue_id"])

    resume_run_id = enqueue_wake(
        db,
        agent_id=orig["agent_id"],
        wake_reason="approval_resumed",
        issue_id=orig["issue_id"],
        parent_run_id=original_run_id,
        wake_payload=resume_payload,
        skip_cycle_check=True,  # same agent intentionally — see kwarg docstring
    )
    return resume_run_id


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

    # v19.D P1: orphan check. The dict's absence means the awaiting
    # coroutine inside execute_wake is gone — either bridge restarted
    # since the request_approval_sync call, or the coroutine was
    # otherwise destroyed. The DB rows above are already updated; the
    # remaining question is whether to (a) signal the dead Event (a
    # no-op masquerading as success) or (b) enqueue a resume wake.
    # For 'approved' we do (b). For 'declined' we do nothing (the
    # cancelled status already set above is terminal).
    ev = _approval_events.get(approval_id)
    is_orphan = ev is None

    if is_orphan and decision == "approved":
        # Spawn a fresh heartbeat_run that re-invokes the adapter with
        # the decision in wake_payload. The bridge endpoint that called
        # us will dispatch the new run via BackgroundTasks.
        try:
            resume_run_id = enqueue_resume_wake(db, run_id, approval_id)
        except Exception as exc:  # noqa: BLE001 — surface any enqueue failure
            record_event(
                db,
                run_id,
                "approval_resolved",
                {"approval_id": approval_id, "decision": decision},
            )
            return {
                "resolved": True,
                "decision": decision,
                "run_id": run_id,
                "resume_error": f"failed to enqueue resume wake: {exc!r}",
            }
        record_event(
            db,
            run_id,
            "approval_resume_enqueued",
            {
                "approval_id": approval_id,
                "resume_run_id": resume_run_id,
                "original_run_id": run_id,
            },
        )
        record_event(
            db,
            run_id,
            "approval_resolved",
            {"approval_id": approval_id, "decision": decision},
        )
        return {
            "resolved": True,
            "decision": decision,
            "run_id": run_id,
            "resumed": True,
            "resume_run_id": resume_run_id,
        }

    # Non-orphan path (v19.C behavior) or orphan-declined (no resume).
    if not is_orphan:
        # Stash the decision BEFORE setting the Event so the waiter sees it.
        _approval_decisions[approval_id] = decision
        # Only signal an existing Event. Do NOT setdefault — that would
        # create a phantom Event for a late duplicate POST after the
        # waiter has already popped, and nothing would ever clean it up.
        # The waiter is the unique creator (via request_approval_sync)
        # and the unique consumer (via wait_for_decision).
        ev.set()  # type: ignore[union-attr] — guarded by is_orphan above

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
