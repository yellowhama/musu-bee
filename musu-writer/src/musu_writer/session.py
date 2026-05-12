"""Session state machine and persistence."""

from __future__ import annotations

import json
import os
from pathlib import Path

from .models import GateResult, Session, SessionState, StepName, StepResult

STORE_DIR = Path(
    os.environ.get("MUSU_WRITER_STORE", "~/.musu/writer-sessions")
).expanduser()

# State transition rules: current_state → (next_step, required_gate)
PIPELINE_ORDER: list[tuple[str, SessionState, SessionState]] = [
    # Pre-pro (any order, all must complete)
    (StepName.AUDIT_CONTINUITY, SessionState.PRE_PRO, SessionState.CONTINUITY_DONE),
    (StepName.DESIGN_CHARACTERS, SessionState.PRE_PRO, SessionState.CHARACTERS_DONE),
    (StepName.BUILD_WORLD_PACKET, SessionState.PRE_PRO, SessionState.WORLD_DONE),
    # Sequential
    (StepName.WRITE_STRUCTURE_DRAFT, SessionState.PRE_PRO_COMPLETE, SessionState.STRUCTURE_DONE),
    (StepName.DETECT_AI, SessionState.STRUCTURE_DONE, SessionState.AI_CHECKED),
    (StepName.WRITE_RHYTHM_DRAFT, SessionState.AI_CHECKED, SessionState.RHYTHM_DONE),
    (StepName.WRITE_MOUTH_DRAFT, SessionState.RHYTHM_DONE, SessionState.MOUTH_DONE),
    (StepName.RUN_REFERENCE_CRITIQUE, SessionState.MOUTH_DONE, SessionState.CRITIQUE_DONE),
]


def get_next_step(session: Session) -> dict:
    """Determine the next step based on current session state.

    Returns dict with:
      step: next step name
      reason: why this step is next
      gate: gate check result (if applicable)
      inputs: suggested inputs for the step
    """
    state = session.state

    # INIT → start pre-pro
    if state == SessionState.INIT:
        session.state = SessionState.PRE_PRO
        return {
            "step": StepName.AUDIT_CONTINUITY,
            "reason": "세션 시작. 연속성 감사부터.",
            "gate": None,
            "inputs": {"chapter": session.chapter},
        }

    # PRE_PRO — check what's not done yet
    if state in (
        SessionState.PRE_PRO,
        SessionState.CONTINUITY_DONE,
        SessionState.CHARACTERS_DONE,
        SessionState.WORLD_DONE,
    ):
        if not session.continuity_done:
            return {
                "step": StepName.AUDIT_CONTINUITY,
                "reason": "연속성 감사 미완료",
                "gate": None,
                "inputs": {"chapter": session.chapter},
            }
        if not session.characters_done:
            return {
                "step": StepName.DESIGN_CHARACTERS,
                "reason": "캐릭터 설계 미완료",
                "gate": None,
                "inputs": {"chapter": session.chapter},
            }
        if not session.world_done:
            return {
                "step": StepName.BUILD_WORLD_PACKET,
                "reason": "세계 패킷 미완료",
                "gate": None,
                "inputs": {"chapter": session.chapter},
            }

        # All pre-pro done
        session.state = SessionState.PRE_PRO_COMPLETE
        gate = _check_pre_pro_gate(session)
        return {
            "step": StepName.WRITE_STRUCTURE_DRAFT,
            "reason": "Pre-pro 3단계 완료. 구조 초안 작성 가능.",
            "gate": gate.to_dict(),
            "inputs": {"chapter": session.chapter},
        }

    # PRE_PRO_COMPLETE → structure draft
    if state == SessionState.PRE_PRO_COMPLETE:
        gate = _check_pre_pro_gate(session)
        return {
            "step": StepName.WRITE_STRUCTURE_DRAFT,
            "reason": "구조 초안 작성 단계",
            "gate": gate.to_dict(),
            "inputs": {"chapter": session.chapter},
        }

    # STRUCTURE_DONE → AI detection
    if state == SessionState.STRUCTURE_DONE:
        gate = _check_structure_gate(session)
        return {
            "step": StepName.DETECT_AI,
            "reason": "Stage 4.5: AI 탐지",
            "gate": gate.to_dict(),
            "inputs": {"draft_path": session.structure_draft_path},
        }

    # AI_CHECKED → rhythm or rework
    if state == SessionState.AI_CHECKED:
        gate = _check_ai_gate(session)
        if not gate.passed:
            return {
                "step": StepName.WRITE_STRUCTURE_DRAFT,
                "reason": f"AI score {session.ai_score:.2f} (HIGH). 구조 재작성 필요.",
                "gate": gate.to_dict(),
                "inputs": {"chapter": session.chapter, "rework": True},
            }
        return {
            "step": StepName.WRITE_RHYTHM_DRAFT,
            "reason": "AI 탐지 통과. 호흡 초안 작성.",
            "gate": gate.to_dict(),
            "inputs": {"draft_path": session.structure_draft_path},
        }

    # RHYTHM_DONE → mouth draft
    if state == SessionState.RHYTHM_DONE:
        return {
            "step": StepName.WRITE_MOUTH_DRAFT,
            "reason": "호흡 초안 완료. 말맛 초안 작성.",
            "gate": None,
            "inputs": {"draft_path": session.rhythm_draft_path},
        }

    # MOUTH_DONE → critique (optional) or complete
    if state == SessionState.MOUTH_DONE:
        return {
            "step": StepName.RUN_REFERENCE_CRITIQUE,
            "reason": "말맛 초안 완료. 참고문헌 비평 (선택).",
            "gate": None,
            "inputs": {"draft_path": session.mouth_draft_path},
            "optional": True,
        }

    # CRITIQUE_DONE → complete
    if state == SessionState.CRITIQUE_DONE:
        session.state = SessionState.COMPLETE
        return {
            "step": StepName.COMPLETE,
            "reason": "전체 파이프라인 완료.",
            "gate": None,
            "inputs": {},
        }

    # COMPLETE
    if state == SessionState.COMPLETE:
        return {
            "step": StepName.COMPLETE,
            "reason": "세션 완료됨.",
            "gate": None,
            "inputs": {},
        }

    return {
        "step": "unknown",
        "reason": f"알 수 없는 상태: {state}",
        "gate": None,
        "inputs": {},
    }


