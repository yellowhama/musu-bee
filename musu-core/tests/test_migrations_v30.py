"""v30 migration: explicit monotonic seq on heartbeat_run_events.

Pins:
- registration order (v30 after v29)
- fresh DB has seq column + unique index
- backfill from rowid preserves v19.D ordering
- idempotent re-run
- fresh-vs-stepped schema equivalence (Constitution III standard)
- record_event assigns strictly monotonic seq
- same-ms burst of 5 INSERTs orders correctly under ORDER BY seq
"""

from __future__ import annotations

import sqlite3

import pytest

from musu_core.db import Database
from musu_core.dispatch.wake import record_event
from musu_core.migrations import (
    MIGRATIONS,
    _v30_down,
    _v30_up,
)


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _indexes(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        row[1]
        for row in conn.execute(f"PRAGMA index_list({table})").fetchall()
    }


def _seed_run(db: Database, run_id: str = "r1") -> None:
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, status) "
        "VALUES (?, 'a1', 'test', 'queued')",
        (run_id,),
    )


def test_v30_registered_in_migrations_list() -> None:
    labels = [m[0] for m in MIGRATIONS]
    assert "v30_event_seq" in labels
    # v30 must come strictly after v29.
    assert labels.index("v30_event_seq") == labels.index(
        "v29_dispatch_hardening"
    ) + 1


def test_v30_on_fresh_db_creates_seq_column_and_index() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    cols = _columns(conn, "heartbeat_run_events")
    assert "seq" in cols, "heartbeat_run_events.seq missing after fresh init"
    idxs = _indexes(conn, "heartbeat_run_events")
    assert "idx_heartbeat_run_events_seq" in idxs


def test_v30_up_is_idempotent() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    _v30_up(conn)
    _v30_up(conn)  # second call must not raise
    cols = _columns(conn, "heartbeat_run_events")
    assert "seq" in cols  # still exactly once


def test_v30_down_drops_seq_index(tmp_path) -> None:
    db_path = str(tmp_path / "v30_down.db")
    db = Database(db_path)
    conn = db._get_conn()
    assert "seq" in _columns(conn, "heartbeat_run_events")
    _v30_down(conn)
    # Index gone for sure (no implementation-dependent quirks here).
    idxs = _indexes(conn, "heartbeat_run_events")
    assert "idx_heartbeat_run_events_seq" not in idxs


def test_v30_backfills_seq_from_rowid_on_stepped_upgrade(tmp_path) -> None:
    """Apply migrations through v29, INSERT some events, then v30 up.
    Backfill must give each row a seq matching its rowid."""
    db_path = str(tmp_path / "stepped.db")
    db = Database(db_path)  # this already runs v30 via apply_pending
    conn = db._get_conn()

    # To simulate "we were on v29", drop v30 first.
    _v30_down(conn)
    cols = _columns(conn, "heartbeat_run_events")
    # On SQLite 3.35+, seq column is dropped. On older, it stays as 0.
    # Either way we're now "as if v29".

    # Seed a few events directly (bypass record_event since v30 isn't
    # applied right now — we want raw rows to simulate pre-v30 data).
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, status) "
        "VALUES ('r1', 'a1', 'test', 'queued')"
    )
    # Use sqlite3 conn directly to avoid the v30-aware record_event.
    conn.execute(
        "INSERT INTO heartbeat_run_events (id, run_id, event_type, payload) "
        "VALUES ('e1', 'r1', 't1', '{}')"
    )
    conn.execute(
        "INSERT INTO heartbeat_run_events (id, run_id, event_type, payload) "
        "VALUES ('e2', 'r1', 't2', '{}')"
    )
    conn.execute(
        "INSERT INTO heartbeat_run_events (id, run_id, event_type, payload) "
        "VALUES ('e3', 'r1', 't3', '{}')"
    )
    conn.commit()

    # Capture rowid for each, then apply v30.
    rowids_pre = {
        r["id"]: r["rowid"]
        for r in conn.execute("SELECT rowid, id FROM heartbeat_run_events").fetchall()
    }
    _v30_up(conn)

    # After v30: seq column exists and equals rowid for these old rows.
    rows = conn.execute(
        "SELECT id, seq FROM heartbeat_run_events ORDER BY id"
    ).fetchall()
    for r in rows:
        assert r["seq"] == rowids_pre[r["id"]], (
            f"backfill mismatch for id={r['id']}: seq={r['seq']} rowid={rowids_pre[r['id']]}"
        )


