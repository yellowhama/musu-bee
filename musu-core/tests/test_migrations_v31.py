"""v31 migration: dispatch_counters table for orphan-resume observability.

Pins:
- registration order (v31 after v30)
- fresh DB has table + 3 seed rows = 0
- idempotent re-run
- seed idempotent under real data (bumped values preserved)
- _v31_down drops table
- fresh-vs-stepped schema equivalence (Constitution III standard)
- unknown counter increment is no-op (rowcount=0, no raise)
"""

from __future__ import annotations

import sqlite3

from musu_core.db import Database
from musu_core.dispatch.counters import (
    COUNTER_APPROVALS_DECLINED_ORPHAN,
    COUNTER_APPROVALS_RESOLVED_IN_MEMORY,
    COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME,
    increment_counter,
    read_counters,
)
from musu_core.migrations import (
    MIGRATIONS,
    _v31_down,
    _v31_up,
)


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    rows = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchall()
    return bool(rows)


def test_v31_registered_in_migrations_list() -> None:
    labels = [m[0] for m in MIGRATIONS]
    assert "v31_dispatch_counters" in labels
    assert labels.index("v31_dispatch_counters") == labels.index(
        "v30_event_seq"
    ) + 1


def test_v31_creates_dispatch_counters_table_on_fresh_db() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    assert _table_exists(conn, "dispatch_counters")
    counters = read_counters(db)
    assert counters == {
        COUNTER_APPROVALS_RESOLVED_IN_MEMORY: 0,
        COUNTER_APPROVALS_RESOLVED_ORPHAN_RESUME: 0,
        COUNTER_APPROVALS_DECLINED_ORPHAN: 0,
    }


def test_v31_up_is_idempotent() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    _v31_up(conn)
    _v31_up(conn)  # second call must not raise
    counters = read_counters(db)
    assert sum(counters.values()) == 0


def test_v31_seed_idempotent_under_real_data() -> None:
    """Counter values are preserved across re-runs of _v31_up."""
    db = Database(":memory:")
    conn = db._get_conn()
    increment_counter(db, COUNTER_APPROVALS_RESOLVED_IN_MEMORY)
    increment_counter(db, COUNTER_APPROVALS_RESOLVED_IN_MEMORY)
    increment_counter(db, COUNTER_APPROVALS_RESOLVED_IN_MEMORY)
    assert read_counters(db)[COUNTER_APPROVALS_RESOLVED_IN_MEMORY] == 3
    _v31_up(conn)  # re-run migration
    assert read_counters(db)[COUNTER_APPROVALS_RESOLVED_IN_MEMORY] == 3


def test_v31_down_drops_table(tmp_path) -> None:
    db_path = str(tmp_path / "v31_down.db")
    db = Database(db_path)
    conn = db._get_conn()
    assert _table_exists(conn, "dispatch_counters")
    _v31_down(conn)
    assert not _table_exists(conn, "dispatch_counters")


def test_fresh_db_vs_stepped_v31_schema_equivalence(tmp_path) -> None:
    """Constitution III equivalence: fresh DB and v30-then-v31 produce
    the same dispatch_counters schema + same seed rows."""
    fresh_path = str(tmp_path / "fresh.db")
    db_a = Database(fresh_path)

    stepped_path = str(tmp_path / "stepped.db")
    db_b = Database(stepped_path)
    conn_b = db_b._get_conn()
    _v31_down(conn_b)
    _v31_up(conn_b)

    assert read_counters(db_a) == read_counters(db_b)


def test_unknown_counter_increment_is_noop() -> None:
    """increment_counter on an unknown name doesn't raise — rowcount=0."""
    db = Database(":memory:")
    # Should not raise. Existing counters remain 0.
    increment_counter(db, "this_counter_does_not_exist")
    counters = read_counters(db)
    assert all(v == 0 for v in counters.values())
