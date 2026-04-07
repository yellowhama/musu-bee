import tempfile
import time
import unittest
from pathlib import Path

from musu_indexer.core import (
    ensure_db_schema,
    get_db,
    get_snapshot_context_exact,
    get_spy_context,
)
from musu_indexer.session_manager import Session, SessionManager


class SessionManagerTests(unittest.TestCase):
    def setUp(self):
        self.manager = SessionManager()
        self.manager.sessions = {}

    def tearDown(self):
        for session_id in list(self.manager.sessions.keys()):
            self.manager.stop_session(session_id)
        self.manager.sessions = {}

    def test_cleanup_stale_sessions_removes_idle_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            stale = Session("stale123", "pty", ["echo", "hi"], Path(tmp))
            stale.last_activity = time.time() - 7200
            self.manager.sessions[stale.id] = stale

            removed = self.manager.cleanup_stale_sessions(timeout_seconds=60)

            self.assertEqual(removed, ["stale123"])
            self.assertEqual(self.manager.list_active_sessions(), [])

    def test_finished_sessions_do_not_show_as_active(self):
        with tempfile.TemporaryDirectory() as tmp:
            session = Session("done1234", "pty", ["echo", "hi"], Path(tmp))
            session.is_running = False
            session.exit_code = 0
            self.manager.sessions[session.id] = session

            self.assertEqual(self.manager.list_active_sessions(), [])

    def test_pty_session_runs_in_workspace_root_and_logs_by_session_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            ensure_db_schema(project_root)
            session_id = self.manager.create_session(
                "pty",
                "python3",
                ["-c", "import os; print(os.getcwd())"],
                project_root,
                custom_id="cwdtest1",
            )

            deadline = time.time() + 3
            rows = []
            while time.time() < deadline:
                rows = get_snapshot_context_exact(project_root, [f"pty:{session_id}"], limit=5)
                if rows:
                    break
                time.sleep(0.05)

            self.assertTrue(rows)
            self.assertIn(str(project_root), rows[0]["content"])
            self.assertEqual(self.manager.list_active_sessions(), [])

    def test_spy_session_logs_are_queryable_by_session_id_and_window_title(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            ensure_db_schema(project_root)
            session_id = self.manager.create_session(
                "spy",
                "python3",
                [
                    "-c",
                    (
                        "import json; "
                        "print(json.dumps({'window_title':'Demo Window','content':'hello from spy'}))"
                    ),
                ],
                project_root,
                custom_id="spytest1",
            )

            deadline = time.time() + 3
            session_rows = []
            window_rows = []
            while time.time() < deadline:
                session_rows = get_snapshot_context_exact(
                    project_root, [f"spy:{session_id}"], limit=5
                )
                window_rows = get_spy_context(project_root, "Demo Window", limit=5)
                if session_rows and window_rows:
                    break
                time.sleep(0.05)

            self.assertTrue(session_rows)
            self.assertTrue(window_rows)
            self.assertIn("hello from spy", session_rows[0]["content"])
            self.assertIn("hello from spy", window_rows[0]["content"])

    def test_session_history_and_persisted_status_survive_registry_reset(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            ensure_db_schema(project_root)
            session_id = self.manager.create_session(
                "pty",
                "python3",
                ["-c", "print('done')"],
                project_root,
                custom_id="persist1",
            )

            deadline = time.time() + 3
            status = None
            while time.time() < deadline:
                status = self.manager.get_session_status(session_id, project_root=project_root)
                if status and status.get("status") == "completed":
                    break
                time.sleep(0.05)

            self.assertIsNotNone(status)
            self.assertEqual(status["status"], "completed")

            self.manager.sessions = {}

            persisted = self.manager.get_session_status(session_id, project_root=project_root)
            history = self.manager.get_session_history(project_root, limit=5)

            self.assertIsNotNone(persisted)
            self.assertEqual(persisted["status"], "completed")
            self.assertEqual(history[0]["id"], session_id)

    def test_cleanup_session_history_removes_old_completed_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            ensure_db_schema(project_root)
            conn = get_db(project_root)
            conn.execute(
                """
                INSERT INTO session_runs (
                    session_id, session_type, command_json, cwd, status,
                    started_at, last_activity, ended_at, pid, exit_code, stop_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "oldrow1",
                    "pty",
                    '["python3","-i"]',
                    str(project_root),
                    "completed",
                    time.time() - 9000,
                    time.time() - 9000,
                    time.time() - 9000,
                    123,
                    0,
                    "process_exit",
                ),
            )
            conn.commit()
            conn.close()

            deleted = self.manager.cleanup_session_history(project_root, hours=1)
            self.assertEqual(deleted, 1)

    def test_reconcile_orphaned_sessions_marks_detached_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp)
            ensure_db_schema(project_root)
            conn = get_db(project_root)
            conn.execute(
                """
                INSERT INTO session_runs (
                    session_id, session_type, command_json, cwd, status,
                    started_at, last_activity, ended_at, pid, exit_code, stop_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "orphan1",
                    "pty",
                    '["printf","x"]',
                    str(project_root),
                    "active",
                    time.time() - 5,
                    time.time() - 5,
                    None,
                    321,
                    None,
                    None,
                ),
            )
            conn.commit()
            conn.close()

            reconciled = self.manager.reconcile_orphaned_sessions(project_root)
            history = self.manager.get_session_history(project_root, limit=5)

            self.assertEqual(reconciled, 1)
            self.assertEqual(history[0]["status"], "orphaned")


if __name__ == "__main__":
    unittest.main()
