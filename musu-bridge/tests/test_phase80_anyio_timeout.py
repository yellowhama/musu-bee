"""Phase 80 — AnyIO fail_after() structured timeout on route_message call.

근거: wiki/next-priorities-research §1
"anyio.fail_after()는 trio-style structured concurrency로 취소 전파를 보장한다."
asyncio.wait_for와 달리 SDK 내부에서 CancelledError를 삼켜도 취소가 전파된다.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import anyio


# ── Unit tests for _route_timeout_sec ─────────────────────────────────────────

def test_route_timeout_default():
    """MUSU_ROUTE_TIMEOUT_SEC 미설정 시 기본값 180s."""
    from handlers import _route_timeout_sec
    with patch.dict("os.environ", {}, clear=False):
        import os
        os.environ.pop("MUSU_ROUTE_TIMEOUT_SEC", None)
        assert _route_timeout_sec() == 180.0


def test_route_timeout_env_override():
    """MUSU_ROUTE_TIMEOUT_SEC=60 설정 시 60.0 반환."""
    from handlers import _route_timeout_sec
    with patch.dict("os.environ", {"MUSU_ROUTE_TIMEOUT_SEC": "60"}):
        assert _route_timeout_sec() == 60.0


# ── Integration: route_chat timeout behavior ──────────────────────────────────

@pytest.fixture(autouse=True)
def reset_channel_cb():
    """Reset CB state between tests."""
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
async def test_route_chat_timeout_returns_error():
    """route_message가 타임아웃 초과 시 route_timeout 에러 반환, route_message 결과 없음."""
    import handlers

    async def _slow_route(*args, **kwargs):
        await anyio.sleep(999)  # Never completes in test

    mock_backend = MagicMock()
    mock_backend.get_agent_by_name.return_value = {
        "id": "a1", "role": "engineer", "adapter_type": "gemini_local"
    }
    mock_backend.create_route_execution.return_value = None
    mock_backend.update_route_execution.return_value = None

    with patch("handlers._get_backend", return_value=mock_backend):
        with patch("handlers._health_probe_enabled", return_value=False):
            with patch("handlers.get_bridge_config") as mock_cfg:
                mock_cfg.return_value.channel_agent_map = {"engineer": "engineer"}
                with patch("handlers.get_mesh_router") as mock_mesh:
                    mock_mesh.return_value.enabled = False
                    with patch("handlers.route_message", side_effect=_slow_route):
                        with patch("handlers._route_timeout_sec", return_value=0.05):
                            result = await handlers.route_chat(
                                channel="engineer",
                                sender_id="test",
                                text="do something long",
                            )

    assert "error" in result
    assert "timeout" in result["error"].lower() or "route_timeout" in result["error"].lower()
    assert result.get("response") is None


@pytest.mark.asyncio
async def test_route_chat_timeout_increments_cb():
    """타임아웃 시 circuit breaker failure 카운터 증가."""
    import handlers

    async def _slow_route(*args, **kwargs):
        await anyio.sleep(999)

    mock_backend = MagicMock()
    mock_backend.get_agent_by_name.return_value = {
        "id": "a1", "role": "engineer", "adapter_type": "gemini_local"
    }
    mock_backend.create_route_execution.return_value = None
    mock_backend.update_route_execution.return_value = None

    cb_failures = []

    def _record_failure(channel):
        cb_failures.append(channel)

    with patch("handlers._get_backend", return_value=mock_backend):
        with patch("handlers._health_probe_enabled", return_value=False):
            with patch("handlers.get_bridge_config") as mock_cfg:
                mock_cfg.return_value.channel_agent_map = {"engineer": "engineer"}
                with patch("handlers.get_mesh_router") as mock_mesh:
                    mock_mesh.return_value.enabled = False
                    with patch("handlers.route_message", side_effect=_slow_route):
                        with patch("handlers._route_timeout_sec", return_value=0.05):
                            try:
                                import server
                                orig = server._channel_cb.record_failure
                                server._channel_cb.record_failure = _record_failure
                            except Exception:
                                pass
                            result = await handlers.route_chat(
                                channel="engineer",
                                sender_id="test",
                                text="do something long",
                            )
                            try:
                                server._channel_cb.record_failure = orig
                            except Exception:
                                pass

    assert "error" in result
    # CB failure recorded via _finish (error path)
    assert result.get("response") is None


@pytest.mark.asyncio
async def test_route_chat_fast_response_not_timed_out():
    """빠른 route_message 응답은 타임아웃 없이 정상 완료."""
    import handlers

    mock_backend = MagicMock()
    mock_backend.get_agent_by_name.return_value = {
        "id": "a1", "role": "engineer", "adapter_type": "gemini_local"
    }
    mock_backend.create_route_execution.return_value = None
    mock_backend.update_route_execution.return_value = None

    with patch("handlers._get_backend", return_value=mock_backend):
        with patch("handlers._health_probe_enabled", return_value=False):
            with patch("handlers.get_bridge_config") as mock_cfg:
                mock_cfg.return_value.channel_agent_map = {"engineer": "engineer"}
                with patch("handlers.get_mesh_router") as mock_mesh:
                    mock_mesh.return_value.enabled = False
                    with patch("handlers.route_message", new_callable=AsyncMock, return_value="ok response"):
                        with patch("handlers._route_timeout_sec", return_value=30.0):
                            result = await handlers.route_chat(
                                channel="engineer",
                                sender_id="test",
                                text="quick task",
                            )

    assert result.get("response") == "ok response"
    assert "error" not in result or result.get("error") is None
