"""Unit tests for A2A protocol module (musu-bridge/a2a.py)."""
from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from a2a import get_agent_card, handle_jsonrpc


def test_get_agent_card_structure():
    """Agent card must contain required A2A fields."""
    card = get_agent_card()
    assert "name" in card
    assert "version" in card
    assert "supported_interfaces" in card
    assert isinstance(card["supported_interfaces"], list)
    assert len(card["supported_interfaces"]) > 0
    assert "skills" in card
    assert isinstance(card["skills"], list)
    assert "security_schemes" in card
    assert "bearer" in card["security_schemes"]


def test_jsonrpc_invalid_version():
    """Body without jsonrpc=2.0 returns error -32600."""
    body = {"id": 1, "method": "SendMessage", "params": {}}
    result = asyncio.run(handle_jsonrpc(body))
    assert result["error"]["code"] == -32600
    assert "jsonrpc" in result["error"]["message"].lower() or "version" in result["error"]["message"].lower()


def test_jsonrpc_unknown_method():
    """Unknown method returns error -32601."""
    body = {"jsonrpc": "2.0", "id": 2, "method": "NonExistentMethod", "params": {}}
    result = asyncio.run(handle_jsonrpc(body))
    assert result["error"]["code"] == -32601
    assert "NonExistentMethod" in result["error"]["message"]


def test_send_message_missing_message():
    """SendMessage without message in params returns error -32602."""
    body = {"jsonrpc": "2.0", "id": 3, "method": "SendMessage", "params": {}}
    result = asyncio.run(handle_jsonrpc(body))
    assert result["error"]["code"] == -32602
    assert "message" in result["error"]["message"].lower()


@patch("a2a._handle_list_tasks")
def test_list_tasks_returns_tasks(mock_list):
    """ListTasks returns a tasks list in the result."""
    mock_list.return_value = {"tasks": [
        {"id": "t1", "status": {"state": "completed"}},
        {"id": "t2", "status": {"state": "submitted"}},
    ]}

    body = {"jsonrpc": "2.0", "id": 4, "method": "ListTasks", "params": {}}
    result = asyncio.run(handle_jsonrpc(body))

    assert "result" in result
    assert "tasks" in result["result"]
    assert len(result["result"]["tasks"]) == 2
