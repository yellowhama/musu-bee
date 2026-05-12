"""Tests for project config and multi-project support.

Generic deployment: when no MUSU_DEFAULT_PROJECT is set, get_project_config("")
returns a minimal stub. When an active project is configured (operator's
WRITER_PROJECT_ROOT/projects/<id>/config.toml), the full config loads.
"""

import os

import pytest

from musu_writer.project_config import (
    default_project,
    get_codex_skill_name,
    get_project_config,
    get_project_dir,
    get_ref_path,
    get_wiki_prefixes,
)


def test_empty_project_returns_minimal_stub():
    """Generic deployment with no project bound."""
    config = get_project_config("")
    assert config["project"]["name"] == ""
    assert config["references"] == {}
    assert config["wiki"]["prefix_filters"] == []
    assert config["codex_skills"] == {}


def test_unknown_project_returns_minimal_with_name():
    """Unknown project name: minimal config tagged with the name."""
    config = get_project_config("nonexistent-project")
    assert config["project"]["name"] == "nonexistent-project"
    assert config["references"] == {}


def test_default_project_reads_env(monkeypatch):
    monkeypatch.delenv("MUSU_DEFAULT_PROJECT", raising=False)
    assert default_project() == ""

    monkeypatch.setenv("MUSU_DEFAULT_PROJECT", "my-project")
    assert default_project() == "my-project"


def test_codex_skill_name_fallback():
    """No project config → fallback to generic skill name."""
    assert get_codex_skill_name("nonexistent", "writer") == "writer"
    assert get_codex_skill_name("", "rhythm") == "rhythm"


def test_project_dir():
    d = get_project_dir("any-project")
    assert "projects/any-project" in str(d)


def test_ref_path_unknown_returns_none():
    assert get_ref_path("nonexistent", "any_key") is None
    assert get_ref_path("", "any_key") is None


# ── Active-project tests (run only when MUSU_TEST_PROJECT is set) ─────────


_ACTIVE_PROJECT = os.environ.get("MUSU_TEST_PROJECT", "")


@pytest.mark.skipif(
    not _ACTIVE_PROJECT,
    reason="MUSU_TEST_PROJECT not set (operator-only test).",
)
def test_active_project_config_loads():
    config = get_project_config(_ACTIVE_PROJECT)
    assert config["project"]["name"] == _ACTIVE_PROJECT


@pytest.mark.skipif(
    not _ACTIVE_PROJECT,
    reason="MUSU_TEST_PROJECT not set (operator-only test).",
)
def test_active_project_wiki_prefixes_list():
    prefixes = get_wiki_prefixes(_ACTIVE_PROJECT)
    assert isinstance(prefixes, list)
