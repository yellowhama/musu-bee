"""relay_circuit_breaker.py — fail-secure circuit breaker for relay token verification.

States: closed (normal) → open (blocked) → half-open (probe) → closed
"""
from __future__ import annotations

import time


class RelayCircuitBreaker:
    """Token verification circuit breaker.

    - failure_threshold consecutive failures → open (block all)
    - recovery_timeout seconds in open → half-open (allow one probe)
    - success in half-open → closed (reset counter)
    - failure in half-open → back to open
    """

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0) -> None:
        self._threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._opened_at: float | None = None
        self._half_open_probe_sent = False

    def is_open(self) -> bool:
        """Return True if circuit is open (request should be blocked)."""
        if self._opened_at is None:
            return False

        elapsed = time.monotonic() - self._opened_at
        if elapsed >= self._recovery_timeout:
            if self._half_open_probe_sent:
                # Still waiting for probe result — keep blocking
                return True
            # Transition to half-open: allow one probe through
            self._half_open_probe_sent = True
            return False

        return True

    def record_failure(self) -> None:
        """Record a token verification failure."""
        if self._opened_at is not None:
            elapsed = time.monotonic() - self._opened_at
            if elapsed >= self._recovery_timeout and self._half_open_probe_sent:
                # Failure in half-open → re-open, reset probe flag
                self._opened_at = time.monotonic()
                self._half_open_probe_sent = False
                self._failure_count = self._threshold
                return

        self._failure_count += 1
        if self._failure_count >= self._threshold:
            self._opened_at = time.monotonic()
            self._half_open_probe_sent = False

    def record_success(self) -> None:
        """Record a successful token verification — closes circuit."""
        self._failure_count = 0
        self._opened_at = None
        self._half_open_probe_sent = False


# Module-level singleton used by relay_client.py
_relay_circuit_breaker = RelayCircuitBreaker()
