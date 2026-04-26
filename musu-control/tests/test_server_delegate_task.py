"""Tests for delegate_task MCP tool — verifies instruction parameter mapping."""
import asyncio
import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from musu_control import server


def _make_response(status_code: int, data: dict) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = data
    resp.raise_for_status = MagicMock()
    return resp


def test_delegate_task_accepts_instruction_parameter():
    """delegate_task must accept 'instruction' param and POST it as text= to /api/tasks/delegate."""
    captured: list[dict[str, Any]] = []

    async def fake_post(url: str, json: dict | None = None, **_kwargs) -> MagicMock:
        captured.append({"url": url, "body": json or {}})
        return _make_response(202, {"task_id": "task-abc", "status": "running"})

    mock_client = AsyncMock()
    mock_client.post.side_effect = fake_post
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("musu_control.server.httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(
            server.delegate_task(
                channel="engineer",
                instruction="Implement feature X",
            )
        )

    assert len(captured) == 1
    body = captured[0]["body"]
    assert body["text"] == "Implement feature X"
    assert body["channel"] == "engineer"
    # old 'text' parameter must not be a direct kwarg — instruction maps to text
    assert "instruction" not in body

    payload = json.loads(result)
    assert payload["task_id"] == "task-abc"


def test_delegate_task_expected_output_optional():
    """expected_output is optional — omitting it must still succeed and POST without it."""
    captured: list[dict[str, Any]] = []

    async def fake_post(url: str, json: dict | None = None, **_kwargs) -> MagicMock:
        captured.append({"url": url, "body": json or {}})
        return _make_response(202, {"task_id": "task-no-eo", "status": "running"})

    mock_client = AsyncMock()
    mock_client.post.side_effect = fake_post
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("musu_control.server.httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(
            server.delegate_task(
                channel="qa",
                instruction="Run smoke tests",
            )
        )

    body = captured[0]["body"]
    assert body["text"] == "Run smoke tests"
    assert body.get("expected_output") is None or "expected_output" not in body

    payload = json.loads(result)
    assert payload["task_id"] == "task-no-eo"


def test_delegate_task_expected_output_included_when_provided():
    """When expected_output is given, it must be forwarded in the POST body."""
    captured: list[dict[str, Any]] = []

    async def fake_post(url: str, json: dict | None = None, **_kwargs) -> MagicMock:
        captured.append({"url": url, "body": json or {}})
        return _make_response(202, {"task_id": "task-eo", "status": "running"})

    mock_client = AsyncMock()
    mock_client.post.side_effect = fake_post
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("musu_control.server.httpx.AsyncClient", return_value=mock_client):
        result = asyncio.run(
            server.delegate_task(
                channel="ceo",
                instruction="Plan Q3 roadmap",
                expected_output="Prioritised issue list",
            )
        )

    body = captured[0]["body"]
    assert body["text"] == "Plan Q3 roadmap"
    assert body["expected_output"] == "Prioritised issue list"

    payload = json.loads(result)
    assert payload["task_id"] == "task-eo"
    assert payload["channel"] == "ceo"
