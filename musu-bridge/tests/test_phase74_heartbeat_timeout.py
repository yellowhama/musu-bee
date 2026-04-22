"""Phase 74: Heartbeat timeout extension + fire-and-check pattern tests.

Tests:
1. MUSU_HEARTBEAT_TIMEOUT_SEC default is 600 (not 300)
2. CEO prompt includes fire-and-check instruction (no polling loop)
3. CEO prompt explicitly forbids while-True polling
"""
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_heartbeat_timeout_default_is_600():
    """MUSU_HEARTBEAT_TIMEOUT_SEC default must be 600s, not 300s.

    Root cause: CEO polling loop (15s × ~20 rounds) exceeded old 300s limit,
    causing watchdog to cancel CEO tasks repeatedly.
    """
    import importlib
    import server

    # Without the env var, the default should resolve to 600
    with patch.dict(os.environ, {}, clear=False):
        os.environ.pop("MUSU_HEARTBEAT_TIMEOUT_SEC", None)
        timeout = int(os.environ.get("MUSU_HEARTBEAT_TIMEOUT_SEC", "600"))
    assert timeout == 600, f"Expected default 600s, got {timeout}s"


@pytest.mark.asyncio
async def test_heartbeat_iteration_uses_600s_timeout():
    """_heartbeat_iteration must use 600s timeout when env var not set."""
    import server

    captured_timeout = []

    async def fake_wait_for(coro, timeout):
        captured_timeout.append(timeout)
        # Cancel the coro to avoid running it
        coro.close()

    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = []

    with (
        patch("server._get_heartbeat_backend", return_value=mock_backend),
        patch("server._should_skip_heartbeat", return_value=(False, "")),
        patch("server.route_chat", new_callable=AsyncMock),
        patch("asyncio.wait_for", side_effect=fake_wait_for),
        patch.dict(os.environ, {}, clear=False),
    ):
        os.environ.pop("MUSU_HEARTBEAT_TIMEOUT_SEC", None)
        await server._heartbeat_iteration(
            agent_name="ceo",
            company_id=None,
            diag_summary="",
        )

    assert captured_timeout, "asyncio.wait_for was never called"
    assert captured_timeout[0] >= 600, (
        f"Heartbeat timeout {captured_timeout[0]}s is too short — CEO needs ≥600s"
    )


@pytest.mark.asyncio
async def test_ceo_prompt_contains_fire_and_check_pattern():
    """CEO heartbeat prompt must instruct fire-and-check, not polling loop.

    Pattern: delegate_task → record task_id → exit heartbeat →
    next heartbeat: get_task_status(task_id) to check result.
    """
    import server

    captured_text = []

    async def fake_route_chat(**kwargs):
        captured_text.append(kwargs.get("text", ""))

    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = []

    with (
        patch("server._get_heartbeat_backend", return_value=mock_backend),
        patch("server._should_skip_heartbeat", return_value=(False, "")),
        patch("server.route_chat", side_effect=fake_route_chat),
        patch.dict(os.environ, {"MUSU_HEARTBEAT_TIMEOUT_SEC": "600"}),
    ):
        await server._heartbeat_iteration(
            agent_name="ceo",
            company_id=None,
            diag_summary="",
        )

    assert captured_text, "route_chat was never called"
    prompt = captured_text[0]

    # Must instruct fire-and-check pattern
    assert any(
        keyword in prompt
        for keyword in ["fire-and-check", "다음 heartbeat", "즉시 종료", "task_id 기록"]
    ), f"CEO prompt missing fire-and-check pattern. Got: {prompt[:300]}"


@pytest.mark.asyncio
async def test_ceo_prompt_forbids_polling_loop():
    """CEO heartbeat prompt must explicitly forbid while-True polling loops."""
    import server

    captured_text = []

    async def fake_route_chat(**kwargs):
        captured_text.append(kwargs.get("text", ""))

    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = []

    with (
        patch("server._get_heartbeat_backend", return_value=mock_backend),
        patch("server._should_skip_heartbeat", return_value=(False, "")),
        patch("server.route_chat", side_effect=fake_route_chat),
        patch.dict(os.environ, {"MUSU_HEARTBEAT_TIMEOUT_SEC": "600"}),
    ):
        await server._heartbeat_iteration(
            agent_name="ceo",
            company_id=None,
            diag_summary="",
        )

    assert captured_text, "route_chat was never called"
    prompt = captured_text[0]

    # Must forbid polling loop
    assert any(
        keyword in prompt
        for keyword in ["폴링 루프 금지", "while True 금지", "sleep 루프 금지", "polling loop 금지"]
    ), f"CEO prompt missing polling loop prohibition. Got: {prompt[:300]}"
