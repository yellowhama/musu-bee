"""v34 + v35 migrations (v21.C): resource_requests + machine_capacity."""
from __future__ import annotations

import sqlite3

from musu_core.db import Database
from musu_core.migrations import (
    MIGRATIONS,
    _v34_down,
    _v34_up,
    _v35_down,
    _v35_up,
)


def _columns(conn, table):
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _table_exists(conn, table):
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchall()
    return len(rows) > 0


# --- v34 ---

def test_v34_registered_after_v33():
    labels = [m[0] for m in MIGRATIONS]
    assert labels.index("v34_resource_requests") == labels.index(
        "v33_machines_and_fks"
    ) + 1


def test_v34_creates_resource_requests_with_columns():
    db = Database(":memory:")
    conn = db._get_conn()
    assert _table_exists(conn, "resource_requests")
    cols = _columns(conn, "resource_requests")
    expected = {
        "id", "company_id", "agent_id", "priority", "requires_json",
        "affinity_json", "status", "bound_machine_id", "bound_at",
        "completed_at", "error", "created_at", "updated_at",
    }
    missing = expected - cols
    assert not missing, f"missing columns: {missing}"


def test_v34_status_check_rejects_invalid():
    db = Database(":memory:")
    conn = db._get_conn()
    try:
        conn.execute(
            "INSERT INTO resource_requests(id, status) VALUES (?, ?)",
            ("r-bad", "nonsense"),
        )
        raised = False
    except sqlite3.IntegrityError:
        raised = True
    assert raised


def test_v34_idempotent():
    db = Database(":memory:")
    conn = db._get_conn()
    _v34_up(conn)
    _v34_up(conn)  # must not raise
    assert _table_exists(conn, "resource_requests")


def test_v34_down_drops_table():
    db = Database(":memory:")
    conn = db._get_conn()
    _v34_down(conn)
    assert not _table_exists(conn, "resource_requests")


# --- v35 ---

def test_v35_registered_after_v34():
    labels = [m[0] for m in MIGRATIONS]
    v35_idx = labels.index("v35_machine_capacity")
    assert v35_idx == labels.index("v34_resource_requests") + 1
    assert labels[v35_idx + 1] == "v36_agents_isolation_profile"


def test_v35_creates_machine_capacity():
    db = Database(":memory:")
    conn = db._get_conn()
    assert _table_exists(conn, "machine_capacity")
    cols = _columns(conn, "machine_capacity")
    expected = {
        "machine_id", "gpu_models_json", "gpu_vram_total_gb",
        "gpu_vram_free_gb", "cpu_cores", "cpu_idle_pct",
        "mem_total_gb", "mem_free_gb", "runtime_classes_json",
        "last_heartbeat_at", "updated_at",
    }
    missing = expected - cols
    assert not missing


def test_v35_fk_on_machines():
    db = Database(":memory:")
    conn = db._get_conn()
    # Insert a machine then capacity row
    conn.execute("INSERT INTO machines(id) VALUES (?)", ("m-1",))
    conn.execute(
        "INSERT INTO machine_capacity(machine_id, gpu_vram_total_gb) VALUES (?, ?)",
        ("m-1", 8.0),
    )
    rows = conn.execute(
        "SELECT gpu_vram_total_gb FROM machine_capacity WHERE machine_id=?",
        ("m-1",),
    ).fetchall()
    assert rows[0][0] == 8.0


def test_v35_idempotent():
    db = Database(":memory:")
    conn = db._get_conn()
    _v35_up(conn)
    _v35_up(conn)
    assert _table_exists(conn, "machine_capacity")


def test_v35_down():
    db = Database(":memory:")
    conn = db._get_conn()
    _v35_down(conn)
    assert not _table_exists(conn, "machine_capacity")
