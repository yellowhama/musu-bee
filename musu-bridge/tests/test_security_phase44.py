"""test_security_phase44.py — Phase 44 보안 강화 테스트.

1. watchdog 레이트 리밋 user_id 격리
2. relay circuit breaker fail-secure
"""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

AUTH = {"Authorization": "Bearer test-token"}


@pytest.fixture()
def client():
    from server import app
    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# P44-01: watchdog 레이트 리밋 — user_id 격리
# ---------------------------------------------------------------------------

def test_watchdog_rate_limit_same_user_blocked(client):
    """동일 IP+node+command: 10초 내 2회 → 429."""
    import server as srv

    # 캐시 초기화
    srv._watchdog_rate.clear()

    mock_router = MagicMock()
    mock_router.forward_watchdog = AsyncMock(return_value={"ok": True})

    with patch("mesh_router.get_mesh_router", return_value=mock_router):
        r1 = client.post("/api/watchdog/node1/agents:cleanup", headers=AUTH)
        r2 = client.post("/api/watchdog/node1/agents:cleanup", headers=AUTH)

    assert r1.status_code == 200
    assert r2.status_code == 429
    assert "Rate limited" in r2.json()["detail"]


def test_watchdog_rate_limit_different_users_independent(client):
    """다른 IP+node+command: 서로 독립 — 두 번째 사용자도 200."""
    import server as srv

    srv._watchdog_rate.clear()

    mock_router = MagicMock()
    mock_router.forward_watchdog = AsyncMock(return_value={"ok": True})

    with patch("mesh_router.get_mesh_router", return_value=mock_router):
        # testclient는 기본적으로 127.0.0.1 → IP 격리 테스트는
        # _watchdog_rate_check 단위 테스트로 검증
        r1 = client.post("/api/watchdog/node1/agents:cleanup", headers=AUTH)
        assert r1.status_code == 200


def test_watchdog_rate_check_user_isolation():
    """_watchdog_rate_check: 다른 user_id는 독립적으로 허용."""
    import server as srv

    srv._watchdog_rate.clear()

    # user1: node1/restart — 허용
    assert srv._watchdog_rate_check("user1", "node1", "restart") is True
    # user1: node1/restart — 차단 (10초 이내)
    assert srv._watchdog_rate_check("user1", "node1", "restart") is False
    # user2: node1/restart — 허용 (다른 user_id)
    assert srv._watchdog_rate_check("user2", "node1", "restart") is True
    # user2: node1/restart — 차단
    assert srv._watchdog_rate_check("user2", "node1", "restart") is False


def test_watchdog_rate_check_different_nodes_independent():
    """동일 user + 다른 node → 독립."""
    import server as srv

    srv._watchdog_rate.clear()

    assert srv._watchdog_rate_check("user1", "nodeA", "restart") is True
    assert srv._watchdog_rate_check("user1", "nodeB", "restart") is True


def test_watchdog_rate_check_different_commands_independent():
    """동일 user+node + 다른 command → 독립."""
    import server as srv

    srv._watchdog_rate.clear()

    assert srv._watchdog_rate_check("user1", "node1", "restart") is True
    assert srv._watchdog_rate_check("user1", "node1", "status") is True


# ---------------------------------------------------------------------------
# P44-02: relay circuit breaker — fail-secure
# ---------------------------------------------------------------------------

def test_relay_circuit_breaker_trips_after_5_failures():
    """토큰 검증 연속 5회 실패 → circuit open → 다음 요청 즉시 False."""
    from relay_circuit_breaker import RelayCircuitBreaker

    cb = RelayCircuitBreaker(failure_threshold=5, recovery_timeout=60)

    # 5회 실패 기록
    for _ in range(5):
        cb.record_failure()

    assert cb.is_open() is True


def test_relay_circuit_breaker_allows_before_threshold():
    """4회 실패 → circuit 아직 closed."""
    from relay_circuit_breaker import RelayCircuitBreaker

    cb = RelayCircuitBreaker(failure_threshold=5, recovery_timeout=60)

    for _ in range(4):
        cb.record_failure()

    assert cb.is_open() is False


def test_relay_circuit_breaker_half_open_after_timeout():
    """circuit open 후 60초 경과 → half-open (1회 허용)."""
    from relay_circuit_breaker import RelayCircuitBreaker

    cb = RelayCircuitBreaker(failure_threshold=5, recovery_timeout=0.01)

    for _ in range(5):
        cb.record_failure()

    assert cb.is_open() is True

    time.sleep(0.02)  # recovery_timeout 경과

    # half-open: 1회 허용
    assert cb.is_open() is False


def test_relay_circuit_breaker_closes_after_success():
    """half-open 상태에서 성공 1회 → closed (카운터 리셋)."""
    from relay_circuit_breaker import RelayCircuitBreaker

    cb = RelayCircuitBreaker(failure_threshold=5, recovery_timeout=0.01)

    for _ in range(5):
        cb.record_failure()

    time.sleep(0.02)

    # half-open: record_success → closed
    cb.record_success()
    assert cb.is_open() is False

    # 실패 카운터 리셋됐으므로 다시 5회 필요
    for _ in range(4):
        cb.record_failure()
    assert cb.is_open() is False


def test_relay_circuit_breaker_reopens_on_half_open_failure():
    """half-open 상태에서 실패 → 다시 open."""
    from relay_circuit_breaker import RelayCircuitBreaker

    cb = RelayCircuitBreaker(failure_threshold=5, recovery_timeout=0.01)

    for _ in range(5):
        cb.record_failure()

    time.sleep(0.02)

    # half-open 상태 확인 후 실패
    assert cb.is_open() is False  # half-open: 허용
    cb.record_failure()  # half-open에서 실패 → 다시 open
    assert cb.is_open() is True
