"""CEO/subordinate routing — user → company → CEO → delegated subordinate.

A CEO is defined as `agents.role='ceo' AND reports_to IS NULL`, scoped to
one company. There can be at most one functioning CEO per company; if
multiple rows match we pick the oldest (deterministic across restarts).

This module only orchestrates DB rows + wakes. The actual LLM call that
turns "user message" into "delegate task to engineer" happens inside the
CEO agent's adapter when its wake executes — there is no Python-side LLM
call here.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from musu_core.db import Database
from musu_core.dispatch.wake import enqueue_wake


def find_ceo(db: Database, company_id: str) -> str | None:
    """Return the agent_id of the company's CEO, or None if none exists.

    CEO = role 'ceo' AND reports_to IS NULL, oldest-first if multiple
    match. The oldest-first tiebreaker keeps the choice stable across
    restarts; we don't pick "current best CEO" by any other heuristic.
    """
    rows = db.execute(
        "SELECT id FROM agents "
        "WHERE company_id=? AND LOWER(role)='ceo' AND reports_to IS NULL "
        "ORDER BY created_at ASC LIMIT 1",
        (company_id,),
    )
    return rows[0]["id"] if rows else None


def route_user_message_to_ceo(
    db: Database,
    company_id: str,
    user_id: str,
    body: str,
) -> dict[str, Any]:
    """Translate a user-typed message into (issue + comment + wake) for the CEO.

    Returns a dict with at minimum:
      {"run_id", "issue_id", "session_id", "ceo_id"}

    or {"error": "..."} on failure (no CEO, empty body, etc.). The wake row
    is created in `queued` state — the caller (e.g. bridge route) is
    responsible for kicking off `execute_wake` via a BackgroundTask.
    """
    body = (body or "").strip()
    if not body:
        return {"error": "empty message body"}

    ceo_id = find_ceo(db, company_id)
    if not ceo_id:
        return {"error": f"company {company_id} has no CEO"}

    # Find or create an active session for this (user, agent).
    rows = db.execute(
        "SELECT id FROM agent_sessions "
        "WHERE agent_id=? AND user_id=? AND ended_at IS NULL "
        "ORDER BY started_at DESC LIMIT 1",
        (ceo_id, user_id),
    )
    if rows:
        session_id = rows[0]["id"]
    else:
        session_id = uuid.uuid4().hex
        db.execute(
            "INSERT INTO agent_sessions (id, agent_id, user_id) VALUES (?, ?, ?)",
            (session_id, ceo_id, user_id),
        )

    # New issue capturing the user's request.
    issue_id = uuid.uuid4().hex
    title = body[:80] + ("…" if len(body) > 80 else "")
    db.execute(
        "INSERT INTO issues (id, company_id, title, description, assignee_id) "
        "VALUES (?, ?, ?, ?, ?)",
        (issue_id, company_id, title, body, ceo_id),
    )

    # Record the user's message as the opening comment.
    comment_id = uuid.uuid4().hex
    db.execute(
        "INSERT INTO issue_comments (id, issue_id, author_id, author_kind, body) "
        "VALUES (?, ?, ?, 'user', ?)",
        (comment_id, issue_id, None, body),
    )

    # Bump session counters.
    db.execute(
        "UPDATE agent_sessions "
        "SET last_message_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
        "    message_count=message_count+1 "
        "WHERE id=?",
        (session_id,),
    )

    # Enqueue the CEO's wake. parent_run_id is NULL (top of a fresh chain).
    run_id = enqueue_wake(
        db,
        agent_id=ceo_id,
        wake_reason="user_message",
        issue_id=issue_id,
        wake_payload={
            "session_id": session_id,
            "user_id": user_id,
            "body": body,
            "comment_id": comment_id,
        },
    )

    return {
        "run_id": run_id,
        "issue_id": issue_id,
        "session_id": session_id,
        "ceo_id": ceo_id,
    }


def delegate_to_subordinate(
    db: Database,
    parent_run_id: str,
    subordinate_role: str,
    sub_task_body: str,
) -> dict[str, Any]:
    """Have a running agent delegate a sub-task to one of its subordinates.

    Subordinate selection rule: pick the oldest agent whose `reports_to`
    equals the parent run's agent AND whose `company_id` matches (so a
    CEO cannot accidentally borrow another company's engineer), AND
    whose `role` matches case-insensitively.

    Returns {"run_id", "sub_issue_id", "subordinate_agent_id"} on success,
    or {"error": "..."} when no matching subordinate exists.

    Raises CycleDetected (via enqueue_wake) if the chain already contains
    the chosen subordinate.
    """
    sub_task_body = (sub_task_body or "").strip()
    if not sub_task_body:
        return {"error": "empty sub-task body"}
    subordinate_role = (subordinate_role or "").strip()
    if not subordinate_role:
        return {"error": "empty subordinate role"}

    # Find the parent run's agent + its company.
    parent_rows = db.execute(
        "SELECT hr.agent_id, a.company_id, hr.issue_id "
        "FROM heartbeat_runs hr JOIN agents a ON a.id=hr.agent_id "
        "WHERE hr.id=?",
        (parent_run_id,),
    )
    if not parent_rows:
        return {"error": f"parent run {parent_run_id} not found"}
    delegator_agent_id = parent_rows[0]["agent_id"]
    company_id = parent_rows[0]["company_id"]
    parent_issue_id = parent_rows[0]["issue_id"]

    # Find the matching subordinate.
    sub_rows = db.execute(
        "SELECT id FROM agents "
        "WHERE reports_to=? AND company_id=? AND LOWER(role)=LOWER(?) "
        "ORDER BY created_at ASC LIMIT 1",
        (delegator_agent_id, company_id, subordinate_role),
    )
    if not sub_rows:
        return {
            "error": f"no subordinate of {delegator_agent_id} "
                     f"in company {company_id} with role {subordinate_role!r}"
        }
    subordinate_agent_id = sub_rows[0]["id"]

    # Create the sub-issue. We store parent linkage in meta JSON since the
    # issues table doesn't have a parent_id column.
    sub_issue_id = uuid.uuid4().hex
    title = sub_task_body[:80] + ("…" if len(sub_task_body) > 80 else "")
    meta = {"parent_issue_id": parent_issue_id} if parent_issue_id else {}
    db.execute(
        "INSERT INTO issues (id, company_id, title, description, assignee_id) "
        "VALUES (?, ?, ?, ?, ?)",
        (sub_issue_id, company_id, title, sub_task_body, subordinate_agent_id),
    )
    # issues table has no `meta` column in current schema; the parent
    # linkage instead lives in the wake_payload below. (The doc claim of
    # "issues.meta" was aspirational — schema didn't carry that field.)

    # Enqueue. Cycle/depth checks happen inside enqueue_wake.
    run_id = enqueue_wake(
        db,
        agent_id=subordinate_agent_id,
        wake_reason="delegated",
        issue_id=sub_issue_id,
        parent_run_id=parent_run_id,
        wake_payload={
            "body": sub_task_body,
            "delegator_agent_id": delegator_agent_id,
            "parent_issue_id": parent_issue_id,
            "parent_run_id": parent_run_id,
        },
    )

    return {
        "run_id": run_id,
        "sub_issue_id": sub_issue_id,
        "subordinate_agent_id": subordinate_agent_id,
    }
