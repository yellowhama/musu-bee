"""Integration tests for musu-bridge server endpoints."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure musu-bridge is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

client = TestClient(app)


@pytest.fixture(autouse=True)
def _mock_route_chat():
    """Patch route_chat so tests don't require a running musu-core."""
    with patch("server.route_chat", new_callable=AsyncMock) as mock:
        mock.return_value = {"response": "Hello from CEO", "agent_id": "ceo-001", "agent_name": "ceo"}
        yield mock


class TestApiRoute:
    def test_valid_request_returns_response_and_agent_id(self, _mock_route_chat):
        resp = client.post("/api/route", json={"channel": "ceo", "sender_id": "user1", "text": "hello"})
        assert resp.status_code == 200
        body = resp.json()
        assert "response" in body
        assert "agent_id" in body
        assert body["response"] == "Hello from CEO"
        assert body["agent_id"] == "ceo-001"

    def test_unknown_channel_returns_error_with_null_response(self, _mock_route_chat):
        _mock_route_chat.return_value = {"error": "No agent mapped to channel: 'unknown'", "response": None}
        resp = client.post("/api/route", json={"channel": "unknown", "sender_id": "user1", "text": "hello"})
        assert resp.status_code == 200
        body = resp.json()
        assert "error" in body
        assert body["response"] is None

    def test_empty_text_returns_error_with_null_response(self, _mock_route_chat):
        _mock_route_chat.return_value = {"error": "Empty message", "response": None}
        resp = client.post("/api/route", json={"channel": "ceo", "sender_id": "user1", "text": ""})
        assert resp.status_code == 200
        body = resp.json()
        assert "error" in body
        assert body["response"] is None


class TestHealthEndpoint:
    def test_health_returns_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
