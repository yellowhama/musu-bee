"""E2E HTTP tests for A2A Protocol endpoints."""
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from server import app

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


class TestA2AEndpoints:
    def test_agent_card_discoverable(self):
        """GET /.well-known/agent.json returns valid A2A card."""
        r = client.get("/.well-known/agent.json")
        assert r.status_code == 200
        card = r.json()
        assert card["name"] == "MUSU Agent Runtime"
        assert "skills" in card
        assert "supported_interfaces" in card
        assert "security_schemes" in card
        assert card["version"] == "1.0.0"

    def test_a2a_list_tasks(self):
        """POST /a2a ListTasks → returns tasks list."""
        r = client.post("/a2a", json={
            "jsonrpc": "2.0", "id": 2,
            "method": "ListTasks", "params": {"limit": 5}
        })
        assert r.status_code == 200
        body = r.json()
        assert "result" in body
        assert "tasks" in body["result"]
        assert isinstance(body["result"]["tasks"], list)

    def test_a2a_unknown_method(self):
        """Unknown method → -32601."""
        r = client.post("/a2a", json={
            "jsonrpc": "2.0", "id": 3, "method": "FakeMethod", "params": {}
        })
        assert r.status_code == 200
        body = r.json()
        assert "error" in body
        assert body["error"]["code"] == -32601

    def test_a2a_invalid_jsonrpc_version(self):
        """Missing jsonrpc field → -32600."""
        r = client.post("/a2a", json={
            "id": 4, "method": "SendMessage", "params": {}
        })
        assert r.status_code == 200
        body = r.json()
        assert body["error"]["code"] == -32600

    def test_a2a_parse_error(self):
        """Invalid JSON body → 400."""
        r = client.post("/a2a", content=b"not json", headers={
            "Authorization": "Bearer test-token",
            "Content-Type": "application/json",
        })
        assert r.status_code == 400

    @patch("handlers.route_chat", new_callable=AsyncMock)
    def test_a2a_send_message(self, mock_route_chat):
        """POST /a2a SendMessage with mocked route_chat."""
        mock_route_chat.return_value = {
            "response": "Done.",
            "task_id": "test-task-123",
        }
        r = client.post("/a2a", json={
            "jsonrpc": "2.0", "id": 1,
            "method": "SendMessage",
            "params": {
                "message": {"role": "user", "parts": [{"text": "hello"}]},
                "metadata": {"channel": "team_lead"},
            }
        })
        assert r.status_code == 200
        body = r.json()
        assert "result" in body
        assert "task" in body["result"]
