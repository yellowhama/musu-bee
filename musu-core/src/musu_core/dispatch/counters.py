"""Operational counters for dispatch observability (v19.F Phase B).

Backed by the v31 `dispatch_counters` table. Each counter is a named
INTEGER incremented via a single-statement UPDATE — SQLite serializes
concurrent writes via its write lock, so two threads racing the same
increment both succeed and the row ends at +2 (not +1), matching the
v19.E record_event single-statement atomicity pattern.

Counter names live as module constants so a typo at a call site fails
at import time, not in production.
"""

from __future__ import annotations

from musu_core.db import Database

COUNTER_APPROVALS_RESOLVED_IN_MEMORY = "approvals_resolved_in_memory"
COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME = "approvals_resolved_orphan_resume"
COUNTER_APPROVALS_DECLINED_ORPHAN = "approvals_declined_orphan"

ALL_COUNTER_NAMES: tuple[str, ...] = (
    COUNTER_APPROVALS_RESOLVED_IN_MEMORY,
    COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME,
    COUNTER_APPROVALS_DECLINED_ORPHAN,
)


def increment_counter(db: Database, name: str) -> None:
    db.execute(
        "UPDATE dispatch_counters SET value = value + 1 WHERE name = ?",
        (name,),
    )


def read_counters(db: Database) -> dict[str, int]:
    rows = db.execute("SELECT name, value FROM dispatch_counters")
    return {r["name"]: r["value"] for r in rows}
