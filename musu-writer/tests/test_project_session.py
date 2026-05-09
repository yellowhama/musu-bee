"""Tests for project planning session."""

import pytest

from musu_writer.models import ProjectSession, ProjectState, ProjectStepName, StepResult
from musu_writer.project_session import (
    advance_project_state, get_next_project_step,
    load_project_session, save_project_session, is_project_ready,
)


@pytest.fixture(autouse=True)
def temp_store(monkeypatch, tmp_path):
    import musu_writer.project_session as ps
    monkeypatch.setattr(ps, "STORE_DIR", tmp_path)
    return tmp_path


def test_new_project_starts_at_init():
    s = ProjectSession(project="test")
    assert s.state == ProjectState.PROJECT_INIT


def test_first_step_is_direction():
    s = ProjectSession(project="test")
    step = get_next_project_step(s)
    assert step["step"] == ProjectStepName.SET_DIRECTION


def test_full_planning_pipeline():
    s = ProjectSession(project="test")

    steps = [
        ProjectStepName.SET_DIRECTION,
        ProjectStepName.SET_THEME,
        ProjectStepName.CREATE_CHARACTER_SHEETS,
        ProjectStepName.WRITE_SYNOPSIS,
        ProjectStepName.WRITE_OUTLINE,
        ProjectStepName.DESIGN_CHARACTER_DRIVEN,
        ProjectStepName.DESIGN_EVENT_DRIVEN,
        ProjectStepName.FINALIZE_WORLDBUILDING,
    ]

    expected_states = [
        ProjectState.DIRECTION_SET,
        ProjectState.THEME_SET,
        ProjectState.CHARACTERS_CREATED,
        ProjectState.SYNOPSIS_DONE,
        ProjectState.OUTLINE_DONE,
        ProjectState.CHARACTER_DRIVEN_DONE,
        ProjectState.EVENT_DRIVEN_DONE,
        ProjectState.WORLD_FINALIZED,
    ]

    for step, expected in zip(steps, expected_states):
        advance_project_state(s, step, StepResult(step=step, status="pass", output_path=f"planning/{step}.md"))
        assert s.state == expected

    # After all 8, next step should be PROJECT_READY
    next_step = get_next_project_step(s)
    assert next_step["step"] == ProjectStepName.PROJECT_READY
    assert s.state == ProjectState.PROJECT_READY


def test_save_and_load():
    s = ProjectSession(project="test-save")
    s.direction_path = "planning/direction.md"
    save_project_session(s)

    loaded = load_project_session(s.session_id)
    assert loaded is not None
    assert loaded.project == "test-save"
    assert loaded.direction_path == "planning/direction.md"


def test_project_ready_check():
    s = ProjectSession(project="ready-test")
    save_project_session(s)
    assert not is_project_ready("ready-test")

    # Complete all steps
    steps = [
        ProjectStepName.SET_DIRECTION,
        ProjectStepName.SET_THEME,
        ProjectStepName.CREATE_CHARACTER_SHEETS,
        ProjectStepName.WRITE_SYNOPSIS,
        ProjectStepName.WRITE_OUTLINE,
        ProjectStepName.DESIGN_CHARACTER_DRIVEN,
        ProjectStepName.DESIGN_EVENT_DRIVEN,
        ProjectStepName.FINALIZE_WORLDBUILDING,
    ]
    for step in steps:
        advance_project_state(s, step, StepResult(step=step, status="pass", output_path=f"p/{step}.md"))

    get_next_project_step(s)  # triggers PROJECT_READY
    save_project_session(s)
    assert is_project_ready("ready-test")
