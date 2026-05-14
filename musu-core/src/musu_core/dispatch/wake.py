"""Wake/dispatch — heartbeat run lifecycle.

A wake is the event that turns a state change (issue assigned, comment with
@mention, blockers cleared) into an `agent runs now` execution. Each wake
creates one `heartbeat_runs` row that walks the lifecycle queued → running →
{completed, failed, waiting_approval, cancelled}, with per-run events
appended to `heartbeat_run_events`.

The dispatcher does not subscribe to DB triggers; the bridge endpoints that
mutate issues call `triggers.on_*` helpers which call `enqueue_wake`. This
keeps the side-effects explicit and grep-able.

Cycle detection lives here, not in the schema: when a wake has a
parent_run_id (CEO → subordinate), we walk the parent chain and refuse if
the new agent is already in the ancestor list, or if depth exceeds
MAX_PARENT_DEPTH.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)

from musu_core.db import Database

# Max CEO→subordinate→sub-subordinate chain. Prevents runaway wake
# fan-out; if a legitimate workflow needs more, raise this in config.
MAX_PARENT_DEPTH = 5


# ---------------------------------------------------------------------------
# Stream wake-up registry (v19.C P1 — token streaming)
# ---------------------------------------------------------------------------
#
# When a wake's SSE stream is open, the bridge registers an asyncio.Event
# here keyed by run_id. record_event signals the event after every write so
# the stream loop sees new rows without polling. Cross-process callers
# (none today) would fall back to the existing time-based poll inside the
# SSE loop — the Event signal is a best-effort accelerator, not a
# correctness requirement.

_stream_events: dict[str, asyncio.Event] = {}


def register_stream_event(run_id: str) -> asyncio.Event:
    """Create-or-fetch the asyncio.Event for run_id. Caller must unregister."""
    ev = _stream_events.get(run_id)
    if ev is None:
        ev = asyncio.Event()
        _stream_events[run_id] = ev
    return ev


def unregister_stream_event(run_id: str) -> None:
    """Remove the Event for run_id. Safe to call multiple times."""
    _stream_events.pop(run_id, None)


def _signal_stream_event(run_id: str) -> None:
    """Wake the SSE loop for run_id if anyone is listening."""
    ev = _stream_events.get(run_id)
    if ev is not None:
        ev.set()


class CycleDetected(RuntimeError):
    """Raised when a new wake would create a cycle or exceed MAX_PARENT_DEPTH."""


def enqueue_wake(
    db: Database,
    agent_id: str,
    wake_reason: str,
    *,
    issue_id: str | None = None,
    parent_run_id: str | None = None,
    wake_payload: dict[str, Any] | None = None,
    skip_cycle_check: bool = False,
) -> str:
    """Insert a queued heartbeat_runs row and return its run_id.

    Raises CycleDetected if parent_run_id leads to a chain that already
    contains agent_id, or exceeds MAX_PARENT_DEPTH.

    skip_cycle_check: opt-in bypass for legitimate same-agent resume
    cases (v19.D approval-resume wake). Even with this set, we still
    refuse to chain MORE than one resume — if the parent run is itself
    an `approval_resumed` run, we re-engage full cycle detection. This
    bounds resume chains to depth 1: original → resumed (allowed), but
    not original → resumed → resumed-again (blocked).
    """
    if parent_run_id:
        if skip_cycle_check:
            # Allow same-agent re-entry once, but block resume-of-resume
            # chains. Look at the parent's wake_reason: if it's already
            # a resume, fall back to full cycle detection (which will
            # refuse because agent_id repeats in the chain).
            parent_rows = db.execute(
                "SELECT wake_reason FROM heartbeat_runs WHERE id=?",
                (parent_run_id,),
            )
            if parent_rows and parent_rows[0]["wake_reason"] == "approval_resumed":
                # Parent is itself a resume — don't allow another layer.
                _assert_no_cycle(db, parent_run_id, agent_id)
            # else: parent is the original, same-agent reentry is fine.
        else:
            _assert_no_cycle(db, parent_run_id, agent_id)
    run_id = uuid.uuid4().hex
    payload_str = json.dumps(wake_payload or {})
    db.execute(
        "INSERT INTO heartbeat_runs "
        "(id, agent_id, issue_id, parent_run_id, wake_reason, wake_payload) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (run_id, agent_id, issue_id, parent_run_id, wake_reason, payload_str),
    )
    return run_id


def record_event(
    db: Database,
    run_id: str,
    event_type: str,
    payload: dict[str, Any] | None = None,
) -> str:
    """Append one row to heartbeat_run_events and return its id.

    After the INSERT commits, signal the per-run asyncio.Event so any
    open SSE stream for run_id wakes up immediately instead of waiting
    for its next poll. The signal is best-effort — if no listener is
    registered the call is a no-op, and cross-process listeners still
    see the row via the bounded poll inside the SSE loop.
    """
    event_id = uuid.uuid4().hex
    db.execute(
        "INSERT INTO heartbeat_run_events (id, run_id, event_type, payload) "
        "VALUES (?, ?, ?, ?)",
        (event_id, run_id, event_type, json.dumps(payload or {})),
    )
    _signal_stream_event(run_id)
    return event_id


async def execute_wake(db: Database, router: Any, run_id: str) -> None:
    """Move queued run → running, dispatch via router, finalize on result.

    The status transition queued → running is gated by a conditional UPDATE
    (TOCTOU-safe — see memory `pattern-toctou-atomic-update`). If the row is
    already non-queued (another worker grabbed it), this returns silently.

    Router dispatch is awaited; on success we mark completed with the
    summary, on failure we mark failed with the error. Any uncaught
    exception is also recorded as failed so the row never gets stranded in
    `running`.
    """
    from musu_core.router import RouteRequest  # noqa: PLC0415 — avoid circular
    from musu_core.dispatch.approval import (  # noqa: PLC0415 — avoid circular
        make_request_approval_callable,
    )

    # Atomic claim. UPDATE...RETURNING needs SQLite ≥ 3.35; we ship 3.50+.
    claimed = db.execute(
        "UPDATE heartbeat_runs "
        "SET status='running', "
        "    started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
        "WHERE id=? AND status='queued' "
        "RETURNING agent_id, wake_payload, issue_id",
        (run_id,),
    )
    if not claimed:
        # Already claimed elsewhere or already completed/failed.
        return
    row = claimed[0]
    agent_id = row["agent_id"]
    payload = json.loads(row["wake_payload"] or "{}")
    prompt = payload.get("prompt") or _derive_prompt(db, row["issue_id"])

    # v19.C P3: if the agent's home_node names a remote mesh peer, forward
    # the wake there instead of running the adapter locally. Empty/NULL
    # home_node or self_name keeps the existing single-machine path.
    #
    # NOTE: emit wake_started AFTER the home_node check so a forwarded
    # wake doesn't double-emit (the peer emits its own wake_started which
    # we relay as forwarded_event). Local path emits exactly one; forward
    # path emits a distinct wake_forwarded so UIs can render either.
    home_node = _resolve_home_node(db, agent_id)
    if home_node and not _is_local_node(home_node):
        record_event(
            db, run_id, "wake_forwarded",
            {"agent_id": agent_id, "home_node": home_node},
        )
        from musu_core.dispatch.forward import forward_wake_to_peer  # noqa: PLC0415
        await forward_wake_to_peer(
            db,
            run_id=run_id,
            agent_id=agent_id,
            home_node=home_node,
            wake_payload={
                **payload,
                "issue_id": row["issue_id"],
                "wake_reason": "forwarded",
            },
        )
        return

    record_event(db, run_id, "wake_started", {"agent_id": agent_id})

    def _on_delta(text: str) -> None:
        # FR-001: each adapter delta becomes one heartbeat_run_events row.
        # FR-003 (callback exception safety) is handled inside
        # BaseAdapter.execute_streaming, not here — we want a record_event
        # exception (e.g. DB locked) to surface, not get swallowed.
        if not text:
            return
        record_event(db, run_id, "message_delta", {"text": text})

    # v19.C P2: inject the per-run request_approval callable into
    # ctx.extra. Adapters that don't need approval simply never look it
    # up; those that do call `await ctx.extra["request_approval"](prompt)`
    # and the await blocks until submit_approval resolves the pending row.
    request_approval = make_request_approval_callable(db, run_id)

    try:
        result = await router.route_streaming(
            RouteRequest(
                agent_id=agent_id,
                prompt=prompt,
                task_id=row["issue_id"],
                extra={"request_approval": request_approval},
            ),
            _on_delta,
        )
        # If submit_approval('declined') already set status='cancelled',
        # don't overwrite it. The adapter still returned a result (likely
        # a polite-refusal summary) but the run's terminal state is
        # already decided.
        if result.success:
            db.execute(
                "UPDATE heartbeat_runs "
                "SET status='completed', summary=?, "
                "    ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
                "WHERE id=? AND status='running'",
                (result.summary, run_id),
            )
            # Only emit 'completed' if we actually transitioned.
            check = db.execute(
                "SELECT status FROM heartbeat_runs WHERE id=?", (run_id,)
            )
            if check and check[0]["status"] == "completed":
                record_event(
                    db, run_id, "completed",
                    {"summary": result.summary[:500]},
                )
        else:
            err = result.error or "unknown error"
            db.execute(
                "UPDATE heartbeat_runs "
                "SET status='failed', error=?, "
                "    ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
                "WHERE id=? AND status='running'",
                (err, run_id),
            )
            check = db.execute(
                "SELECT status FROM heartbeat_runs WHERE id=?", (run_id,)
            )
            if check and check[0]["status"] == "failed":
                record_event(db, run_id, "failed", {"error": err})
    except Exception as exc:  # noqa: BLE001 — final safety net
        err = f"dispatch exception: {exc!r}"
        db.execute(
            "UPDATE heartbeat_runs "
            "SET status='failed', error=?, "
            "    ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE id=? AND status='running'",
            (err, run_id),
        )
        check = db.execute(
            "SELECT status FROM heartbeat_runs WHERE id=?", (run_id,)
        )
        if check and check[0]["status"] == "failed":
            record_event(db, run_id, "failed", {"error": err})


def _resolve_home_node(db: Database, agent_id: str) -> str | None:
    """Return agents.home_node for agent_id, or None if NULL/empty.

    Empty string normalizes to None so a row with home_node='' behaves
    identically to home_node IS NULL (both mean "run wherever the
    dispatcher is").
    """
    rows = db.execute(
        "SELECT home_node FROM agents WHERE id=?", (agent_id,)
    )
    if not rows:
        return None
    val = rows[0]["home_node"]
    if not val:
        return None
    return val


def _is_local_node(node_name: str) -> bool:
    """True iff node_name matches the mesh self_name in nodes.toml.

    If nodes.toml is missing or doesn't declare a self, treat every
    node as remote — the forward attempt will fail with "unknown
    home_node" rather than silently no-op. Callers can short-circuit
    earlier if that turns out to be too strict.
    """
    try:
        from musu_core.mesh import get_registry  # noqa: PLC0415
        registry = get_registry()
        return registry.is_local(node_name)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "mesh registry unavailable while checking is_local(%r): %r",
            node_name, exc,
        )
        return False


def _assert_no_cycle(
    db: Database, parent_run_id: str, new_agent_id: str
) -> None:
    """Walk parent_run_id chain. Raise CycleDetected on repeat or overflow.

    `depth` counts how many ancestors we have walked (the immediate parent
    is depth 1). The new wake becomes depth = ancestors + 1. If the parent
    chain already has MAX_PARENT_DEPTH ancestors and the new wake would be
    one more, that is an overflow.
    """
    current: str | None = parent_run_id
    chain: list[str] = []
    while current is not None:
        rows = db.execute(
            "SELECT agent_id, parent_run_id FROM heartbeat_runs WHERE id=?",
            (current,),
        )
        if not rows:
            return
        ancestor_agent = rows[0]["agent_id"]
        chain.append(ancestor_agent)
        if ancestor_agent == new_agent_id:
            raise CycleDetected(
                f"agent {new_agent_id} already in wake chain at depth "
                f"{len(chain)}: {' → '.join(chain)}"
            )
        # The new wake will sit one below the ancestors we have walked so
        # far. If that puts it past MAX_PARENT_DEPTH, refuse.
        if len(chain) >= MAX_PARENT_DEPTH:
            raise CycleDetected(
                f"wake chain would exceed MAX_PARENT_DEPTH={MAX_PARENT_DEPTH}: "
                f"{' → '.join(chain)}"
            )
        current = rows[0]["parent_run_id"]


def _derive_prompt(db: Database, issue_id: str | None) -> str:
    """Build a default prompt from the linked issue when no prompt is provided."""
    if not issue_id:
        return "Wake event — no explicit task."
    rows = db.execute(
        "SELECT title, description FROM issues WHERE id=?", (issue_id,)
    )
    if not rows:
        return f"Wake event — issue {issue_id} not found."
    return f"Issue: {rows[0]['title']}\n\n{rows[0]['description']}"
