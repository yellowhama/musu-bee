"""Tests for controllers.orphan_reconciler — continuous orphan logging."""
from __future__ import annotations

import logging
import uuid

import pytest

from musu_core.controllers.orphan_reconciler import OrphanApprovalReconciler
from musu_core.controllers.reconciler import ReconcileRequest


def _insert_approval(db, approval_id, run_id=None, status="pending"):
    if run_id is None:
        # Set up FK chain: agent -> heartbeat_run -> approval
        run_id = f"run-{approval_id}"
        agent_id = f"agent-{approval_id}"
        db.execute(
            "INSERT OR IGNORE INTO agents(id, name) VALUES (?, ?)",
            (agent_id, "test-agent"),
        )
        db.execute(
            "INSERT INTO heartbeat_runs(id, agent_id, wake_reason) "
            "VALUES (?, ?, 'test')",
            (run_id, agent_id),
        )
    db.execute(
        "INSERT INTO run_approvals(id, run_id, prompt, status) VALUES (?, ?, ?, ?)",
        (approval_id, run_id, "test prompt", status),
    )


async def test_reconcile_pending_logs_once(backend, caplog):
    aid = str(uuid.uuid4())
    _insert_approval(backend, aid)
    rec = OrphanApprovalReconciler(backend)
    req = ReconcileRequest(table="run_approvals", key=aid)

    with caplog.at_level(logging.INFO, logger="musu_core.controllers.orphan_reconciler"):
        result = await rec.reconcile(req)
    assert result.failed is False

    matching = [r for r in caplog.records if aid in r.getMessage()]
    assert len(matching) == 1, f"expected 1 log, got {len(matching)}: {[r.getMessage() for r in caplog.records]}"


async def test_reconcile_resolved_status_no_log(backend, caplog):
    aid = str(uuid.uuid4())
    _insert_approval(backend, aid, status="approved")
    rec = OrphanApprovalReconciler(backend)
    req = ReconcileRequest(table="run_approvals", key=aid)

    with caplog.at_level(logging.INFO, logger="musu_core.controllers.orphan_reconciler"):
        await rec.reconcile(req)

    matching = [r for r in caplog.records if aid in r.getMessage()]
    assert matching == [], "resolved approvals must not be logged"


async def test_reconcile_dedup_prevents_repeat_log(backend, caplog):
    aid = str(uuid.uuid4())
    _insert_approval(backend, aid)
    rec = OrphanApprovalReconciler(backend)
    req = ReconcileRequest(table="run_approvals", key=aid)

    with caplog.at_level(logging.INFO, logger="musu_core.controllers.orphan_reconciler"):
        await rec.reconcile(req)
        await rec.reconcile(req)
        await rec.reconcile(req)

    matching = [r for r in caplog.records if aid in r.getMessage()]
    assert len(matching) == 1, "dedup should suppress repeat logs"


async def test_reconcile_missing_row_no_error(backend):
    rec = OrphanApprovalReconciler(backend)
    req = ReconcileRequest(table="run_approvals", key="nonexistent")
    result = await rec.reconcile(req)
    assert not result.failed
