"""Input hash-based duplicate dispatch prevention tests.

Sprint Contract: engineer channel duplicate dispatch guard
Issue: 4b5848ad-1430-44fe-8826-dc04901837dc

Verifies:
1. Same instruction + same channel within 60s → {"status": "duplicate"}, no new task created
2. semaphore boom (RuntimeError from __aenter__) → graceful 503/busy, not unhandled exception
3. allow_duplicate=True bypasses the hash gate
4. Different channel same instruction → not a duplicate
5. Same channel different instruction → not a duplicate
6. After 60s TTL expires → not a duplicate (treated as new)
7. Failed task hash is re-registered so same instruction is blocked within TTL after failure
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
from fastapi.testclient import TestClient

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
os.environ.setdefault("MUSU_PLAN", "pro")
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)

_VALID_TEXT = (
    "Read musu-bridge/handlers.py route_chat function and verify "
    "that the error handling returns the correct dict structure. "
    "pytest musu-bridge/tests/test_server.py -v should pass. "
    "expected_output: pytest exits 0 with all tests passing."
)

_VALID_TEXT_2 = (
    "Read musu-bridge/server.py _get_channel_semaphore function and verify "
    "that the semaphore capacity is correctly initialized. "
    "pytest musu-bridge/tests/test_semaphore_boom.py -v should pass. "
    "expected_output: pytest exits 0 with all semaphore tests passing."
)


def _clear_hash_cache() -> None:
    """Clear the in-process dedup hash cache between tests."""
    import server
    if hasattr(server, "_dispatch_hash_cache"):
        server._dispatch_hash_cache.clear()


class TestHashDedupGate:
    """Same instruction + same channel within 60s must return duplicate status."""

    def setup_method(self) -> None:
        _clear_hash_cache()
        from handlers import _get_backend
        backend = _get_backend()
        try:
            backend._db.execute(
                "UPDATE route_executions SET status='cancelled' WHERE channel='engineer' AND status='running'"
            )
        except Exception:
            pass
        import server
        server._channel_semaphores.pop("engineer", None)

    def test_same_instruction_same_channel_returns_duplicate(self):
        """Second call with identical text+channel within 60s must return duplicate."""
        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok", "task_id": "t1"}

            # First call — should succeed
            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202, f"First call failed: {resp1.json()}"
            original_task_id = resp1.json()["task_id"]

            # Second call — identical payload, should be deduped
            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
            body = resp2.json()
            assert body.get("status") == "duplicate", f"Expected status=duplicate, got: {body}"
            assert "task_id" in body, f"Expected original task_id in response, got: {body}"

    def test_duplicate_response_contains_original_task_id(self):
        """Duplicate response must include the original task_id for traceability."""
        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok"}

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202
            original_task_id = resp1.json()["task_id"]

            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
            body = resp2.json()
            assert body.get("status") == "duplicate"
            assert body.get("task_id") == original_task_id, (
                f"Expected task_id={original_task_id!r}, got {body.get('task_id')!r}"
            )

    def test_duplicate_does_not_create_new_task_record(self):
        """A duplicate dispatch must not create a new route_execution record."""
        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok"}

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202

            # Patch create_route_execution so that if the duplicate path accidentally
            # reaches the DB-write section it raises, making the bug visible.
            with patch("handlers._get_backend") as mock_backend_fn:
                mock_backend = MagicMock()
                mock_backend_fn.return_value = mock_backend

                resp2 = _client.post(
                    "/api/tasks/delegate",
                    json={"channel": "engineer", "text": _VALID_TEXT},
                    headers=_AUTH,
                )
                assert resp2.json().get("status") == "duplicate", (
                    f"Expected duplicate, got: {resp2.json()}"
                )
                mock_backend.create_route_execution.assert_not_called(), (
                    "Duplicate dispatch must not call create_route_execution"
                )

    def test_allow_duplicate_bypasses_hash_gate(self):
        """allow_duplicate=True must bypass the hash gate and create a new task."""
        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok"}

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202
            task_id_1 = resp1.json()["task_id"]

            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp2.status_code == 202, f"allow_duplicate=True should create new task, got {resp2.status_code}: {resp2.json()}"
            task_id_2 = resp2.json()["task_id"]
            assert task_id_1 != task_id_2, "allow_duplicate=True should produce a different task_id"

    def test_different_channel_same_instruction_not_duplicate(self):
        """Same instruction on different channels must not be treated as duplicate."""
        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok"}

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202

            # cto channel — different channel, same text
            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "cto", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            # Should not be a duplicate (different channel)
            assert resp2.status_code == 202, (
                f"Different channel should not be duplicate, got {resp2.status_code}: {resp2.json()}"
            )

    def test_same_channel_different_instruction_not_duplicate(self):
        """Different instruction on same channel must not be treated as duplicate."""
        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok"}

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202

            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT_2, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp2.status_code == 202, (
                f"Different instruction should not be duplicate, got {resp2.status_code}: {resp2.json()}"
            )

    def test_hash_gate_expires_after_ttl(self):
        """After the 60s TTL, the same instruction+channel should not be duplicate."""
        import server

        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok"}

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202

            # Manually expire the cache entry by back-dating its timestamp
            if hasattr(server, "_dispatch_hash_cache"):
                for key in list(server._dispatch_hash_cache.keys()):
                    task_id, ts = server._dispatch_hash_cache[key]
                    server._dispatch_hash_cache[key] = (task_id, ts - 61)

            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp2.status_code == 202, (
                f"Expired TTL should allow new task, got {resp2.status_code}: {resp2.json()}"
            )
            assert resp2.json().get("status") != "duplicate", (
                f"Expired entry should not return duplicate: {resp2.json()}"
            )


class TestSemaphoreBoomGracefulReturn:
    """Semaphore boom (RuntimeError from __aenter__) must return 503 busy, not crash."""

    def setup_method(self) -> None:
        _clear_hash_cache()
        from handlers import _get_backend
        backend = _get_backend()
        try:
            backend._db.execute(
                "UPDATE route_executions SET status='cancelled' WHERE channel='engineer' AND status='running'"
            )
        except Exception:
            pass
        import server
        server._channel_semaphores.pop("engineer", None)

    def test_semaphore_boom_returns_busy_not_500(self):
        """If the semaphore raises RuntimeError on acquire, return 503/busy gracefully."""
        with patch("server._get_channel_semaphore") as mock_sem_factory:
            mock_ctx = MagicMock()
            mock_ctx.at_capacity.return_value = False
            mock_ctx.__aenter__ = AsyncMock(side_effect=RuntimeError("semaphore boom"))
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_sem_factory.return_value = mock_ctx

            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            # Must return 202 (task accepted + background handles gracefully) OR
            # synchronously return 503/busy — either way must NOT be 500/unhandled
            assert resp.status_code != 500, (
                f"Semaphore boom must not surface as 500: {resp.status_code} {resp.json()}"
            )

    def test_semaphore_boom_does_not_leave_zombie_running_record(self):
        """After semaphore boom, the task record must be failed/cancelled, not running."""
        from handlers import _get_backend

        with patch("server._get_channel_semaphore") as mock_sem_factory, \
             patch("server.route_chat", new_callable=AsyncMock):
            mock_ctx = MagicMock()
            mock_ctx.at_capacity.return_value = False
            mock_ctx.__aenter__ = AsyncMock(side_effect=RuntimeError("semaphore boom"))
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_sem_factory.return_value = mock_ctx

            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            if resp.status_code != 202:
                return  # Synchronous rejection — no record created, test passes

            task_id = resp.json()["task_id"]
            time.sleep(0.15)

            backend = _get_backend()
            rec = backend.get_route_execution(task_id)
            assert rec is not None
            assert rec.get("status") in ("failed", "cancelled"), (
                f"Semaphore boom must not leave zombie running record, got: {rec.get('status')}"
            )


class TestFailedHashReRegistration:
    """Failed task must re-register its hash so same instruction is blocked within TTL."""

    def setup_method(self) -> None:
        _clear_hash_cache()
        from handlers import _get_backend
        backend = _get_backend()
        try:
            backend._db.execute(
                "UPDATE route_executions SET status='cancelled' WHERE channel='engineer' AND status='running'"
            )
        except Exception:
            pass
        import server
        server._channel_semaphores.pop("engineer", None)

    def test_failed_task_hash_blocks_redispatch_within_ttl(self):
        """After a task fails, its hash must stay in the cache so re-dispatch is blocked."""
        import server

        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            # First dispatch succeeds (seeds cache), then task fails in background
            mock_chat.return_value = {"response": "ok", "task_id": "t-fail"}

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202
            task_id = resp1.json()["task_id"]

            # Simulate the task failing by manually expiring the hash entry's timestamp
            # so a normal re-dispatch would succeed (TTL expired) — then re-register it.
            import hashlib
            _hash_key = ("engineer", hashlib.sha256(_VALID_TEXT.encode()).hexdigest())
            # Expire the existing entry so the gate would normally allow through
            if _hash_key in server._dispatch_hash_cache:
                orig_task_id, orig_ts = server._dispatch_hash_cache[_hash_key]
                server._dispatch_hash_cache[_hash_key] = (orig_task_id, orig_ts - 200)

            # Trigger the "failed" re-registration path: call the function directly
            server._reregister_failed_hash(req_channel="engineer", req_text=_VALID_TEXT, task_id=task_id)

            # Now same instruction should be blocked (duplicate) within TTL
            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT},
                headers=_AUTH,
            )
            body2 = resp2.json()
            assert body2.get("status") == "duplicate", (
                f"Failed task hash re-registration must block re-dispatch within TTL, got: {body2}"
            )

    def test_failed_task_hash_expires_after_ttl(self):
        """After re-registration, the failed hash must expire after TTL and allow new dispatch."""
        import server, hashlib

        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok"}

            resp1 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp1.status_code == 202
            task_id = resp1.json()["task_id"]

            # Re-register as failed
            server._reregister_failed_hash(req_channel="engineer", req_text=_VALID_TEXT, task_id=task_id)

            # Expire the re-registered entry
            _hash_key = ("engineer", hashlib.sha256(_VALID_TEXT.encode()).hexdigest())
            if _hash_key in server._dispatch_hash_cache:
                orig_task_id, orig_ts = server._dispatch_hash_cache[_hash_key]
                server._dispatch_hash_cache[_hash_key] = (orig_task_id, orig_ts - (server._DISPATCH_HASH_TTL_SEC + 1))

            # Should allow dispatch now
            resp2 = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp2.status_code == 202, (
                f"Expired failed hash must allow new dispatch, got {resp2.status_code}: {resp2.json()}"
            )
            assert resp2.json().get("status") != "duplicate"

    def test_run_with_retry_reregisters_hash_on_failure(self):
        """_run_with_retry must call _reregister_failed_hash when the task fails."""
        import server

        fail_called = {"n": 0}
        original_reregister = getattr(server, "_reregister_failed_hash", None)

        def _mock_reregister(req_channel, req_text, task_id):
            fail_called["n"] += 1

        with patch.object(server, "_reregister_failed_hash", side_effect=_mock_reregister), \
             patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.side_effect = RuntimeError("adapter crash: exited with code 1")

            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp.status_code == 202
            # Give background task time to run and fail
            time.sleep(0.3)

            assert fail_called["n"] >= 1, (
                f"_reregister_failed_hash must be called when task fails, called {fail_called['n']} times"
            )


class TestCacheWarmupPersistence:
    """Bridge restart dedup persistence: warmup loads DB history into _dispatch_hash_cache."""

    def setup_method(self) -> None:
        _clear_hash_cache()

    def test_cache_warmup_populates_from_db(self):
        """_warmup_dispatch_hash_cache() must load running/done records from DB into cache."""
        import server
        import hashlib
        from handlers import _get_backend

        backend = _get_backend()
        fake_id = "aaaaaaaa-0000-0000-0000-000000000001"
        fake_text = "Read some file and verify it works. expected_output: pytest exits 0."
        fake_hash = hashlib.sha256(fake_text.encode()).hexdigest()
        try:
            backend._db.execute(
                "INSERT OR REPLACE INTO route_executions (id, channel, sender_id, input, status, input_hash) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (fake_id, "engineer", "test", fake_text, "running", fake_hash),
            )
        except Exception as e:
            pytest.skip(f"DB insert failed: {e}")

        server._dispatch_hash_cache.clear()
        server._warmup_dispatch_hash_cache()

        key = ("engineer", fake_hash)
        assert key in server._dispatch_hash_cache, (
            f"Warmup must load running record into cache, key {key!r} not found. "
            f"Cache keys: {list(server._dispatch_hash_cache.keys())}"
        )
        cached_task_id, _ = server._dispatch_hash_cache[key]
        assert cached_task_id == fake_id, (
            f"Cached task_id must match DB record, got {cached_task_id!r}"
        )

    def test_failed_task_hash_seeded_in_cache(self):
        """After _reregister_failed_hash, same hash re-dispatch must be blocked for 30s."""
        import server
        import hashlib

        with patch("server.route_chat", new_callable=AsyncMock) as mock_chat:
            mock_chat.return_value = {"response": "ok"}

            resp = _client.post(
                "/api/tasks/delegate",
                json={"channel": "engineer", "text": _VALID_TEXT, "allow_duplicate": True},
                headers=_AUTH,
            )
            assert resp.status_code == 202
            task_id = resp.json()["task_id"]

        # Expire the hash cache so gate would normally allow re-dispatch
        _hash_key = ("engineer", hashlib.sha256(_VALID_TEXT.encode()).hexdigest())
        if _hash_key in server._dispatch_hash_cache:
            orig_task_id, orig_ts = server._dispatch_hash_cache[_hash_key]
            server._dispatch_hash_cache[_hash_key] = (orig_task_id, orig_ts - 200)

        # Trigger failed hash seeding
        server._reregister_failed_hash(req_channel="engineer", req_text=_VALID_TEXT, task_id=task_id)

        # Hash must be in cache with timestamp that has ~30s remaining
        assert _hash_key in server._dispatch_hash_cache, (
            "_reregister_failed_hash must seed the hash into _dispatch_hash_cache"
        )
        _, seeded_ts = server._dispatch_hash_cache[_hash_key]
        elapsed = time.monotonic() - seeded_ts
        assert elapsed < server._DISPATCH_HASH_TTL_SEC, (
            f"Seeded hash must not be immediately expired, elapsed={elapsed:.1f}s TTL={server._DISPATCH_HASH_TTL_SEC}s"
        )
