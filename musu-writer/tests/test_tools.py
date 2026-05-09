"""Tests for all skill tools — multi-project."""

from musu_writer.tools.continuity import get_continuity_context
from musu_writer.tools.characters import get_character_context
from musu_writer.tools.world_packet import get_world_context
from musu_writer.tools.structure_draft import get_structure_context
from musu_writer.tools.rhythm_draft import get_rhythm_context
from musu_writer.tools.mouth_draft import get_mouth_context
from musu_writer.tools.reference_critique import get_critique_context


# ── False Dane (default project) ─────────────────────────

def test_continuity_context():
    ctx = get_continuity_context("CH01")
    assert ctx["skill"] == "continuity"
    assert "template" in ctx
    assert "knowledge_layers" in ctx["template"]


def test_character_context():
    ctx = get_character_context("CH01")
    assert ctx["skill"] == "character"
    assert "card_template" in ctx


def test_world_context():
    ctx = get_world_context("CH01")
    assert ctx["skill"] == "worldbuilder"
    assert "template" in ctx


def test_structure_context():
    ctx = get_structure_context("CH01")
    assert ctx["skill"] == "writer_1an"
    assert "abc_gate" in ctx


def test_rhythm_context():
    ctx = get_rhythm_context("CH01")
    assert ctx["skill"] == "rhythm_3an"
    assert "scene_tempo_targets" in ctx


def test_mouth_context():
    ctx = get_mouth_context("CH01")
    assert ctx["skill"] == "mouth_2an"
    assert "workflow" in ctx


def test_critique_context():
    ctx = get_critique_context("CH01")
    assert ctx["skill"] == "reference_critic"
    assert "output_template" in ctx


# ── Bloodline project ────────────────────────────────────

def test_continuity_bloodline():
    ctx = get_continuity_context("CH01", project="bloodline")
    assert ctx["skill"] == "continuity"
    assert "template" in ctx


def test_structure_bloodline():
    ctx = get_structure_context("CH01", project="bloodline")
    assert ctx["skill"] == "writer_1an"
    assert "abc_gate" in ctx  # Common gate still works


def test_character_bloodline():
    ctx = get_character_context("CH01", project="bloodline")
    assert ctx["skill"] == "character"
    assert "card_template" in ctx


# ── All tools have instructions ──────────────────────────

def test_all_contexts_have_instructions():
    for fn in [
        lambda: get_continuity_context("CH01"),
        lambda: get_character_context("CH01"),
        lambda: get_world_context("CH01"),
        lambda: get_structure_context("CH01"),
        lambda: get_rhythm_context("CH01"),
        lambda: get_mouth_context("CH01"),
        lambda: get_critique_context("CH01"),
    ]:
        ctx = fn()
        assert "instructions" in ctx
        assert len(ctx["instructions"]) > 20
