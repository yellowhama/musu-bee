"""Phase 79 — Agent health probe before dispatch tests.

근거: memory/project_silent_failure_research.md 항목 5
"Agent health probe before dispatch (5s timeout GET /health)"
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Unit tests for _probe_agent_health ────────────────────────────────────────

@pytest.mark.asyncio
async def test_probe_returns_true_when_disabled():
    """MUSU_HEALTH_PROBE_ENABLED=false → always healthy (fail-open)."""
    from handlers import _probe_agent_health
    with patch.dict("os.environ", {"MUSU_HEALTH_PROBE_ENABLED": "false"}):
        result = await _probe_agent_health("engineer", adapter_type="gemini_local")
    assert result is True


@pytest.mark.asyncio
async def test_probe_local_adapter_healthy_via_db():
    """Local adapter: recent done task in DB → healthy."""
    from handlers import _probe_agent_health

    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = [{"cnt": 1}]

    with patch.dict("os.environ", {"MUSU_HEALTH_PROBE_ENABLED": "true"}):
        with patch("handlers._get_backend", return_value=mock_backend):
            result = await _probe_agent_health("engineer", adapter_type="gemini_local")
    assert result is True


@pytest.mark.asyncio
async def test_probe_local_adapter_unknown_channel_returns_true():
    """Local adapter with no history → fail-open (True) to avoid blocking new channels."""
    from handlers import _probe_agent_health

    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = [{"cnt": 0}]

    with patch.dict("os.environ", {"MUSU_HEALTH_PROBE_ENABLED": "true"}):
        with patch("handlers._get_backend", return_value=mock_backend):
            result = await _probe_agent_health("brand_new_channel", adapter_type="gemini_local")
    # New channel with no history → not unhealthy, fail-open
    assert result is True


@pytest.mark.asyncio
async def test_probe_local_adapter_consecutive_failures_unhealthy():
    """Local adapter: only recent failures (no done) → unhealthy."""
    from handlers import _probe_local_agent

    mock_backend = MagicMock()
    # done_count = 0, fail_count >= 3
    mock_backend._db.execute.side_effect = [
        [{"cnt": 0}],   # done in last 30s
        [{"cnt": 5}],   # failed in last 60s
    ]

    with patch("handlers._get_backend", return_value=mock_backend):
        result = await _probe_local_agent("engineer")
    assert result is False


@pytest.mark.asyncio
async def test_probe_http_adapter_healthy():
    """HTTP adapter: GET /health returns 200 → healthy."""
    from handlers import _probe_agent_health

    mock_response = MagicMock()
    mock_response.status = 200

    with patch.dict("os.environ", {"MUSU_HEALTH_PROBE_ENABLED": "true"}):
        with patch("urllib.request.urlopen", return_value=mock_response):
            result = await _probe_agent_health(
                "remote_agent",
                adapter_type="http",
                health_url="http://localhost:9000/health",
            )
    assert result is True


@pytest.mark.asyncio
async def test_probe_http_adapter_timeout_returns_false():
    """HTTP adapter: timeout → unhealthy (False)."""
    from handlers import _probe_agent_health
    import socket

    with patch.dict("os.environ", {"MUSU_HEALTH_PROBE_ENABLED": "true"}):
        with patch("urllib.request.urlopen", side_effect=socket.timeout("timed out")):
            result = await _probe_agent_health(
                "remote_agent",
                adapter_type="http",
                health_url="http://localhost:9000/health",
            )
    assert result is False


# ── Integration: route_chat skips LLM when probe fails ───────────────────────

@pytest.fixture(autouse=True)
def reset_channel_cb():
    """Reset global channel CB state before each test to avoid cross-test pollution."""
    try:
        import server
        server._channel_cb._failures.clear()
        server._channel_cb._tripped_at.clear()
    except Exception:
        pass
    yield
    try:
        import server
        server._channel_cb._failures.clear()
        server._channel_cb._tripped_at.clear()
    except Exception:
        pass


@pytest.mark.asyncio
async def test_route_chat_returns_error_when_probe_fails():
    """route_chat: unhealthy probe → returns error without calling route_message."""
    import handlers

    mock_backend = MagicMock()
    mock_backend.get_agent_by_name.return_value = {"id": "a1", "role": "engineer", "adapter_type": "gemini_local"}
    mock_backend.create_route_execution.return_value = None
    mock_backend.update_route_execution.return_value = None

    with patch("handlers._health_probe_enabled", return_value=True):
        with patch("handlers._get_backend", return_value=mock_backend):
            with patch("handlers._probe_agent_health", new_callable=AsyncMock, return_value=False):
                with patch("handlers.route_message", new_callable=AsyncMock) as mock_route:
                    result = await handlers.route_chat(
                        channel="engineer",
                        sender_id="test",
                        text="do something",
                    )

    assert "error" in result
    assert "probe" in result["error"].lower() or "health" in result["error"].lower() or "unavailable" in result["error"].lower()
    mock_route.assert_not_called()


@pytest.mark.asyncio
async def test_route_chat_proceeds_when_probe_passes():
    """route_chat: healthy probe → dispatches via Router.route normally."""
    import handlers
    from musu_core.adapters.base import AdapterResult
    from musu_core.router import RouteResult

    fake_route_result = RouteResult(
        run_id="run-1",
        agent_id="a1",
        success=True,
        summary="ok",
        adapter_result=AdapterResult(run_id="run-1", success=True, summary="ok"),
    )

    mock_backend = MagicMock()
    mock_backend.get_agent_by_name.return_value = {
        "id": "a1", "role": "engineer", "adapter_type": "gemini_local", "adapter_config": {},
    }
    mock_backend.create_route_execution.return_value = None
    mock_backend.update_route_execution.return_value = None
    mock_backend.list_tasks.return_value = []
    mock_backend.create_task.return_value = {"id": "task-1", "meta": {}}

    with patch("handlers._health_probe_enabled", return_value=True):
        with patch("handlers._get_backend", return_value=mock_backend):
            with patch("handlers._probe_agent_health", new_callable=AsyncMock, return_value=True):
                with patch("musu_core.router.Router.route", new_callable=AsyncMock,
                           return_value=fake_route_result) as mock_route:
                    with patch("handlers.get_bridge_config") as mock_cfg:
                        mock_cfg.return_value.channel_agent_map = {"engineer": "engineer"}
                        with patch("handlers.get_mesh_router") as mock_mesh:
                            mock_mesh.return_value.enabled = False
                            mock_mesh.return_value.is_remote.return_value = False
                            result = await handlers.route_chat(
                                channel="engineer",
                                sender_id="test",
                                text="do something",
                            )

    mock_route.assert_called_once()
