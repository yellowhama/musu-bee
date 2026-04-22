"""Phase 75: per-channel task limit tests."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

import server  # noqa: E402
from server import app  # noqa: E402

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False, headers=_AUTH)

_DELEGATE_PAYLOAD = {
    "channel": "engineer",
    "sender_id": "user1",
    "text": (
        "Read musu-bridge/handlers.py route_chat function and verify "
        "the error path returns the correct dict. "
        "pytest musu-bridge/tests/test_server.py -v should pass after check."
    ),
}

_BACKEND_MOCK = MagicMock()
_BACKEND_MOCK.create_route_execution.return_value = None
_BACKEND_MOCK.update_route_execution.return_value = None
# Free-tier gate: simulate 0 tasks today so we never hit the daily limit
_BACKEND_MOCK._db.execute.return_value = [(0,)]


def _make_backend_patch():
    return patch("handlers._get_backend", return_value=_BACKEND_MOCK)


def _make_route_chat_patch():
    async def _hang(*args, **kwargs):
        await asyncio.sleep(3600)

    return patch("server.route_chat", side_effect=_hang)


class TestChannelSemaphoreHelper:
    """Unit tests for _get_channel_semaphore()."""

    def setup_method(self):
        server._channel_semaphores.clear()

    def test_returns_semaphore_with_correct_initial_value(self):
        sem = server._get_channel_semaphore("ceo")
        assert sem._value == server._CHANNEL_MAX_TASKS

    def test_same_channel_returns_same_semaphore_instance(self):
        s1 = server._get_channel_semaphore("engineer")
        s2 = server._get_channel_semaphore("engineer")
        assert s1 is s2

    def test_different_channels_return_different_semaphores(self):
        s_eng = server._get_channel_semaphore("engineer")
        s_ceo = server._get_channel_semaphore("ceo")
        assert s_eng is not s_ceo


_CHANNEL_MAP = {
    "engineer": {"agent_id": "eng-001"},
    "ceo": {"agent_id": "ceo-001"},
}

_AGENT_MOCK = {"adapter_config": {"timeout_sec": 30}}


def _endpoint_patches():
    """Context managers that satisfy all delegate endpoint dependencies."""
    return (
        patch("server.get_channel_map", return_value=_CHANNEL_MAP),
        patch("server.get_company", return_value=None),
        patch("server.get_agent_by_id", return_value=_AGENT_MOCK),
        _make_backend_patch(),
    )


class TestChannelLimitEndpoint:
    """Integration tests for the /api/tasks/delegate per-channel 429."""

    def setup_method(self):
        server._channel_semaphores.clear()
        server._active_tasks.clear()

    def test_first_request_accepted_when_semaphore_free(self):
        """Normal request should succeed when channel has capacity."""
        p1, p2, p3, p4 = _endpoint_patches()
        with p1, p2, p3, p4, patch("server.route_chat", new_callable=AsyncMock):
            resp = _client.post("/api/tasks/delegate", json=_DELEGATE_PAYLOAD)
        assert resp.status_code == 202

    def test_returns_429_when_channel_at_capacity(self):
        """Request must be rejected with 429 when channel semaphore is exhausted."""
        sem = server._get_channel_semaphore("engineer")
        sem._value = 0

        p1, p2, p3, p4 = _endpoint_patches()
        with p1, p2, p3, p4, patch("server.route_chat", new_callable=AsyncMock):
            resp = _client.post("/api/tasks/delegate", json=_DELEGATE_PAYLOAD)

        assert resp.status_code == 429
        assert "engineer" in resp.json()["detail"]

    def test_429_response_includes_retry_after_header(self):
        """429 from channel limit must carry Retry-After: 30."""
        sem = server._get_channel_semaphore("engineer")
        sem._value = 0

        p1, p2, p3, p4 = _endpoint_patches()
        with p1, p2, p3, p4, patch("server.route_chat", new_callable=AsyncMock):
            resp = _client.post("/api/tasks/delegate", json=_DELEGATE_PAYLOAD)

        assert resp.status_code == 429
        assert resp.headers.get("Retry-After") == "30"

    def test_channel_limit_independent_across_channels(self):
        """Exhausting 'engineer' channel must not affect 'ceo' channel."""
        sem_eng = server._get_channel_semaphore("engineer")
        sem_eng._value = 0

        ceo_payload = {**_DELEGATE_PAYLOAD, "channel": "ceo"}
        p1, p2, p3, p4 = _endpoint_patches()
        with p1, p2, p3, p4, patch("server.route_chat", new_callable=AsyncMock):
            resp = _client.post("/api/tasks/delegate", json=ceo_payload)

        assert resp.status_code == 202

    def test_env_var_controls_channel_limit(self):
        """MUSU_CHANNEL_MAX_TASKS env var must determine semaphore initial value."""
        server._channel_semaphores.clear()
        original = server._CHANNEL_MAX_TASKS
        try:
            server._CHANNEL_MAX_TASKS = 2
            sem = server._get_channel_semaphore("qa")
            assert sem._value == 2
        finally:
            server._CHANNEL_MAX_TASKS = original
            server._channel_semaphores.clear()

    def test_detail_mentions_capacity_count(self):
        """Error detail must include the configured max task count."""
        sem = server._get_channel_semaphore("engineer")
        sem._value = 0

        p1, p2, p3, p4 = _endpoint_patches()
        with p1, p2, p3, p4, patch("server.route_chat", new_callable=AsyncMock):
            resp = _client.post("/api/tasks/delegate", json=_DELEGATE_PAYLOAD)

        detail = resp.json()["detail"]
        assert str(server._CHANNEL_MAX_TASKS) in detail
