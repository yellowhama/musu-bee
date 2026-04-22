"""Phase 78 — Per-channel circuit breaker tests.

근거: memory/project_silent_failure_research.md 항목 4
"Per-channel circuit breaker (3 consecutive failures → 30s block)"
"""

import time
import pytest
from unittest.mock import patch, MagicMock


# ── Unit tests for _ChannelCircuitBreaker ─────────────────────────────────────

def test_cb_closed_initially():
    from server import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=30)
    assert cb.is_open("engineer") is False


def test_cb_opens_after_threshold_failures():
    from server import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=30)
    cb.record_failure("engineer")
    cb.record_failure("engineer")
    assert cb.is_open("engineer") is False  # 2 failures — still closed
    cb.record_failure("engineer")
    assert cb.is_open("engineer") is True   # 3 failures — open


def test_cb_channel_isolation():
    from server import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=30)
    cb.record_failure("engineer")
    cb.record_failure("engineer")
    cb.record_failure("engineer")
    assert cb.is_open("engineer") is True
    assert cb.is_open("cto") is False  # different channel unaffected


def test_cb_auto_closes_after_block_sec():
    from server import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=1)
    cb.record_failure("engineer")
    cb.record_failure("engineer")
    cb.record_failure("engineer")
    assert cb.is_open("engineer") is True
    time.sleep(1.1)
    assert cb.is_open("engineer") is False  # block period expired


def test_cb_window_expiry_resets_count():
    from server import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=1, block_sec=30)
    cb.record_failure("engineer")
    cb.record_failure("engineer")
    time.sleep(1.1)
    cb.record_failure("engineer")  # only 1 failure in current window
    assert cb.is_open("engineer") is False


def test_cb_state_returns_channel_info():
    from server import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=30)
    cb.record_failure("engineer")
    cb.record_failure("engineer")
    cb.record_failure("engineer")
    state = cb.state("engineer")
    assert state["state"] == "open"
    assert state["fail_count"] >= 3


def test_cb_state_closed_channel():
    from server import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=30)
    state = cb.state("engineer")
    assert state["state"] == "closed"
    assert state["fail_count"] == 0


# ── Integration: global CB singleton in server ────────────────────────────────

def test_global_cb_singleton_exists():
    import server
    assert hasattr(server, "_channel_cb")


def test_global_cb_default_thresholds():
    import server
    cb = server._channel_cb
    assert cb._fail_threshold >= 3
    assert cb._block_sec >= 30


# ── circuit_breakers_status endpoint includes channel CB ─────────────────────

@pytest.mark.asyncio
async def test_circuit_breakers_endpoint_includes_channels():
    from server import circuit_breakers_status, _channel_cb
    # Ensure engineer channel shows in response
    _channel_cb.record_failure("engineer")
    _channel_cb.record_failure("engineer")
    _channel_cb.record_failure("engineer")

    result = await circuit_breakers_status()
    assert "channels" in result
    assert "engineer" in result["channels"]
    assert result["channels"]["engineer"]["state"] == "open"

    # Reset for other tests
    _channel_cb._failures.clear()
