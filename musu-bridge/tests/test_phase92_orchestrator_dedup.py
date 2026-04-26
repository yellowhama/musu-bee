"""Phase 92 — Orchestrator reconnect dedup tests.

Sprint Contract: phase92-sprint-contract
Issue: c4f1e7b2-9a3d-4c88-b015-e8d7f2a60c91

Covers:
T1 — _warmup_dispatch_hash_cache loads failed/cancelled records with backdated timestamp
T2 — durability re-dispatch runs AFTER warmup (warmup is called before yield in lifespan)
     and uses hash dedup gate to skip already-dispatched pending tasks
T3 — _ChannelSemaphore.__aexit__ does NOT release when acquire() raised TimeoutError
     (no double-release / available count overflow)
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
os.environ.setdefault("MUSU_PLAN", "pro")
sys.path.insert(0, str(Path(__file__).parent.parent))

import server  # noqa: E402
from server import _ChannelSemaphore  # noqa: E402


def _clear_cache() -> None:
    server._dispatch_hash_cache.clear()


# ── T1: Warmup loads failed/cancelled hashes ────────────────────────────────

class TestWarmupFailedCancelledHashes:
    """_warmup_dispatch_hash_cache() must load failed and cancelled records."""

    def setup_method(self) -> None:
        _clear_cache()
        server._channel_semaphores.pop("engineer", None)

    def _insert_record(self, backend, rec_id: str, channel: str, text: str, status: str) -> str:
        h = hashlib.sha256(text.encode()).hexdigest()
        try:
            backend._db.execute(
                "INSERT OR REPLACE INTO route_executions "
                "(id, channel, sender_id, input, status, input_hash) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (rec_id, channel, "test", text, status, h),
            )
        except Exception as e:
            pytest.skip(f"DB insert failed: {e}")
        return h

    def test_warmup_loads_failed_record(self):
        """A failed record with input_hash must be loaded into the dedup cache."""
        from handlers import _get_backend
        backend = _get_backend()
        text = "Read file and verify. expected_output: pytest exits 0."
        rec_id = "bbbb0001-0000-0000-0000-000000000001"
        h = self._insert_record(backend, rec_id, "engineer", text, "failed")

        _clear_cache()
        server._warmup_dispatch_hash_cache()

        key = ("engineer", h)
        assert key in server._dispatch_hash_cache, (
            f"Warmup must load failed record into cache. Keys: {list(server._dispatch_hash_cache.keys())}"
        )

    def test_warmup_loads_cancelled_record(self):
        """A cancelled record with input_hash must be loaded into the dedup cache."""
        from handlers import _get_backend
        backend = _get_backend()
        text = "Check handler output and verify. expected_output: pytest exits 0."
        rec_id = "bbbb0002-0000-0000-0000-000000000002"
        h = self._insert_record(backend, rec_id, "engineer", text, "cancelled")

        _clear_cache()
        server._warmup_dispatch_hash_cache()

        key = ("engineer", h)
        assert key in server._dispatch_hash_cache, (
            f"Warmup must load cancelled record into cache. Keys: {list(server._dispatch_hash_cache.keys())}"
        )

    def test_warmup_failed_record_uses_backdated_timestamp(self):
        """Failed record must be loaded with a backdated timestamp (~30s remaining TTL)."""
        from handlers import _get_backend
        backend = _get_backend()
        text = "Verify route_chat output. expected_output: pytest exits 0."
        rec_id = "bbbb0003-0000-0000-0000-000000000003"
        h = self._insert_record(backend, rec_id, "engineer", text, "failed")

        _clear_cache()
        server._warmup_dispatch_hash_cache()

        key = ("engineer", h)
        assert key in server._dispatch_hash_cache
        _, loaded_ts = server._dispatch_hash_cache[key]
        elapsed = time.monotonic() - loaded_ts
        # Backdated: apparent age = TTL - 30s, so elapsed should be ~(TTL - 30)
        # Remaining TTL = TTL - elapsed ≈ 30s
        remaining = server._DISPATCH_HASH_TTL_SEC - elapsed
        assert 0 < remaining <= 35, (
            f"Failed record must have ~30s remaining TTL after warmup, got {remaining:.1f}s"
        )

    def test_warmup_running_record_uses_full_timestamp(self):
        """Running record must be loaded with time.monotonic() (full TTL remaining)."""
        from handlers import _get_backend
        backend = _get_backend()
        text = "Run pytest and check results. expected_output: pytest exits 0."
        rec_id = "bbbb0004-0000-0000-0000-000000000004"
        h = self._insert_record(backend, rec_id, "engineer", text, "running")

        _clear_cache()
        server._warmup_dispatch_hash_cache()

        key = ("engineer", h)
        assert key in server._dispatch_hash_cache
        _, loaded_ts = server._dispatch_hash_cache[key]
        elapsed = time.monotonic() - loaded_ts
        remaining = server._DISPATCH_HASH_TTL_SEC - elapsed
        # Running records should have close to full TTL remaining
        assert remaining > server._DISPATCH_HASH_TTL_SEC - 5, (
            f"Running record must have near-full TTL, got {remaining:.1f}s remaining"
        )

    def test_warmup_failed_record_blocks_redispatch(self):
        """After warmup loads a failed hash, re-dispatch of same instruction is blocked (409)."""
        from handlers import _get_backend
        from fastapi.testclient import TestClient
        client = TestClient(server.app, raise_server_exceptions=False)
        backend = _get_backend()

        text = (
            "Check the bridge metrics endpoint and verify counter fields are present. "
            "expected_output: pytest exits 0 with all metrics tests passing."
        )
        rec_id = "bbbb0005-0000-0000-0000-000000000005"
        h = self._insert_record(backend, rec_id, "engineer", text, "failed")

        _clear_cache()
        server._warmup_dispatch_hash_cache()

        # Attempt re-dispatch — should be blocked as duplicate
        resp = client.post(
            "/api/tasks/delegate",
            json={"channel": "engineer", "text": text},
            headers={"Authorization": "Bearer test-token"},
        )
        body = resp.json()
        assert body.get("status") == "duplicate", (
            f"Failed hash loaded via warmup must block re-dispatch, got: {body}"
        )

    def test_warmup_does_not_load_record_without_input_hash(self):
        """Records with NULL input_hash column must be skipped by warmup."""
        from handlers import _get_backend
        backend = _get_backend()
        rec_id = "bbbb0006-0000-0000-0000-000000000006"
        try:
            backend._db.execute(
                "INSERT OR REPLACE INTO route_executions "
                "(id, channel, sender_id, input, status) "
                "VALUES (?, ?, ?, ?, ?)",
                (rec_id, "engineer", "test", "some instruction", "failed"),
            )
        except Exception as e:
            pytest.skip(f"DB insert failed: {e}")

        before = set(server._dispatch_hash_cache.keys())
        server._warmup_dispatch_hash_cache()
        after = set(server._dispatch_hash_cache.keys())
        # Any new entries must have a non-None hash (records without input_hash skipped)
        new_keys = after - before
        for key in new_keys:
            assert key[1] is not None, "Warmup must not load NULL input_hash entries"


# ── T2: Warmup-before-redispatch ordering ────────────────────────────────────

class TestWarmupBeforeRedispatchOrdering:
    """_warmup_dispatch_hash_cache must be called before the durability re-dispatch loop.

    server.py lifespan order at Phase 91:
        line 568: fail_stale_route_executions()
        line 573: pending = list_pending_route_executions()
        line 577: for rec in pending: ... asyncio.create_task(route_chat(...))   ← re-dispatch
        line 712: _warmup_dispatch_hash_cache()                                  ← warmup AFTER!

    Phase 92 must move warmup to BEFORE the re-dispatch loop so that
    failed/cancelled hashes block reconnect-triggered re-dispatch.
    """

    def test_warmup_is_called_before_redispatch_in_lifespan(self):
        """_warmup_dispatch_hash_cache must be invoked before asyncio.create_task in lifespan."""
        import inspect
        src = inspect.getsource(server)
        warmup_pos = src.find("_warmup_dispatch_hash_cache()")
        # Find the durability re-dispatch create_task call
        redispatch_pos = src.find("asyncio.create_task(route_chat(")
        assert warmup_pos != -1, "_warmup_dispatch_hash_cache() not found in server.py"
        assert redispatch_pos != -1, "durability re-dispatch asyncio.create_task not found in server.py"
        assert warmup_pos < redispatch_pos, (
            f"_warmup_dispatch_hash_cache() (pos {warmup_pos}) must appear BEFORE "
            f"the durability re-dispatch create_task (pos {redispatch_pos}) in server.py"
        )


# ── T3: Semaphore acquire-flag / no double-release on TimeoutError ────────────

class TestSemaphoreAcquireFlag:
    """__aexit__ must not release() when acquire() raised TimeoutError."""

    def test_timeout_on_acquire_does_not_decrement_available(self):
        """If acquire() times out, available count must remain unchanged (no double-release)."""

        async def run():
            sem = _ChannelSemaphore(1)
            await sem.acquire()  # fill the one slot
            assert sem.available == 0

            # Second acquire with 0.01s timeout — must time out
            try:
                async with sem:  # __aenter__ calls acquire(timeout=...) — will TimeoutError
                    pass
            except (asyncio.TimeoutError, Exception):
                pass

            # available must still be 0 (the timed-out acquire never took a slot)
            assert sem.available == 0, (
                f"TimeoutError acquire must not change available: {sem.available}"
            )
            # Release the original acquire
            sem.release()
            assert sem.available == 1

        # Force very short timeout
        with patch.dict(os.environ, {"MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC": "0.01"}):
            asyncio.run(run())

    def test_successful_acquire_decrements_available(self):
        """Normal async-with properly acquires and releases."""

        async def run():
            sem = _ChannelSemaphore(2)
            async with sem:
                assert sem.available == 1
            assert sem.available == 2

        asyncio.run(run())

    def test_available_never_exceeds_capacity_after_timeout_loop(self):
        """Running many timed-out acquires must never push available above capacity."""

        async def run():
            sem = _ChannelSemaphore(1)
            await sem.acquire()  # hold the slot

            for _ in range(10):
                try:
                    async with sem:
                        pass
                except Exception:
                    pass

            sem.release()
            assert sem.available == sem.capacity, (
                f"available {sem.available} must equal capacity {sem.capacity} after timeout loop"
            )
            assert sem.available <= sem.capacity

        with patch.dict(os.environ, {"MUSU_SEMAPHORE_ACQUIRE_TIMEOUT_SEC": "0.01"}):
            asyncio.run(run())
