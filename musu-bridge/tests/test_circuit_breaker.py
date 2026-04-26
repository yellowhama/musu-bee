"""Per-channel circuit breaker on mesh_router.forward() — TDD tests.

근거: memory/project_silent_failure_research.md — per-channel circuit breaker
for remote forwarding path (mesh_router.forward) to prevent zombie watchdog
cancellation cascades.
"""
from __future__ import annotations

import asyncio
import time
import pytest
from unittest.mock import AsyncMock, patch

from mesh_router import CircuitBreaker, MeshRouter


# ── Unit tests: CircuitBreaker class ─────────────────────────────────────────

class TestCircuitBreakerTransitions:
    def test_closed_to_open_after_threshold_failures(self):
        """CLOSED → OPEN after failure_threshold consecutive failures."""
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        cb.record_failure("agent_a")
        cb.record_failure("agent_a")
        assert not cb.is_open("agent_a")  # 2 failures — still CLOSED
        cb.record_failure("agent_a")
        assert cb.is_open("agent_a")      # 3 failures — OPEN

    def test_open_state_skips_immediately(self):
        """OPEN channel is reported as open without additional checks."""
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        for _ in range(3):
            cb.record_failure("agent_a")
        # Must be open immediately — no delay
        assert cb.is_open("agent_a") is True
        assert cb.is_open("agent_a") is True  # idempotent

    def test_half_open_to_closed_after_cooldown(self):
        """After cooldown_seconds, OPEN → HALF-OPEN → CLOSED on success."""
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=1)
        for _ in range(3):
            cb.record_failure("agent_a")
        assert cb.is_open("agent_a") is True

        time.sleep(1.1)
        # After cooldown: circuit allows a probe — is_open returns False (HALF-OPEN)
        assert cb.is_open("agent_a") is False

        # Recording success keeps it CLOSED
        cb.record_success("agent_a")
        assert cb.is_open("agent_a") is False

    def test_channel_isolation(self):
        """Failures on one channel don't affect another."""
        cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        for _ in range(3):
            cb.record_failure("agent_a")
        assert cb.is_open("agent_a") is True
        assert cb.is_open("agent_b") is False

    def test_env_override_failure_threshold(self):
        """MUSU_MESH_CB_FAIL_THRESHOLD env var overrides default threshold."""
        import os
        with patch.dict(os.environ, {"MUSU_MESH_CB_FAIL_THRESHOLD": "2"}):
            cb = CircuitBreaker.from_env()
        cb.record_failure("agent_x")
        assert not cb.is_open("agent_x")  # 1 failure
        cb.record_failure("agent_x")
        assert cb.is_open("agent_x")      # 2 failures — threshold=2

    def test_env_override_cooldown_seconds(self):
        """MUSU_MESH_CB_COOLDOWN_SECONDS env var overrides default cooldown."""
        import os
        with patch.dict(os.environ, {"MUSU_MESH_CB_COOLDOWN_SECONDS": "1", "MUSU_MESH_CB_FAIL_THRESHOLD": "1"}):
            cb = CircuitBreaker.from_env()
        cb.record_failure("agent_x")
        assert cb.is_open("agent_x") is True
        # Simulate cooldown elapsed by backdating tripped_at (avoids flaky wall-clock sleep)
        cb._tripped_at["agent_x"] = time.time() - 1.5
        assert cb.is_open("agent_x") is False


# ── Integration: MeshRouter.forward() uses circuit breaker ───────────────────

class TestMeshRouterCircuitBreaker:
    def _make_router(self) -> MeshRouter:
        """Create a MeshRouter with a pre-wired node (no nodes.toml needed)."""
        router = MeshRouter.__new__(MeshRouter)
        router._path = None  # type: ignore[assignment]
        router._self_name = "local"
        router._node_urls = {"remote": "http://remote:8070"}
        router._node_agents = {"remote": ["agent_a"]}
        router._agent_nodes = {"agent_a": "remote"}
        router._node_tokens = {}
        router._node_mac = {}
        router._node_broadcast = {}
        router._node_fingerprints = {}
        router._health_cache = {}
        router._loaded = True
        from mesh_router import CircuitBreaker
        router._cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
        return router

    @pytest.mark.asyncio
    async def test_open_circuit_returns_fallback_without_http(self):
        """When circuit is OPEN, forward() returns fallback dict without HTTP call."""
        router = self._make_router()
        for _ in range(3):
            router._cb.record_failure("agent_a")

        with patch.object(router, "_forward_http", new_callable=AsyncMock) as mock_http:
            result = await router.forward("http://remote:8070", "agent_a", "user", "hello")

        mock_http.assert_not_called()
        assert "error" in result
        assert "circuit" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_closed_circuit_calls_http(self):
        """When circuit is CLOSED, forward() proceeds to HTTP (or QUIC)."""
        router = self._make_router()
        expected = {"response": "ok"}

        with patch.object(router, "_forward_http", new_callable=AsyncMock, return_value=expected) as mock_http:
            result = await router.forward("http://remote:8070", "agent_a", "user", "hello")

        mock_http.assert_called_once()
        assert result == expected

    @pytest.mark.asyncio
    async def test_http_error_records_failure_and_trips_circuit(self):
        """HTTP errors increment the circuit breaker failure counter."""
        router = self._make_router()

        error_result = {"error": "remote_unreachable", "response": None}
        with patch.object(router, "_forward_http", new_callable=AsyncMock, return_value=error_result):
            for _ in range(3):
                await router.forward("http://remote:8070", "agent_a", "user", "hello")

        assert router._cb.is_open("agent_a") is True
