from __future__ import annotations

import json
import re
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional

from .core import ensure_db_schema, get_db
from .resolver import resolve_and_materialize

ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")
MAX_SNAPSHOT_CHARS = 4000
PERSIST_ACTIVITY_INTERVAL_SECONDS = 1.0


def strip_ansi(text: str) -> str:
    return ANSI_ESCAPE.sub("", text)


class Session:
    """Represents a single stateful process session (PTY or Spy)."""

    def __init__(
        self, session_id: str, session_type: str, command: List[str], project_root: Path
    ):
        self.id = session_id
        self.type = session_type
        self.project_root = project_root
        self.process: Optional[subprocess.Popen] = None
        self.thread: Optional[threading.Thread] = None
        self.command = command
        self.started_at = time.time()
        self.last_activity = self.started_at
        self.is_running = False
        self.exit_code: Optional[int] = None
        self.stop_reason = "running"
        self.last_logged_content_by_source: Dict[str, str] = {}
        self.last_persisted_activity = 0.0
        self._persist_lock = threading.Lock()

    @property
    def snapshot_source(self) -> str:
        return f"{self.type}:{self.id}"

    def start(self):
        self.process = subprocess.Popen(
            self.command,
            cwd=str(self.project_root),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="ignore",
            bufsize=1,
        )
        self.is_running = True
        self.last_persisted_activity = time.time()
        persist_session_record(self)
        self.thread = threading.Thread(target=self._read_loop, daemon=True)
        self.thread.start()

    def _maybe_persist_activity(self, force: bool = False):
        now = time.time()
        if not force and now - self.last_persisted_activity < PERSIST_ACTIVITY_INTERVAL_SECONDS:
            return
        persist_session_record(self)
        self.last_persisted_activity = now

    def _sink_snapshot(self, conn, source: str, content: str) -> None:
        clean_content = content.strip()
        if not clean_content:
            return
        if clean_content == self.last_logged_content_by_source.get(source):
            return
        if len(clean_content) > MAX_SNAPSHOT_CHARS:
            clean_content = clean_content[:MAX_SNAPSHOT_CHARS] + "…"
        conn.execute(
            "INSERT INTO raw_snapshots (source, content) VALUES (?, ?)",
            (source, clean_content),
        )
        self.last_logged_content_by_source[source] = clean_content

    def _read_loop(self):
        conn = get_db(self.project_root)
        stdout = None
        try:
            stdout = self.process.stdout if self.process else None
            if stdout is None:
                return
            for line in iter(stdout.readline, ""):
                if not line:
                    break
                self.last_activity = time.time()
                content = line.strip()
                if not content:
                    continue

                if self.type == "pty":
                    self._sink_snapshot(conn, self.snapshot_source, strip_ansi(content))
                elif self.type == "spy":
                    try:
                        data = json.loads(content)
                        source = data.get("window_title", self.id)
                        text = data.get("content")
                        if text:
                            self._sink_snapshot(conn, self.snapshot_source, text)
                            self._sink_snapshot(conn, f"spy:{source}", text)
                    except json.JSONDecodeError:
                        continue
                conn.commit()
                self._maybe_persist_activity()
        finally:
            if self.process is not None:
                try:
                    self.process.wait(timeout=0.2)
                except subprocess.TimeoutExpired:
                    pass
                self.exit_code = self.process.poll()
                if self.process.stdout:
                    self.process.stdout.close()
                if self.process.stdin:
                    self.process.stdin.close()
            self.is_running = False
            if self.stop_reason == "running":
                self.stop_reason = "process_exit"
            persist_session_record(self)
            conn.close()

    def info(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type,
            "running": self.is_running,
            "pid": self.process.pid if self.process else None,
            "command": self.command,
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.started_at)),
            "last_activity": time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(self.last_activity)
            ),
            "idle_seconds": int(time.time() - self.last_activity),
            "exit_code": self.exit_code,
            "stop_reason": self.stop_reason,
        }

    def write(self, text: str):
        if self.process and self.process.stdin and self.is_running:
            self.process.stdin.write(text)
            if not text.endswith("\n"):
                self.process.stdin.write("\n")
            self.process.stdin.flush()
            self.last_activity = time.time()
            self._maybe_persist_activity(force=True)

    def stop(self, reason: str = "manual"):
        self.stop_reason = reason
        self.is_running = False
        if self.process:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    self.process.kill()
            if self.process.stdout:
                self.process.stdout.close()
            if self.process.stdin:
                self.process.stdin.close()
            self.exit_code = self.process.poll()
        persist_session_record(self)


