import tempfile
import unittest
from pathlib import Path

from musu_indexer.workspace import matches_scope, resolve_workspace


class WorkspaceResolutionTests(unittest.TestCase):
    def test_profile_resolution_uses_discovered_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profile = root / ".musu-indexer.json"
            profile.write_text(
                """
                {
                  "name": "demo",
                  "include_roots": ["src", "docs"],
                  "exclude_roots": ["references_AI"],
                  "ignore_globs": ["work/**"]
                }
                """.strip(),
                encoding="utf-8",
            )
            nested = root / "src" / "pkg"
            nested.mkdir(parents=True)

            workspace = resolve_workspace(start_path=nested)

            self.assertEqual(workspace.root, root)
            self.assertEqual(workspace.resolution_reason, "discovered-profile")
            self.assertTrue(workspace.includes_path("src/main.py"))
            self.assertFalse(workspace.includes_path("references_AI/openclaw/README.md"))
            self.assertFalse(workspace.includes_path("work/tmp/output.log"))

    def test_git_root_fallback_is_used_without_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".git").mkdir()
            nested = root / "pkg" / "src"
            nested.mkdir(parents=True)

            workspace = resolve_workspace(start_path=nested)

            self.assertEqual(workspace.root, root)
            self.assertEqual(workspace.resolution_reason, "git-root")


class ScopeTests(unittest.TestCase):
    def test_scope_rules(self):
        self.assertTrue(matches_scope("docs/plan.md", "doc"))
        self.assertTrue(matches_scope("README.md", "doc"))
        self.assertTrue(matches_scope("src/index.ts", "code"))
        self.assertFalse(matches_scope("docs/plan.md", "code"))
        self.assertFalse(matches_scope("src/index.ts", "doc"))

    def test_hidden_dot_paths_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            workspace = resolve_workspace(root_override=Path(tmp))
            self.assertTrue(workspace.includes_path(".github/workflows/publish.yml"))


class NestedIgnoreTests(unittest.TestCase):
    # v17.B Phase 1 — Regression coverage for the indexer leak where
    # .musu_dev.db had 13 109 of 14 030 rows pointing at nested
    # node_modules. fnmatch("musu-bee/node_modules/x", "node_modules/**")
    # was False, so the old DEFAULT_IGNORE_GLOBS only caught root-level
    # dirs. These tests pin the new behavior.

    def _workspace(self, tmp):
        return resolve_workspace(root_override=Path(tmp))

    def test_root_level_node_modules_still_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            self.assertFalse(ws.includes_path("node_modules/acorn/index.js"))

    def test_nested_node_modules_now_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            self.assertFalse(
                ws.includes_path("musu-bee/node_modules/.bin/acorn.ps1")
            )

    def test_nested_pycache_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            self.assertFalse(
                ws.includes_path("musu-bridge/handlers/__pycache__/x.pyc")
            )

    def test_nested_venv_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            self.assertFalse(
                ws.includes_path("musu-bridge/.venv/Lib/site-packages/x.py")
            )

    def test_normal_source_paths_still_included(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            self.assertTrue(ws.includes_path("musu-bee/src/app/page.tsx"))
            self.assertTrue(ws.includes_path("musu-bridge/server.py"))
            self.assertTrue(ws.includes_path("docs/BOUNDARY.md"))

    def test_file_globs_still_excluded(self):
        with tempfile.TemporaryDirectory() as tmp:
            ws = self._workspace(tmp)
            self.assertFalse(ws.includes_path("artifacts/release-v1.tar.gz"))
            self.assertFalse(ws.includes_path("bundle.zip"))


if __name__ == "__main__":
    unittest.main()
