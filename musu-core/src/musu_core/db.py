"""SQLite WAL schema — agents, tasks, comments, execution_log."""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

_local = threading.local()

_SCHEMA = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT '',
    adapter_type TEXT NOT NULL DEFAULT 'process',
    -- JSON blob: model, command, cwd, instructions_path, etc.
    adapter_config TEXT NOT NULL DEFAULT '{}',
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
    -- JSON array: ordered fallback adapter configs [{adapter_type, ...}, ...]
    fallback_chain TEXT DEFAULT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'todo'
                    CHECK (status IN ('todo', 'in_progress', 'done', 'blocked', 'cancelled')),
    priority    TEXT NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    assignee_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    parent_id   TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    -- JSON blob for arbitrary metadata
    meta        TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    -- 'user' or 'agent'
    author_kind TEXT NOT NULL DEFAULT 'agent',
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS execution_log (
    id          TEXT PRIMARY KEY,
    task_id     TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    agent_id    TEXT REFERENCES agents(id) ON DELETE SET NULL,
    adapter_type TEXT NOT NULL DEFAULT '',
    -- 'started', 'completed', 'failed', 'timeout'
    event       TEXT NOT NULL,
    -- JSON: prompt, response summary, session_id, usage, error
    payload     TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content     TEXT NOT NULL DEFAULT '',
    model       TEXT,
    agent_id    TEXT REFERENCES agents(id) ON DELETE SET NULL,
    -- JSON blob for arbitrary metadata
    meta        TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee   ON tasks(assignee_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_comments_task    ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_execlog_task     ON execution_log(task_id);
CREATE INDEX IF NOT EXISTS idx_execlog_agent    ON execution_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_agent ON messages(agent_id);

CREATE TABLE IF NOT EXISTS fallback_metrics (
    id          TEXT PRIMARY KEY,
    agent_id    TEXT,
    run_id      TEXT NOT NULL,
    -- error_code string or 'unknown'
    fallback_reason TEXT NOT NULL DEFAULT 'unknown',
    -- which fallback adapter was attempted (empty = primary failure pre-chain)
    fallback_adapter TEXT NOT NULL DEFAULT '',
    -- 1 when every adapter in the chain failed; 0 when a fallback succeeded
    chain_exhausted INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_fallback_metrics_agent   ON fallback_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_fallback_metrics_created ON fallback_metrics(created_at);

CREATE TABLE IF NOT EXISTS companies (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    template_key    TEXT NOT NULL DEFAULT 'default',
    workspace_id    TEXT NOT NULL DEFAULT '',
    meta            TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS company_role_templates (
    id              TEXT PRIMARY KEY,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role            TEXT NOT NULL,
    instructions    TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS company_project_index (
    id              TEXT PRIMARY KEY,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    project_name    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'paused', 'archived')),
    assigned_to     TEXT REFERENCES agents(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS company_approvals_queue (
    id              TEXT PRIMARY KEY,
    company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    task_id         TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by    TEXT NOT NULL DEFAULT '',
    reason          TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS route_executions (
    id          TEXT PRIMARY KEY,
    channel     TEXT NOT NULL,
    sender_id   TEXT NOT NULL,
    input       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'done', 'failed')),
    node        TEXT,
    output      TEXT,
    error       TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_route_executions_status ON route_executions(status);

CREATE INDEX IF NOT EXISTS idx_companies_workspace ON companies(workspace_id);
CREATE INDEX IF NOT EXISTS idx_role_templates_company ON company_role_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_project_index_company ON company_project_index(company_id);
CREATE INDEX IF NOT EXISTS idx_approvals_company ON company_approvals_queue(company_id);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON company_approvals_queue(status);
"""


def _open(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.executescript(_SCHEMA)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    # Apply pending schema migrations (idempotent)
    from musu_core.migrations import apply_pending  # local import avoids circular
    apply_pending(conn)
    return conn


class Database:
    """Thread-safe SQLite connection wrapper."""

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        self._lock = threading.Lock()
        self._conn: sqlite3.Connection | None = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = _open(self.db_path)
        return self._conn

    @contextmanager
    def cursor(self) -> Generator[sqlite3.Cursor, None, None]:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            try:
                yield cur
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                cur.close()

    def execute(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        with self._lock:
            conn = self._get_conn()
            cur = conn.cursor()
            try:
                cur.execute(sql, params)
                rows = cur.fetchall()
                conn.commit()
                return rows
            except Exception:
                conn.rollback()
                raise
            finally:
                cur.close()

    def close(self) -> None:
        with self._lock:
            if self._conn:
                self._conn.close()
                self._conn = None


_db_instances: dict[str, Database] = {}
_db_lock = threading.Lock()


def get_db(db_path: str) -> Database:
    with _db_lock:
        if db_path not in _db_instances:
            _db_instances[db_path] = Database(db_path)
        return _db_instances[db_path]