# ── Gap fix: Chapter-to-chapter causality (#5) ──────────


def load_previous_chapter_state(chapter: str) -> dict:
    """Load the previous chapter's session result for causality chaining.

    Gap #5: Each chapter session automatically gets the previous chapter's
    causality_check output so the agent knows what forced this chapter.
    """
    STORE_DIR.mkdir(parents=True, exist_ok=True)

    # Find sessions for the previous chapter
    chapter_num = int(chapter.replace("CH", "").replace("ch", ""))
    if chapter_num <= 1:
        return {"previous_chapter": None, "reason": "First chapter, no prior state"}

    prev_chapter = f"CH{chapter_num - 1:02d}"
    prev_sessions = []

    for f in STORE_DIR.glob("*.json"):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if data.get("chapter") == prev_chapter and data.get("state") == "complete":
                prev_sessions.append(data)
        except Exception:
            continue

    if not prev_sessions:
        return {"previous_chapter": prev_chapter, "reason": "No completed session found"}

    # Get the most recent completed session
    latest = max(prev_sessions, key=lambda d: d.get("updated_at", 0))

    # Extract causality-relevant data
    causality = {}
    for step_name, step_data in latest.get("step_results", {}).items():
        if step_name == "audit_continuity":
            causality["continuity"] = step_data.get("details", {})
        elif step_name == "build_world_packet":
            causality["world"] = step_data.get("details", {})

    return {
        "previous_chapter": prev_chapter,
        "previous_session_id": latest.get("session_id"),
        "mouth_draft_path": latest.get("mouth_draft_path", ""),
        "ai_score": latest.get("ai_score", -1),
        "causality_data": causality,
    }