def _format_epoch(value: float | None) -> str | None:
    if value is None:
        return None
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(value))


def persist_session_record(session: Session) -> None:
    if not session.project_root.exists():
        return
    ensure_db_schema(session.project_root)
    ended_at = None if session.is_running else time.time()
    try:
        conn = get_db(session.project_root)
        conn.execute(
            """
            INSERT INTO session_runs (
                session_id, session_type, command_json, cwd, status,
                started_at, last_activity, ended_at, pid, exit_code, stop_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                session_type=excluded.session_type,
                command_json=excluded.command_json,
                cwd=excluded.cwd,
                status=excluded.status,
                started_at=excluded.started_at,
                last_activity=excluded.last_activity,
                ended_at=excluded.ended_at,
                pid=excluded.pid,
                exit_code=excluded.exit_code,
                stop_reason=excluded.stop_reason
            """,
            (
                session.id,
                session.type,
                json.dumps(session.command),
                str(session.project_root),
                "active" if session.is_running else "completed",
                session.started_at,
                session.last_activity,
                ended_at,
                session.process.pid if session.process else None,
                session.exit_code,
                session.stop_reason,
            ),
        )
        conn.commit()
        conn.close()
    except OSError:
        return


def _session_row_to_info(row, *, live_session_ids: set[str]) -> Dict:
    command = json.loads(row["command_json"]) if row["command_json"] else []
    status = row["status"]
    if status == "active" and row["session_id"] not in live_session_ids:
        status = "orphaned"
    return {
        "id": row["session_id"],
        "type": row["session_type"],
        "running": row["session_id"] in live_session_ids,
        "status": status,
        "pid": row["pid"],
        "command": command,
        "started_at": _format_epoch(row["started_at"]),
        "last_activity": _format_epoch(row["last_activity"]),
        "idle_seconds": (
            int(time.time() - row["last_activity"]) if row["last_activity"] else None
        ),
        "ended_at": _format_epoch(row["ended_at"]),
        "exit_code": row["exit_code"],
        "stop_reason": row["stop_reason"],
        "cwd": row["cwd"],
    }


