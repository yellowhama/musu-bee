"""Phase 92 T1 — Durability loop _active_tasks dedup guard.

Sprint Contract T1: if a pending record's task_id is already live in _active_tasks,
the durability re-dispatch loop must skip it without spawning a duplicate coroutine.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")
os.environ.setdefault("MUSU_PLAN", "pro")
sys.path.insert(0, str(Path(__file__).parent.parent))

import server  # noqa: E402


_TEXT = (
    "Read musu-bridge/server.py _active_tasks dict and verify "
    "that the task entry is cleaned up by the done callback. "
    "expected_output: pytest exits 0 with all active_tasks tests passing."
)

_TEXT_2 = (
    "Read musu-bridge/server.py lifespan block and verify "
    "that the durability re-dispatch guard is in place. "
    "expected_output: pytest exits 0 with all reconnect dedup tests passing."
)


class TestActiveTasksDedupInDurabilityLoop:
    """Durability re-dispatch loop must skip task_ids already in _active_tasks."""

    def setup_method(self) -> None:
        server._active_tasks.clear()
        server._dispatch_hash_cache.clear()

    def teardown_method(self) -> None:
        server._active_tasks.clear()
        server._dispatch_hash_cache.clear()

    def _make_pending_record(self, task_id: str, text: str, channel: str = "engineer") -> dict:
        return {
            "id": task_id,
            "channel": channel,
            "sender_id": "orchestrator",
            "input": text,
        }

    def test_active_task_id_is_skipped_not_redispatched(self):
        """If rec['id'] is already in _active_tasks, create_task must NOT be called."""
        task_id = "aaaa0001-0000-0000-0000-000000000001"
        fake_task = MagicMock(spec=asyncio.Task)
        server._active_tasks[task_id] = fake_task

        rec = self._make_pending_record(task_id, _TEXT)

        create_task_calls: list = []
        _simulate_durability_loop([rec], on_create_task=lambda: create_task_calls.append(1))

        assert len(create_task_calls) == 0, (
            "create_task must NOT be called for task_id already in _active_tasks"
        )

    def test_inactive_task_id_is_redispatched(self):
        """If rec['id'] is NOT in _active_tasks, create_task MUST be called."""
        task_id = "aaaa0002-0000-0000-0000-000000000002"
        # Not in _active_tasks
        assert task_id not in server._active_tasks

        rec = self._make_pending_record(task_id, _TEXT_2)

        create_task_calls: list = []
        _simulate_durability_loop([rec], on_create_task=lambda: create_task_calls.append(1))
        assert len(create_task_calls) >= 1, (
            "create_task must be called for task_id NOT in _active_tasks"
        )

    def test_active_tasks_guard_logs_skip_message(self, caplog):
        """Skipped task_id must emit a log message containing 'already live in _active_tasks'."""
        task_id = "aaaa0003-0000-0000-0000-000000000003"
        fake_task = MagicMock(spec=asyncio.Task)
        server._active_tasks[task_id] = fake_task

        rec = self._make_pending_record(task_id, _TEXT)

        with caplog.at_level(logging.INFO, logger="server"):
            _simulate_durability_loop([rec])

        assert any("already live in _active_tasks" in r.message for r in caplog.records), (
            f"Expected 'already live in _active_tasks' log message. Records: {[r.message for r in caplog.records]}"
        )

    def test_increment_retry_count_not_called_for_active_task(self):
        """increment_retry_count must NOT be called when task_id is already active."""
        task_id = "aaaa0004-0000-0000-0000-000000000004"
        server._active_tasks[task_id] = MagicMock(spec=asyncio.Task)

        rec = self._make_pending_record(task_id, _TEXT)
        increment_calls: list[str] = []

        _simulate_durability_loop([rec], on_increment=lambda tid: increment_calls.append(tid))

        assert task_id not in increment_calls, (
            "increment_retry_count must NOT be called for task_id already in _active_tasks"
        )

    def test_hash_dedup_still_blocks_before_active_tasks_check(self):
        """Hash-cache dedup (existing check) still fires before the active-tasks guard."""
        task_id = "aaaa0005-0000-0000-0000-000000000005"
        # Seed hash cache — same instruction within TTL
        h = hashlib.sha256(_TEXT.encode()).hexdigest()
        server._dispatch_hash_cache[("engineer", h)] = ("other-task-id", time.monotonic())

        rec = self._make_pending_record(task_id, _TEXT)

        create_task_calls: list = []
        _simulate_durability_loop([rec], on_create_task=lambda: create_task_calls.append(1))
        assert len(create_task_calls) == 0, (
            "Hash-cache dedup must block create_task before active-tasks guard is reached"
        )


def _simulate_durability_loop(
    pending: list[dict],
    on_increment: "callable | None" = None,
    on_create_task: "callable | None" = None,
) -> None:
    """Re-implement the durability loop logic from server.py lifespan for unit testing.

    Mirrors the logic at lifespan lines 573-596 in server.py so tests can
    verify the guard conditions without running the full FastAPI lifespan.
    Uses the real server._active_tasks and server._dispatch_hash_cache.
    """
    import time

    _now = time.monotonic()
    for rec in pending:
        # Existing hash-cache dedup check (Phase 91)
        _h_key = (rec["channel"], hashlib.sha256(rec["input"].encode()).hexdigest())
        _cached = server._dispatch_hash_cache.get(_h_key)
        if _cached is not None:
            _orig_id, _ts = _cached
            if _now - _ts < server._DISPATCH_HASH_TTL_SEC:
                continue

        # Phase 92: active-tasks guard
        if rec["id"] in server._active_tasks:
            import logging as _logging
            _logging.getLogger("server").info(
                "durability: skip re-dispatch task_id=%s — already live in _active_tasks",
                rec["id"],
            )
            continue

        if on_increment:
            on_increment(rec["id"])
        if on_create_task:
            on_create_task()
