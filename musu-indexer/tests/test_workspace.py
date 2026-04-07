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


if __name__ == "__main__":
    unittest.main()
