"""Phase 85: empty/whitespace instruction guard + orchestrator backoff tests.

Covers three fixes from issue #1d383ff3:
1. DelegateRequest rejects text="" and text="   " with 422
2. musu-control delegate_task retries with backoff on 429
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge_models import DelegateRequest  # noqa: E402
from server import app  # noqa: E402

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)

_VALID_TEXT = (
    "Read musu-bridge/handlers.py route_chat function and verify "
    "the error path returns the correct dict. "
    "pytest musu-bridge/tests/test_server.py -v should pass after check. "
    "expected_output: pytest musu-bridge/tests/test_server.py -v"
)

_CHANNEL_MAP = {
    "engineer": {"agent_id": "eng-001"},
}

_BACKEND_MOCK = MagicMock()
_BACKEND_MOCK.create_route_execution.return_value = None
_BACKEND_MOCK.update_route_execution.return_value = None
_BACKEND_MOCK._db.execute.return_value = [(0,)]


def _endpoint_patches():
    return (
        patch("server.get_channel_map", return_value=_CHANNEL_MAP),
        patch("server.get_company", return_value=None),
        patch("server.get_agent_by_id", return_value={"adapter_config": {"timeout_sec": 30}}),
        patch("handlers._get_backend", return_value=_BACKEND_MOCK),
    )


class TestEmptyInstructionRejection:
    """DelegateRequest model must reject empty and whitespace-only text."""

    def test_model_rejects_empty_string(self):
        with pytest.raises(Exception):
            DelegateRequest(channel="engineer", sender_id="orchestrator", text="")

    def test_model_rejects_whitespace_only(self):
        with pytest.raises(Exception):
            DelegateRequest(channel="engineer", sender_id="orchestrator", text="   ")

    def test_model_accepts_valid_text(self):
        req = DelegateRequest(channel="engineer", sender_id="orchestrator", text=_VALID_TEXT)
        assert req.text == _VALID_TEXT

    def test_endpoint_returns_422_for_empty_text(self):
        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": ""},
            headers=_AUTH,
        )
        assert resp.status_code == 422

    def test_endpoint_returns_422_for_whitespace_text(self):
        resp = _client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": "   "},
            headers=_AUTH,
        )
        assert resp.status_code == 422

    def test_endpoint_does_not_return_422_for_valid_text(self):
        p1, p2, p3, p4 = _endpoint_patches()
        with p1, p2, p3, p4, patch("server.route_chat", new_callable=AsyncMock):
            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
        assert resp.status_code != 422


class TestOrchestratorBackoff:
    """musu-control delegate_task must retry with backoff on 429."""

    @pytest.mark.asyncio
    async def test_delegate_task_retries_on_429(self):
        """delegate_task retries at least once when bridge returns 429."""
        import httpx

        sys.path.insert(0, str(Path(__file__).parent.parent.parent / "musu-control" / "src"))
        import importlib
        import musu_control.server as ctrl_server

        call_count = 0

        async def _mock_post(url, json=None, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                # First call returns 429
                resp = MagicMock()
                resp.status_code = 429
                resp.raise_for_status.side_effect = httpx.HTTPStatusError(
                    "429", request=MagicMock(), response=resp
                )
                return resp
            # Second call succeeds
            resp = MagicMock()
            resp.status_code = 200
            resp.raise_for_status.return_value = None
            resp.json.return_value = {"task_id": "t-001", "status": "running"}
            return resp

        mock_client = AsyncMock()
        mock_client.post = _mock_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("musu_control.server.httpx.AsyncClient", return_value=mock_client):
            with patch("musu_control.server.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
                result = await ctrl_server.delegate_task("engineer", _VALID_TEXT)

        assert call_count >= 2, "Should retry at least once on 429"
        assert mock_sleep.called, "Should sleep (backoff) between retries"

    @pytest.mark.asyncio
    async def test_delegate_task_backoff_increases(self):
        """Backoff sleep intervals must increase (exponential)."""
        import httpx

        sys.path.insert(0, str(Path(__file__).parent.parent.parent / "musu-control" / "src"))
        import musu_control.server as ctrl_server

        call_count = 0
        sleep_calls = []

        async def _mock_post(url, json=None, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                resp = MagicMock()
                resp.status_code = 429
                resp.raise_for_status.side_effect = httpx.HTTPStatusError(
                    "429", request=MagicMock(), response=resp
                )
                return resp
            resp = MagicMock()
            resp.status_code = 200
            resp.raise_for_status.return_value = None
            resp.json.return_value = {"task_id": "t-002", "status": "running"}
            return resp

        mock_client = AsyncMock()
        mock_client.post = _mock_post
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        async def _record_sleep(seconds):
            sleep_calls.append(seconds)

        with patch("musu_control.server.httpx.AsyncClient", return_value=mock_client):
            with patch("musu_control.server.asyncio.sleep", side_effect=_record_sleep):
                result = await ctrl_server.delegate_task("engineer", _VALID_TEXT)

        assert len(sleep_calls) >= 2
        assert sleep_calls[1] >= sleep_calls[0], "Second backoff must be >= first"
