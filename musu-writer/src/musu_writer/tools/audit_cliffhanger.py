"""Audit cliffhanger tool — last-N-paragraph 5-form mapping.

Pure context provider. No LLM call. Extracts the last N paragraphs of
a chapter draft and provides the 5 cliffhanger types (crisis_imminent,
shock_dialogue, unexpected_character, danger_signal, exposure_moment)
for Claude Code / the author to map.

HR critique 19번 / HR CH11 v3 시범 critique 에서 회차 결제 동기 핵심
(3중 결합) 확인. 작가가 챕터 마지막 N문단 빠르게 점검.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ..project_config import get_project_dir
from ..references import (
    extract_tail_paragraphs,
    get_latest_decision,
    get_latest_draft,
    get_latest_lesson,
)

CLIFFHANGER_TYPES = [
    "crisis_imminent",
    "shock_dialogue",
    "unexpected_character",
    "danger_signal",
    "exposure_moment",
]


def audit_cliff(
    project: str,
    chapter: str = "",
    tail_paragraphs: int = 5,
) -> dict:
    """Build context for cliffhanger 5-form audit.

    Args:
        project: Project name. Required.
        chapter: Optional chapter id. If empty, picks the highest-versioned
            draft in drafts/.
        tail_paragraphs: How many trailing paragraphs to extract (default 5).

    Returns:
        dict with tail_content, cliffhanger_types, character_core_content,
        tone_content, repeated_correction_lesson, instructions — or
        {"error": ...}.
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
    tail_content = extract_tail_paragraphs(draft_content, tail_paragraphs)
    tail_paragraph_count = (
        tail_content.count("\n\n") + 1 if tail_content else 0
    )

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
    output_path = reviews_dir / f"CLIFFHANGER_AUDIT_{chapter_label}_{date_str}.md"

    instructions = (
        f"You are auditing the cliffhanger ending of project '{project}' "
        f"chapter '{chapter_label}'.\n\n"
        f"RULES:\n"
        f"1. Read 'tail_content' (last {tail_paragraph_count} paragraphs).\n"
        f"2. Map to 1~2 types from 'cliffhanger_types':\n"
        f"   - crisis_imminent: 위기 직전 — 바로 다음 회 사건 직전 컷\n"
        f"   - shock_dialogue: 충격 발언 — 충격적 한 줄로 끝\n"
        f"   - unexpected_character: 예상 외 인물 등장 — 새 인물/존재 출현\n"
        f"   - danger_signal: 위험 신호 직전 — 위협 신호 (소리/그림자/뉴스 등)\n"
        f"   - exposure_moment: 들키는 순간 — 비밀 발각/정체 노출\n"
        f"3. Score the ending: A+ / A / A- / B+ / B / B- / C+ / C / C- / D / F\n"
        f"4. 1~2 sentence rationale + 1~2 sentence suggestion if grade ≤ B-.\n"
        f"5. If none of the 5 types match → mark 'flat' (D grade) + suggest "
        f"the strongest single type to inject.\n"
        f"6. Apply character_core + tone (decisions) when scoring dialogue endings.\n"
        f"7. Apply repeated_correction_lesson when interpreting recurring weak endings.\n"
        f"8. Save the audit to 'output_path'. Write in Korean.\n"
        f"9. This audit is for project '{project}' only. Do not reference the other project.\n"
    )

    return {
        "tool": "audit_cliffhanger",
        "project": project,
        "chapter": chapter_label,
        "instructions": instructions,
        "output_path": str(output_path),
        "draft_path": str(draft_path),
        "tail_content": tail_content,
        "tail_paragraph_count": tail_paragraph_count,
        "character_core_content": character_core_display,
        "tone_content": tone_display,
        "repeated_correction_lesson": lesson_display,
        "cliffhanger_types": CLIFFHANGER_TYPES,
    }
