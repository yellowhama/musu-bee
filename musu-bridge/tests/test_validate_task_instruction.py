"""Phase 91: validate_task_instruction — expected_output gate tests."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from handlers import validate_task_instruction


_SHORT = "Fix the bug"

_LONG_NO_EXPECTED = (
    "Add error handling to musu-bridge/handlers.py route_chat function "
    "when backend.create_route_execution raises an exception."
)

_VALID = (
    "Add error handling to musu-bridge/handlers.py route_chat function "
    "when backend.create_route_execution raises an exception. "
    "expected_output: pytest musu-bridge/tests/test_server.py -v passes with no errors."
)


def test_short_instruction_rejected():
    err = validate_task_instruction(_SHORT)
    assert err is not None
    assert "50" in err or "short" in err.lower()


def test_missing_expected_output_rejected():
    err = validate_task_instruction(_LONG_NO_EXPECTED)
    assert err is not None
    assert "expected_output" in err.lower()


def test_valid_instruction_passes():
    err = validate_task_instruction(_VALID)
    assert err is None
