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
import uuid
from typing import Any

from musu_core.db import Database

# Max CEO→subordinate→sub-subordinate chain. Prevents runaway wake
# fan-out; if a legitimate workflow needs more, raise this in config.
MAX_PARENT_DEPTH = 5


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
) -> str:
    """Insert a queued heartbeat_runs row and return its run_id.

    Raises CycleDetected if parent_run_id leads to a chain that already
    contains agent_id, or exceeds MAX_PARENT_DEPTH.
    """
    if parent_run_id:
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
    """Append one row to heartbeat_run_events and return its id."""
    event_id = uuid.uuid4().hex
    db.execute(
        "INSERT INTO heartbeat_run_events (id, run_id, event_type, payload) "
        "VALUES (?, ?, ?, ?)",
        (event_id, run_id, event_type, json.dumps(payload or {})),
    )
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

    record_event(db, run_id, "wake_started", {"agent_id": agent_id})

    try:
        result = await router.route(
            RouteRequest(
                agent_id=agent_id,
                prompt=prompt,
                task_id=row["issue_id"],
            )
        )
        if result.success:
            db.execute(
                "UPDATE heartbeat_runs "
                "SET status='completed', summary=?, "
                "    ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
                "WHERE id=?",
                (result.summary, run_id),
            )
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
                "WHERE id=?",
                (err, run_id),
            )
            record_event(db, run_id, "failed", {"error": err})
    except Exception as exc:  # noqa: BLE001 — final safety net
        err = f"dispatch exception: {exc!r}"
        db.execute(
            "UPDATE heartbeat_runs "
            "SET status='failed', error=?, "
            "    ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
            "WHERE id=?",
            (err, run_id),
        )
        record_event(db, run_id, "failed", {"error": err})


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
