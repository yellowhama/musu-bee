"""Wake triggers — translate issue state changes into wake events.

These are NOT DB triggers (SQLite has them, but invisible side effects
make debugging hard). They are explicit functions the bridge route
handlers call after they mutate an issue. One trigger per business
reason; each one wraps `enqueue_wake`.

The functions never raise on `agent not found` cases — they return the
run_ids that were created (possibly empty) so callers can log
"@mention without matching agent" themselves.
"""

from __future__ import annotations

import re

from musu_core.db import Database
from musu_core.dispatch.wake import enqueue_wake

_MENTION_RE = re.compile(r"@([A-Za-z0-9_\-]+)")


def on_issue_assignee_changed(
    db: Database, issue_id: str, new_assignee_id: str | None
) -> str | None:
    """Fire `issue_assigned` wake when an issue gains an assignee.

    No-op when new_assignee_id is None (issue unassigned).
    """
    if not new_assignee_id:
        return None
    return enqueue_wake(
        db,
        agent_id=new_assignee_id,
        wake_reason="issue_assigned",
        issue_id=issue_id,
    )


def on_issue_comment_added(
    db: Database,
    issue_id: str,
    comment_id: str,
    body: str,
) -> list[str]:
    """Fire `issue_commented` wake for each @mention in the comment body.

    Returns the list of run_ids created (empty if no mention matched a
    known agent name). Name match is case-insensitive.
    """
    mentions = {m for m in _MENTION_RE.findall(body)}
    if not mentions:
        return []
    run_ids: list[str] = []
    for name in mentions:
        rows = db.execute(
            "SELECT id FROM agents WHERE LOWER(name)=LOWER(?)",
            (name,),
        )
        if not rows:
            continue
        run_ids.append(
            enqueue_wake(
                db,
                agent_id=rows[0]["id"],
                wake_reason="issue_commented",
                issue_id=issue_id,
                wake_payload={"comment_id": comment_id, "mention": name},
            )
        )
    return run_ids


def on_blockers_resolved(
    db: Database, issue_id: str
) -> str | None:
    """Fire `blockers_resolved` wake when an issue's last blocker clears.

    Targets the issue's current assignee. No-op when unassigned.
    """
    rows = db.execute(
        "SELECT assignee_id FROM issues WHERE id=?", (issue_id,)
    )
    if not rows:
        return None
    assignee = rows[0]["assignee_id"]
    if not assignee:
        return None
    return enqueue_wake(
        db,
        agent_id=assignee,
        wake_reason="blockers_resolved",
        issue_id=issue_id,
    )
