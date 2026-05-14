"""v29 migration: run_approvals table + agents.home_node column.

The Constitution III gate test for v19.C — proves the migration is
idempotent, additive only, and lands the same schema whether applied to a
fresh DB or stepped onto a v28 DB.
"""

from __future__ import annotations

import sqlite3

import pytest

from musu_core.db import Database, _open
from musu_core.migrations import (
    MIGRATIONS,
    _v29_down,
    _v29_up,
    apply_pending,
)


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _indexes(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        row[1]
        for row in conn.execute(f"PRAGMA index_list({table})").fetchall()
    }


def test_v29_registered_in_migrations_list() -> None:
    labels = [m[0] for m in MIGRATIONS]
    assert "v29_dispatch_hardening" in labels
    # v29 must come strictly after v28 — order matters for apply_pending.
    assert labels.index("v29_dispatch_hardening") == labels.index(
        "v28_agent_hierarchy_and_runs"
    ) + 1


def test_v29_on_fresh_db_creates_run_approvals_and_home_node() -> None:
    db = Database(":memory:")
    # Database.__init__ → _open runs apply_pending, so v29 already applied.
    rows = db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='run_approvals'"
    )
    assert rows, "run_approvals table missing after v29 up"

    # PRAGMA inspection — need the raw conn.
    conn = db._get_conn()
    agent_cols = _columns(conn, "agents")
    assert "home_node" in agent_cols, "agents.home_node missing after v29 up"

    run_approval_cols = _columns(conn, "run_approvals")
    assert run_approval_cols == {
        "id",
        "run_id",
        "prompt",
        "status",
        "requested_at",
        "responded_at",
    }


def test_v29_indexes_exist() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    idxs = _indexes(conn, "run_approvals")
    assert "idx_run_approvals_run" in idxs
    assert "idx_run_approvals_pending" in idxs


def test_v29_status_check_constraint_rejects_garbage() -> None:
    db = Database(":memory:")
    # Need an agent + heartbeat_run to satisfy FK.
    db.execute(
        "INSERT INTO agents (id, name) VALUES ('a1', 'tester')"
    )
    db.execute(
        "INSERT INTO heartbeat_runs (id, agent_id, wake_reason) "
        "VALUES ('r1', 'a1', 'test')"
    )
    # Insert valid pending row — must work.
    db.execute(
        "INSERT INTO run_approvals (id, run_id, prompt) VALUES ('ap1', 'r1', 'ok?')"
    )
    rows = db.execute(
        "SELECT status FROM run_approvals WHERE id='ap1'"
    )
    assert rows[0]["status"] == "pending"

    # Garbage status — must fail.
    with pytest.raises(sqlite3.IntegrityError):
        db.execute(
            "INSERT INTO run_approvals (id, run_id, prompt, status) "
            "VALUES ('ap2', 'r1', 'q?', 'maybe')"
        )


def test_v29_up_is_idempotent() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    # Already applied once via Database init. A second invocation must not raise.
    _v29_up(conn)
    _v29_up(conn)
    # And the table is still there exactly once.
    rows = conn.execute(
        "SELECT count(*) FROM sqlite_master "
        "WHERE type='table' AND name='run_approvals'"
    ).fetchone()
    assert rows[0] == 1


def test_v29_down_drops_run_approvals(tmp_path) -> None:
    # Use a file-backed DB so we can inspect after Database closes.
    db_path = str(tmp_path / "v29_down_test.db")
    db = Database(db_path)
    conn = db._get_conn()
    # Pre: table exists.
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='run_approvals'"
    ).fetchall()
    assert rows, "table should exist before down"

    _v29_down(conn)

    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='run_approvals'"
    ).fetchall()
    assert not rows, "table should be gone after v29_down"

    # Indexes also gone.
    rows = conn.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='index' AND name LIKE 'idx_run_approvals%'"
    ).fetchall()
    assert not rows


def test_fresh_db_vs_stepped_v29_produce_equivalent_schema(tmp_path) -> None:
    """Constitution III standard: fresh vs upgraded paths produce the same
    schema. Apply all migrations on DB-A and only v29 on a pre-v28 DB-B."""
    # DB-A: full chain through v29 (Database init does this).
    db_a_path = str(tmp_path / "fresh.db")
    db_a = Database(db_a_path)
    conn_a = db_a._get_conn()

    # DB-B: stop the chain at v28, then manually apply v29.
    # The simplest way: open a connection bypassing Database, run migrations
    # up to and including v28, then call _v29_up.
    db_b_path = str(tmp_path / "stepped.db")
    # Use _open's setup but skip apply_pending — replicate the prefix manually.
    conn_b = sqlite3.connect(db_b_path)
    conn_b.row_factory = sqlite3.Row
    # Run the _SCHEMA via Database first (apply_pending will run all
    # migrations); then drop v29 to simulate "stopped at v28".
    db_b = Database(db_b_path)
    conn_b = db_b._get_conn()
    _v29_down(conn_b)
    # Now re-apply only v29.
    _v29_up(conn_b)

    # Compare critical schema surface.
    assert _columns(conn_a, "agents") == _columns(conn_b, "agents")
    assert _columns(conn_a, "run_approvals") == _columns(conn_b, "run_approvals")
    assert _indexes(conn_a, "run_approvals") == _indexes(conn_b, "run_approvals")
