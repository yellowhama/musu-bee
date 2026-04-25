"""Sprint Contract fix — route_timeout reduction + CB block_sec increase.

Tests (RED phase — must fail before production changes):
1. ceo channel timeout defaults to 120s (was 300s)
2. team_lead channel timeout defaults to 90s (was 300s)
3. Default circuit breaker block_sec is 60 (was 30)
4. CB still opens after 3 failures on ceo channel
"""
import os
import time
from unittest.mock import patch

import pytest


# ── helpers ───────────────────────────────────────────────────────────────────

def _route_timeout(channel: str, extra_env: dict | None = None) -> float:
    """Import handlers fresh, strip all relevant env vars, then query timeout."""
    import importlib
    import handlers
    importlib.reload(handlers)

    strip = {
        "MUSU_ROUTE_TIMEOUT_SEC": "",
        "MUSU_ROUTE_TIMEOUT_SEC_CEO": "",
        "MUSU_ROUTE_TIMEOUT_SEC_TEAM_LEAD": "",
        "MUSU_ROUTE_TIMEOUT_SEC_ENGINEER": "",
    }
    with patch.dict(os.environ, strip):
        for k in strip:
            os.environ.pop(k, None)
        if extra_env:
            os.environ.update(extra_env)
        importlib.reload(handlers)
        return handlers._route_timeout_sec(channel)


# ── timeout tests ─────────────────────────────────────────────────────────────

def test_ceo_default_timeout_is_600():
    """ceo channel must default to 600s — 120s caused repeated route_timeout failures."""
    result = _route_timeout("ceo")
    assert result == 600.0, f"Expected 600.0 for ceo, got {result}"


def test_team_lead_default_timeout_is_600():
    """team_lead channel must default to 600s — unified with all channels in Phase 89."""
    result = _route_timeout("team_lead")
    assert result == 600.0, f"Expected 600.0 for team_lead, got {result}"


def test_ceo_env_override_still_works():
    """MUSU_ROUTE_TIMEOUT_SEC_CEO env var must override the new 120s default."""
    result = _route_timeout("ceo", {"MUSU_ROUTE_TIMEOUT_SEC_CEO": "60"})
    assert result == 60.0, f"Expected 60.0 from env override, got {result}"


def test_team_lead_env_override_still_works():
    """MUSU_ROUTE_TIMEOUT_SEC_TEAM_LEAD env var must override the 300s default."""
    result = _route_timeout("team_lead", {"MUSU_ROUTE_TIMEOUT_SEC_TEAM_LEAD": "45"})
    assert result == 45.0, f"Expected 45.0 from env override, got {result}"


# ── circuit breaker block_sec tests ──────────────────────────────────────────

def test_default_cb_block_sec_is_60():
    """Global _channel_cb must use block_sec=60 (was 30) to give 60s open window."""
    import importlib
    import channel_circuit_breaker as ccb
    importlib.reload(ccb)

    # The module-level _channel_cb is built at import time from env vars.
    # With no env override, block_sec must be 60.
    with patch.dict(os.environ, {"MUSU_CB_BLOCK_SEC": ""}, clear=False):
        os.environ.pop("MUSU_CB_BLOCK_SEC", None)
        importlib.reload(ccb)
        assert ccb._channel_cb._block_sec == 60, (
            f"Expected block_sec=60, got {ccb._channel_cb._block_sec}"
        )


def test_cb_env_override_still_works():
    """MUSU_CB_BLOCK_SEC env var must override the new 60s default."""
    import importlib
    import channel_circuit_breaker as ccb

    with patch.dict(os.environ, {"MUSU_CB_BLOCK_SEC": "120"}):
        importlib.reload(ccb)
        assert ccb._channel_cb._block_sec == 120, (
            f"Expected block_sec=120 from env, got {ccb._channel_cb._block_sec}"
        )


def test_cb_opens_after_3_failures_on_ceo():
    """ceo circuit breaker must open after 3 failures (threshold unchanged)."""
    from channel_circuit_breaker import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=60)
    cb.record_failure("ceo")
    cb.record_failure("ceo")
    assert cb.is_open("ceo") is False  # 2 failures — still closed
    cb.record_failure("ceo")
    assert cb.is_open("ceo") is True   # 3 failures — open


def test_cb_stays_open_for_60s_block():
    """Circuit breaker must stay open until 60s block expires (not 30s)."""
    from channel_circuit_breaker import _ChannelCircuitBreaker
    cb = _ChannelCircuitBreaker(fail_threshold=3, window_sec=60, block_sec=60)
    cb.record_failure("ceo")
    cb.record_failure("ceo")
    cb.record_failure("ceo")
    state = cb.state("ceo")
    assert state["block_sec"] == 60, f"Expected block_sec=60 in state, got {state['block_sec']}"
    assert state["state"] == "open"
