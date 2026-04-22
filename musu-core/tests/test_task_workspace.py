"""Tests for TaskWorkspace file-based agent communication."""
from __future__ import annotations

import json
from pathlib import Path

from musu_core.task_workspace import TaskWorkspace


def test_create_workspace(tmp_path):
    ws = TaskWorkspace("task-001", root=str(tmp_path))
    result = ws.create()
    assert result == tmp_path / "task-001"
    assert result.is_dir()


def test_create_idempotent(tmp_path):
    ws = TaskWorkspace("task-001", root=str(tmp_path))
    ws.create()
    ws.create()  # should not raise
    assert ws.path.is_dir()


def test_write_and_read_contract(tmp_path):
    ws = TaskWorkspace("task-002", root=str(tmp_path))
    ws.create()
    contract = {"task": "build feature", "scope": "module A", "acceptance_criteria": ["test passes"]}
    ws.write_contract(contract)
    read = ws.read_contract()
    assert read == contract


def test_write_and_read_engineer_output(tmp_path):
    ws = TaskWorkspace("task-003", root=str(tmp_path))
    ws.create()
    output = {
        "files_changed": ["src/foo.py"],
        "assumptions": [],
        "blockers": [],
        "test_results": {"passed": 5, "failed": 0},
        "commit_hash": "abc1234",
        "summary": "done",
    }
    ws.write_engineer_output(output)
    read = ws.read_engineer_output()
    assert read == output


def test_write_and_read_qa_feedback(tmp_path):
    ws = TaskWorkspace("task-004", root=str(tmp_path))
    ws.create()
    feedback = {
        "pass": True,
        "scores": {"functionality": 9, "correctness": 8, "completeness": 9, "code_quality": 8},
        "feedback": "good work",
        "failing_criteria": [],
        "suggestions": [],
        "iteration": 1,
    }
    ws.write_qa_feedback(feedback)
    read = ws.read_qa_feedback()
    assert read == feedback


def test_read_missing_returns_none(tmp_path):
    ws = TaskWorkspace("task-005", root=str(tmp_path))
    ws.create()
    assert ws.read_contract() is None
    assert ws.read_engineer_output() is None
    assert ws.read_qa_feedback() is None


def test_exists(tmp_path):
    ws = TaskWorkspace("task-006", root=str(tmp_path))
    assert not ws.exists()
    ws.create()
    assert ws.exists()


def test_list_files(tmp_path):
    ws = TaskWorkspace("task-007", root=str(tmp_path))
    ws.create()
    assert ws.list_files() == []
    ws.write_contract({"task": "test"})
    ws.write_engineer_output({"summary": "done"})
    files = ws.list_files()
    assert "sprint_contract.json" in files
    assert "engineer_output.json" in files


def test_atomic_write_survives_content(tmp_path):
    """Verify the file contains valid JSON after write."""
    ws = TaskWorkspace("task-008", root=str(tmp_path))
    ws.create()
    data = {"key": "value", "unicode": "한글 테스트"}
    ws.write_contract(data)
    raw = (ws.path / "sprint_contract.json").read_text(encoding="utf-8")
    parsed = json.loads(raw)
    assert parsed["unicode"] == "한글 테스트"
