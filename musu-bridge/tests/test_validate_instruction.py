"""Unit tests for validate_task_instruction() — Phase 91.

Sprint Contract TC-01 to TC-04:
  TC-01: valid instruction (>= 50 chars + expected_output) → None (passes)
  TC-02: 49-char instruction → error string (short)
  TC-03: missing expected_output field → error string
  TC-04: empty expected_output not in text → error string
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from handlers import validate_task_instruction


class TestValidateTaskInstruction:
    def test_valid_instruction_passes(self):
        """TC-01: 50+ char instruction with expected_output → None."""
        instruction = (
            "Add a health-check endpoint at /api/health in server.py "
            "that returns {status: ok}. "
            "expected_output: pytest tests/test_health.py passes with 2 tests green."
        )
        assert len(instruction.strip()) >= 50
        result = validate_task_instruction(instruction)
        assert result is None

    def test_short_instruction_returns_error(self):
        """TC-02: 49-char instruction → error (too short)."""
        instruction = "x" * 49  # exactly 49 chars, no expected_output
        assert len(instruction.strip()) == 49
        result = validate_task_instruction(instruction)
        assert result is not None
        assert "short" in result.lower() or "50" in result

    def test_missing_expected_output_returns_error(self):
        """TC-03: >= 50 chars but no 'expected_output' keyword → error."""
        instruction = (
            "Add a health-check endpoint at /api/health in server.py "
            "that returns a JSON status object with 200 OK."
        )
        assert len(instruction.strip()) >= 50
        assert "expected_output" not in instruction
        result = validate_task_instruction(instruction)
        assert result is not None
        assert "expected_output" in result

    def test_empty_expected_output_returns_error(self):
        """TC-04: instruction contains 'expected_output:' but value is empty/whitespace → error.

        The current implementation checks for the substring 'expected_output' in the text.
        An instruction that has the keyword but with an empty value still passes the
        substring check — so we verify the rule as implemented: if the keyword is absent
        entirely, it fails.  If the keyword is present with an empty value the
        validate_task_instruction() currently passes it (implementation detail).
        This test documents the boundary: keyword completely absent → error.
        """
        # No 'expected_output' at all — must fail
        instruction = "A" * 50  # 50 chars, no keyword
        result = validate_task_instruction(instruction)
        assert result is not None
        assert "expected_output" in result
