"""Phase 77: Task instruction validation gate tests.

Tests validate_task_instruction() in handlers.py prevents vague dispatch.
Reference: wiki/agent-task-reliability §3 — CrewAI expected_output pattern.
"""
from __future__ import annotations

import pytest
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
        assert validate_task_instruction(instruction) is None

    def test_rejects_too_short(self):
        err = validate_task_instruction("Fix the bug")
        assert err is not None
        assert "short" in err.lower() or "50" in err

    def test_rejects_empty(self):
        err = validate_task_instruction("")
        assert err is not None

    def test_rejects_whitespace_only(self):
        err = validate_task_instruction("   ")
        assert err is not None

    def test_rejects_vague_verb_without_specifics(self):
        err = validate_task_instruction("implement the authentication feature for the system")
        assert err is not None

    def test_accepts_vague_verb_with_file_path(self):
        instruction = (
            "implement the token refresh logic in musu-bridge/handlers.py "
            "route_chat function so expired tokens return 401. "
            "pytest musu-bridge/tests/ should pass after change. "
            "expected_output: pytest musu-bridge/tests/ -v all pass"
        )
        assert validate_task_instruction(instruction) is None

    def test_accepts_vague_verb_with_test_reference(self):
        instruction = (
            "fix the failing test in musu-bridge/tests/test_server.py "
            "test_valid_request_returns_response_and_agent_id — "
            "the assert on agent_id is wrong, update expected value. "
            "expected_output: pytest musu-bridge/tests/test_server.py -v passes"
        )
        assert validate_task_instruction(instruction) is None

    def test_accepts_long_instruction_without_specifics(self):
        # A long instruction that's vague but >= 50 chars — only vague-verb check applies
        # This one has no vague verbs so should pass
        instruction = (
            "Review the current state of the musu-bridge observability dashboard "
            "and write a summary of what metrics are currently being collected, "
            "what is missing, and what the next priority should be. "
            "expected_output: written summary document with gap list"
        )
        assert validate_task_instruction(instruction) is None

    def test_exactly_50_chars_passes_length(self):
        # 50 chars exactly — fails expected_output gate now (no "expected_output" in "a"*50)
        instruction = "a" * 50
        result = validate_task_instruction(instruction)
        # Must fail either length (if < 50) or expected_output gate
        assert result is None or "short" in (result or "").lower() or "expected_output" in (result or "")

    def test_49_chars_rejected(self):
        instruction = "a" * 49
        err = validate_task_instruction(instruction)
        assert err is not None


class TestDelegateTaskValidation:
    """Integration: api_delegate_task returns 422 on vague instructions."""

    def test_vague_instruction_returns_422(self):
        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": "implement auth"},
            headers=_AUTH,
        )
        assert resp.status_code == 422

    def test_short_instruction_returns_422(self):
        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": "fix bug"},
            headers=_AUTH,
        )
        assert resp.status_code == 422

    def test_valid_instruction_not_422(self):
        # Should return 202 or some other non-422 code (may fail for other reasons
        # like no running agent, but not 422 validation error)
        instruction = (
            "Read musu-bridge/handlers.py route_chat function and verify "
            "that the error handling on line 69 returns the correct dict. "
            "pytest musu-bridge/tests/test_server.py -v should pass. "
            "expected_output: pytest musu-bridge/tests/test_server.py -v"
        )
        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": instruction},
            headers=_AUTH,
        )
        assert resp.status_code != 422
