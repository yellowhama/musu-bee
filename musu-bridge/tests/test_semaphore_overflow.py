"""Phase 92 T2 — _ChannelSemaphore acquire timeout default 60s.

Sprint Contract T2: MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC default must be 60s (was 30s).
Phase 89 raised task timeout to 600s; 30s acquire timeout abandons tasks prematurely.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
os.environ.setdefault("MUSU_PLAN", "pro")
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import _ChannelSemaphore  # noqa: E402


class TestSemaphoreAcquireTimeoutDefault:
    """Default acquire timeout must be 60s per Phase 92 contract."""

    def test_default_acquire_timeout_is_60s(self):
        """When MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC is not set, default must be 60.0."""
        env_without_override = {k: v for k, v in os.environ.items()
                                if k != "MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC"}

        timeout_used: list[float] = []

        async def run():
            sem = _ChannelSemaphore(1)
            # Fill the slot so acquire will block
            await sem.acquire()

            original_wait_for = asyncio.wait_for

            async def capture_wait_for(coro, timeout):
                timeout_used.append(timeout)
                raise asyncio.TimeoutError()

            with patch.dict(os.environ, env_without_override, clear=True):
                with patch("asyncio.wait_for", side_effect=capture_wait_for):
                    try:
                        await sem.acquire(timeout=float(os.environ.get(
                            "MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC", "60"
                        )))
                    except asyncio.TimeoutError:
                        pass

        asyncio.run(run())
        assert timeout_used, "acquire() with timeout must call asyncio.wait_for"
        assert timeout_used[0] == 60.0, (
            f"Default acquire timeout must be 60.0s, got {timeout_used[0]}s"
        )

    def test_env_override_respected(self):
        """MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC=120 must set acquire timeout to 120.0s."""
        timeout_used: list[float] = []

        async def run():
            sem = _ChannelSemaphore(1)
            await sem.acquire()

            async def capture_wait_for(coro, timeout):
                timeout_used.append(timeout)
                raise asyncio.TimeoutError()

            with patch("asyncio.wait_for", side_effect=capture_wait_for):
                try:
                    await sem.acquire(timeout=float(os.environ.get(
                        "MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC", "60"
                    )))
                except asyncio.TimeoutError:
                    pass

        with patch.dict(os.environ, {"MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC": "120"}):
            asyncio.run(run())

        assert timeout_used[0] == 120.0, (
            f"Expected 120.0s timeout, got {timeout_used[0]}s"
        )

    def test_aenter_uses_60s_default_when_env_not_set(self):
        """__aenter__ must read 60s default from env, not hardcoded 30s."""
        import inspect
        import server as _server
        src = inspect.getsource(_server._ChannelSemaphore.__aenter__)
        # Must not contain '30' as a default literal for the timeout
        assert '"30"' not in src and "'30'" not in src, (
            f"__aenter__ must not use 30s as default timeout — update to 60s.\nSource:\n{src}"
        )

    def test_aenter_uses_120s_literal_default(self):
        """__aenter__ source must reference '120' as the default timeout value.

        Raised from 60s (Phase 92) to 120s: channel capacity doubled 5→10,
        burst traffic drains faster, but we still need sufficient wait time.
        """
        import inspect
        import server as _server
        src = inspect.getsource(_server._ChannelSemaphore.__aenter__)
        assert '"120"' in src or "'120'" in src, (
            f"__aenter__ must use 120s as default MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC.\nSource:\n{src}"
        )


class TestSemaphoreAvailableAfterTimeout:
    """Mid-acquire TimeoutError must not change available count."""

    def test_timeout_on_acquire_does_not_alter_available(self):
        """TimeoutError from acquire() must leave _available unchanged."""

        async def run():
            sem = _ChannelSemaphore(1)
            await sem.acquire()
            assert sem.available == 0

            try:
                await sem.acquire(timeout=0.01)
            except asyncio.TimeoutError:
                pass

            assert sem.available == 0, (
                f"available must stay 0 after timed-out acquire, got {sem.available}"
            )
            sem.release()
            assert sem.available == 1

        asyncio.run(run())

    def test_available_never_exceeds_capacity_after_repeated_timeouts(self):
        """Repeated timed-out acquires must never push available above capacity."""

        async def run():
            sem = _ChannelSemaphore(2)
            await sem.acquire()
            await sem.acquire()

            for _ in range(5):
                try:
                    await sem.acquire(timeout=0.01)
                except asyncio.TimeoutError:
                    pass

            assert sem.available == 0
            assert sem.available <= sem.capacity

            sem.release()
            sem.release()
            assert sem.available == sem.capacity

        asyncio.run(run())

    def test_normal_acquire_release_unaffected_by_change(self):
        """Normal acquire/release cycle must still work after default timeout change."""

        async def run():
            sem = _ChannelSemaphore(3)
            assert sem.available == 3
            await sem.acquire()
            assert sem.available == 2
            await sem.acquire()
            assert sem.available == 1
            sem.release()
            assert sem.available == 2
            sem.release()
            assert sem.available == 3

        asyncio.run(run())
