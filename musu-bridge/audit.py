"""Audit log for musu-bridge.

Records mutating API actions (route_chat, agent CRUD, message deletes)
to a local SQLite database for security review and compliance.

Schema:
  audit_log(id, ts, actor_ip, method, path, status_code, agent_id, note)

Environment:
  MUSU_BRIDGE_AUDIT_DB  — SQLite file path (default: data/audit.db)
  MUSU_BRIDGE_AUDIT_MAX_ROWS — row cap before oldest rows are purged (default: 50000)
"""
from __future__ import annotations

import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Generator

_DB_PATH_DEFAULT = "data/audit.db"
_MAX_ROWS_DEFAULT = 50_000
_MUTATING = frozenset({"POST", "PUT", "PATCH", "DELETE"})

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def _db_path() -> str:
    return os.environ.get("MUSU_BRIDGE_AUDIT_DB", _DB_PATH_DEFAULT)


def _max_rows() -> int:
    try:
        return int(os.environ.get("MUSU_BRIDGE_AUDIT_MAX_ROWS", str(_MAX_ROWS_DEFAULT)))
    except ValueError:
        return _MAX_ROWS_DEFAULT


@contextmanager
def _cursor() -> Generator[sqlite3.Cursor, None, None]:
    global _conn
    with _lock:
        if _conn is None:
            path = _db_path()
            os.makedirs(os.path.dirname(path) if os.path.dirname(path) else ".", exist_ok=True)
            _conn = sqlite3.connect(path, check_same_thread=False)
            _conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    ts          REAL    NOT NULL,
                    actor_ip    TEXT    NOT NULL DEFAULT '',
                    method      TEXT    NOT NULL DEFAULT '',
                    path        TEXT    NOT NULL DEFAULT '',
                    status_code INTEGER NOT NULL DEFAULT 0,
                    agent_id    TEXT    NOT NULL DEFAULT '',
                    note        TEXT    NOT NULL DEFAULT ''
                )
                """
            )
            _conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts)"
            )
            _conn.commit()
        cur = _conn.cursor()
        try:
            yield cur
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise


def record(
    *,
    actor_ip: str = "",
    method: str = "",
    path: str = "",
    status_code: int = 0,
    agent_id: str = "",
    note: str = "",
) -> None:
    """Insert one audit event. Silently ignored on any DB error."""
    try:
        with _cursor() as cur:
            cur.execute(
                """
                INSERT INTO audit_log (ts, actor_ip, method, path, status_code, agent_id, note)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (time.time(), actor_ip, method, path, status_code, agent_id, note),
            )
            # Purge oldest rows when cap is hit
            max_rows = _max_rows()
            cur.execute("SELECT COUNT(*) FROM audit_log")
            count = cur.fetchone()[0]
            if count > max_rows:
                excess = count - max_rows
                cur.execute(
                    "DELETE FROM audit_log WHERE id IN "
                    "(SELECT id FROM audit_log ORDER BY ts ASC LIMIT ?)",
                    (excess,),
                )
    except Exception:  # noqa: BLE001
        pass  # audit must never crash the main flow


def recent(limit: int = 100, offset: int = 0) -> list[dict]:
    """Return recent audit entries, newest first."""
    try:
        with _cursor() as cur:
            cur.execute(
                """
                SELECT id, ts, actor_ip, method, path, status_code, agent_id, note
                FROM audit_log
                ORDER BY ts DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            )
            rows = cur.fetchall()
            return [
                {
                    "id": r[0],
                    "ts": r[1],
                    "actor_ip": r[2],
                    "method": r[3],
                    "path": r[4],
                    "status_code": r[5],
                    "agent_id": r[6],
                    "note": r[7],
                }
                for r in rows
            ]
    except Exception:  # noqa: BLE001
        return []


def activity_for_company(company_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    """Return route_executions scoped to a company, newest first."""
    from handlers import _get_backend  # local import avoids circular

    try:
        backend = _get_backend()
        rows = backend._db.execute(
            "SELECT * FROM route_executions WHERE company_id = ?"
            " ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (company_id, limit, offset),
        )
        return [dict(r) for r in rows]
    except Exception:  # noqa: BLE001
        return []
