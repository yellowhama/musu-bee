import tempfile
import unittest
from pathlib import Path

from musu_indexer.core import get_db, init_db, reconcile_index
from musu_indexer.workspace import resolve_workspace


class ReconcileTests(unittest.TestCase):
    def test_cleanup_removes_missing_and_out_of_workspace_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "src").mkdir()
            (root / "src" / "main.py").write_text("print('ok')\n", encoding="utf-8")
            (root / ".musu-indexer.json").write_text(
                """
                {
                  "name": "demo",
                  "include_roots": ["src"],
                  "exclude_roots": ["references_AI"]
                }
                """.strip(),
                encoding="utf-8",
            )

            init_db(root)
            conn = get_db(root)
            conn.execute(
                "INSERT INTO files (path, size, last_modified, category, indexed_at) VALUES (?, ?, ?, ?, datetime('now'))",
                ("src/main.py", 12, 1.0, "code"),
            )
            conn.execute(
                "INSERT INTO files (path, size, last_modified, category, indexed_at) VALUES (?, ?, ?, ?, datetime('now'))",
                ("references_AI/openclaw/README.md", 10, 1.0, "reference"),
            )
            conn.execute(
                "INSERT INTO files (path, size, last_modified, category, indexed_at) VALUES (?, ?, ?, ?, datetime('now'))",
                ("src/missing.py", 10, 1.0, "code"),
            )
            conn.commit()
            conn.close()

            workspace = resolve_workspace(start_path=root)
            dry_run_result = reconcile_index(root, workspace=workspace, dry_run=True)
            self.assertIn("missing_on_disk=1", dry_run_result)
            self.assertIn("out_of_workspace=1", dry_run_result)
            self.assertIn("deleted_rows=0", dry_run_result)

            apply_result = reconcile_index(root, workspace=workspace, dry_run=False)
            self.assertIn("deleted_rows=2", apply_result)

            conn = get_db(root)
            remaining = [row["path"] for row in conn.execute("SELECT path FROM files").fetchall()]
            conn.close()
            self.assertEqual(remaining, ["src/main.py"])


if __name__ == "__main__":
    unittest.main()
