"""Const VI experiment — 4 concurrent reconcilers writing SQLite.

Hypothesis: 4 reconcilers each writing 100 rows to one SQLite WAL db
concurrently completes without deadlock or SQLITE_BUSY, at a rate
>100 writes/sec aggregate. If this holds, 21.A controller framework
can run multiple reconcilers in one ControllerManager without
introducing a write-batching bottleneck workaround.

Marker: `slow`. Excluded from default pytest sweep. Run manually:
    pytest -m slow musu-core/tests/test_controllers_sqlite_contention.py
"""
from __future__ import annotations

import asyncio
import time

import pytest

from musu_core.db import Database


@pytest.mark.slow
async def test_4_controllers_concurrent_writes(tmp_path):
    # Use a real file (not :memory:) so WAL behavior matches production.
    db_path = str(tmp_path / "contention.db")
    db = Database(db_path)
    # Ensure WAL is on (Database._open sets it, but be explicit for the test)
    db.execute("PRAGMA journal_mode = WAL")

    # Use an existing musu table from the schema. `contention_test` is
    # in the controllers allowlist for this exact purpose.
    db.execute(
        "CREATE TABLE IF NOT EXISTS contention_test "
        "(rowid INTEGER PRIMARY KEY AUTOINCREMENT, writer TEXT, n INTEGER)"
    )

    writes_per_writer = 100
    n_writers = 4
    expected_total = writes_per_writer * n_writers

    async def writer(name: str) -> None:
        for i in range(writes_per_writer):
            await asyncio.to_thread(
                db.execute,
                "INSERT INTO contention_test(writer, n) VALUES (?, ?)",
                (name, i),
            )

    start = time.monotonic()
    await asyncio.gather(*[writer(f"w{i}") for i in range(n_writers)])
    elapsed = time.monotonic() - start

    rows = db.execute("SELECT COUNT(*) AS c FROM contention_test")
    actual = rows[0]["c"]
    rate = actual / elapsed if elapsed > 0 else float("inf")

    print(
        f"\n[Const VI v21.A] 4-controller contention: "
        f"{actual} writes in {elapsed:.2f}s = {rate:.0f} writes/s"
    )

    assert actual == expected_total, (
        f"missing writes: expected {expected_total}, got {actual} — "
        f"contention likely caused failures"
    )
    assert rate > 100, (
        f"throughput too low ({rate:.0f}/s) — "
        f"Database._lock may be the bottleneck; consider write batching"
    )

    # Verify each writer succeeded fully
    for i in range(n_writers):
        per_writer = db.execute(
            "SELECT COUNT(*) AS c FROM contention_test WHERE writer=?",
            (f"w{i}",),
        )
        assert per_writer[0]["c"] == writes_per_writer, (
            f"writer w{i} missing rows"
        )

    db.close()
