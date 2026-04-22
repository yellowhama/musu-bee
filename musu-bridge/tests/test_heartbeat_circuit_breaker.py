"""Tests for heartbeat circuit breaker — _should_skip_heartbeat."""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timedelta

from server import _should_skip_heartbeat, CIRCUIT_TRIP_THRESHOLD


def _make_backend(running: bool = False, recent_failures: int = 0):
    """Build a minimal mock backend for circuit breaker tests."""
    backend = MagicMock()
    call_count = [0]

    def fake_execute(sql, params=()):
        call_count[0] += 1
        if "status = 'running'" in sql:
            return [{"id": 1}] if running else []
        if "COUNT(*)" in sql:
            return [{"cnt": recent_failures}]
        return []

    backend._db.execute.side_effect = fake_execute
    return backend


# ---------------------------------------------------------------------------
# 1. running 태스크 있으면 (True, 'already running')
# ---------------------------------------------------------------------------

def test_skip_when_task_is_running():
    backend = _make_backend(running=True, recent_failures=0)
    should_skip, reason = _should_skip_heartbeat(backend, channel="ceo")
    assert should_skip is True
    assert reason == "already running"


# ---------------------------------------------------------------------------
# 2. 실패 0회 → (False, '')
# ---------------------------------------------------------------------------

def test_no_skip_when_zero_failures():
    backend = _make_backend(running=False, recent_failures=0)
    should_skip, reason = _should_skip_heartbeat(backend, channel="ceo")
    assert should_skip is False
    assert reason == ""


# ---------------------------------------------------------------------------
# 3. 실패 2회 → (False, '') — 임계치 미달
# ---------------------------------------------------------------------------

def test_no_skip_when_below_threshold():
    backend = _make_backend(running=False, recent_failures=CIRCUIT_TRIP_THRESHOLD - 1)
    should_skip, reason = _should_skip_heartbeat(backend, channel="ceo")
    assert should_skip is False
    assert reason == ""


# ---------------------------------------------------------------------------
# 4. 실패 3회 → (True, 'circuit open ...')
# ---------------------------------------------------------------------------

def test_skip_when_at_threshold():
    backend = _make_backend(running=False, recent_failures=CIRCUIT_TRIP_THRESHOLD)
    should_skip, reason = _should_skip_heartbeat(backend, channel="ceo")
    assert should_skip is True
    assert "circuit open" in reason


# ---------------------------------------------------------------------------
# 5. 실패 5회 → (True, ...) — backoff 더 큼
# ---------------------------------------------------------------------------

def test_skip_with_higher_backoff_at_more_failures():
    backend_3 = _make_backend(running=False, recent_failures=3)
    backend_5 = _make_backend(running=False, recent_failures=5)

    _, reason_3 = _should_skip_heartbeat(backend_3, channel="ceo")
    _, reason_5 = _should_skip_heartbeat(backend_5, channel="ceo")

    def parse_backoff(reason: str) -> int:
        # reason format: "circuit open (N recent failures, backoff=Xs)"
        import re
        m = re.search(r"backoff=(\d+)s", reason)
        assert m, f"backoff not found in: {reason}"
        return int(m.group(1))

    assert parse_backoff(reason_5) > parse_backoff(reason_3)


# ---------------------------------------------------------------------------
# 6. DB 예외 → (False, '') — fail-open
# ---------------------------------------------------------------------------

def test_fail_open_on_db_exception():
    backend = MagicMock()
    backend._db.execute.side_effect = RuntimeError("db gone")
    should_skip, reason = _should_skip_heartbeat(backend, channel="ceo")
    assert should_skip is False
    assert reason == ""
