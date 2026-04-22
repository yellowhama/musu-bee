"""Phase 71: adapter_type propagation — route_chat returns adapter_type in response dict."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from server import app

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)


class TestRouteChatAdapterType:
    """route_chat() must include adapter_type in the response dict."""

    def test_api_route_returns_adapter_type(self):
        """POST /api/route response must contain adapter_type key."""
        mock_result = {
            "response": "Hello from CEO",
            "agent_id": "ceo-001",
            "agent_name": "ceo",
            "adapter_type": "claude_local",
        }
        with patch("server.route_chat", new_callable=AsyncMock, return_value=mock_result):
            resp = _client.post(
                "/api/route",
                json={"channel": "ceo", "sender_id": "user1", "text": "hello"},
                headers=_AUTH,
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "adapter_type" in body, "adapter_type must be present in /api/route response"
        assert body["adapter_type"] == "claude_local"

    def test_api_route_adapter_type_gemini(self):
        """adapter_type passes through as gemini_local when set."""
        mock_result = {
            "response": "response from gemini",
            "agent_id": "eng-001",
            "agent_name": "engineer",
            "adapter_type": "gemini_local",
        }
        with patch("server.route_chat", new_callable=AsyncMock, return_value=mock_result):
            resp = _client.post(
                "/api/route",
                json={"channel": "engineer", "sender_id": "user1", "text": "implement X"},
                headers=_AUTH,
            )
        assert resp.status_code == 200
        assert resp.json()["adapter_type"] == "gemini_local"

    def test_api_route_adapter_type_defaults_empty_string_on_error(self):
        """Error responses still include adapter_type (empty string)."""
        mock_result = {
            "error": "Empty message",
            "response": None,
            "adapter_type": "",
        }
        with patch("server.route_chat", new_callable=AsyncMock, return_value=mock_result):
            resp = _client.post(
                "/api/route",
                json={"channel": "ceo", "sender_id": "user1", "text": ""},
                headers=_AUTH,
            )
        assert resp.status_code == 200
        body = resp.json()
        assert "adapter_type" in body


class TestHandlersRouteChatAdapterType:
    """handlers.route_chat() must include adapter_type in return dict."""

    @pytest.mark.asyncio
    async def test_route_chat_includes_adapter_type(self):
        """route_chat returns dict with adapter_type key."""
        import handlers

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = {
            "id": "ceo-1",
            "role": "ceo",
            "adapter_type": "claude_local",
        }
        mock_backend.create_route_execution.return_value = "exec-1"
        mock_backend.update_route_execution = MagicMock()

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.route_message", new_callable=AsyncMock, return_value="Agent response text"),
            patch("handlers.get_mesh_router") as mock_mesh,
        ):
            mock_mesh.return_value.enabled = False
            result = await handlers.route_chat(
                channel="ceo",
                sender_id="user1",
                text="hello",
            )

        assert "adapter_type" in result, "route_chat must return adapter_type"
        assert result["adapter_type"] == "claude_local"
        assert result["response"] == "Agent response text"

    @pytest.mark.asyncio
    async def test_route_chat_uses_adapter_override_over_agent_type(self):
        """When adapter_override is set, it takes priority over agent's adapter_type."""
        import handlers

        mock_backend = MagicMock()
        mock_backend.get_agent_by_name.return_value = {
            "id": "ceo-1",
            "role": "ceo",
            "adapter_type": "claude_local",
        }
        mock_backend.create_route_execution.return_value = "exec-1"
        mock_backend.update_route_execution = MagicMock()

        with (
            patch("handlers._get_backend", return_value=mock_backend),
            patch("handlers.route_message", new_callable=AsyncMock, return_value="Gemini response"),
            patch("handlers.get_mesh_router") as mock_mesh,
        ):
            mock_mesh.return_value.enabled = False
            result = await handlers.route_chat(
                channel="ceo",
                sender_id="user1",
                text="hello",
                adapter_override="gemini_local",
            )

        assert result["adapter_type"] == "gemini_local"