class SessionManager:
    """Registry for managing multiple stateful sessions."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(SessionManager, cls).__new__(cls)
            cls._instance.sessions: Dict[str, Session] = {}
        return cls._instance

    def create_session(
        self,
        session_type: str,
        command_base: str,
        args: List[str],
        project_root: Path,
        custom_id: str = None,
    ) -> str:
        ensure_db_schema(project_root)
        session_id = custom_id or str(uuid.uuid4())[:8]
        full_cmd = resolve_and_materialize(command_base, *args)
        session = Session(session_id, session_type, full_cmd, project_root)
        session.start()
        self.sessions[session_id] = session
        return session_id

    def get_session(self, session_id: str) -> Optional[Session]:
        return self.sessions.get(session_id)

    def get_session_info(self, session_id: str) -> Optional[Dict]:
        session = self.get_session(session_id)
        if not session:
            return None
        info = session.info()
        info["status"] = "active" if session.is_running else "completed"
        info["ended_at"] = None if session.is_running else _format_epoch(time.time())
        info["cwd"] = str(session.project_root)
        return info

    def get_session_status(
        self, session_id: str, project_root: Path | None = None
    ) -> Optional[Dict]:
        session = self.get_session(session_id)
        if session is not None and session.is_running:
            return self.get_session_info(session_id)
        if project_root is None:
            return self.get_session_info(session_id) if session is not None else None
        self.reconcile_orphaned_sessions(project_root)
        ensure_db_schema(project_root)
        conn = get_db(project_root)
        row = conn.execute(
            """
            SELECT session_id, session_type, command_json, cwd, status,
                   started_at, last_activity, ended_at, pid, exit_code, stop_reason
            FROM session_runs
            WHERE session_id = ?
            """,
            (session_id,),
        ).fetchone()
        conn.close()
        if row is None:
            return None
        return _session_row_to_info(row, live_session_ids=set(self.sessions.keys()))

    def get_session_history(self, project_root: Path, limit: int = 10) -> List[Dict]:
        self.reconcile_orphaned_sessions(project_root)
        ensure_db_schema(project_root)
        conn = get_db(project_root)
        rows = conn.execute(
            """
            SELECT session_id, session_type, command_json, cwd, status,
                   started_at, last_activity, ended_at, pid, exit_code, stop_reason
            FROM session_runs
            ORDER BY started_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        conn.close()
        live_session_ids = set(self.sessions.keys())
        return [_session_row_to_info(row, live_session_ids=live_session_ids) for row in rows]

    def cleanup_session_history(self, project_root: Path, hours: int = 168) -> int:
        self.reconcile_orphaned_sessions(project_root)
        ensure_db_schema(project_root)
        cutoff = time.time() - (hours * 3600)
        conn = get_db(project_root)
        cursor = conn.execute(
            """
            DELETE FROM session_runs
            WHERE status IN ('completed', 'orphaned')
              AND ended_at IS NOT NULL
              AND ended_at < ?
            """,
            (cutoff,),
        )
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        return deleted

    def reconcile_orphaned_sessions(self, project_root: Path) -> int:
        ensure_db_schema(project_root)
        live_session_ids = set(self.sessions.keys())
        conn = get_db(project_root)
        rows = conn.execute(
            "SELECT session_id FROM session_runs WHERE status = 'active'"
        ).fetchall()
        orphaned = [
            row["session_id"] for row in rows if row["session_id"] not in live_session_ids
        ]
        if orphaned:
            placeholders = ", ".join("?" for _ in orphaned)
            conn.execute(
                f"""
                UPDATE session_runs
                SET status = 'orphaned',
                    stop_reason = COALESCE(stop_reason, 'runtime-detached'),
                    ended_at = COALESCE(ended_at, last_activity, started_at)
                WHERE session_id IN ({placeholders})
                """,
                tuple(orphaned),
            )
            conn.commit()
        conn.close()
        return len(orphaned)

    def list_active_sessions(self) -> List[Dict]:
        return [
            session.info() for session in self.sessions.values() if session.is_running
        ]

    def stop_session(self, session_id: str, reason: str = "manual") -> bool:
        session = self.sessions.get(session_id)
        if not session:
            return False
        session.stop(reason=reason)
        del self.sessions[session_id]
        return True

    def cleanup_stale_sessions(self, timeout_seconds: int = 3600) -> List[str]:
        now = time.time()
        to_delete = []
        for session_id, session in self.sessions.items():
            if not session.is_running or now - session.last_activity > timeout_seconds:
                to_delete.append(session_id)

        for session_id in to_delete:
            self.stop_session(session_id, reason="stale-timeout")
        return to_delete

    def wait_for_settle(
        self, session_id: str, timeout_seconds: float = 0.5, poll_seconds: float = 0.05
    ) -> Optional[Dict]:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            session = self.get_session(session_id)
            if session is None:
                break
            if not session.is_running:
                return self.get_session_status(session_id, project_root=session.project_root)
            time.sleep(poll_seconds)
        session = self.get_session(session_id)
        if session is None:
            return None
        return self.get_session_status(session_id, project_root=session.project_root)


manager = SessionManager()
