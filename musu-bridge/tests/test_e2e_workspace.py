"""E2E workspace tests: TaskWorkspace file creation and reading."""
from __future__ import annotations

from musu_core.task_workspace import TaskWorkspace


def test_full_workspace_lifecycle(tmp_path):
    """Create workspace → write all 3 handoff files → read them back."""
    ws = TaskWorkspace("task-e2e-001", root=str(tmp_path))
    ws.create()

    # CEO writes contract
    contract = {"task": "build login page", "acceptance_criteria": ["form renders", "validates email"]}
    ws.write_contract(contract)

    # Engineer writes output
    eng = {"files_changed": ["src/login.py"], "test_results": {"passed": 5, "failed": 0}, "commit_hash": "abc123", "summary": "done"}
    ws.write_engineer_output(eng)

    # QA writes feedback
    qa = {"pass": True, "scores": {"functionality": 9, "correctness": 8, "completeness": 9, "code_quality": 8}, "feedback": "good", "iteration": 1}
    ws.write_qa_feedback(qa)

    # Verify all files readable
    assert ws.read_contract() == contract
    assert ws.read_engineer_output() == eng
    assert ws.read_qa_feedback() == qa
    assert len(ws.list_files()) == 3


def test_workspace_missing_files_return_none(tmp_path):
    """Reading non-existent workspace files returns None."""
    ws = TaskWorkspace("task-e2e-002", root=str(tmp_path))
    ws.create()
    assert ws.read_contract() is None
    assert ws.read_engineer_output() is None
    assert ws.read_qa_feedback() is None
