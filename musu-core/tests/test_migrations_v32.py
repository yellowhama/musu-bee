"""v32 migration: row-level approval_status on heartbeat_runs (v19.F.2).

Pins:
- registration order (v32 after v31)
- fresh DB has approval_status column + partial index
- idempotent re-run
- NULL default for new heartbeat_runs rows
- fresh-vs-stepped schema equivalence (Constitution III standard)
"""

from __future__ import annotations

import sqlite3

from musu_core.db import Database
from musu_core.migrations import (
    MIGRATIONS,
    _v32_down,
    _v32_up,
)


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _indexes(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        row[1]
        for row in conn.execute(f"PRAGMA index_list({table})").fetchall()
    }


def test_v32_registered_in_migrations_list() -> None:
    labels = [m[0] for m in MIGRATIONS]
    assert "v32_approval_status" in labels
    # v32 must come strictly after v31.
    assert labels.index("v32_approval_status") == labels.index(
        "v31_dispatch_counters"
    ) + 1


def test_v32_creates_approval_status_column_and_partial_index() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    cols = _columns(conn, "heartbeat_runs")
    assert "approval_status" in cols, (
        "heartbeat_runs.approval_status missing after fresh init"
    )
    idxs = _indexes(conn, "heartbeat_runs")
    assert "idx_approval_status_run" in idxs


def test_v32_up_is_idempotent() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    _v32_up(conn)
    _v32_up(conn)  # second call must not raise
    cols = _columns(conn, "heartbeat_runs")
    # Column still exists exactly once.
    column_names = [
        row[1]
        for row in conn.execute("PRAGMA table_info(heartbeat_runs)").fetchall()
    ]
    assert column_names.count("approval_status") == 1


def test_v32_null_default_for_new_heartbeat_run_row() -> None:
    """A heartbeat_runs INSERT that omits approval_status leaves it NULL."""
    db = Database(":memory:")
    db.execute(
        "INSERT INTO agents (id, name, role) VALUES ('a1', 'tester', 'ceo')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason, status) "
        "VALUES ('r1', 'a1', 'test', 'running')"
    )
    rows = db.execute(
        "SELECT approval_status FROM heartbeat_runs WHERE id='r1'"
    )
    assert rows[0]["approval_status"] is None


def test_v32_down_drops_partial_index(tmp_path) -> None:
    db_path = str(tmp_path / "v32_down.db")
    db = Database(db_path)
    conn = db._get_conn()
    assert "idx_approval_status_run" in _indexes(conn, "heartbeat_runs")
    _v32_down(conn)
    assert "idx_approval_status_run" not in _indexes(conn, "heartbeat_runs")


def test_fresh_db_vs_stepped_v32_schema_equivalence(tmp_path) -> None:
    """Constitution III equivalence: fresh DB and v31-then-v32 produce
    the same heartbeat_runs columns + indexes."""
    fresh_path = str(tmp_path / "fresh.db")
    db_a = Database(fresh_path)
    conn_a = db_a._get_conn()

    stepped_path = str(tmp_path / "stepped.db")
    db_b = Database(stepped_path)
    conn_b = db_b._get_conn()
    _v32_down(conn_b)
    _v32_up(conn_b)

    assert _columns(conn_a, "heartbeat_runs") == _columns(
        conn_b, "heartbeat_runs"
    )
    assert _indexes(conn_a, "heartbeat_runs") == _indexes(
        conn_b, "heartbeat_runs"
    )
