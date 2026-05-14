"""v33 migration: machines table + machine_id FK columns (v21.B).

Pins:
- registration order (v33 after v32)
- machines table created with all expected columns + status index
- agents.machine_id FK column + partial index
- heartbeat_runs.machine_id + resource_class columns
- idempotent re-run (no second-apply errors, no duplicate columns)
- v33 is the new MIGRATIONS tail (no v34 yet)
"""
from __future__ import annotations

import sqlite3

from musu_core.db import Database
from musu_core.migrations import (
    MIGRATIONS,
    _v33_down,
    _v33_up,
)


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _indexes(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        row[1]
        for row in conn.execute(f"PRAGMA index_list({table})").fetchall()
    }


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchall()
    return len(rows) > 0


def test_v33_registered_in_migrations_list() -> None:
    labels = [m[0] for m in MIGRATIONS]
    assert "v33_machines_and_fks" in labels
    # v33 must come strictly after v32.
    assert labels.index("v33_machines_and_fks") == labels.index(
        "v32_approval_status"
    ) + 1
    # v33 is the new tail until v34 lands.
    assert labels[-1] == "v33_machines_and_fks"


def test_v33_creates_machines_table() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    assert _table_exists(conn, "machines"), "machines table missing after fresh init"

    cols = _columns(conn, "machines")
    expected = {
        "id", "hostname", "os", "arch", "capacity_json",
        "status", "last_seen_at", "created_at", "updated_at",
    }
    missing = expected - cols
    assert not missing, f"machines table missing columns: {missing}"

    idxs = _indexes(conn, "machines")
    assert "idx_machines_status" in idxs, (
        f"idx_machines_status missing; have {idxs}"
    )


def test_v33_adds_agents_machine_id() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    cols = _columns(conn, "agents")
    assert "machine_id" in cols, "agents.machine_id column missing"

    idxs = _indexes(conn, "agents")
    assert "idx_agents_machine" in idxs, (
        f"idx_agents_machine missing; have {idxs}"
    )


def test_v33_adds_heartbeat_runs_columns() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    cols = _columns(conn, "heartbeat_runs")
    assert "machine_id" in cols, "heartbeat_runs.machine_id missing"
    assert "resource_class" in cols, "heartbeat_runs.resource_class missing"


def test_v33_is_idempotent_when_reapplied() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    # Already applied once via Database init; apply again — must not raise
    _v33_up(conn)
    _v33_up(conn)

    cols = _columns(conn, "agents")
    # machine_id column should appear exactly once (PRAGMA table_info
    # returns each column once even after multiple ALTER attempts)
    count = sum(1 for row in conn.execute(
        "PRAGMA table_info(agents)"
    ).fetchall() if row[1] == "machine_id")
    assert count == 1, f"agents.machine_id appears {count} times"


def test_v33_down_drops_machines_table() -> None:
    """Down should remove the machines table. Column drops are
    graceful-no-op on older SQLite per existing pattern."""
    db = Database(":memory:")
    conn = db._get_conn()
    assert _table_exists(conn, "machines")
    _v33_down(conn)
    assert not _table_exists(conn, "machines"), (
        "v33 down did not drop machines table"
    )


def test_v33_default_machine_status_is_online() -> None:
    """Spot-check the CHECK constraint + default."""
    db = Database(":memory:")
    conn = db._get_conn()
    conn.execute(
        "INSERT INTO machines(id, hostname) VALUES (?, ?)",
        ("m-test", "localhost"),
    )
    rows = conn.execute(
        "SELECT status FROM machines WHERE id=?", ("m-test",)
    ).fetchall()
    assert rows[0][0] == "online"


def test_v33_machines_status_check_rejects_invalid() -> None:
    db = Database(":memory:")
    conn = db._get_conn()
    try:
        conn.execute(
            "INSERT INTO machines(id, status) VALUES (?, ?)",
            ("m-bad", "nonsense"),
        )
        raised = False
    except sqlite3.IntegrityError:
        raised = True
    assert raised, "machines.status CHECK should reject invalid values"
