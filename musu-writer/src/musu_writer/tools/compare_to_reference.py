"""Compare to reference tool — qualitative 7-axis comparison.

Pure context provider. No LLM call. Attaches chapter draft + reference
excerpts (yaksa / sajo / agot) + project decisions/lessons so that
Claude Code / the author can judge across 7 axes:

- webfic_hook (웹연재 후킹)
- character_voice (캐릭터 말맛)
- scene_density (장면 밀도)
- world_pressure (세계 압력)
- subtext (서브텍스트)
- sentence_rhythm (문장 리듬)
- reader_residue (독자 잔상)

Verified manually in HR critique 19번 (2026-05-10).
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ..project_config import get_project_dir
from ..references import (
    get_latest_decision,
    get_latest_draft,
    get_latest_lesson,
    load_reference_excerpt,
)

DEFAULT_REFERENCE_KEYS = ["yaksa_13", "sajo_1", "agot_en"]
SEVEN_AXES = [
    "webfic_hook",
    "character_voice",
    "scene_density",
    "world_pressure",
    "subtext",
    "sentence_rhythm",
    "reader_residue",
]


def compare_refs(
    project: str,
    chapter: str = "",
    reference_keys: list[str] | None = None,
    max_chars_per_ref: int = 4000,
) -> dict:
    """Build qualitative reference comparison context.

    Args:
        project: Project name. Required.
        chapter: Optional chapter id. If empty, uses highest-versioned draft.
        reference_keys: Optional REFERENCE_KEY_MAP keys. Defaults to
            ["yaksa_13", "sajo_1", "agot_en"].
        max_chars_per_ref: Excerpt size per reference. Default 4000.

    Returns:
        dict with draft_content, reference_excerpts, character_core_content,
        tone_content, repeated_correction_lesson, seven_axes, instructions
        — or {"error": ...}.
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

    if reference_keys is None:
        reference_keys = list(DEFAULT_REFERENCE_KEYS)

    reference_excerpts: dict = {}
    for key in reference_keys:
        reference_excerpts[key] = load_reference_excerpt(key, max_chars=max_chars_per_ref)

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
    output_path = reviews_dir / f"REFERENCE_QUALITATIVE_COMPARISON_{chapter_label}_{date_str}.md"

    found_keys = [k for k, v in reference_excerpts.items() if v.get("found")]
    missing_keys = [k for k, v in reference_excerpts.items() if not v.get("found")]

    instructions = (
        f"You are running a qualitative reference comparison for project '{project}' "
        f"chapter '{chapter_label}'.\n\n"
        f"RULES:\n"
        f"1. Read 'draft_content' (full chapter, in Korean) and 'reference_excerpts' "
        f"({len(found_keys)} found, {len(missing_keys)} missing).\n"
        f"2. For each of 7 axes (in 'seven_axes'), score the chapter:\n"
        f"   - Grade: A+ / A / A- / B+ / B / B- / C+ / C / C- / D / F\n"
        f"   - 1-2 sentence rationale\n"
        f"   - 1-2 sentence comparison to at least 1 reference (use found keys only)\n"
        f"3. Seven axes meaning:\n"
        f"   - webfic_hook: 첫 30~50줄 후킹력 + 첫 사건 진입 속도\n"
        f"   - character_voice: 화자/캐릭터 말투 독자성\n"
        f"   - scene_density: 한 줄에 사건/관계/세계관 중 몇 개 동시 처리 (HR critique 19번 진단축)\n"
        f"   - world_pressure: 사회/계급/제도/돈/공기 압력이 장면에 박혀있나\n"
        f"   - subtext: 표면 행동/대사 외에 숨은 의미 있나\n"
        f"   - sentence_rhythm: 단·중·장문 변주 / 모바일 호흡\n"
        f"   - reader_residue: 챕터 끝나도 남는 이미지/감정\n"
        f"4. Apply character_core + tone (project decisions) when scoring voice/subtext.\n"
        f"5. Apply repeated_correction_lesson when interpreting recurring patterns.\n"
        f"6. References with 'found:False' must be excluded from comparison.\n"
        f"7. Save the comparison to 'output_path'. Write in Korean.\n"
        f"8. Project '{project}' only. Do not reference the other project.\n"
    )

    return {
        "tool": "compare_to_reference",
        "project": project,
        "chapter": chapter_label,
        "instructions": instructions,
        "output_path": str(output_path),
        "draft_path": str(draft_path),
        "draft_content": draft_content,
        "reference_excerpts": reference_excerpts,
        "character_core_content": character_core_display,
        "tone_content": tone_display,
        "repeated_correction_lesson": lesson_display,
        "seven_axes": SEVEN_AXES,
    }
