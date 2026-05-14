"""try_bind — atomic row-level UPDATE binding a request to a machine.

Pattern from v19.F.2 approval lock: conditional UPDATE + rowcount
check. Two concurrent schedulers binding the same request → one
wins, one returns False.
"""
from __future__ import annotations

from typing import Any


def try_bind(db: Any, request_id: str, machine_id: str) -> bool:
    """Bind a pending request to a machine atomically.

    Returns True if this caller did the bind, False if another caller
    already bound it (race) or the request is no longer pending.

    Uses cursor.rowcount after a conditional UPDATE — that is the
    SQLite-documented atomic answer for "did my WHERE-guarded UPDATE
    actually touch a row". total_changes is process-global and can
    be perturbed by other writers; rowcount is per-statement.
    """
    conn = db._get_conn()
    with db._lock:
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE resource_requests "
                "SET bound_machine_id=?, "
                "    bound_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), "
                "    status='bound', "
                "    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
                "WHERE id=? AND bound_machine_id IS NULL AND status='pending'",
                (machine_id, request_id),
            )
            changed = cur.rowcount
            conn.commit()
            return changed > 0
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()


def pending_per_machine(db: Any) -> dict[str, int]:
    """Aggregate pending count grouped by bound_machine_id.

    Used by score.py for queue-depth penalty. Counts requests with
    status in ('bound','running') — not 'pending' (those aren't yet
    on any machine).
    """
    rows = db.execute(
        "SELECT bound_machine_id, COUNT(*) AS n "
        "FROM resource_requests "
        "WHERE status IN ('bound','running') AND bound_machine_id IS NOT NULL "
        "GROUP BY bound_machine_id"
    )
    return {r["bound_machine_id"]: int(r["n"]) for r in rows}
