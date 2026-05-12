"""Audit canon drift tool — checks a chapter draft against the project's canon.

Pure context provider. No LLM call. Claude Code reads draft + canon files +
character_core reference and writes the drift audit at output_path.
"""

from __future__ import annotations

from datetime import datetime

from ..project_config import get_project_dir
from ..references import (
    get_canon_files,
    get_latest_decision,
    get_latest_draft,
    get_latest_lesson,
)


def audit_canon(
    project: str,
    chapter,
) -> dict:
    """Build context for auditing canon drift on a project's chapter draft.

    Args:
        project: Project name (operator-defined). Required.
        chapter: Chapter id ("CH01" / "01" / "1" / 1).

    Returns:
        dict with instructions, output_path, draft_path, draft_content,
        canon_files, character_core_reference, template — OR {"error": ...}.
    """
    if not project:
        return {"error": "project is required (no default)"}

    draft_path = get_latest_draft(project, chapter)
    if draft_path is None:
        return {
            "error": f"No draft found for project '{project}' chapter '{chapter}'.",
        }

    draft_content = draft_path.read_text(encoding="utf-8")

    canon_files = get_canon_files(project)
    character_core_ref = get_latest_decision(project, "character_core")
    character_display = character_core_ref or "(no character_core decision captured yet)"
    repeated_correction_lesson = get_latest_lesson("repeated_correction")
    repeated_correction_display = repeated_correction_lesson or "(no repeated correction captured yet)"

    project_dir = get_project_dir(project)
    reviews_dir = project_dir / "reviews"
    reviews_dir.mkdir(parents=True, exist_ok=True)

    chapter_label = str(chapter).replace("ch", "CH")
    if not chapter_label.startswith("CH"):
        chapter_label = f"CH{chapter_label.zfill(2)}"

    date_str = datetime.now().strftime("%Y_%m_%d")
    output_path = reviews_dir / f"CANON_DRIFT_AUDIT_{chapter_label}_{date_str}.md"

    canon_index_block = (
        "\n".join(f"- `{name}`" for name in canon_files.keys())
        if canon_files
        else "(no canon files in this project)"
    )

    template = (
        f"# Canon Drift Audit — {project} {chapter_label}\n\n"
        f"## Meta\n"
        f"- Date: {date_str.replace('_', '-')}\n"
        f"- Project: {project}\n"
        f"- Chapter: {chapter_label}\n"
        f"- Draft: {draft_path.name}\n"
        f"- Canon files compared: {len(canon_files)}\n"
        f"- Character core lock:\n"
        f"  > {character_display}\n"
        f"- Company repeated-correction lesson (from lessons/repeated_corrections.md):\n"
        f"  > {repeated_correction_display}\n\n"
        f"## Canon Index\n"
        f"{canon_index_block}\n\n"
        f"## Findings\n\n"
        f"### Conflict 1 — <한 줄 요약>\n"
        f"- **Canon source**: `canon/<file>.md` 또는 `decisions/character_core.md`\n"
        f"- **Canon says**: <원문 인용>\n"
        f"- **Draft says** (line N): <draft 인용>\n"
        f"- **Conflict type**: name | fact | relation | location | timeline | character\n"
        f"- **Severity**: low | medium | high\n"
        f"- **Suggested fix**: <draft 수정 또는 canon 업데이트 중 어느 쪽인지 명시>\n\n"
        f"### Conflict 2 — ...\n\n"
        f"## Summary\n"
        f"- Total conflicts: <N>\n"
        f"- Verdict: [ ] pass  [ ] fix required\n"
        f"\n"
        f"(if no drift) 'No canon drift detected.'\n"
    )

    instructions = (
        f"You are auditing canon drift on a chapter draft for project '{project}'.\n\n"
        f"RULES:\n"
        f"1. Read 'draft_content' (full chapter draft, provided).\n"
        f"2. Compare against 'canon_files' ({len(canon_files)} files, full bodies provided).\n"
        f"3. Compare against 'character_core_reference' (latest character core lock).\n"
        f"4. Extract every fact / name / relation / location / timeline / character "
        f"trait in the draft that conflicts with canon or character_core. "
        f"For each conflict, fill all 6 slots: canon source, canon quote, draft quote (line N), "
        f"conflict type, severity, suggested fix.\n"
        f"5. Cross-check 'repeated_correction_lesson' (company-level pattern the author "
        f"has flagged repeatedly). If a conflict matches the lesson, note it in 'Severity' or 'Suggested fix'.\n"
        f"6. If NO conflicts, write 'No canon drift detected.' under Summary and set verdict to [x] pass.\n"
        f"7. Save the result to 'output_path'. Do NOT change the filename.\n"
        f"8. Write in Korean. Quotes from draft/canon keep original.\n"
        f"9. This audit is for project '{project}' only. Do not reference the other project's canon.\n"
    )

    return {
        "tool": "audit_canon_drift",
        "project": project,
        "chapter": chapter_label,
        "instructions": instructions,
        "output_path": str(output_path),
        "draft_path": str(draft_path),
        "draft_content": draft_content,
        "canon_files": canon_files,
        "character_core_reference": character_display,
        "repeated_correction_lesson": repeated_correction_display,
        "template": template,
    }
