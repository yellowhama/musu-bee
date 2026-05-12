"""Tests for reference file loader — multi-project.

Generic deployment tests use a placeholder project name. Active-project
tests require MUSU_TEST_PROJECT and are skipped otherwise.
"""

import os

import pytest

from musu_writer.references import get_chapter_context, list_skill_refs, load_project_wikis


def test_list_skill_refs_unknown_project_returns_list():
    refs = list_skill_refs("writer", project="nonexistent-project")
    assert isinstance(refs, list)


def test_list_unknown_skill_returns_list():
    refs = list_skill_refs("nonexistent-skill", project="nonexistent-project")
    assert isinstance(refs, list)


def test_chapter_context_unknown_project_returns_dict():
    ctx = get_chapter_context("CH01", project="nonexistent-project")
    assert isinstance(ctx, dict)
    assert ctx.get("project_name") == "nonexistent-project"


def test_load_project_wikis_unknown_project_returns_empty():
    wikis = load_project_wikis("nonexistent-project")
    assert wikis == []


# ── Active-project tests (run only when MUSU_TEST_PROJECT is set) ─────────


_ACTIVE_PROJECT = os.environ.get("MUSU_TEST_PROJECT", "")


@pytest.mark.skipif(
    not _ACTIVE_PROJECT,
    reason="MUSU_TEST_PROJECT not set (operator-only test).",
)
def test_active_chapter_context_loads():
    ctx = get_chapter_context("CH01", project=_ACTIVE_PROJECT)
    assert isinstance(ctx, dict)
    assert ctx.get("project_name") == _ACTIVE_PROJECT
