"""Bridge-restart recovery for orphaned approvals (v19.D P1).

Pins:
- sweep_orphaned_approvals logs every pending row + returns the count,
  does not mutate state.
- submit_approval on an orphan-approved enqueues a resume heartbeat_run
  with the four-key wake_payload + records approval_resume_enqueued event.
- submit_approval on an orphan-declined cancels the run, no resume.
- Idempotency: a second submit_approval after a resume already enqueued
  returns already_resolved without making a second resume row.
"""

from __future__ import annotations

import json
import logging

import pytest

from musu_core.db import Database
from musu_core.dispatch.approval import (
    _approval_decisions,
    _approval_events,
    submit_approval,
)
from musu_core.dispatch.recovery import sweep_orphaned_approvals


def _seed(db: Database, run_id: str = "r1") -> str:
    """Create agent + waiting_approval run + pending approval. Return approval_id."""
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, wake_payload, status) "
        "VALUES (?, 'a1', 'user_message', ?, 'waiting_approval')",
        (run_id, json.dumps({"prompt": "do the thing"})),
    )
    db.execute(
        "INSERT INTO run_approvals (id, run_id, prompt) "
        "VALUES (?, ?, ?)",
        ("ap1", run_id, "delete 14 files?"),
    )
    return "ap1"


def _clear_inprocess() -> None:
    """Simulate bridge restart by emptying the in-process dicts."""
    _approval_events.clear()
    _approval_decisions.clear()


def test_sweep_logs_each_pending(caplog) -> None:
    db = Database(":memory:")
    _seed(db, "r1")
    _clear_inprocess()

    with caplog.at_level(logging.INFO):
        count = sweep_orphaned_approvals(db)

    assert count == 1
    # Log emitted with run_id + approval_id.
    log_text = "\n".join(r.getMessage() for r in caplog.records)
    assert "ap1" in log_text
    assert "r1" in log_text
    # No mutation: status still pending.
    rows = db.execute("SELECT status FROM run_approvals WHERE id='ap1'")
    assert rows[0]["status"] == "pending"


def test_sweep_zero_orphans_still_logs_count() -> None:
    db = Database(":memory:")
    _clear_inprocess()
    # No approval rows at all.
    with pytest.MonkeyPatch.context() as mp:  # noqa: F841 — just for scope
        count = sweep_orphaned_approvals(db)
    assert count == 0


def test_orphan_approved_enqueues_resume_wake() -> None:
    db = Database(":memory:")
    approval_id = _seed(db, "r1")
    _clear_inprocess()

    res = submit_approval(db, approval_id, "approved")

    # Return shape carries resumed marker + resume_run_id.
    assert res["resolved"] is True
    assert res["decision"] == "approved"
    assert res.get("resumed") is True
    resume_run_id = res.get("resume_run_id")
    assert resume_run_id and resume_run_id != "r1"

    # New heartbeat_run row exists with the right linkage.
    rows = db.execute(
        "SELECT agent_id, wake_reason, parent_run_id, wake_payload "
        "FROM heartbeat_runs WHERE id=?",
        (resume_run_id,),
    )
    assert rows, "resume run row not created"
    r = rows[0]
    assert r["agent_id"] == "a1"
    assert r["wake_reason"] == "approval_resumed"
    assert r["parent_run_id"] == "r1"

    payload = json.loads(r["wake_payload"])
    assert payload["is_approval_resume"] is True
    assert payload["approval_decision"] == "approved"
    assert payload["approval_prompt"] == "delete 14 files?"
    assert payload["prompt"] == "do the thing"

    # approval_resume_enqueued event landed on the ORIGINAL run's timeline.
    events = db.execute(
        "SELECT event_type, payload FROM heartbeat_run_events "
        "WHERE run_id='r1' ORDER BY created_at"
    )
    types = [e["event_type"] for e in events]
    assert "approval_resume_enqueued" in types
    for e in events:
        if e["event_type"] == "approval_resume_enqueued":
            p = json.loads(e["payload"])
            assert p["approval_id"] == approval_id
            assert p["resume_run_id"] == resume_run_id
            assert p["original_run_id"] == "r1"


def test_orphan_declined_cancels_only_no_resume() -> None:
    db = Database(":memory:")
    approval_id = _seed(db, "r1")
    _clear_inprocess()

    res = submit_approval(db, approval_id, "declined")

    assert res["resolved"] is True
    assert res["decision"] == "declined"
    # No resume markers.
    assert "resumed" not in res or res.get("resumed") is not True

    # Original run is cancelled.
    rows = db.execute("SELECT status FROM heartbeat_runs WHERE id='r1'")
    assert rows[0]["status"] == "cancelled"

    # No resume row created.
    rows = db.execute(
        "SELECT id FROM heartbeat_runs WHERE wake_reason='approval_resumed'"
    )
    assert not rows, "declined should not create a resume run"


def test_orphan_double_submit_idempotent() -> None:
    """FR-006: second POST after the first already enqueued resume is a no-op."""
    db = Database(":memory:")
    approval_id = _seed(db, "r1")
    _clear_inprocess()

    first = submit_approval(db, approval_id, "approved")
    assert first.get("resumed") is True
    first_resume_id = first["resume_run_id"]

    # Second submit. By v19.C semantics the row is already non-pending
    # so the early-exit in submit_approval returns already_resolved.
    second = submit_approval(db, approval_id, "approved")
    assert second.get("already_resolved") is True
    assert second["decision"] == "approved"

    # Exactly one resume run total.
    rows = db.execute(
        "SELECT id FROM heartbeat_runs WHERE wake_reason='approval_resumed'"
    )
    assert len(rows) == 1
    assert rows[0]["id"] == first_resume_id
