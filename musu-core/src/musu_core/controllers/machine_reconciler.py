"""MachineReconciler — Machine-axis reconciler (frame v9 §4).

Watches: `machines` rows.
Reconcile pass:
    1. Load machine row by req.key.
    2. Inspect status transition:
        - 'online'   → nothing to do; scheduler picks up new requests.
        - 'draining' → nothing to do; in-flight runs finish; new
                       binds blocked by filter (capacity-based, not
                       status-based — filter handles this).
        - 'offline'  → reclaim. For every resource_request bound to
                       this machine with status IN ('bound','running'):
                           set status='pending'
                           clear bound_machine_id, bound_at
                       So the scheduler can re-bind to another
                       machine. Idempotent: a re-run with already-
                       pending rows is a no-op.

The reclaim UPDATE is atomic (single statement) and guarded by status.
We log the count of reclaimed requests for observability.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)

logger = logging.getLogger(__name__)


class MachineReconciler(Reconciler):
    """One instance per ControllerManager; keyed reconciles by machine id."""

    def __init__(self, db: Any) -> None:
        self._db = db

    @property
    def name(self) -> str:
        return "MachineReconciler"

    async def reconcile(self, req: ReconcileRequest) -> ReconcileResult:
        rows = await asyncio.to_thread(
            self._db.execute,
            "SELECT id, status FROM machines WHERE id=?",
            (req.key,),
        )
        if not rows:
            return ReconcileResult()  # gone — forget
        machine = rows[0]
        status = machine["status"]

        if status == "online":
            return ReconcileResult()
        if status == "draining":
            # No-op: filter.py already excludes draining machines
            # from new binds; running requests are allowed to finish.
            return ReconcileResult()
        if status == "offline":
            reclaimed = await asyncio.to_thread(
                _reclaim_for_offline_machine, self._db, machine["id"],
            )
            if reclaimed:
                logger.info(
                    "Machine[%s]: reclaimed %d requests (offline)",
                    machine["id"], reclaimed,
                )
            return ReconcileResult()
        # Unknown status — treat as no-op, log for visibility.
        logger.warning(
            "Machine[%s]: unknown status=%r — skipped",
            machine["id"], status,
        )
        return ReconcileResult()


def _reclaim_for_offline_machine(db: Any, machine_id: str) -> int:
    """Atomically requeue all bound/running requests on a now-offline machine.

    Returns the number of rows reclaimed. Uses cursor.rowcount for
    accurate per-statement count (same pattern as scheduler.binder
    after the v21.C audit).
    """
    conn = db._get_conn()
    with db._lock:
        cur = conn.cursor()
        try:
            cur.execute(
                "UPDATE resource_requests "
                "SET status='pending', "
                "    bound_machine_id=NULL, "
                "    bound_at=NULL, "
                "    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "
                "WHERE bound_machine_id=? "
                "  AND status IN ('bound','running')",
                (machine_id,),
            )
            changed = cur.rowcount
            conn.commit()
            return changed
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
