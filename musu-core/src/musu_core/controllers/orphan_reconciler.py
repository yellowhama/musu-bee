"""OrphanApprovalReconciler — continuous form of sweep_orphaned_approvals.

The original sweep (dispatch/recovery.py:sweep_orphaned_approvals) is a
one-shot startup hook that logs every pending approval. This reconciler
is its continuous sibling: KindSource on run_approvals delivers each
pending row, the reconciler logs once per id (dedup via in-memory set).

Non-mutating by design — matches dispatch/recovery.py invariant. The
human still resolves orphans via the dashboard; the reconciler exists
purely so operators have a live signal during normal operation, not
only at bridge restart.

Coexistence with sweep_orphaned_approvals:
- Bridge startup still calls sweep_orphaned_approvals (one log line per
  orphan, then exits).
- ControllerManager starts AFTER startup sweep. Its KindSource initial
  cursor = MAX(updated_at) so historical orphans are NOT re-logged.
- New orphans (created after ControllerManager start) get one log line
  via this reconciler.
- Net effect: each orphan is logged at most twice — once at startup if
  it predates the manager, once when it's first emitted to the
  reconciler. The in-memory dedup set (bounded) prevents per-orphan
  log spam.
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

_DEDUP_CAP = 10_000  # bounded so long-lived processes don't leak
_DEDUP_TRIM_TO = 5_000


class OrphanApprovalReconciler(Reconciler):
    """Log each pending run_approval once."""

    def __init__(
        self, db: Any, logger: Optional[logging.Logger] = None
    ) -> None:
        self._db = db
        self._log = logger or logging.getLogger(__name__)
        # FIFO-ish dedup: insertion-ordered dict (Python 3.7+) keeps
        # eviction order deterministic.
        self._seen: dict[str, None] = {}

    @property
    def name(self) -> str:
        return "OrphanApprovalReconciler"

    async def reconcile(self, req: ReconcileRequest) -> ReconcileResult:
        if req.key in self._seen:
            return ReconcileResult()
        rows = await asyncio.to_thread(
            self._db.execute,
            "SELECT id, run_id, prompt, requested_at, status "
            "FROM run_approvals WHERE id=?",
            (req.key,),
        )
        if not rows:
            return ReconcileResult()
        row = rows[0]
        if row["status"] != "pending":
            return ReconcileResult()  # already resolved — not orphan anymore

        self._mark_seen(req.key)
        prompt_excerpt = (row["prompt"] or "")[:80]
        self._log.info(
            "orphan approval id=%s run_id=%s requested_at=%s prompt=%r",
            row["id"], row["run_id"], row["requested_at"], prompt_excerpt,
        )
        return ReconcileResult()

    def _mark_seen(self, key: str) -> None:
        self._seen[key] = None
        if len(self._seen) > _DEDUP_CAP:
            # Drop oldest half to keep memory bounded
            old_keys = list(self._seen.keys())[: len(self._seen) - _DEDUP_TRIM_TO]
            for k in old_keys:
                self._seen.pop(k, None)
