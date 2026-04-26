"""Phase 91: validate_task_instruction — expected_output gate tests.

Tests the two-argument form:
  validate_task_instruction(instruction: str, expected_output: str | None) → None
Raises HTTPException(400) on invalid input.

Also tests the HTTP gate on POST /api/tasks/route.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
os.environ.setdefault("MUSU_PLAN", "pro")

sys.path.insert(0, str(Path(__file__).parent.parent))

from handlers import validate_task_instruction

_AUTH = {"Authorization": "Bearer test-token"}

_SHORT = "Fix the bug"  # < 50 chars

_LONG = (
    "Add error handling to musu-bridge/handlers.py route_chat function "
    "when backend.create_route_execution raises an exception."
)  # >= 50 chars


def test_rejects_short_instruction():
    """40-char instruction → HTTPException 400."""
    instruction = "A" * 40
    assert len(instruction) == 40
    with pytest.raises(HTTPException) as exc_info:
        validate_task_instruction(instruction, expected_output="결과물")
    assert exc_info.value.status_code == 400
    assert "50" in exc_info.value.detail or "short" in exc_info.value.detail.lower()


def test_rejects_missing_expected_output():
    """Normal instruction (>= 50 chars) + expected_output='' → HTTPException 400."""
    with pytest.raises(HTTPException) as exc_info:
        validate_task_instruction(_LONG, expected_output="")
    assert exc_info.value.status_code == 400
    assert "expected_output" in exc_info.value.detail.lower()


def test_passes_valid_instruction():
    """60+ char instruction + expected_output='결과물' → no exception."""
    instruction = "A" * 60
    validate_task_instruction(instruction, expected_output="결과물")


# ── HTTP endpoint tests ────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    import server
    return TestClient(server.app, raise_server_exceptions=False)


def test_route_task_rejects_short_instruction(client):
    """POST /api/tasks/route with instruction < 50 chars → 400."""
    resp = client.post("/api/tasks/route", headers=_AUTH, json={
        "channel": "ch",
        "instruction": "Fix bug",
        "expected_output": "tests pass",
    })
    assert resp.status_code == 400


def test_route_task_rejects_missing_expected_output(client):
    """POST /api/tasks/route with empty expected_output → 400."""
    resp = client.post("/api/tasks/route", headers=_AUTH, json={
        "channel": "ch",
        "instruction": _LONG,
        "expected_output": "",
    })
    assert resp.status_code == 400
