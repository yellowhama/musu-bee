"""Audit reference density tool — quantitative comparison with reference novels.

Pure context provider. No LLM call. Reproduces HR critique 19번 정량 표 in
one call: chapter stats + baseline reference stats (yaksa / sajo / agot).

Reference sources are read-only from /mnt/e (REFERENCE_KEY_MAP in
references.py). Author/Claude reads stats and writes the verdict at
output_path.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ..project_config import get_project_dir
from ..references import (
    compute_text_stats,
    get_latest_decision,
    get_latest_draft,
    get_latest_lesson,
    load_reference_excerpt,
)

DEFAULT_REFERENCE_KEYS = ["yaksa_13", "sajo_1", "agot_en"]
REFERENCE_SAMPLE_CHARS = 120_000


def audit_density(
    project: str,
    chapter: str = "",
    reference_keys: list[str] | None = None,
) -> dict:
    """Build a quantitative density comparison between a chapter draft and references.

    Args:
        project: Project name. Required.
        chapter: Optional chapter id. If empty, picks the highest-versioned
            draft in drafts/.
        reference_keys: Optional list of REFERENCE_KEY_MAP keys. Defaults to
            ["yaksa_13", "sajo_1", "agot_en"] (HR critique 19번 검증).

    Returns:
        dict with chapter_stats, reference_stats (per key), tone_content,
        repeated_correction_lesson, instructions — or {"error": ...}.
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
    chapter_stats = compute_text_stats(draft_content)

    if reference_keys is None:
        reference_keys = list(DEFAULT_REFERENCE_KEYS)

    reference_stats: dict = {}
    for key in reference_keys:
        loaded = load_reference_excerpt(key, max_chars=REFERENCE_SAMPLE_CHARS)
        if loaded.get("found"):
            stats = compute_text_stats(loaded["excerpt"])
            reference_stats[key] = {
                "source_path": loaded["source_path"],
                "total_lines": loaded["total_lines"],
                "total_chars": loaded["total_chars"],
                "sample_chars": len(loaded["excerpt"]),
                **stats,
            }
        else:
            reference_stats[key] = {
                "found": False,
                "error": loaded.get("error", "unknown"),
            }

    tone_content = get_latest_decision(project, "tone")
    repeated_correction_lesson = get_latest_lesson("repeated_correction")
    tone_display = tone_content or "(no tone decision captured yet)"
    lesson_display = repeated_correction_lesson or "(no repeated correction captured yet)"

    reviews_dir = project_dir / "reviews"
    reviews_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y_%m_%d")
    chapter_label = chapter or draft_path.stem
    output_path = reviews_dir / f"REFERENCE_DENSITY_AUDIT_{chapter_label}_{date_str}.md"

    instructions = (
        f"You are running a reference-density audit for project '{project}' "
        f"chapter '{chapter_label}'.\n\n"
        f"RULES:\n"
        f"1. Read 'chapter_stats' (sentence_count, avg_sentence_chars, "
        f"dialogue_line_ratio, paragraph_count, wall_paragraph_count, "
        f"wall_paragraph_ratio).\n"
        f"2. Compare against 'reference_stats' ({len(reference_keys)} baseline references). "
        f"Each reference 'found:False' must be excluded from comparison.\n"
        f"3. Produce a markdown table at 'output_path':\n"
        f"   | metric | this chapter | <key1> | <key2> | ... | verdict |\n"
        f"4. For each metric, classify the chapter as one of:\n"
        f"   - '웹연재형 단문' (sentence_chars 짧음, dialogue ratio 높음, wall_paragraph 낮음)\n"
        f"   - '서사 밀도형' (sentence_chars 김, dialogue ratio 낮음, wall_paragraph 있음)\n"
        f"   - '하이브리드' (중간 — 단문 호흡 + 가끔 서사 밀도)\n"
        f"5. Apply tone_content + repeated_correction_lesson to interpret edge cases.\n"
        f"6. Save the audit to 'output_path'. Write in Korean.\n"
        f"7. Heuristic note: 통계는 정규식 기반 ±10% 변동 가능.\n"
        f"8. This audit is for project '{project}' only. Do not reference the other project.\n"
    )

    return {
        "tool": "audit_reference_density",
        "project": project,
        "chapter": chapter_label,
        "instructions": instructions,
        "output_path": str(output_path),
        "draft_path": str(draft_path),
        "chapter_stats": chapter_stats,
        "reference_stats": reference_stats,
        "tone_content": tone_display,
        "repeated_correction_lesson": lesson_display,
    }
