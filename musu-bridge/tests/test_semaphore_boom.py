"""Regression tests for semaphore boom fix.

Root cause: _value.setter replaced self._sem with a new BoundedSemaphore while
in-flight acquire/release operations held a reference to the old semaphore object.
When release() ran on the new sem (never acquired), BoundedSemaphore raised
ValueError: BoundedSemaphore released too many times — logged as 'semaphore boom'.

Fix: use asyncio.Semaphore (not BoundedSemaphore) + manual overflow guard in release().
     _value.setter no longer replaces _sem, only updates _available.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import server
from server import _ChannelSemaphore


class TestChannelSemaphoreRaceCondition:
    """Prove that the _value.setter race does NOT cause ValueError."""

    def test_value_setter_does_not_replace_sem(self):
        """_value.setter must not replace _sem — in-flight callers need the same object."""
        sem = _ChannelSemaphore(5)
        # Force sem creation by calling _ensure_sem
        original_sem = sem._ensure_sem()
        # Now set _value — should NOT replace _sem
        sem._value = 3
        assert sem._sem is original_sem, "_value.setter must not replace _sem"

    @pytest.mark.asyncio
    async def test_no_valueerror_when_value_setter_called_during_release(self):
        """Simulate the race: _value.setter fires while a release is pending.

        Before fix: _sem was replaced → release() called on new sem (never acquired)
        → ValueError: BoundedSemaphore released too many times.
        After fix: _sem is not replaced → release() succeeds on original sem.
        """
        sem = _ChannelSemaphore(2)
        await sem.acquire()  # creates _sem, decrements to 1

        # Simulate what the _value.setter used to do: replace _sem mid-operation
        # The setter no longer replaces _sem, but we verify it directly
        sem._value = 1  # old buggy code would do: self._sem = asyncio.BoundedSemaphore(1)

        # release() must not raise ValueError
        try:
            sem.release()
        except ValueError as e:
            pytest.fail(f"release() raised ValueError (semaphore boom): {e}")

    @pytest.mark.asyncio
    async def test_concurrent_acquire_release_no_boom(self):
        """Two concurrent tasks acquiring/releasing the same channel semaphore."""
        sem = _ChannelSemaphore(2)
        results = []

        async def _worker(name: str) -> None:
            async with sem:
                results.append(f"{name}:enter")
                await asyncio.sleep(0.01)
                results.append(f"{name}:exit")

        await asyncio.gather(_worker("A"), _worker("B"))
        assert "A:enter" in results
        assert "B:enter" in results
        assert sem._available == 2  # back to full capacity

    @pytest.mark.asyncio
    async def test_release_with_sem_at_capacity_is_a_noop(self):
        """Releasing when already at full capacity must be a no-op (not raise)."""
        sem = _ChannelSemaphore(3)
        await sem.acquire()
        sem.release()
        assert sem._available == 3

        # Double-release must be silently ignored
        try:
            sem.release()
        except Exception as e:
            pytest.fail(f"Double release raised: {e}")
        assert sem._available == 3  # unchanged

    def test_release_before_any_acquire_is_noop(self):
        """release() before any acquire() must be a no-op (sem is None)."""
        sem = _ChannelSemaphore(5)
        assert sem._sem is None
        try:
            sem.release()
        except Exception as e:
            pytest.fail(f"release() before acquire raised: {e}")
        assert sem._sem is None
        assert sem._available == 5

    @pytest.mark.asyncio
    async def test_uses_plain_semaphore_not_bounded(self):
        """_ChannelSemaphore must use asyncio.Semaphore, not BoundedSemaphore.

        BoundedSemaphore raises ValueError on over-release; plain Semaphore does not.
        We rely on the manual bound check in release() for overflow protection.
        """
        sem = _ChannelSemaphore(1)
        inner = sem._ensure_sem()
        assert type(inner) is asyncio.Semaphore, (
            f"Expected asyncio.Semaphore, got {type(inner).__name__}. "
            "BoundedSemaphore was causing 'semaphore boom' ValueError."
        )

    @pytest.mark.asyncio
    async def test_value_setter_updates_available_only(self):
        """_value setter must update _available but preserve _sem object identity."""
        sem = _ChannelSemaphore(5)
        await sem.acquire()  # _available = 4, creates _sem
        original_sem_id = id(sem._sem)

        sem._value = 2  # simulate test forcing a lower available count

        assert sem._available == 2
        assert id(sem._sem) == original_sem_id, "_sem object must not be replaced"

    @pytest.mark.asyncio
    async def test_at_capacity_reflects_available_after_concurrent_ops(self):
        """at_capacity() must track correctly through acquire/release cycles."""
        sem = _ChannelSemaphore(1)
        assert not sem.at_capacity()

        await sem.acquire()
        assert sem.at_capacity()

        sem.release()
        assert not sem.at_capacity()


class TestChannelSemaphoreIntegration:
    """Ensure the semaphore fix holds under the test patterns from test_phase75."""

    def setup_method(self):
        server._channel_semaphores.clear()

    def test_value_zero_still_triggers_at_capacity(self):
        """Setting _value=0 via setter must still cause at_capacity() to return True."""
        sem = server._get_channel_semaphore("engineer")
        sem._value = 0
        assert sem.at_capacity()

    def test_value_positive_not_at_capacity(self):
        sem = server._get_channel_semaphore("cto")
        sem._value = 3
        assert not sem.at_capacity()
