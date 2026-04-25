"""Tests for _ChannelSemaphore double-release guard.

Phase 88 switched from asyncio.Semaphore to asyncio.BoundedSemaphore.
BoundedSemaphore raises ValueError when released beyond its bound.
These tests verify release() never crashes on over-release.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from server import _ChannelSemaphore  # noqa: E402


class TestDoubleReleaseGuard:
    """release() must be safe even when called without a matching acquire."""

    def test_release_with_sem_at_bound_does_not_raise(self):
        """BoundedSemaphore at full capacity must not raise on release()."""

        async def run():
            sem = _ChannelSemaphore(3)
            # Force _sem into existence at full capacity (no prior acquire)
            sem._sem = asyncio.BoundedSemaphore(3)
            sem._available = 3
            # Must not raise ValueError: BoundedSemaphore released too many times
            sem.release()
            assert sem.available == 3

        asyncio.run(run())

    def test_release_after_value_setter_zero_does_not_raise(self):
        """_value = 0 creates BoundedSemaphore(0); release() must not raise."""

        async def run():
            sem = _ChannelSemaphore(5)
            sem._value = 0  # creates BoundedSemaphore(0) — over-release bomb
            # Must not raise ValueError
            sem.release()
            assert sem.available <= sem.capacity

        asyncio.run(run())

    def test_extra_release_beyond_capacity_is_noop(self):
        """release() called more times than acquire() must be a silent no-op."""

        async def run():
            sem = _ChannelSemaphore(2)
            await sem.acquire()
            await sem.acquire()
            sem.release()
            sem.release()  # back to full capacity
            # One extra release — must not raise
            sem.release()
            assert sem.available == sem.capacity

        asyncio.run(run())

    def test_normal_acquire_release_cycle_unaffected(self):
        """Normal acquire/release cycle must work correctly after the guard."""

        async def run():
            sem = _ChannelSemaphore(3)
            assert sem.available == 3
            await sem.acquire()
            assert sem.available == 2
            sem.release()
            assert sem.available == 3

        asyncio.run(run())

    def test_async_with_cancel_during_blocked_acquire_does_not_raise(self):
        """Task cancelled while blocked on semaphore acquire must not double-release."""

        async def run():
            sem = _ChannelSemaphore(1)
            await sem.acquire()  # fill the slot

            async def waiter():
                async with sem:
                    pass  # will never reach here

            task = asyncio.create_task(waiter())
            await asyncio.sleep(0)  # let waiter block on acquire
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            # Release the original acquire — must not raise
            sem.release()
            assert sem.available == sem.capacity

        asyncio.run(run())
