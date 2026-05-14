"""Tests for controllers.qa_loop_reconciler — wraps QALoop."""
from __future__ import annotations

import json
import uuid
from unittest.mock import AsyncMock, MagicMock

from musu_core.controllers.qa_loop_reconciler import QALoopReconciler
from musu_core.controllers.reconciler import ReconcileRequest
from musu_core.qa_loop import QALoopResult


def _insert_task(db, task_id, status="in_progress", meta=None):
    db.execute(
        "INSERT INTO tasks(id, title, status, meta) VALUES (?, ?, ?, ?)",
        (task_id, "test", status, json.dumps(meta or {})),
    )


def _get_meta(db, task_id) -> dict:
    rows = db.execute("SELECT meta FROM tasks WHERE id=?", (task_id,))
    return json.loads(rows[0]["meta"])


async def test_eligible_task_invokes_qa_loop(backend):
    tid = str(uuid.uuid4())
    meta = {
        "qa_loop": True,
        "prompt": "build feature X",
        "sprint_contract": {
            "task": "build X",
            "scope": ["X"],
            "acceptance_criteria": ["X works"],
        },
    }
    _insert_task(backend, tid, meta=meta)

    fake_qa = MagicMock()
    fake_qa.run = AsyncMock(
        return_value=QALoopResult(
            passed=True, iterations_used=2, final_score=None,
        )
    )

    rec = QALoopReconciler(fake_qa, backend)
    result = await rec.reconcile(
        ReconcileRequest(table="tasks", key=tid)
    )
    assert not result.failed
    fake_qa.run.assert_called_once()
    persisted = _get_meta(backend, tid)
    assert persisted["qa_loop_outcome"] == {
        "passed": True, "iterations": 2, "escalated": False,
    }


async def test_task_not_in_progress_is_noop(backend):
    tid = str(uuid.uuid4())
    _insert_task(backend, tid, status="todo", meta={"qa_loop": True})

    fake_qa = MagicMock()
    fake_qa.run = AsyncMock()
    rec = QALoopReconciler(fake_qa, backend)
    result = await rec.reconcile(
        ReconcileRequest(table="tasks", key=tid)
    )
    assert not result.failed
    fake_qa.run.assert_not_called()


async def test_task_without_qa_loop_flag_is_noop(backend):
    tid = str(uuid.uuid4())
    _insert_task(backend, tid, meta={"sprint_contract": {"task": "x", "acceptance_criteria": []}})

    fake_qa = MagicMock()
    fake_qa.run = AsyncMock()
    rec = QALoopReconciler(fake_qa, backend)
    result = await rec.reconcile(
        ReconcileRequest(table="tasks", key=tid)
    )
    assert not result.failed
    fake_qa.run.assert_not_called()


async def test_missing_task_is_noop(backend):
    fake_qa = MagicMock()
    fake_qa.run = AsyncMock()
    rec = QALoopReconciler(fake_qa, backend)
    result = await rec.reconcile(
        ReconcileRequest(table="tasks", key="missing-task")
    )
    assert not result.failed
    fake_qa.run.assert_not_called()


async def test_qa_loop_exception_returns_error_result(backend):
    tid = str(uuid.uuid4())
    meta = {
        "qa_loop": True,
        "prompt": "x",
        "sprint_contract": {
            "task": "x", "scope": [], "acceptance_criteria": [],
        },
    }
    _insert_task(backend, tid, meta=meta)
    fake_qa = MagicMock()
    fake_qa.run = AsyncMock(side_effect=RuntimeError("router down"))
    rec = QALoopReconciler(fake_qa, backend)
    result = await rec.reconcile(
        ReconcileRequest(table="tasks", key=tid)
    )
    assert result.failed
    assert isinstance(result.error, RuntimeError)
