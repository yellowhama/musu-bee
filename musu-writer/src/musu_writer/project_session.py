"""Project planning session — 8-stage planning before any chapter writing."""

from __future__ import annotations

import json
import os
from pathlib import Path

from .models import GateResult, ProjectSession, ProjectState, ProjectStepName, StepResult

STORE_DIR = Path(
    os.environ.get("MUSU_WRITER_STORE", "~/.musu/writer-sessions")
).expanduser()


# State transitions: step → (current_state, next_state)
PROJECT_PIPELINE = [
    (ProjectStepName.SET_DIRECTION, ProjectState.PROJECT_INIT, ProjectState.DIRECTION_SET),
    (ProjectStepName.SET_THEME, ProjectState.DIRECTION_SET, ProjectState.THEME_SET),
    (ProjectStepName.CREATE_CHARACTER_SHEETS, ProjectState.THEME_SET, ProjectState.CHARACTERS_CREATED),
    (ProjectStepName.WRITE_SYNOPSIS, ProjectState.CHARACTERS_CREATED, ProjectState.SYNOPSIS_DONE),
    (ProjectStepName.WRITE_OUTLINE, ProjectState.SYNOPSIS_DONE, ProjectState.OUTLINE_DONE),
    (ProjectStepName.DESIGN_CHARACTER_DRIVEN, ProjectState.OUTLINE_DONE, ProjectState.CHARACTER_DRIVEN_DONE),
    (ProjectStepName.DESIGN_EVENT_DRIVEN, ProjectState.CHARACTER_DRIVEN_DONE, ProjectState.EVENT_DRIVEN_DONE),
    (ProjectStepName.FINALIZE_WORLDBUILDING, ProjectState.EVENT_DRIVEN_DONE, ProjectState.WORLD_FINALIZED),
]


def get_next_project_step(session: ProjectSession) -> dict:
    """Determine the next planning step based on current state."""
    state = session.state

    if state == ProjectState.PROJECT_INIT:
        return {
            "step": ProjectStepName.SET_DIRECTION,
            "reason": "프로젝트 시작. 장르/시장/타겟 독자 결정부터.",
            "gate": None,
            "inputs": {"project": session.project},
        }

    # Find current position in pipeline
    for i, (step, from_state, to_state) in enumerate(PROJECT_PIPELINE):
        if state.value == to_state.value:
            # Current step is done. What's next?
            if i + 1 < len(PROJECT_PIPELINE):
                next_step, _, _ = PROJECT_PIPELINE[i + 1]
                return {
                    "step": next_step,
                    "reason": f"이전 단계 완료. 다음: {next_step.value}",
                    "gate": None,
                    "inputs": {"project": session.project},
                }
            else:
                # All planning done
                session.state = ProjectState.PROJECT_READY
                return {
                    "step": ProjectStepName.PROJECT_READY,
                    "reason": "기획 8단계 전부 완료. 챕터 세션 시작 가능.",
                    "gate": _check_project_ready_gate(session).to_dict(),
                    "inputs": {},
                }

    if state == ProjectState.PROJECT_READY:
        return {
            "step": ProjectStepName.PROJECT_READY,
            "reason": "프로젝트 기획 완료. start_chapter_session으로 챕터 작업 시작.",
            "gate": None,
            "inputs": {},
        }

    # Find which step matches current state as from_state
    for step, from_state, to_state in PROJECT_PIPELINE:
        if state.value == from_state.value:
            return {
                "step": step,
                "reason": f"현재 단계: {step.value}",
                "gate": None,
                "inputs": {"project": session.project},
            }

    return {"step": "unknown", "reason": f"알 수 없는 상태: {state}", "gate": None, "inputs": {}}


def advance_project_state(session: ProjectSession, step: str, result: StepResult) -> None:
    """Record a step result and advance the project session state."""
    session.record_step(step, result)

    # Map step → output_path field
    path_map = {
        ProjectStepName.SET_DIRECTION: "direction_path",
        ProjectStepName.SET_THEME: "theme_path",
        ProjectStepName.CREATE_CHARACTER_SHEETS: "character_sheets_path",
        ProjectStepName.WRITE_SYNOPSIS: "synopsis_path",
        ProjectStepName.WRITE_OUTLINE: "outline_path",
        ProjectStepName.DESIGN_CHARACTER_DRIVEN: "character_driven_path",
        ProjectStepName.DESIGN_EVENT_DRIVEN: "event_driven_path",
        ProjectStepName.FINALIZE_WORLDBUILDING: "world_path",
    }

    if step in path_map and result.output_path:
        setattr(session, path_map[step], result.output_path)

    # Advance state
    for s, from_state, to_state in PROJECT_PIPELINE:
        if s.value == step and result.status == "pass":
            session.state = to_state
            break

    save_project_session(session)


def _check_project_ready_gate(session: ProjectSession) -> GateResult:
    """Check if all 8 planning stages are complete."""
    missing = []
    required = [
        ("direction_path", "방향 결정"),
        ("theme_path", "주제/소재"),
        ("character_sheets_path", "캐릭터 시트"),
        ("synopsis_path", "시놉시스"),
        ("outline_path", "아웃라인"),
        ("character_driven_path", "캐릭터 드리븐"),
        ("event_driven_path", "이벤트 드리븐"),
        ("world_path", "세계관"),
    ]
    for attr, label in required:
        if not getattr(session, attr, ""):
            missing.append(label)

    return GateResult(
        gate="project_ready",
        passed=len(missing) == 0,
        reason="기획 8단계 전부 완료" if not missing else f"미완료: {', '.join(missing)}",
        blocking_issues=missing,
    )


def is_project_ready(project: str) -> bool:
    """Check if a project has completed planning (for chapter session gate)."""
    session = load_project_session_by_project(project)
    if session is None:
        return False
    return session.state == ProjectState.PROJECT_READY


# ── Persistence ──────────────────────────────────────────


def save_project_session(session: ProjectSession) -> str:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    path = STORE_DIR / f"{session.session_id}.json"
    data = session.to_dict()
    data["_type"] = "project_session"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(path)


def load_project_session(session_id: str) -> ProjectSession | None:
    path = STORE_DIR / f"{session_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("_type") != "project_session":
        return None

    session = ProjectSession(
        session_id=data["session_id"],
        project=data["project"],
        state=ProjectState(data["state"]),
        created_at=data.get("created_at", 0),
        updated_at=data.get("updated_at", 0),
    )
    session.direction_path = data.get("direction_path", "")
    session.theme_path = data.get("theme_path", "")
    session.character_sheets_path = data.get("character_sheets_path", "")
    session.synopsis_path = data.get("synopsis_path", "")
    session.outline_path = data.get("outline_path", "")
    session.character_driven_path = data.get("character_driven_path", "")
    session.event_driven_path = data.get("event_driven_path", "")
    session.world_path = data.get("world_path", "")

    for step_name, step_data in data.get("step_results", {}).items():
        session.step_results[step_name] = StepResult(
            step=step_data["step"],
            status=step_data["status"],
            output_path=step_data.get("output_path", ""),
            details=step_data.get("details", {}),
            timestamp=step_data.get("timestamp", 0),
        )

    return session


def load_project_session_by_project(project: str) -> ProjectSession | None:
    """Find the latest project session for a project name."""
    if not STORE_DIR.exists():
        return None

    best = None
    for f in STORE_DIR.glob("proj-*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("_type") == "project_session" and data.get("project") == project:
                if best is None or data.get("updated_at", 0) > best.get("updated_at", 0):
                    best = data
        except Exception:
            continue

    if best is None:
        return None

    return load_project_session(best["session_id"])