def test_fresh_db_vs_stepped_v30_schema_equivalence(tmp_path) -> None:
    """Constitution III equivalence test: fresh DB through v30 vs
    v29-then-v30 produce the same heartbeat_run_events schema."""
    fresh_path = str(tmp_path / "fresh.db")
    db_a = Database(fresh_path)
    conn_a = db_a._get_conn()

    stepped_path = str(tmp_path / "stepped.db")
    db_b = Database(stepped_path)
    conn_b = db_b._get_conn()
    _v30_down(conn_b)
    _v30_up(conn_b)

    assert _columns(conn_a, "heartbeat_run_events") == _columns(
        conn_b, "heartbeat_run_events"
    )
    assert _indexes(conn_a, "heartbeat_run_events") == _indexes(
        conn_b, "heartbeat_run_events"
    )


def test_record_event_assigns_strictly_monotonic_seq() -> None:
    db = Database(":memory:")
    _seed_run(db)
    record_event(db, "r1", "a")
    record_event(db, "r1", "b")
    record_event(db, "r1", "c")
    rows = db.execute(
        "SELECT event_type, seq FROM heartbeat_run_events "
        "WHERE run_id='r1' ORDER BY seq ASC"
    )
    seqs = [r["seq"] for r in rows]
    types = [r["event_type"] for r in rows]
    assert seqs == sorted(set(seqs)), "seq values must be strictly increasing"
    assert types == ["a", "b", "c"], "events out of INSERT order"


def test_same_ms_burst_orders_correctly() -> None:
    """SC-001: 5 events inserted in a tight loop should ORDER BY seq
    in INSERT order even when created_at is identical (ms resolution)."""
    db = Database(":memory:")
    _seed_run(db)
    # Tight loop — most or all will share the same ms.
    for n in range(5):
        record_event(db, "r1", f"chunk_{n}")
    rows = db.execute(
        "SELECT event_type, seq FROM heartbeat_run_events "
        "WHERE run_id='r1' ORDER BY seq ASC"
    )
    types = [r["event_type"] for r in rows]
    assert types == [f"chunk_{n}" for n in range(5)], (
        f"same-ms burst reordered: {types}"
    )
    seqs = [r["seq"] for r in rows]
    # Each seq is one greater than the previous.
    diffs = [seqs[i] - seqs[i - 1] for i in range(1, len(seqs))]
    assert all(d == 1 for d in diffs), f"seq not strictly +1: {seqs}"


def test_unique_constraint_rejects_duplicate_seq() -> None:
    """UNIQUE INDEX on seq is defense-in-depth — duplicates rejected."""
    db = Database(":memory:")
    _seed_run(db)
    record_event(db, "r1", "first")
    # Try to manually INSERT a row with a duplicate seq — must fail.
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO heartbeat_run_events "
            "(id, run_id, event_type, payload, seq) "
            "VALUES ('dup', 'r1', 'forced_dup', '{}', "
            "(SELECT seq FROM heartbeat_run_events WHERE event_type='first'))"
        )


def test_record_event_concurrent_threads_no_seq_collision(tmp_path) -> None:
    """v19.E audit fix: concurrent record_event calls from multiple
    threads must never collide on the UNIQUE seq index.

    Pre-fix: separate SELECT MAX(seq)+1 + INSERT released the
    Database._lock between statements, letting two threads read the
    same MAX and race. Post-fix: single INSERT with embedded subquery
    is one SQLite statement = atomic.
    """
    import threading

    # File-backed DB so all threads share state (Database(:memory:)
    # creates a fresh per-call thread-local connection).
    db_path = str(tmp_path / "concurrent.db")
    db = Database(db_path)
    _seed_run(db)

    N_THREADS = 8
    N_PER_THREAD = 25
    errors: list[BaseException] = []
    barrier = threading.Barrier(N_THREADS)

    def worker(tid: int) -> None:
        try:
            barrier.wait()
            for i in range(N_PER_THREAD):
                record_event(db, "r1", f"t{tid}_e{i}")
        except BaseException as e:  # noqa: BLE001 — re-raise via list
            errors.append(e)

    threads = [
        threading.Thread(target=worker, args=(t,), daemon=True)
        for t in range(N_THREADS)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10.0)

    assert not errors, f"concurrent record_event raised: {errors}"

    rows = db.execute(
        "SELECT seq FROM heartbeat_run_events ORDER BY seq ASC"
    )
    seqs = [r["seq"] for r in rows]
    expected_total = N_THREADS * N_PER_THREAD
    assert len(seqs) == expected_total, (
        f"missing rows: got {len(seqs)} expected {expected_total}"
    )
    assert seqs == list(range(1, expected_total + 1)), (
        "seq values not contiguous 1..N — race produced a gap"
    )
