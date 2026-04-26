"""Phase 77/91: Task instruction validation gate tests.

Tests validate_task_instruction() in handlers.py prevents vague dispatch.
Updated for Phase 91: two-argument form that raises HTTPException(400).
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from handlers import validate_task_instruction
from server import app

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)


class TestValidateTaskInstructionUnit:
    def test_returns_none_for_valid_instruction(self):
        instruction = (
            "Add error handling to musu-bridge/handlers.py route_chat function "
            "when backend.create_route_execution raises an exception. "
            "Test: pytest musu-bridge/tests/test_server.py -v should pass. "
            "expected_output: pytest musu-bridge/tests/test_server.py -v"
        )
        validate_task_instruction(instruction, expected_output="pytest musu-bridge/tests/test_server.py -v")

    def test_rejects_too_short(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction("Fix the bug", expected_output="tests pass")
        assert exc_info.value.status_code == 400
        assert "short" in exc_info.value.detail.lower() or "50" in exc_info.value.detail

    def test_rejects_empty(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction("", expected_output="tests pass")
        assert exc_info.value.status_code == 400

    def test_rejects_whitespace_only(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction("   ", expected_output="tests pass")
        assert exc_info.value.status_code == 400

    def test_rejects_vague_verb_without_specifics(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction("implement the authentication feature for the system", expected_output=None)
        assert exc_info.value.status_code == 400

    def test_accepts_vague_verb_with_file_path(self):
        instruction = (
            "implement the token refresh logic in musu-bridge/handlers.py "
            "route_chat function so expired tokens return 401. "
            "pytest musu-bridge/tests/ should pass after change."
        )
        validate_task_instruction(instruction, expected_output="pytest musu-bridge/tests/ -v all pass")

    def test_accepts_vague_verb_with_test_reference(self):
        instruction = (
            "fix the failing test in musu-bridge/tests/test_server.py "
            "test_valid_request_returns_response_and_agent_id — "
            "the assert on agent_id is wrong, update expected value."
        )
        validate_task_instruction(instruction, expected_output="pytest musu-bridge/tests/test_server.py -v passes")

    def test_accepts_long_instruction_without_specifics(self):
        instruction = (
            "Review the current state of the musu-bridge observability dashboard "
            "and write a summary of what metrics are currently being collected, "
            "what is missing, and what the next priority should be."
        )
        validate_task_instruction(instruction, expected_output="written summary document with gap list")

    def test_exactly_50_chars_passes_length(self):
        instruction = "a" * 50
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction(instruction, expected_output=None)
        assert exc_info.value.status_code == 400
        assert "expected_output" in exc_info.value.detail.lower()

    def test_49_chars_rejected(self):
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction("a" * 49, expected_output="tests pass")
        assert exc_info.value.status_code == 400
        assert "short" in exc_info.value.detail.lower() or "50" in exc_info.value.detail


class TestDelegateTaskValidation:
    """Integration: api_delegate_task returns 400 on invalid instructions."""

    def test_vague_instruction_returns_400(self):
        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": "implement auth"},
            headers=_AUTH,
        )
        assert resp.status_code == 400

    def test_short_instruction_returns_400(self):
        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": "fix bug"},
            headers=_AUTH,
        )
        assert resp.status_code == 400

    def test_valid_instruction_not_400(self):
        instruction = (
            "Read musu-bridge/handlers.py route_chat function and verify "
            "that the error handling on line 69 returns the correct dict. "
            "pytest musu-bridge/tests/test_server.py -v should pass."
        )
        resp = _client.post(
            "/api/tasks/delegate",
            json={
                "channel": "engineer",
                "text": instruction,
                "expected_output": "pytest musu-bridge/tests/test_server.py -v passes",
            },
            headers=_AUTH,
        )
        assert resp.status_code != 400
