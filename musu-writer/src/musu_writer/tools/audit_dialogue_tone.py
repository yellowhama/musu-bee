"""Audit dialogue tone tool — per-character dialogue consistency.

Pure context provider. No LLM call. Complements audit_tone_drift
(whole-chapter tone) with per-character dialogue checks.

Extracts dialogue lines (Korean + English quote variants), pairs them
with the project's character_core + tone decisions, and returns context
for Claude Code to judge consistency.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from ..project_config import get_project_dir
from ..references import get_latest_decision, get_latest_draft, get_latest_lesson

DIALOGUE_PATTERNS = [
    r'"([^"\n]+)"',
    r'“([^”\n]+)”',
    r"'([^'\n]+)'",
    r'‘([^’\n]+)’',
]
COMBINED = re.compile("|".join(DIALOGUE_PATTERNS))

SPEAKER_HINT_PATTERN = re.compile(r"^([가-힣A-Za-z][가-힣A-Za-z0-9 _-]{0,15}?)[은는이가:](?:\s|$)")

MAX_SAMPLES = 20


def _extract_dialogue(content: str) -> list[dict]:
    """Return up to MAX_SAMPLES dialogue entries with line_number + speaker_hint."""
    samples: list[dict] = []
    for idx, line in enumerate(content.splitlines(), start=1):
        for match in COMBINED.finditer(line):
            quoted = next((g for g in match.groups() if g), "")
            if not quoted or len(quoted.strip()) < 2:
                continue
            speaker_hint = ""
            prefix = line[: match.start()].rstrip()
            m_hint = SPEAKER_HINT_PATTERN.match(prefix.split()[-1] if prefix else "")
            if m_hint:
                speaker_hint = m_hint.group(1)
            samples.append({
                "line_number": idx,
                "speaker_hint": speaker_hint,
                "line": quoted.strip(),
            })
            if len(samples) >= MAX_SAMPLES:
                return samples
    return samples


def audit_dialogue(project: str, chapter: str = "") -> dict:
    """Build context for per-character dialogue tone audit.

    Args:
        project: Project name. Required.
        chapter: Optional chapter id. If empty, picks the highest-versioned
            draft in drafts/.

    Returns:
        dict with dialogue_samples, character_core_content, tone_content,
        lessons_ref, instructions — or {"error": ...}.
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
    dialogue_samples = _extract_dialogue(draft_content)

    character_core_content = get_latest_decision(project, "character_core")
    tone_content = get_latest_decision(project, "tone")
    repeated_correction_lesson = get_latest_lesson("repeated_correction")

    character_core_display = character_core_content or "(no character_core decision captured yet)"
    tone_display = tone_content or "(no tone decision captured yet)"
    lesson_display = repeated_correction_lesson or "(no repeated correction captured yet)"

    reviews_dir = project_dir / "reviews"
    reviews_dir.mkdir(parents=True, exist_ok=True)
    date_str = datetime.now().strftime("%Y_%m_%d")

    chapter_label = chapter or draft_path.stem.split("_DRAFT_")[0].split("_CHAPTER_")[-1]
    if not chapter_label:
        chapter_label = "latest"

    output_path = reviews_dir / f"DIALOGUE_TONE_AUDIT_{chapter_label}_{date_str}.md"

    instructions = (
        f"You are auditing per-character dialogue tone for project '{project}'.\n\n"
        f"RULES:\n"
        f"1. Read 'dialogue_samples' ({len(dialogue_samples)} extracted quotes).\n"
        f"2. Map each sample to a character if 'speaker_hint' is available; "
        f"otherwise infer from surrounding context in draft_content.\n"
        f"3. Compare each character's dialogue against 'character_core_content' "
        f"(captured character_core decision) and 'tone_content' (captured tone).\n"
        f"4. Flag inconsistencies: tone that breaks character_core / contradicts "
        f"the locked tone / mixes registers within the same character.\n"
        f"5. Cross-check 'repeated_correction_lesson' — if the author has flagged "
        f"a recurring dialogue pattern, prioritize it.\n"
        f"6. Save the audit to 'output_path'. Write in Korean. Keep dialogue quotes verbatim.\n"
        f"7. If no inconsistencies, write a single summary line and verdict [x] pass.\n"
        f"8. This audit is for project '{project}' only. Do not reference the other project.\n"
    )

    return {
        "tool": "audit_dialogue_tone",
        "project": project,
        "chapter": chapter_label,
        "instructions": instructions,
        "output_path": str(output_path),
        "draft_path": str(draft_path),
        "draft_content": draft_content,
        "dialogue_samples": dialogue_samples,
        "character_core_content": character_core_display,
        "tone_content": tone_display,
        "repeated_correction_lesson": lesson_display,
    }
