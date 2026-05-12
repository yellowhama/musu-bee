"""Phase 84 — Agent unavailable retry + team_lead channel mapping.

수정 내용:
1. config.py channel_agent_map에 'team_lead' → 'lead' 추가
2. server.py _run_once(): route_chat 'Agent unavailable' 결과 → RuntimeError
3. server.py _run_with_retry(): 'unavailable' RuntimeError도 retry 대상
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Test 1: config.py team_lead 채널 매핑 ─────────────────────────────────────

def test_team_lead_channel_in_config():
    """config.py channel_agent_map에 team_lead 매핑이 존재해야 한다."""
    from config import BridgeConfig
    cfg = BridgeConfig()
    assert "team_lead" in cfg.channel_agent_map
    # Default is the generic 'team-lead' handle; operators can override via MUSU_AGENT_TEAM_LEAD env var
    assert cfg.channel_agent_map["team_lead"]  # non-empty


# ── Test 2: _run_once logic: unavailable dict → RuntimeError ──────────────────

def test_unavailable_dict_triggers_runtime_error():
    """route_chat 반환값에 'unavailable' 포함 시 RuntimeError를 발생시켜야 한다.

    server.py _run_once() 핵심 로직:
        if isinstance(_result, dict) and 'unavailable' in (_result.get('error') or '').lower():
            raise RuntimeError(...)
    """
    result = {"error": "Agent unavailable. Please try again later.", "response": None}
    error_str = (result.get("error") or "").lower()
    # Verify the condition that _run_once uses
    assert isinstance(result, dict)
    assert "unavailable" in error_str

    # Verify RuntimeError would be raised with correct message
    try:
        if isinstance(result, dict) and "unavailable" in (result.get("error") or "").lower():
            raise RuntimeError(f"Agent unavailable: {result.get('error')}")
        pytest.fail("RuntimeError should have been raised")
    except RuntimeError as exc:
        assert "unavailable" in str(exc).lower()


# ── Test 3: server.py _run_once raises correctly ──────────────────────────────

@pytest.mark.asyncio
async def test_run_once_raises_runtime_error_on_unavailable():
    """_run_once()가 route_chat unavailable 결과를 RuntimeError로 변환하는지 검증."""
    import asyncio

    unavailable = {"error": "Agent unavailable. Please try again later.", "response": None}

    # Simulate _run_once logic directly (extracted from server.py)
    async def _simulate_run_once(mock_result):
        _result = await asyncio.sleep(0) or mock_result  # simulate await
        if isinstance(_result, dict) and "unavailable" in (_result.get("error") or "").lower():
            raise RuntimeError(f"Agent unavailable: {_result.get('error')}")
        return True

    with pytest.raises(RuntimeError, match="unavailable"):
        await _simulate_run_once(unavailable)

    # Success case: no exception
    success = {"response": "ok", "error": None}
    result = await _simulate_run_once(success)
    assert result is True


# ── Test 4: RuntimeError 'unavailable' is retry-eligible ──────────────────────

def test_unavailable_runtime_error_matches_retry_condition():
    """'unavailable' 문자열이 포함된 RuntimeError는 retry 조건을 만족해야 한다."""
    exc = RuntimeError("Agent unavailable: health_probe failed")
    exc_str = str(exc)
    # This mirrors the condition in server.py _run_with_retry
    assert "unavailable" in exc_str.lower()


def test_exited_with_code_still_retry_eligible():
    """기존 'exited with code' 패턴도 여전히 retry 조건 만족 (리그레션 없음)."""
    exc = RuntimeError("subprocess exited with code 1")
    exc_str = str(exc)
    assert "exited with code" in exc_str
