"""SchedulerReconciler — the actual scheduler loop.

Watches: resource_requests where status='pending'
Per reconcile:
    1. Load request
    2. Load capacities (joined with machine status)
    3. Filter → score → top candidate
    4. try_bind atomically
    5. On bind, notify the bound machine via WatchDispatcher
    6. On no candidate, requeue with backoff

If a pending request can't be matched right now, it stays pending and
the source re-emits on the next poll. We also requeue_after_ms=2000
so the workqueue gives us a deterministic retry cadence.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)
from musu_core.controllers.watch import WatchDispatcher
from musu_core.scheduler.binder import pending_per_machine, try_bind
from musu_core.scheduler.capacity import load_all_capacities
from musu_core.scheduler.filter import filter_machines
from musu_core.scheduler.request import ResourceRequest
from musu_core.scheduler.score import score_machines

logger = logging.getLogger(__name__)


class SchedulerReconciler(Reconciler):
    """Single instance per ControllerManager."""

    def __init__(
        self,
        db: Any,
        watch_dispatcher: Optional[WatchDispatcher] = None,
    ) -> None:
        self._db = db
        self._dispatcher = watch_dispatcher

    @property
    def name(self) -> str:
        return "SchedulerReconciler"

    async def reconcile(self, req: ReconcileRequest) -> ReconcileResult:
        # Load request row
        rows = await asyncio.to_thread(
            self._db.execute,
            "SELECT * FROM resource_requests WHERE id=?",
            (req.key,),
        )
        if not rows:
            return ReconcileResult()  # gone, forget
        row = rows[0]
        if row["status"] != "pending":
            return ReconcileResult()  # already bound / completed / cancelled

        try:
            request = ResourceRequest.from_db_row(row)
        except (ValueError, KeyError, TypeError) as exc:
            return ReconcileResult(error=exc)

        capacities = await asyncio.to_thread(load_all_capacities, self._db)
        pending = await asyncio.to_thread(pending_per_machine, self._db)

        candidates = filter_machines(capacities, request)
        if not candidates:
            logger.debug(
                "scheduler[%s]: no candidate machines, requeue", req.key
            )
            return ReconcileResult(requeue_after_ms=2000)

        scored = score_machines(candidates, request, pending_per_machine=pending)
        target = scored[0][0]

        bound = await asyncio.to_thread(
            try_bind, self._db, request.id, target.machine_id
        )
        if not bound:
            # Another scheduler raced us, or the row changed underneath.
            # Either way, this request is no longer pending; nothing to do.
            return ReconcileResult()

        logger.info(
            "scheduler[%s]: bound to machine=%s score=%.1f",
            request.id, target.machine_id, scored[0][1],
        )
        if self._dispatcher is not None:
            # Wake the machine's controller (21.E will subscribe).
            self._dispatcher.notify(
                "resource_requests", request.id, "update"
            )
        return ReconcileResult()
