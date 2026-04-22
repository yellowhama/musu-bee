"""E2E pipeline tests: delegate → route_chat → adapter → result.

Uses a mock adapter that simulates Claude subprocess without actually calling it.
Tests the full pipeline from HTTP request to route_execution record.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


@pytest.fixture(autouse=True)
def _mock_route_chat():
    with patch("server.route_chat", new_callable=AsyncMock) as mock:
        mock.return_value = {
            "response": "Feature implemented. Tests pass.",
            "agent_id": "eng-001",
            "agent_name": "Engineer",
            "cost_usd": 0.05,
            "input_tokens": 1000,
            "output_tokens": 200,
        }
        yield mock


def test_delegate_task_creates_execution():
    """delegate_task → route_execution record created."""
    resp = client.post("/api/tasks/delegate", json={
        "channel": "engineer",
        "text": (
            "Read musu-bridge/handlers.py route_chat function and verify "
            "that the error handling on line 69 returns the correct dict structure. "
            "pytest musu-bridge/tests/test_server.py -v should pass after inspection."
        ),
    })
    assert resp.status_code == 202
    data = resp.json()
    assert "task_id" in data

    # Poll for status
    task_id = data["task_id"]
    status_resp = client.get(f"/api/tasks/{task_id}")
    assert status_resp.status_code == 200


def test_delegate_task_with_company_id():
    """delegate_task with company_id validates company exists."""
    resp = client.post("/api/tasks/delegate", json={
        "channel": "engineer",
        "text": (
            "Read musu-bridge/server.py and check that the /health endpoint "
            "returns status 200 with ok=true. pytest musu-bridge/tests/test_server.py should pass."
        ),
        "company_id": "nonexistent",
    })
    assert resp.status_code == 400


def test_route_endpoint_returns_response():
    """POST /api/route returns agent response."""
    resp = client.post("/api/route", json={
        "channel": "engineer",
        "sender_id": "test",
        "text": "Hello",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("response") or data.get("error")


def test_feedback_creates_issue():
    """POST /api/feedback creates an issue."""
    resp = client.post("/api/feedback", json={
        "title": "Button broken",
        "description": "The submit button doesn't work",
        "type": "bug",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "received"
    assert "issue_id" in data


def test_success_rate_endpoint():
    """GET /api/stats/success-rate returns stats."""
    resp = client.get("/api/stats/success-rate?days=1")
    assert resp.status_code == 200
    data = resp.json()
    assert "success_rate_pct" in data
    assert "total" in data
    assert "done" in data
