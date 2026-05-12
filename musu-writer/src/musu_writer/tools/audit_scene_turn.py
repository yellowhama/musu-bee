"""Audit scene turn tool — McKee turn test (head vs tail value shift).

Pure context provider. No LLM call. Extracts head + tail paragraphs of
a chapter draft and provides VALUE_AXES (social/physical/psychological/
relational) + OUTCOME_CATEGORIES (yes_but/no_and/yes_and/no_but) for
Claude Code / the author to judge value-sign transition.

R4 시범 critique 의 Q1 (가치 부호 전환) + Q2 (Yes-But/No-And) 두 작품
강점 확인 후 도구화.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ..project_config import get_project_dir
from ..references import (
    extract_head_paragraphs,
    extract_tail_paragraphs,
    get_latest_decision,
    get_latest_draft,
    get_latest_lesson,
)

VALUE_AXES = ["social", "physical", "psychological", "relational"]
OUTCOME_CATEGORIES = ["yes_but", "no_and", "yes_and", "no_but"]


def audit_turn(
    project: str,
    chapter: str = "",
    head_paragraphs: int = 3,
    tail_paragraphs: int = 3,
) -> dict:
    """Build context for McKee scene-turn audit.

    Args:
        project: Project name. Required.
        chapter: Optional chapter id. If empty, uses highest-versioned draft.
        head_paragraphs: How many leading paragraphs (default 3).
        tail_paragraphs: How many trailing paragraphs (default 3).

    Returns:
        dict with head_content, tail_content, value_axes, outcome_categories,
        decisions/lessons context, instructions — or {"error": ...}.
    """
    if not project:
        return {"error": "project is required (no default)"}

    project_dir = get_project_dir(project)
    if not project_dir.exists():
        return {"error": f"project dir not found: {project_dir}"}

    if chapter:
        draft_path = get_latest_draft(project, chapter)
    else:
        drafts_dir = project_dir / "drafts"
        if not drafts_dir.exists():
            return {"error": f"no drafts dir for project '{project}'"}
        all_drafts = list(drafts_dir.glob("*_v*.md"))
        if not all_drafts:
            return {"error": f"no draft files in {drafts_dir}"}

        def _key(p: Path) -> tuple[str, int]:
            stem = p.stem
            v = 0
            if "_v" in stem:
                try:
                    v = int(stem.rsplit("_v", 1)[1])
                except ValueError:
                    v = 0
            return (stem.rsplit("_v", 1)[0], v)

        draft_path = max(all_drafts, key=_key)

    if draft_path is None or not draft_path.exists():
        return {
            "error": f"No draft found for project '{project}' chapter '{chapter or 'latest'}'.",
        }

    draft_content = draft_path.read_text(encoding="utf-8")
    head_content = extract_head_paragraphs(draft_content, head_paragraphs)
    tail_content = extract_tail_paragraphs(draft_content, tail_paragraphs)
    head_paragraph_count = head_content.count("\n\n") + 1 if head_content else 0
    tail_paragraph_count = tail_content.count("\n\n") + 1 if tail_content else 0

    character_core_content = get_latest_decision(project, "character_core")
    tone_content = get_latest_decision(project, "tone")
    repeated_correction_lesson = get_latest_lesson("repeated_correction")
    character_core_display = character_core_content or "(no character_core decision captured yet)"
    tone_display = tone_content or "(no tone decision captured yet)"
    lesson_display = repeated_correction_lesson or "(no repeated correction captured yet)"

    reviews_dir = project_dir / "reviews"
    reviews_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y_%m_%d")
    chapter_label = chapter or draft_path.stem
    output_path = reviews_dir / f"SCENE_TURN_AUDIT_{chapter_label}_{date_str}.md"

    instructions = (
        f"You are running a McKee scene-turn audit for project '{project}' "
        f"chapter '{chapter_label}'.\n\n"
        f"RULES:\n"
        f"1. Read 'head_content' (first {head_paragraph_count} paragraphs) and "
        f"'tail_content' (last {tail_paragraph_count} paragraphs).\n"
        f"2. For each of 4 'value_axes', assign head sign and tail sign:\n"
        f"   - social: 사회적 위치/평판/계급 (+: 상승/안정, -: 하락/위협, 0: 변화 없음)\n"
        f"   - physical: 신체/생존/물리 위험 (+/-/0)\n"
        f"   - psychological: 심리/내면/자기 인식 (+/-/0)\n"
        f"   - relational: 관계/유대/충성 (+/-/0)\n"
        f"3. Identify axes where sign flipped (e.g. +→-, -→+). 1~2 sentence rationale per flip.\n"
        f"4. Classify the outcome into one of 'outcome_categories':\n"
        f"   - yes_but: 목표 달성했지만 더 큰 위험/대가 발생 (Yes, but worse)\n"
        f"   - no_and: 실패 + 추가 위험 (No, and furthermore)\n"
        f"   - yes_and: 목표 달성 + 추가 이득 (드물게 강함, 보통 약한 챕터)\n"
        f"   - no_but: 실패했지만 작은 위안/단서 (No, but…)\n"
        f"5. Score the turn: A+ / A / A- / B+ / B / B- / C+ / C / C- / D / F\n"
        f"6. 'flat' (sign 0/0/0/0 + yes_and) → D grade + suggest the strongest axis to inject.\n"
        f"7. Apply character_core + tone (decisions) when scoring psychological/relational axes.\n"
        f"8. Apply repeated_correction_lesson when interpreting recurring weak turns.\n"
        f"9. Save the audit to 'output_path'. Write in Korean.\n"
        f"10. Heuristic note: 휴리스틱 ±오차, 작가 최종 결정.\n"
        f"11. This audit is for project '{project}' only. Do not reference the other project.\n"
    )

    return {
        "tool": "audit_scene_turn",
        "project": project,
        "chapter": chapter_label,
        "instructions": instructions,
        "output_path": str(output_path),
        "draft_path": str(draft_path),
        "head_content": head_content,
        "tail_content": tail_content,
        "head_paragraph_count": head_paragraph_count,
        "tail_paragraph_count": tail_paragraph_count,
        "character_core_content": character_core_display,
        "tone_content": tone_display,
        "repeated_correction_lesson": lesson_display,
        "value_axes": VALUE_AXES,
        "outcome_categories": OUTCOME_CATEGORIES,
    }
