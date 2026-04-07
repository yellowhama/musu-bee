"""Integration tests for /api/messages endpoints in musu-bridge server."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

client = TestClient(app)

# ---------------------------------------------------------------------------
# Sample fixtures
# ---------------------------------------------------------------------------

_MSG_1 = {
    "id": "msg-001",
    "session_id": "sess-abc",
    "role": "user",
    "content": "hello",
    "model": None,
    "meta": {},
    "created_at": "2026-04-07T10:00:00.000Z",
}
_MSG_2 = {
    "id": "msg-002",
    "session_id": "sess-abc",
    "role": "assistant",
    "content": "hi there",
    "model": "claude-sonnet-4-6",
    "meta": {},
    "created_at": "2026-04-07T10:00:01.000Z",
}


# ---------------------------------------------------------------------------
# GET /api/messages
# ---------------------------------------------------------------------------


class TestListMessages:
    def test_returns_list_for_valid_session_id(self):
        with patch("server.list_messages", return_value=[_MSG_1, _MSG_2]) as mock:
            resp = client.get("/api/messages", params={"session_id": "sess-abc"})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        assert body[0]["id"] == "msg-001"
        mock.assert_called_once_with(
            session_id="sess-abc",
            limit=50,
            before_id=None,
            agent_id=None,
            date_from=None,
            date_to=None,
        )

    def test_conversation_id_alias_works(self):
        with patch("server.list_messages", return_value=[_MSG_1]) as mock:
            resp = client.get("/api/messages", params={"conversation_id": "sess-xyz"})
        assert resp.status_code == 200
        mock.assert_called_once_with(
            session_id="sess-xyz",
            limit=50,
            before_id=None,
            agent_id=None,
            date_from=None,
            date_to=None,
        )

    def test_missing_session_id_returns_422(self):
        resp = client.get("/api/messages")
        assert resp.status_code == 422

    def test_limit_param_passed_through(self):
        with patch("server.list_messages", return_value=[]) as mock:
            resp = client.get("/api/messages", params={"session_id": "s1", "limit": 10})
        assert resp.status_code == 200
        mock.assert_called_once_with(
            session_id="s1",
            limit=10,
            before_id=None,
            agent_id=None,
            date_from=None,
            date_to=None,
        )

    def test_before_id_cursor_param_passed_through(self):
        with patch("server.list_messages", return_value=[_MSG_1]) as mock:
            resp = client.get("/api/messages", params={"session_id": "s1", "before_id": "msg-002"})
        assert resp.status_code == 200
        mock.assert_called_once_with(
            session_id="s1",
            limit=50,
            before_id="msg-002",
            agent_id=None,
            date_from=None,
            date_to=None,
        )

    def test_agent_id_filter_passed_through(self):
        with patch("server.list_messages", return_value=[_MSG_2]) as mock:
            resp = client.get("/api/messages", params={"session_id": "s1", "agent_id": "agent-007"})
        assert resp.status_code == 200
        mock.assert_called_once_with(
            session_id="s1",
            limit=50,
            before_id=None,
            agent_id="agent-007",
            date_from=None,
            date_to=None,
        )

    def test_date_range_filters_passed_through(self):
        with patch("server.list_messages", return_value=[]) as mock:
            resp = client.get(
                "/api/messages",
                params={
                    "session_id": "s1",
                    "date_from": "2026-04-07T00:00:00Z",
                    "date_to": "2026-04-07T23:59:59Z",
                },
            )
        assert resp.status_code == 200
        mock.assert_called_once_with(
            session_id="s1",
            limit=50,
            before_id=None,
            agent_id=None,
            date_from="2026-04-07T00:00:00Z",
            date_to="2026-04-07T23:59:59Z",
        )

    def test_empty_result_returns_empty_list(self):
        with patch("server.list_messages", return_value=[]):
            resp = client.get("/api/messages", params={"session_id": "no-such-session"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_limit_out_of_range_returns_422(self):
        resp = client.get("/api/messages", params={"session_id": "s1", "limit": 0})
        assert resp.status_code == 422

    def test_limit_above_max_returns_422(self):
        resp = client.get("/api/messages", params={"session_id": "s1", "limit": 501})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /api/messages/{id}
# ---------------------------------------------------------------------------


class TestGetMessage:
    def test_returns_message_when_found(self):
        with patch("server.get_message_by_id", return_value=_MSG_1):
            resp = client.get("/api/messages/msg-001")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "msg-001"
        assert body["content"] == "hello"

    def test_returns_404_when_not_found(self):
        with patch("server.get_message_by_id", return_value=None):
            resp = client.get("/api/messages/ghost-id")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# DELETE /api/messages/{id}
# ---------------------------------------------------------------------------


class TestDeleteMessage:
    def test_returns_deleted_true_when_found(self):
        with patch("server.delete_message_by_id", return_value=True):
            resp = client.delete("/api/messages/msg-001")
        assert resp.status_code == 200
        body = resp.json()
        assert body["deleted"] is True
        assert body["id"] == "msg-001"

    def test_returns_404_when_not_found(self):
        with patch("server.delete_message_by_id", return_value=False):
            resp = client.delete("/api/messages/ghost-id")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
