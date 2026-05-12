"""Tests for planning tools."""

from musu_writer.tools.planning import (
    get_direction_context, get_theme_context, get_character_sheets_context,
    get_synopsis_context, get_outline_context, get_character_driven_context,
    get_event_driven_context, get_worldbuilding_context, get_chapter_beats_context,
)


def test_direction_context():
    ctx = get_direction_context("test-project")
    assert ctx["skill"] == "planning_direction"
    assert "template" in ctx
    assert "genre" in ctx["template"]
    assert "target_reader" in ctx["template"]


def test_theme_context():
    ctx = get_theme_context("test-project")
    assert ctx["skill"] == "planning_theme"
    assert "premise" in ctx["template"]
    assert "core_conflict" in ctx["template"]


def test_character_sheets_context():
    ctx = get_character_sheets_context("test-project")
    assert ctx["skill"] == "planning_character_sheets"
    assert "character_template" in ctx
    assert "desire" in ctx["character_template"]
    assert "flaw" in ctx["character_template"]
    assert "voice" in ctx["character_template"]


def test_synopsis_context():
    ctx = get_synopsis_context("test-project")
    assert "logline" in ctx["template"]
    assert "act_1" in ctx["template"]


def test_outline_context():
    ctx = get_outline_context("test-project")
    assert "chapter_template" in ctx
    assert "conflict" in ctx["chapter_template"]


def test_character_driven_context():
    ctx = get_character_driven_context("test-project")
    assert "protagonist_arc" in ctx["template"]
    assert "relationship_dynamics" in ctx["template"]


def test_event_driven_context():
    ctx = get_event_driven_context("test-project")
    assert "event_chain" in ctx["template"]
    assert "twists" in ctx["template"]
    assert "tension_curve" in ctx["template"]


def test_worldbuilding_context():
    ctx = get_worldbuilding_context("test-project")
    assert "rules" in ctx["template"]
    assert "economy" in ctx["template"]
    assert "constraints" in ctx["template"]


def test_chapter_beats_context():
    ctx = get_chapter_beats_context("test-project", "CH01")
    assert ctx["chapter"] == "CH01"
    assert "beat_template" in ctx
    assert "props" in ctx["beat_template"]


def test_all_planning_tools_have_instructions():
    fns = [
        get_direction_context, get_theme_context, get_character_sheets_context,
        get_synopsis_context, get_outline_context, get_character_driven_context,
        get_event_driven_context, get_worldbuilding_context,
    ]
    for fn in fns:
        ctx = fn("test-project")
        assert "instructions" in ctx, f"{fn.__name__} missing instructions"
        assert len(ctx["instructions"]) > 20


def test_all_have_depends_on():
    """All tools except direction should declare dependencies."""
    fns = [
        get_theme_context, get_character_sheets_context,
        get_synopsis_context, get_outline_context, get_character_driven_context,
        get_event_driven_context, get_worldbuilding_context,
    ]
    for fn in fns:
        ctx = fn("test-project")
        assert "depends_on" in ctx, f"{fn.__name__} missing depends_on"
