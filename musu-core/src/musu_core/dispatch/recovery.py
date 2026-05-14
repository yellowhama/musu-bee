"""Bridge restart recovery for orphaned approvals (v19.D P1).

At bridge startup, sweep_orphaned_approvals walks the run_approvals
table for pending rows. Every pending row at process-start time is by
definition orphaned — the awaiting coroutine inside execute_wake
cannot survive a process restart. We log each one at INFO and return
the count.

We deliberately do NOT auto-cancel orphans at startup. The user's
in-flight approval card still appears in the dashboard, and clicking
yes/no goes through the orphan-resume path in submit_approval (which
enqueues a fresh wake on approved). Auto-cancelling at startup would
defeat that whole flow.

See contracts/orphan-resume.md and plan.md Decision 3 for rationale.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from musu_core.db import Database


def sweep_orphaned_approvals(
    db: "Database",
    *,
    logger: logging.Logger | None = None,
) -> int:
    """Log every pending approval at startup. Return the count.

    Does not mutate any rows. Designed to be called once from
    musu-bridge/server.py startup hook.
    """
    log = logger or logging.getLogger(__name__)
    rows = db.execute(
        "SELECT id, run_id, prompt, requested_at "
        "FROM run_approvals WHERE status='pending' "
        "ORDER BY requested_at ASC"
    )
    count = len(rows)
    if count == 0:
        log.info("startup approval sweep: 0 orphans")
    else:
        log.info(
            "startup approval sweep: %d orphan(s) pending — "
            "the user can still resolve them via the dashboard",
            count,
        )
        for row in rows:
            # Truncate prompt to keep log lines bounded.
            prompt_excerpt = (row["prompt"] or "")[:80]
            log.info(
                "  orphan approval id=%s run_id=%s requested_at=%s prompt=%r",
                row["id"], row["run_id"], row["requested_at"], prompt_excerpt,
            )
    return count
