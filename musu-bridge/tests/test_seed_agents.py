"""Tests for seed_agents.py — CLI detection, adapter presets, nodes.toml assignment."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "musu-core" / "src"))

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")

from seed_agents import (
    build_config,
    budget_for_role,
    detect_cli,
    model_for_role,
    _get_self_node,
    _ensure_assignments,
)


class TestDetectCli:
    def test_claude_detected(self):
        with patch("shutil.which", side_effect=lambda cmd: "/usr/bin/claude" if cmd == "claude" else None):
            adapter, command = detect_cli()
            assert adapter == "claude_local"
            assert command == "claude"

    def test_gemini_fallback(self):
        def which(cmd):
            if cmd == "gemini":
                return "/usr/bin/gemini"
            return None
        with patch("shutil.which", side_effect=which):
            adapter, command = detect_cli()
            assert adapter == "gemini_local"
            assert command == "gemini"

    def test_codex_fallback(self):
        def which(cmd):
            if cmd == "codex":
                return "/usr/bin/codex"
            return None
        with patch("shutil.which", side_effect=which):
            adapter, command = detect_cli()
            assert adapter == "codex_local"
            assert command == "codex"

    def test_no_cli_defaults_claude(self):
        with patch("shutil.which", return_value=None):
            adapter, command = detect_cli()
            assert adapter == "claude_local"
            assert command == "claude"


class TestModelForRole:
    def test_ceo_gets_sonnet(self):
        assert "sonnet" in model_for_role("ceo", "claude_local")

    def test_worker_gets_haiku(self):
        assert "haiku" in model_for_role("worker", "claude_local")

    def test_gemini_worker_gets_flash(self):
        assert "flash" in model_for_role("worker", "gemini_local")

    def test_gemini_ceo_gets_pro(self):
        assert "pro" in model_for_role("ceo", "gemini_local")


class TestBudgetForRole:
    def test_ceo_budget(self):
        assert budget_for_role("ceo") == 5.0

    def test_engineer_budget(self):
        assert budget_for_role("engineer") == 2.0

    def test_worker_budget(self):
        assert budget_for_role("worker") == 0.5


class TestBuildConfig:
    def test_has_all_required_fields(self):
        cfg = build_config("engineer", "claude_local", "claude", "/home/test")
        assert cfg["command"] == "claude"
        assert cfg["cwd"] == "/home/test"
        assert cfg["dangerously_skip_permissions"] is True
        assert cfg["timeout_sec"] == 600
        assert "model" in cfg
        assert "disable_mcp" in cfg
        assert "max_budget_usd" in cfg
        assert "instructions_path" in cfg

    def test_ceo_has_mcp_enabled(self):
        cfg = build_config("ceo", "claude_local", "claude", "/test")
        assert cfg["disable_mcp"] is False

    def test_worker_has_mcp_disabled(self):
        cfg = build_config("worker", "claude_local", "claude", "/test")
        assert cfg["disable_mcp"] is True


class TestEnsureAssignments:
    def test_adds_missing_assignments(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".toml", delete=False) as f:
            f.write('[mesh]\nself = "test-node"\n\n[[mesh.nodes]]\nname = "test-node"\nurl = "http://localhost:8070"\n')
            f.flush()
            toml_path = Path(f.name)

        try:
            import seed_agents
            orig = seed_agents._NODES_TOML
            seed_agents._NODES_TOML = toml_path

            added = _ensure_assignments(["ceo", "worker"], "test-node")
            assert added == 2

            content = toml_path.read_text()
            assert "ceo" in content
            assert "worker" in content

            # Idempotent: second call adds 0
            added2 = _ensure_assignments(["ceo", "worker"], "test-node")
            assert added2 == 0

            seed_agents._NODES_TOML = orig
        finally:
            toml_path.unlink(missing_ok=True)
