import tempfile
import unittest
from pathlib import Path

from musu_indexer.core import (
    _python_index_dirty_paths,
    get_recent_runs,
    get_db,
    infer_category,
    init_db,
    reconcile_index,
    result_has_error,
    search_index,
)
from musu_indexer.query_expander import QueryExpander
from musu_indexer.workspace import resolve_workspace


class CategoryInferenceTests(unittest.TestCase):
    def test_infer_category(self):
        self.assertEqual(infer_category("references/OPENCLAW_ANALYSIS.md"), "reference")
        self.assertEqual(infer_category("docs/ARCHITECTURE_SPEC.md"), "spec")
        self.assertEqual(infer_category("plans/01_phase_plan.md"), "plan")
        self.assertEqual(infer_category("reports/audit_report.md"), "report")
        self.assertEqual(infer_category("src/main.py"), "code")
        self.assertEqual(infer_category("pyproject.toml"), "config")


class ResultSurfaceTests(unittest.TestCase):
    def test_result_has_error(self):
        self.assertTrue(result_has_error("sync error: failed"))
        self.assertTrue(result_has_error("ingest-batch error: failed"))
        self.assertFalse(result_has_error("sync success: ok"))


class QueryExpanderTests(unittest.TestCase):
    def test_phrase_is_preserved_for_multi_token_queries(self):
        built = QueryExpander.build_fts_query("workspace profile")
        self.assertIn('"workspace profile"', built)


class SearchQualityTests(unittest.TestCase):
    def test_search_ranks_title_and_scope_signal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            init_db(root)
            conn = get_db(root)
            conn.execute(
                "INSERT INTO files (path, size, last_modified, category, indexed_at) VALUES (?, ?, ?, ?, datetime('now'))",
                ("docs/workspace-profile.md", 10, 1.0, "guide"),
            )
            conn.execute(
                "INSERT INTO files (path, size, last_modified, category, indexed_at) VALUES (?, ?, ?, ?, datetime('now'))",
                ("src/profile_engine.py", 10, 1.0, "code"),
            )
            conn.execute(
                "INSERT INTO search_index (path, title, content, type) VALUES (?, ?, ?, ?)",
                (
                    "docs/workspace-profile.md",
                    "Workspace Profile Guide",
                    "workspace profile guide and examples",
                    "section",
                ),
            )
            conn.execute(
                "INSERT INTO search_index (path, title, content, type) VALUES (?, ?, ?, ?)",
                (
                    "src/profile_engine.py",
                    "profile_engine.py",
                    "workspace profile parser implementation",
                    "symbol",
                ),
            )
            conn.commit()
            conn.close()

            workspace = resolve_workspace(root_override=root)
            doc_results = search_index(
                root,
                "workspace profile",
                workspace=workspace,
                scope="doc",
                limit=5,
            )
            self.assertGreaterEqual(len(doc_results), 1)
            self.assertEqual(doc_results[0]["path"], "docs/workspace-profile.md")


class SyncRunEvidenceTests(unittest.TestCase):
    def test_cleanup_records_sync_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".musu-indexer.json").write_text(
                '{"name":"demo","include_roots":["src"]}',
                encoding="utf-8",
            )
            init_db(root)
            conn = get_db(root)
            conn.execute(
                "INSERT INTO files (path, size, last_modified, category, indexed_at) VALUES (?, ?, ?, ?, datetime('now'))",
                ("src/missing.py", 10, 1.0, "code"),
            )
            conn.commit()
            conn.close()

            workspace = resolve_workspace(start_path=root)
            reconcile_index(root, workspace=workspace, dry_run=True)
            runs = get_recent_runs(root, limit=1)
            self.assertEqual(runs[0]["mode"], "cleanup")


class PythonFallbackIndexerTests(unittest.TestCase):
    def test_python_indexer_populates_rows_for_docs_and_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            init_db(root)
            (root / "README.md").write_text("# Title\n\nbody\n", encoding="utf-8")
            (root / "tool.py").write_text(
                "def hello():\n    return 'hi'\n",
                encoding="utf-8",
            )

            indexed = _python_index_dirty_paths(root, ["README.md", "tool.py"])
            conn = get_db(root)
            files = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
            sections = conn.execute("SELECT COUNT(*) FROM doc_sections").fetchone()[0]
            symbols = conn.execute("SELECT COUNT(*) FROM code_symbols").fetchone()[0]
            conn.close()

            self.assertEqual(indexed, 2)
            self.assertEqual(files, 2)
            self.assertGreaterEqual(sections, 1)
            self.assertGreaterEqual(symbols, 1)


if __name__ == "__main__":
    unittest.main()
