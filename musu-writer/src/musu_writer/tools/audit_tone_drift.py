"""Audit tone drift tool — checks a chapter draft against the project's tone lock.

Pure context provider. No LLM call. Claude Code reads draft + tone_reference
and writes the drift audit at output_path.
"""

from __future__ import annotations

from datetime import datetime

from ..project_config import get_project_dir
from ..references import get_latest_decision, get_latest_draft, get_latest_lesson


def audit_tone(
    project: str,
    chapter,
) -> dict:
    """Build context for auditing tone drift on a project's chapter draft.

    Args:
        project: Project name (operator-defined). Required.
        chapter: Chapter id ("CH01" / "01" / "1" / 1).

    Returns:
        dict with instructions, output_path, draft_path, draft_content,
        tone_reference, template — OR {"error": ...} on missing inputs.
    """
    if not project:
        return {"error": "project is required (no default)"}

    tone_reference = get_latest_decision(project, "tone")
    if not tone_reference:
        return {
            "error": (
                f"No tone decision captured for project '{project}'. "
                "Run capture_decision(project=..., decision_type='tone', ...) first."
            ),
        }

    draft_path = get_latest_draft(project, chapter)
    if draft_path is None:
        return {
            "error": f"No draft found for project '{project}' chapter '{chapter}'.",
        }

    draft_content = draft_path.read_text(encoding="utf-8")
    repeated_correction_lesson = get_latest_lesson("repeated_correction")
    repeated_correction_display = repeated_correction_lesson or "(no repeated correction captured yet)"

    project_dir = get_project_dir(project)
    reviews_dir = project_dir / "reviews"
    reviews_dir.mkdir(parents=True, exist_ok=True)

    chapter_label = str(chapter).replace("ch", "CH")
    if not chapter_label.startswith("CH"):
        chapter_label = f"CH{chapter_label.zfill(2)}"

    date_str = datetime.now().strftime("%Y_%m_%d")
    output_path = reviews_dir / f"TONE_DRIFT_AUDIT_{chapter_label}_{date_str}.md"

    template = (
        f"# Tone Drift Audit — {project} {chapter_label}\n\n"
        f"## Meta\n"
        f"- Date: {date_str.replace('_', '-')}\n"
        f"- Project: {project}\n"
        f"- Chapter: {chapter_label}\n"
        f"- Draft: {draft_path.name}\n"
        f"- Tone reference (from decisions/tone.md):\n"
        f"  > {tone_reference}\n"
        f"- Company repeated-correction lesson (from lessons/repeated_corrections.md):\n"
        f"  > {repeated_correction_display}\n\n"
        f"## Findings\n\n"
        f"### Violation 1 — <한 줄 요약>\n"
        f"- **Tone rule violated**: <tone_reference의 어느 부분>\n"
        f"- **Quote from draft** (line N): <본문 인용>\n"
        f"- **Why it violates**: <설명>\n"
        f"- **Suggested fix**: <대안 한 줄>\n\n"
        f"### Violation 2 — ...\n\n"
        f"## Summary\n"
        f"- Total violations: <N>\n"
        f"- Severity: <low|medium|high>\n"
        f"- Verdict: [ ] pass  [ ] fix required\n"
        f"\n"
        f"(if no drift) 'No tone drift detected against current tone lock.'\n"
    )

    instructions = (
        f"You are auditing tone drift on a chapter draft for project '{project}'.\n\n"
        f"RULES:\n"
        f"1. Read 'draft_content' (full chapter draft, provided).\n"
        f"2. Compare against 'tone_reference' (project's locked tone, provided).\n"
        f"3. Extract every line / passage in the draft that violates the tone lock. "
        f"For each violation, fill all 4 slots: rule violated, quote (with line N), "
        f"why, suggested fix.\n"
        f"4. If NO violations, write a single line under Summary: "
        f"'No tone drift detected against current tone lock.' "
        f"and set verdict to [x] pass.\n"
        f"5. Cross-check 'repeated_correction_lesson' (company-level pattern the author "
        f"has flagged repeatedly). If the lesson is relevant to a violation in this draft, "
        f"note it in 'Why it violates'.\n"
        f"6. Save the result to 'output_path'. Do NOT change the filename.\n"
        f"7. Write in Korean (project language). Quotes from draft keep original.\n"
        f"8. This audit is for project '{project}' only. Do not reference the other project.\n"
    )

    return {
        "tool": "audit_tone_drift",
        "project": project,
        "chapter": chapter_label,
        "instructions": instructions,
        "output_path": str(output_path),
        "draft_path": str(draft_path),
        "draft_content": draft_content,
        "tone_reference": tone_reference,
        "repeated_correction_lesson": repeated_correction_display,
        "template": template,
    }
