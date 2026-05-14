"""QALoopReconciler — wrap the existing qa_loop.QALoop as a Reconciler.

Pure adapter: qa_loop.py is NOT modified. This reconciler watches
`tasks` rows that carry `meta.sprint_contract` and `meta.qa_loop=true`,
invokes QALoop.run, and persists the outcome back into tasks.meta.

For eligibility:
    tasks.status == 'in_progress' AND
    tasks.meta contains sprint_contract AND
    tasks.meta.qa_loop is truthy (opt-in flag, so existing tasks
                                  without this flag are unaffected)

Result outcomes (written to tasks.meta.qa_loop_outcome):
    {passed: bool, iterations: int, escalated: bool}

This wrapper is what 21.E will use when CEOReconciler routes QA work.
v21.A only ships the wrapper; no callers are added in 21.A. All
existing qa_loop call sites in qa_loop tests + musu-bridge stay
identical and pass unchanged.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)
from musu_core.qa_loop import QALoop
from musu_core.sprint_contract import SprintContract

logger = logging.getLogger(__name__)


class QALoopReconciler(Reconciler):
    """Reconcile tasks via the engineer→QA loop."""

    def __init__(self, qa_loop: QALoop, db: Any) -> None:
        self._qa = qa_loop
        self._db = db

    @property
    def name(self) -> str:
        return "QALoopReconciler"

    async def reconcile(self, req: ReconcileRequest) -> ReconcileResult:
        rows = await asyncio.to_thread(
            self._db.execute,
            "SELECT id, status, meta FROM tasks WHERE id=?",
            (req.key,),
        )
        if not rows:
            return ReconcileResult()  # row gone — forget
        row = rows[0]
        if row["status"] != "in_progress":
            return ReconcileResult()  # not eligible
        try:
            meta = json.loads(row["meta"] or "{}")
        except (ValueError, TypeError) as exc:
            return ReconcileResult(error=exc)
        if not meta.get("qa_loop"):
            return ReconcileResult()  # opt-in flag absent
        contract_dict = meta.get("sprint_contract")
        if not contract_dict:
            return ReconcileResult()  # nothing to evaluate

        try:
            contract = SprintContract.from_dict(contract_dict)
        except (KeyError, TypeError, ValueError) as exc:
            return ReconcileResult(error=exc)

        try:
            result = await self._qa.run(
                task_prompt=meta.get("prompt", ""),
                contract=contract,
                task_id=req.key,
                engineer_session_id=meta.get("engineer_session_id"),
            )
        except Exception as exc:  # noqa: BLE001 — return as error for retry
            logger.exception("QALoopReconciler[%s] failed", req.key)
            return ReconcileResult(error=exc)

        new_meta = {
            **meta,
            "qa_loop_outcome": {
                "passed": bool(result.passed),
                "iterations": int(result.iterations_used),
                "escalated": bool(result.escalated),
            },
        }
        # Intentional: do NOT bump tasks.updated_at here. The default
        # ON UPDATE trigger would re-enqueue this same task via the
        # KindSource cursor, creating a self-triggered infinite loop.
        # The reconciler's own write should not look like an external
        # change worth re-reconciling.
        await asyncio.to_thread(
            self._db.execute,
            "UPDATE tasks SET meta=? WHERE id=?",
            (json.dumps(new_meta), req.key),
        )
        return ReconcileResult()
