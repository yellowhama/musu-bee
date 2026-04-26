"""Unit tests for validate_task_instruction() — Phase 91 (updated).

Tests the two-argument form:
  validate_task_instruction(instruction: str, expected_output: str | None) → None
Raises HTTPException(400) on invalid input.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).parent.parent))

from handlers import validate_task_instruction


_VALID_INSTRUCTION = (
    "Add a health-check endpoint at /api/health in server.py "
    "that returns {status: ok}."
)


class TestValidateTaskInstruction:
    def test_valid_instruction_passes(self):
        """50+ char instruction with non-empty expected_output → no exception."""
        validate_task_instruction(_VALID_INSTRUCTION, expected_output="pytest tests/test_health.py passes")

    def test_short_instruction_raises(self):
        """49-char instruction → HTTPException 400."""
        instruction = "x" * 49
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction(instruction, expected_output="some output")
        assert exc_info.value.status_code == 400
        assert "50" in exc_info.value.detail or "short" in exc_info.value.detail.lower()

    def test_missing_expected_output_raises(self):
        """50+ chars but expected_output=None → HTTPException 400."""
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction(_VALID_INSTRUCTION, expected_output=None)
        assert exc_info.value.status_code == 400
        assert "expected_output" in exc_info.value.detail.lower()

    def test_empty_expected_output_raises(self):
        """50+ chars but expected_output='' → HTTPException 400."""
        with pytest.raises(HTTPException) as exc_info:
            validate_task_instruction(_VALID_INSTRUCTION, expected_output="")
        assert exc_info.value.status_code == 400
        assert "expected_output" in exc_info.value.detail.lower()