def advance_state(session: Session, step: str, result: StepResult) -> None:
    """Record a step result and advance the session state."""
    session.record_step(step, result)

    if step == StepName.AUDIT_CONTINUITY and result.status == "pass":
        session.continuity_done = True
        session.state = SessionState.CONTINUITY_DONE
    elif step == StepName.DESIGN_CHARACTERS and result.status == "pass":
        session.characters_done = True
        session.state = SessionState.CHARACTERS_DONE
    elif step == StepName.BUILD_WORLD_PACKET and result.status == "pass":
        session.world_done = True
        session.state = SessionState.WORLD_DONE
    elif step == StepName.WRITE_STRUCTURE_DRAFT and result.status == "pass":
        session.structure_draft_path = result.output_path
        session.state = SessionState.STRUCTURE_DONE
    elif step == StepName.DETECT_AI and result.status == "pass":
        session.ai_score = result.details.get("score", 0)
        session.ai_risk = result.details.get("risk", "low")
        session.state = SessionState.AI_CHECKED
    elif step == StepName.WRITE_RHYTHM_DRAFT and result.status == "pass":
        session.rhythm_draft_path = result.output_path
        session.state = SessionState.RHYTHM_DONE
    elif step == StepName.WRITE_MOUTH_DRAFT and result.status == "pass":
        session.mouth_draft_path = result.output_path
        session.state = SessionState.MOUTH_DONE
    elif step == StepName.RUN_REFERENCE_CRITIQUE:
        session.state = SessionState.CRITIQUE_DONE

    save_session(session)


# ── Gate checks ──────────────────────────────────────────


def _check_pre_pro_gate(session: Session) -> GateResult:
    issues = []
    if not session.continuity_done:
        issues.append("연속성 감사 미완료")
    if not session.characters_done:
        issues.append("캐릭터 설계 미완료")
    if not session.world_done:
        issues.append("세계 패킷 미완료")
    return GateResult(
        gate="pre_pro_complete",
        passed=len(issues) == 0,
        reason="Pre-pro 3단계 완료 확인" if not issues else "Pre-pro 미완료",
        blocking_issues=issues,
    )


def _check_structure_gate(session: Session) -> GateResult:
    issues = []
    if not session.structure_draft_path:
        issues.append("구조 초안 파일 없음")
    return GateResult(
        gate="structure_ready",
        passed=len(issues) == 0,
        reason="구조 초안 존재 확인",
        blocking_issues=issues,
    )


def _check_ai_gate(session: Session) -> GateResult:
    if session.ai_score > 0.6:
        return GateResult(
            gate="ai_detection",
            passed=False,
            reason=f"AI score {session.ai_score:.2f} > 0.6 (HIGH). 구조 재작성 필요.",
            blocking_issues=[f"AI score: {session.ai_score:.2f}, risk: HIGH"],
        )
    return GateResult(
        gate="ai_detection",
        passed=True,
        reason=f"AI score {session.ai_score:.2f} ({session.ai_risk}). 통과.",
    )


# ── Persistence ──────────────────────────────────────────


def save_session(session: Session) -> str:
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    path = STORE_DIR / f"{session.session_id}.json"
    path.write_text(
        json.dumps(session.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return str(path)


def load_session(session_id: str) -> Session | None:
    path = STORE_DIR / f"{session_id}.json"
    if not path.exists():
        return None

    data = json.loads(path.read_text(encoding="utf-8"))

    session = Session(
        session_id=data["session_id"],
        chapter=data["chapter"],
        project=data.get("project", ""),
        state=SessionState(data["state"]),
        created_at=data.get("created_at", 0),
        updated_at=data.get("updated_at", 0),
    )
    session.continuity_done = data.get("continuity_done", False)
    session.characters_done = data.get("characters_done", False)
    session.world_done = data.get("world_done", False)
    session.structure_draft_path = data.get("structure_draft_path", "")
    session.rhythm_draft_path = data.get("rhythm_draft_path", "")
    session.mouth_draft_path = data.get("mouth_draft_path", "")
    session.ai_score = data.get("ai_score", -1.0)
    session.ai_risk = data.get("ai_risk", "")
    session.user_anchors = data.get("user_anchors", [])

    for step_name, step_data in data.get("step_results", {}).items():
        session.step_results[step_name] = StepResult(
            step=step_data["step"],
            status=step_data["status"],
            output_path=step_data.get("output_path", ""),
            details=step_data.get("details", {}),
            timestamp=step_data.get("timestamp", 0),
        )

    return session
