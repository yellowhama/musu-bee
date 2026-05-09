"""Tests for session state machine."""

import pytest

from musu_writer.models import Session, SessionState, StepName, StepResult
from musu_writer.session import advance_state, get_next_step, load_session, save_session


@pytest.fixture(autouse=True)
def temp_store(monkeypatch, tmp_path):
    import musu_writer.session as sess_mod

    monkeypatch.setattr(sess_mod, "STORE_DIR", tmp_path)
    return tmp_path


def test_new_session_starts_at_init():
    s = Session(chapter="CH01")
    assert s.state == SessionState.INIT


def test_first_next_step_is_continuity():
    s = Session(chapter="CH01")
    step = get_next_step(s)
    assert step["step"] == StepName.AUDIT_CONTINUITY
    assert s.state == SessionState.PRE_PRO


def test_pre_pro_order():
    s = Session(chapter="CH01")
    get_next_step(s)  # → PRE_PRO

    # Complete continuity
    advance_state(s, StepName.AUDIT_CONTINUITY, StepResult(step="audit", status="pass"))
    assert s.continuity_done
    step = get_next_step(s)
    assert step["step"] == StepName.DESIGN_CHARACTERS

    # Complete characters
    advance_state(s, StepName.DESIGN_CHARACTERS, StepResult(step="chars", status="pass"))
    assert s.characters_done
    step = get_next_step(s)
    assert step["step"] == StepName.BUILD_WORLD_PACKET

    # Complete world
    advance_state(s, StepName.BUILD_WORLD_PACKET, StepResult(step="world", status="pass"))
    assert s.world_done
    assert s.is_pre_pro_complete()

    step = get_next_step(s)
    assert step["step"] == StepName.WRITE_STRUCTURE_DRAFT
    assert s.state == SessionState.PRE_PRO_COMPLETE


def test_structure_to_ai_to_rhythm():
    s = Session(chapter="CH01", state=SessionState.PRE_PRO_COMPLETE)
    s.continuity_done = s.characters_done = s.world_done = True

    # Structure draft
    advance_state(
        s,
        StepName.WRITE_STRUCTURE_DRAFT,
        StepResult(step="struct", status="pass", output_path="drafts/CH01_v1.md"),
    )
    assert s.state == SessionState.STRUCTURE_DONE

    step = get_next_step(s)
    assert step["step"] == StepName.DETECT_AI

    # AI detection pass
    advance_state(
        s,
        StepName.DETECT_AI,
        StepResult(step="ai", status="pass", details={"score": 0.2, "risk": "low"}),
    )
    assert s.state == SessionState.AI_CHECKED
    assert s.ai_score == 0.2

    step = get_next_step(s)
    assert step["step"] == StepName.WRITE_RHYTHM_DRAFT
    assert step["gate"]["passed"]


def test_ai_high_score_blocks_rhythm():
    s = Session(chapter="CH01", state=SessionState.STRUCTURE_DONE)
    s.continuity_done = s.characters_done = s.world_done = True
    s.structure_draft_path = "drafts/CH01_v1.md"

    # AI detection HIGH
    advance_state(
        s,
        StepName.DETECT_AI,
        StepResult(step="ai", status="pass", details={"score": 0.85, "risk": "high"}),
    )

    step = get_next_step(s)
    assert step["step"] == StepName.WRITE_STRUCTURE_DRAFT  # rework
    assert not step["gate"]["passed"]
    assert "HIGH" in step["reason"]


def test_full_pipeline_to_complete():
    s = Session(chapter="CH01")
    get_next_step(s)

    # Pre-pro
    for step_name in [StepName.AUDIT_CONTINUITY, StepName.DESIGN_CHARACTERS, StepName.BUILD_WORLD_PACKET]:
        advance_state(s, step_name, StepResult(step=step_name, status="pass"))

    # Structure
    advance_state(s, StepName.WRITE_STRUCTURE_DRAFT, StepResult(step="s", status="pass", output_path="d.md"))

    # AI
    advance_state(s, StepName.DETECT_AI, StepResult(step="ai", status="pass", details={"score": 0.1, "risk": "low"}))

    # Rhythm
    advance_state(s, StepName.WRITE_RHYTHM_DRAFT, StepResult(step="r", status="pass", output_path="r.md"))

    # Mouth
    advance_state(s, StepName.WRITE_MOUTH_DRAFT, StepResult(step="m", status="pass", output_path="m.md"))

    # Critique
    advance_state(s, StepName.RUN_REFERENCE_CRITIQUE, StepResult(step="c", status="pass"))

    step = get_next_step(s)
    assert step["step"] == StepName.COMPLETE
    assert s.state == SessionState.COMPLETE


def test_save_and_load():
    s = Session(chapter="CH03")
    s.continuity_done = True
    s.ai_score = 0.15
    save_session(s)

    loaded = load_session(s.session_id)
    assert loaded is not None
    assert loaded.chapter == "CH03"
    assert loaded.continuity_done
    assert loaded.ai_score == 0.15


def test_load_nonexistent():
    assert load_session("nonexistent") is None
