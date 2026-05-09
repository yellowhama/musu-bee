"""Data models for the writing pipeline."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum


# ── Project Planning Session (1회, 프로젝트 전체) ────────


class ProjectState(str, Enum):
    """Project planning state machine."""

    PROJECT_INIT = "project_init"
    DIRECTION_SET = "direction_set"           # 1. 장르/시장/타겟
    THEME_SET = "theme_set"                   # 2. 주제/소재
    CHARACTERS_CREATED = "characters_created" # 3. 캐릭터 시트
    SYNOPSIS_DONE = "synopsis_done"           # 4. 시놉시스
    OUTLINE_DONE = "outline_done"             # 5. 디테일 아웃라인
    CHARACTER_DRIVEN_DONE = "character_driven_done"  # 6. 캐릭터 드리븐
    EVENT_DRIVEN_DONE = "event_driven_done"   # 7. 이벤트 드리븐
    WORLD_FINALIZED = "world_finalized"       # 8. 세계관 확정
    # Review gates (Generator ≠ Evaluator)
    REVIEW_DIRECTION = "review_direction"     # 방향+주제 리뷰
    REVIEW_CHARACTERS = "review_characters"   # 캐릭터 리뷰
    REVIEW_SYNOPSIS = "review_synopsis"       # 시놉시스 리뷰
    REVIEW_OUTLINE = "review_outline"         # 아웃라인 리뷰
    REVIEW_DRIVEN = "review_driven"           # 캐릭터+이벤트 드리븐 리뷰
    REVIEW_WORLD = "review_world"             # 세계관 리뷰
    PROJECT_READY = "project_ready"           # 기획 완료 → 챕터 세션 시작 가능


class ProjectStepName(str, Enum):
    """Named steps in project planning."""

    SET_DIRECTION = "set_direction"
    SET_THEME = "set_theme"
    CREATE_CHARACTER_SHEETS = "create_character_sheets"
    WRITE_SYNOPSIS = "write_synopsis"
    WRITE_OUTLINE = "write_outline"
    DESIGN_CHARACTER_DRIVEN = "design_character_driven"
    DESIGN_EVENT_DRIVEN = "design_event_driven"
    FINALIZE_WORLDBUILDING = "finalize_worldbuilding"
    # Review steps
    REVIEW_DIRECTION = "review_direction"
    REVIEW_CHARACTERS = "review_characters"
    REVIEW_SYNOPSIS = "review_synopsis"
    REVIEW_OUTLINE = "review_outline"
    REVIEW_DRIVEN = "review_driven"
    REVIEW_WORLD = "review_world"
    PROJECT_READY = "project_ready"


@dataclass
class ProjectSession:
    """A project planning session — runs once per project before any chapter."""

    session_id: str = field(default_factory=lambda: f"proj-{uuid.uuid4().hex[:10]}")
    project: str = ""
    state: ProjectState = ProjectState.PROJECT_INIT
    step_results: dict[str, StepResult] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    # Planning outputs
    direction_path: str = ""
    theme_path: str = ""
    character_sheets_path: str = ""
    synopsis_path: str = ""
    outline_path: str = ""
    character_driven_path: str = ""
    event_driven_path: str = ""
    world_path: str = ""

    def record_step(self, step: str, result: StepResult) -> None:
        self.step_results[step] = result
        self.updated_at = time.time()

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "project": self.project,
            "state": self.state.value,
            "step_results": {k: v.to_dict() for k, v in self.step_results.items()},
            "direction_path": self.direction_path,
            "theme_path": self.theme_path,
            "character_sheets_path": self.character_sheets_path,
            "synopsis_path": self.synopsis_path,
            "outline_path": self.outline_path,
            "character_driven_path": self.character_driven_path,
            "event_driven_path": self.event_driven_path,
            "world_path": self.world_path,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


# ── Chapter Writing Session (매 화) ────────────────────


class SessionState(str, Enum):
    """Pipeline state machine states."""

    INIT = "init"
    # Chapter beats (V2 addition)
    BEATS_DESIGNED = "beats_designed"
    # Pre-production (parallel)
    PRE_PRO = "pre_pro"
    CONTINUITY_DONE = "continuity_done"
    CHARACTERS_DONE = "characters_done"
    WORLD_DONE = "world_done"
    PRE_PRO_COMPLETE = "pre_pro_complete"
    # Sequential draft pipeline
    STRUCTURE_DRAFT = "structure_draft"
    STRUCTURE_DONE = "structure_done"
    AI_DETECTION = "ai_detection"
    AI_CHECKED = "ai_checked"
    RHYTHM_DRAFT = "rhythm_draft"
    RHYTHM_DONE = "rhythm_done"
    MOUTH_DRAFT = "mouth_draft"
    MOUTH_DONE = "mouth_done"
    # Optional critique
    CRITIQUE = "critique"
    CRITIQUE_DONE = "critique_done"
    # Terminal
    COMPLETE = "complete"


class StepName(str, Enum):
    """Named steps in the pipeline."""

    DESIGN_CHAPTER_BEATS = "design_chapter_beats"
    AUDIT_CONTINUITY = "audit_continuity"
    DESIGN_CHARACTERS = "design_characters"
    BUILD_WORLD_PACKET = "build_world_packet"
    WRITE_STRUCTURE_DRAFT = "write_structure_draft"
    DETECT_AI = "detect_ai"
    WRITE_RHYTHM_DRAFT = "write_rhythm_draft"
    WRITE_MOUTH_DRAFT = "write_mouth_draft"
    RUN_REFERENCE_CRITIQUE = "run_reference_critique"
    COMPLETE = "complete"


@dataclass
class StepResult:
    """Result from a single pipeline step."""

    step: str
    status: str  # "pass", "fail", "skip"
    output_path: str = ""
    details: dict = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "step": self.step,
            "status": self.status,
            "output_path": self.output_path,
            "details": self.details,
            "timestamp": self.timestamp,
        }


@dataclass
class GateResult:
    """Result from a gate validation check."""

    gate: str
    passed: bool
    reason: str = ""
    blocking_issues: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "gate": self.gate,
            "passed": self.passed,
            "reason": self.reason,
            "blocking_issues": self.blocking_issues,
        }


@dataclass
class Session:
    """A chapter writing session with state tracking."""

    session_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    chapter: str = ""
    project: str = "false-dane"
    state: SessionState = SessionState.INIT
    step_results: dict[str, StepResult] = field(default_factory=dict)
    user_anchors: list[dict] = field(default_factory=list)
    previous_chapter_state: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    # Pre-pro completion flags
    continuity_done: bool = False
    characters_done: bool = False
    world_done: bool = False

    # Draft paths
    structure_draft_path: str = ""
    rhythm_draft_path: str = ""
    mouth_draft_path: str = ""

    # AI detection result
    ai_score: float = -1.0
    ai_risk: str = ""

    def is_pre_pro_complete(self) -> bool:
        return self.continuity_done and self.characters_done and self.world_done

    def record_step(self, step: str, result: StepResult) -> None:
        self.step_results[step] = result
        self.updated_at = time.time()

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "chapter": self.chapter,
            "project": self.project,
            "state": self.state.value,
            "step_results": {k: v.to_dict() for k, v in self.step_results.items()},
            "user_anchors": self.user_anchors,
            "continuity_done": self.continuity_done,
            "characters_done": self.characters_done,
            "world_done": self.world_done,
            "structure_draft_path": self.structure_draft_path,
            "rhythm_draft_path": self.rhythm_draft_path,
            "mouth_draft_path": self.mouth_draft_path,
            "ai_score": self.ai_score,
            "ai_risk": self.ai_risk,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
