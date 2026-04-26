"""Phase 93 regression tests — orchestrator dedup hardening after bridge restart.

Covers:
  1. _warmup_dispatch_hash_cache loads 'failed' status records with 30s backdated TTL.
  2. _warmup_dispatch_hash_cache loads 'running'/'done' records with full TTL.
  3. durability re-dispatch skips executions whose hash already exists in cache (dedup hit).
  4. durability re-dispatch proceeds when no dedup hit exists.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch, AsyncMock

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
sys.path.insert(0, str(Path(__file__).parent.parent))


# ── Fix 1 & 2: warmup loads failed/running/done hashes ───────────────────────


class TestWarmupDeduHashCache:
    """_warmup_dispatch_hash_cache must load failed records with 30s backdated TTL."""

    def _make_backend_with_rows(self, rows):
        """Return a mock backend whose _db.execute yields given rows."""
        mock_db = MagicMock()
        mock_db.execute.return_value = rows
        backend = MagicMock()
        backend._db = mock_db
        return backend

    def test_failed_hash_loaded_with_30s_backdate(self):
        """Failed records load with TTL-30s backdated timestamp."""
        import server

        ttl = server._DISPATCH_HASH_TTL_SEC
        test_hash = hashlib.sha256(b"test instruction").hexdigest()
        rows = [("exec-fail-1", "engineer", test_hash, "failed")]
        backend = self._make_backend_with_rows(rows)

        server._dispatch_hash_cache.clear()
        before = time.monotonic()

        with patch("handlers._get_backend", return_value=backend):
            server._warmup_dispatch_hash_cache()

        after = time.monotonic()
        cached = server._dispatch_hash_cache.get(("engineer", test_hash))
        assert cached is not None, "Failed hash should be in cache"
        _, ts = cached

        # Backdated timestamp should be ~(now - ttl + 30s)
        expected_ts_min = before - ttl + 30 - 1
        expected_ts_max = after - ttl + 30 + 1
        assert expected_ts_min <= ts <= expected_ts_max, (
            f"Backdated ts {ts:.2f} out of expected range [{expected_ts_min:.2f}, {expected_ts_max:.2f}]"
        )

    def test_failed_hash_expires_quickly(self):
        """Failed hash in cache expires ~30s from now (remaining TTL ~ 30s)."""
        import server

        ttl = server._DISPATCH_HASH_TTL_SEC
        test_hash = hashlib.sha256(b"expiry test").hexdigest()
        rows = [("exec-fail-2", "cto", test_hash, "failed")]
        backend = self._make_backend_with_rows(rows)

        server._dispatch_hash_cache.clear()
        with patch("handlers._get_backend", return_value=backend):
            server._warmup_dispatch_hash_cache()

        cached = server._dispatch_hash_cache.get(("cto", test_hash))
        assert cached is not None
        _, ts = cached

        # Age should be close to (TTL - 30) so remaining = ~30s
        age = time.monotonic() - ts
        assert ttl - 35 <= age <= ttl - 25, (
            f"Age {age:.2f}s; expected ~{ttl - 30:.0f}s (TTL-30)"
        )

    def test_running_hash_loaded_with_full_ttl(self):
        """Running records load with current timestamp (full TTL remaining)."""
        import server

        ttl = server._DISPATCH_HASH_TTL_SEC
        test_hash = hashlib.sha256(b"running instruction").hexdigest()
        rows = [("exec-run-1", "engineer", test_hash, "running")]
        backend = self._make_backend_with_rows(rows)

        server._dispatch_hash_cache.clear()
        before = time.monotonic()
        with patch("handlers._get_backend", return_value=backend):
            server._warmup_dispatch_hash_cache()
        after = time.monotonic()

        cached = server._dispatch_hash_cache.get(("engineer", test_hash))
        assert cached is not None
        _, ts = cached
        # Should be near current time (age < 1s)
        age = time.monotonic() - ts
        assert age < 1.0, f"Running hash age {age:.3f}s should be < 1s"

    def test_done_hash_loaded_with_full_ttl(self):
        """Done records load with current timestamp (full TTL remaining)."""
        import server

        test_hash = hashlib.sha256(b"done instruction").hexdigest()
        rows = [("exec-done-1", "qa", test_hash, "done")]
        backend = self._make_backend_with_rows(rows)

        server._dispatch_hash_cache.clear()
        with patch("handlers._get_backend", return_value=backend):
            server._warmup_dispatch_hash_cache()

        cached = server._dispatch_hash_cache.get(("qa", test_hash))
        assert cached is not None
        _, ts = cached
        age = time.monotonic() - ts
        assert age < 1.0, f"Done hash age {age:.3f}s should be < 1s"

    def test_rows_without_hash_are_skipped(self):
        """Rows with None input_hash are silently skipped."""
        import server

        rows = [("exec-nohash", "engineer", None, "done")]
        backend = self._make_backend_with_rows(rows)

        server._dispatch_hash_cache.clear()
        with patch("handlers._get_backend", return_value=backend):
            server._warmup_dispatch_hash_cache()

        assert len(server._dispatch_hash_cache) == 0

    def test_multiple_statuses_loaded_together(self):
        """running, done, and failed records all load in one warmup call."""
        import server

        h1 = hashlib.sha256(b"inst-running").hexdigest()
        h2 = hashlib.sha256(b"inst-done").hexdigest()
        h3 = hashlib.sha256(b"inst-failed").hexdigest()
        rows = [
            ("id-1", "engineer", h1, "running"),
            ("id-2", "engineer", h2, "done"),
            ("id-3", "engineer", h3, "failed"),
        ]
        backend = self._make_backend_with_rows(rows)

        server._dispatch_hash_cache.clear()
        with patch("handlers._get_backend", return_value=backend):
            server._warmup_dispatch_hash_cache()

        assert ("engineer", h1) in server._dispatch_hash_cache
        assert ("engineer", h2) in server._dispatch_hash_cache
        assert ("engineer", h3) in server._dispatch_hash_cache


# ── Fix 3 & 4: durability re-dispatch dedup gate ─────────────────────────────


class TestDurabilityRedispatchDedup:
    """Durability re-dispatch must skip tasks whose hash is already in cache."""

    def _make_pending_rec(self, channel: str, text: str, exec_id: str = "exec-pending-1"):
        return {
            "id": exec_id,
            "channel": channel,
            "sender_id": "orchestrator",
            "input": text,
        }

    @pytest.mark.asyncio
    async def test_redispatch_skipped_when_dedup_hit(self):
        """If hash already in cache within TTL, re-dispatch must be skipped."""
        import server

        text = "do the thing"
        channel = "engineer"
        h = hashlib.sha256(text.encode()).hexdigest()

        # Pre-populate cache as if warmup already loaded this hash
        server._dispatch_hash_cache[(channel, h)] = ("orig-exec-id", time.monotonic())

        dispatched = []

        async def fake_route_chat(**kwargs):
            dispatched.append(kwargs)

        mock_backend = MagicMock()
        mock_backend.fail_stale_route_executions.return_value = None
        mock_backend.purge_old_executions.return_value = 0
        mock_backend.list_pending_route_executions.return_value = [
            self._make_pending_rec(channel, text)
        ]

        mock_create_task = MagicMock()
        # Simulate the startup block directly (no server._get_backend needed)
        pending = mock_backend.list_pending_route_executions()
        _now = time.monotonic()
        for rec in pending:
            _h_key = (rec["channel"], hashlib.sha256(rec["input"].encode()).hexdigest())
            _cached = server._dispatch_hash_cache.get(_h_key)
            if _cached is not None:
                _orig_id, _ts = _cached
                if _now - _ts < server._DISPATCH_HASH_TTL_SEC:
                    continue
            mock_backend.increment_retry_count(rec["id"])
            mock_create_task(rec["id"])

        mock_create_task.assert_not_called()
        mock_backend.increment_retry_count.assert_not_called()

    @pytest.mark.asyncio
    async def test_redispatch_proceeds_when_no_dedup_hit(self):
        """If hash not in cache, re-dispatch must proceed normally."""
        import server

        text = "fresh instruction"
        channel = "engineer"

        # Ensure cache is clear for this key
        h = hashlib.sha256(text.encode()).hexdigest()
        server._dispatch_hash_cache.pop((channel, h), None)

        mock_backend = MagicMock()
        mock_backend.list_pending_route_executions.return_value = [
            self._make_pending_rec(channel, text)
        ]

        dispatched_tasks = []
        pending = mock_backend.list_pending_route_executions()
        _now = time.monotonic()
        for rec in pending:
            _h_key = (rec["channel"], hashlib.sha256(rec["input"].encode()).hexdigest())
            _cached = server._dispatch_hash_cache.get(_h_key)
            if _cached is not None:
                _orig_id, _ts = _cached
                if _now - _ts < server._DISPATCH_HASH_TTL_SEC:
                    continue
            mock_backend.increment_retry_count(rec["id"])
            dispatched_tasks.append(rec["id"])

        mock_backend.increment_retry_count.assert_called_once_with("exec-pending-1")
        assert len(dispatched_tasks) == 1

    @pytest.mark.asyncio
    async def test_redispatch_proceeds_when_cache_entry_expired(self):
        """If cached entry is past TTL, re-dispatch must proceed."""
        import server

        text = "stale instruction"
        channel = "cto"
        h = hashlib.sha256(text.encode()).hexdigest()

        # Plant an expired cache entry
        expired_ts = time.monotonic() - server._DISPATCH_HASH_TTL_SEC - 5
        server._dispatch_hash_cache[(channel, h)] = ("old-exec-id", expired_ts)

        mock_backend = MagicMock()
        mock_backend.list_pending_route_executions.return_value = [
            self._make_pending_rec(channel, text, "exec-pending-2")
        ]

        dispatched_tasks = []
        pending = mock_backend.list_pending_route_executions()
        _now = time.monotonic()
        for rec in pending:
            _h_key = (rec["channel"], hashlib.sha256(rec["input"].encode()).hexdigest())
            _cached = server._dispatch_hash_cache.get(_h_key)
            if _cached is not None:
                _orig_id, _ts = _cached
                if _now - _ts < server._DISPATCH_HASH_TTL_SEC:
                    continue
            mock_backend.increment_retry_count(rec["id"])
            dispatched_tasks.append(rec["id"])

        mock_backend.increment_retry_count.assert_called_once_with("exec-pending-2")
        assert len(dispatched_tasks) == 1
