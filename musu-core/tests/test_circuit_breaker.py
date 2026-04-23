"""TDD tests for CircuitBreaker in musu_core.router."""
import time
import pytest
from musu_core.router import CircuitBreaker, CircuitState


class TestCircuitBreakerInitialState:
    def test_starts_closed(self):
        cb = CircuitBreaker(failure_threshold=5, recovery_timeout=60)
        assert cb.state == CircuitState.CLOSED

    def test_allows_calls_when_closed(self):
        cb = CircuitBreaker(failure_threshold=5, recovery_timeout=60)
        assert cb.allow_request() is True


class TestCircuitBreakerOpening:
    def test_opens_after_failure_threshold(self):
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=60)
        for _ in range(3):
            cb.record_failure()
        assert cb.state == CircuitState.OPEN

    def test_blocks_calls_when_open(self):
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=60)
        for _ in range(3):
            cb.record_failure()
        assert cb.allow_request() is False

    def test_does_not_open_below_threshold(self):
        cb = CircuitBreaker(failure_threshold=5, recovery_timeout=60)
        for _ in range(4):
            cb.record_failure()
        assert cb.state == CircuitState.CLOSED


class TestCircuitBreakerHalfOpen:
    def test_transitions_to_half_open_after_recovery_timeout(self):
        cb = CircuitBreaker(failure_threshold=2, recovery_timeout=0.05)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        time.sleep(0.06)
        # allow_request probes HALF_OPEN state
        assert cb.allow_request() is True
        assert cb.state == CircuitState.HALF_OPEN

    def test_closes_on_success_in_half_open(self):
        cb = CircuitBreaker(failure_threshold=2, recovery_timeout=0.05)
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.06)
        cb.allow_request()  # transitions to HALF_OPEN
        cb.record_success()
        assert cb.state == CircuitState.CLOSED

    def test_reopens_on_failure_in_half_open(self):
        cb = CircuitBreaker(failure_threshold=2, recovery_timeout=0.05)
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.06)
        cb.allow_request()  # transitions to HALF_OPEN
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
