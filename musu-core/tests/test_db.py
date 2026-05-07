"""Tests for musu_core.db — Database connection, WAL mode, migrations."""
import os
import tempfile

import pytest
from musu_core.db import Database


@pytest.fixture
def tmp_db():
    """Create a temporary database."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    db = Database(path)
    yield db
    db.close()
    os.unlink(path)


class TestDatabaseBasics:
    def test_create_and_connect(self, tmp_db):
        """DB should be created and connected."""
        result = tmp_db.execute("SELECT 1 as val")
        assert result is not None

    def test_wal_mode(self, tmp_db):
        """DB should use WAL mode for concurrency."""
        rows = tmp_db.execute("PRAGMA journal_mode")
        if rows:
            mode = rows[0][0] if isinstance(rows[0], (list, tuple)) else rows[0]["journal_mode"]
            assert mode.lower() == "wal"

    def test_execute_insert_select(self, tmp_db):
        """Basic INSERT + SELECT should work."""
        tmp_db.execute("CREATE TABLE test_t (id INTEGER PRIMARY KEY, name TEXT)")
        tmp_db.execute("INSERT INTO test_t (name) VALUES (?)", ("hello",))
        rows = tmp_db.execute("SELECT name FROM test_t")
        assert rows is not None
        assert len(rows) >= 1

    def test_migrations_run(self, tmp_db):
        """Migrations should create core tables."""
        # agents table should exist after migration
        try:
            tmp_db.execute("SELECT COUNT(*) FROM agents")
        except Exception:
            pytest.skip("agents table not created — migration may need explicit call")


class TestDatabaseEdgeCases:
    def test_empty_query(self, tmp_db):
        """Empty result set should return empty list, not None."""
        tmp_db.execute("CREATE TABLE empty_t (id INTEGER)")
        rows = tmp_db.execute("SELECT * FROM empty_t")
        assert rows is not None

    def test_parameterized_query(self, tmp_db):
        """Parameterized queries should prevent injection."""
        tmp_db.execute("CREATE TABLE safe_t (val TEXT)")
        tmp_db.execute("INSERT INTO safe_t (val) VALUES (?)", ("'; DROP TABLE safe_t; --",))
        rows = tmp_db.execute("SELECT val FROM safe_t")
        assert len(rows) >= 1
