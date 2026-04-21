import sqlite3
import pytest
from musu_core.db import _SCHEMA
from musu_core.migrations import apply_pending


def make_db():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    apply_pending(conn)
    return conn


def test_companies_has_status_column():
    conn = make_db()
    rows = conn.execute("PRAGMA table_info(companies)").fetchall()
    cols = {r["name"] for r in rows}
    assert "status" in cols
    assert "purpose" in cols


def test_company_status_default_active():
    conn = make_db()
    conn.execute(
        "INSERT INTO companies (id, name) VALUES ('c1', 'Test Co')"
    )
    conn.commit()
    row = conn.execute("SELECT status, purpose FROM companies WHERE id='c1'").fetchone()
    assert row["status"] == "active"
    assert row["purpose"] == ""
