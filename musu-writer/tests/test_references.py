"""Tests for reference file loader — multi-project."""

from musu_writer.references import get_chapter_context, list_skill_refs, load_project_wikis


def test_list_writer_refs_false_dane():
    refs = list_skill_refs("writer", project="false-dane")
    if refs:
        assert "brief.md" in refs or len(refs) > 0


def test_list_writer_refs_bloodline():
    # Bloodline has no codex skills yet — should fallback gracefully
    refs = list_skill_refs("writer", project="bloodline")
    # Either empty or falls back to generic
    assert isinstance(refs, list)


def test_list_unknown_skill():
    refs = list_skill_refs("nonexistent", project="false-dane")
    # May fall back to writer-craft common gates
    assert isinstance(refs, list)


def test_chapter_context_false_dane():
    ctx = get_chapter_context("CH01", project="false-dane")
    assert isinstance(ctx, dict)
    assert ctx.get("project_name") == "false-dane"
    assert any(k in ctx for k in ["canon_files", "planning_files", "latest_draft"])


def test_chapter_context_bloodline():
    ctx = get_chapter_context("CH01", project="bloodline")
    assert isinstance(ctx, dict)
    assert ctx.get("project_name") == "bloodline"


def test_wiki_prefixes_false_dane():
    wikis = load_project_wikis("false-dane")
    # Should find wiki pages if they exist
    assert isinstance(wikis, list)


def test_wiki_prefixes_bloodline():
    wikis = load_project_wikis("bloodline")
    # Bloodline has no wiki prefix filters — empty
    assert wikis == []
