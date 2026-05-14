"""Const VI: cross-process watch latency bench (v21.B).

Hypothesis: cross-machine watch latency at 2s poll_interval is
acceptable for v21 (<3s P95 from write-on-B to handler-fired-on-A).

Method: spawn 1 writer process; reader process runs a KindSource at
the named poll_interval and records (handler_fire_time - write_time)
per row. Single process pair (not 2 machines), but the SQLite WAL +
spawn-fresh-interpreter approximates cross-process semantics.

Pass: P95 < 3s, max < 5s, all 10 writes seen.

Marker: slow. Default sweep excludes. Manual:
    pytest -m slow musu-core/tests/test_controllers_watch_cross_proc.py
"""
from __future__ import annotations

import asyncio
import multiprocessing as mp
import sqlite3
import statistics
import time
import uuid

import pytest

from musu_core.controllers.handlers import enqueue_request_for_object
from musu_core.controllers.sources import KindSource
from musu_core.db import Database


def _writer_process(db_path: str, n_writes: int, write_log_path: str) -> None:
    """Run in spawn child. Insert n_writes rows, log wall-clock time."""
    import sqlite3 as _sqlite
    import time as _time

    # Connect raw to keep child light; Database() would trigger migrations.
    conn = _sqlite.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    # Wait a moment so the reader's initial cursor advances past startup
    _time.sleep(0.5)

    with open(write_log_path, "w") as f:
        for i in range(n_writes):
            row_id = f"cp-{i}"
            t0 = _time.time()
            conn.execute(
                "INSERT INTO tasks(id, title, status) VALUES (?, ?, 'todo')",
                (row_id, f"task {i}"),
            )
            conn.commit()
            f.write(f"{row_id} {t0}\n")
            f.flush()
            _time.sleep(0.5)
    conn.close()


async def _run_reader(
    db_path: str, n_writes: int, poll_interval_ms: int, deadline: float
) -> dict[str, float]:
    """Run KindSource until n_writes rows seen or deadline."""
    db = Database(db_path)
    src = KindSource(
        db, "tasks",
        enqueue_request_for_object("tasks"),
        poll_interval_ms=poll_interval_ms,
    )

    fires: dict[str, float] = {}

    def enqueue(req, priority):
        # Only count cross-proc rows (prefix cp-)
        if req.key.startswith("cp-") and req.key not in fires:
            fires[req.key] = time.time()

    task = asyncio.create_task(src.start(enqueue))
    try:
        while len(fires) < n_writes and time.time() < deadline:
            await asyncio.sleep(0.1)
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        db.close()
    return fires


@pytest.mark.slow
def test_cross_process_watch_latency(tmp_path):
    db_path = str(tmp_path / "cross_proc.db")
    write_log = str(tmp_path / "writes.log")
    n_writes = 10
    poll_interval_ms = 2000

    # Init schema in the parent first so the child writer sees a
    # ready table without re-applying migrations concurrently.
    Database(db_path).close()

    # Spawn writer
    ctx = mp.get_context("spawn")
    writer = ctx.Process(
        target=_writer_process, args=(db_path, n_writes, write_log)
    )
    writer.start()

    # Run reader in this process
    deadline = time.time() + 30  # 30s wall-clock cap
    fires = asyncio.run(_run_reader(db_path, n_writes, poll_interval_ms, deadline))

    writer.join(timeout=10)

    # Parse write log
    writes: dict[str, float] = {}
    with open(write_log) as f:
        for line in f:
            key, ts = line.strip().split()
            writes[key] = float(ts)

    # Compute latencies
    latencies = []
    for key, write_ts in writes.items():
        if key in fires:
            latencies.append(fires[key] - write_ts)

    assert len(latencies) == n_writes, (
        f"only {len(latencies)}/{n_writes} writes detected; "
        f"writes={list(writes)}, fires={list(fires)}"
    )

    p50 = statistics.median(latencies)
    p95 = sorted(latencies)[int(len(latencies) * 0.95)] if len(latencies) > 1 else latencies[0]
    pmax = max(latencies)
    pmin = min(latencies)

    print(
        f"\n[Const VI v21.B] cross-process watch latency "
        f"(poll={poll_interval_ms}ms, n={n_writes}): "
        f"min={pmin*1000:.0f}ms p50={p50*1000:.0f}ms "
        f"p95={p95*1000:.0f}ms max={pmax*1000:.0f}ms"
    )

    assert p95 < 3.0, f"P95 {p95*1000:.0f}ms exceeded 3000ms budget"
    assert pmax < 5.0, f"max {pmax*1000:.0f}ms exceeded 5000ms budget"
