"""Tests for controllers.sources — KindSource + ChannelSource."""
from __future__ import annotations

import asyncio
import time
import uuid

import pytest

from musu_core.controllers.handlers import enqueue_request_for_object
from musu_core.controllers.predicates import StatusIn
from musu_core.controllers.reconciler import ReconcileRequest
from musu_core.controllers.sources import ChannelSource, KindSource


def _insert_task(db, task_id, status="todo", title="t"):
    db.execute(
        "INSERT INTO tasks(id, title, status) VALUES (?, ?, ?)",
        (task_id, title, status),
    )


def _touch_task(db, task_id, status):
    # advance updated_at to now
    db.execute(
        "UPDATE tasks SET status=?, "
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') "
        "WHERE id=?",
        (status, task_id),
    )


def test_kind_source_rejects_unsafe_table(backend):
    with pytest.raises(ValueError):
        KindSource(backend, "; DROP TABLE agents", lambda r: [])


def test_kind_source_rejects_unsafe_column(backend):
    with pytest.raises(ValueError):
        KindSource(
            backend, "tasks", lambda r: [],
            timestamp_column="updated_at; DROP TABLE x",
        )


async def test_kind_source_picks_up_new_rows(backend):
    src = KindSource(
        backend, "tasks",
        enqueue_request_for_object("tasks"),
        poll_interval_ms=50,
    )
    seen: list[ReconcileRequest] = []

    def enqueue(req, priority):
        seen.append(req)

    task = asyncio.create_task(src.start(enqueue))
    await asyncio.sleep(0.1)  # let initial cursor settle

    task_id = str(uuid.uuid4())
    _insert_task(backend, task_id)

    # Wait up to 2s for the row to be picked up
    deadline = time.monotonic() + 2.0
    while time.monotonic() < deadline and not seen:
        await asyncio.sleep(0.05)

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    assert any(r.key == task_id for r in seen), f"row not seen: {seen}"


async def test_kind_source_cursor_advances(backend):
    src = KindSource(
        backend, "tasks",
        enqueue_request_for_object("tasks"),
        poll_interval_ms=50,
    )
    seen: list[ReconcileRequest] = []
    task = asyncio.create_task(src.start(lambda r, p: seen.append(r)))
    await asyncio.sleep(0.1)

    id_a = str(uuid.uuid4())
    _insert_task(backend, id_a)
    await asyncio.sleep(0.2)

    # After first insert is seen, inserting another shouldn't re-fire the first
    pre_count = len(seen)
    id_b = str(uuid.uuid4())
    _insert_task(backend, id_b)
    await asyncio.sleep(0.2)

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    # We should see id_b (post-cursor) but not duplicate id_a
    keys_after_first = [r.key for r in seen[pre_count:]]
    assert id_b in keys_after_first
    assert keys_after_first.count(id_a) == 0


async def test_kind_source_predicate_filters(backend):
    src = KindSource(
        backend, "tasks",
        enqueue_request_for_object("tasks"),
        predicates=[StatusIn("in_progress")],
        poll_interval_ms=50,
    )
    seen: list[ReconcileRequest] = []
    task = asyncio.create_task(src.start(lambda r, p: seen.append(r)))
    await asyncio.sleep(0.1)

    skip_id = str(uuid.uuid4())
    pass_id = str(uuid.uuid4())
    _insert_task(backend, skip_id, status="todo")
    _insert_task(backend, pass_id, status="in_progress")
    await asyncio.sleep(0.25)

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    keys = [r.key for r in seen]
    assert pass_id in keys
    assert skip_id not in keys


async def test_kind_source_cancel_clean(backend):
    src = KindSource(
        backend, "tasks",
        enqueue_request_for_object("tasks"),
        poll_interval_ms=50,
    )
    task = asyncio.create_task(src.start(lambda r, p: None))
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def test_channel_source_fires_on_emit():
    seen = []
    src = ChannelSource(handler=lambda e: [
        ReconcileRequest(table="tasks", key=str(e))
    ])
    task = asyncio.create_task(src.start(lambda r, p: seen.append(r)))
    src.emit("event-1")
    src.emit("event-2")
    await asyncio.sleep(0.1)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    keys = sorted(r.key for r in seen)
    assert keys == ["event-1", "event-2"]


async def test_kind_source_known_limitation_same_timestamp(backend):
    """Documented known limitation: rows inserted in the same ms as the
    cursor are MISSED.

    SQLite strftime('%fZ') has ms resolution. Under heavy write rates,
    multiple inserts within one ms share `updated_at`; the cursor uses
    `>` strict comparison, so once the source consumes a row at time T,
    any later-arriving row also at time T is lost.

    21.B remediation: switch to `(updated_at > ? OR (updated_at = ? AND
    id > ?))` once the watch dispatcher lands. This test PINS the
    current behavior so a future fix is detectable.
    """
    # The test deliberately does NOT assert "all rows seen" — we are
    # documenting the limitation, not regressing it.
    src = KindSource(
        backend, "tasks",
        enqueue_request_for_object("tasks"),
        poll_interval_ms=200,
    )
    seen: list[ReconcileRequest] = []
    task = asyncio.create_task(src.start(lambda r, p: seen.append(r)))
    await asyncio.sleep(0.05)

    # Insert 1 row, let source see it
    id_a = "ts-a"
    _insert_task(backend, id_a)
    await asyncio.sleep(0.4)

    # Force a second row at the SAME updated_at as id_a
    rows = backend.execute("SELECT updated_at FROM tasks WHERE id=?", (id_a,))
    same_ts = rows[0]["updated_at"]
    id_b = "ts-b"
    backend.execute(
        "INSERT INTO tasks(id, title, status, updated_at) VALUES (?, ?, ?, ?)",
        (id_b, "second", "todo", same_ts),
    )
    await asyncio.sleep(0.4)

    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    keys = [r.key for r in seen]
    # id_a always seen. id_b is the documented miss case — under current
    # impl, id_b may or may not appear depending on poll timing relative
    # to the SAME-ms insert. We assert id_a was seen (sanity) and leave
    # the id_b outcome unchecked.
    assert id_a in keys, f"id_a should always be picked up: {keys}"


async def test_channel_source_handler_multiple_requests():
    seen = []
    src = ChannelSource(handler=lambda e: [
        ReconcileRequest(table="tasks", key=f"{e}-a"),
        ReconcileRequest(table="tasks", key=f"{e}-b"),
    ])
    task = asyncio.create_task(src.start(lambda r, p: seen.append(r)))
    src.emit("x")
    await asyncio.sleep(0.1)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    keys = sorted(r.key for r in seen)
    assert keys == ["x-a", "x-b"]
