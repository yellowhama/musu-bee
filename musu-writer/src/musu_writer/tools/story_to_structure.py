"""Story-to-structure tool — converts author's story seed into a unified scene-structure template.

Pure context provider. No LLM call. Claude Code reads the returned
template + tone reference and writes the actual structure file.
"""

from __future__ import annotations

import re
from datetime import datetime

from ..project_config import get_project_config, get_project_dir
from ..references import get_latest_decision

VALID_SCOPES = {"single_chapter", "arc", "season"}


def _slugify(text: str, fallback: str = "untitled") -> str:
    """Convert text to a-z-0-9 slug. Returns fallback if nothing usable remains."""
    s = text.strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", "-", s).strip("-")
    s_ascii = re.sub(r"[^a-z0-9-]", "", s)
    # Collapse multiple dashes and strip; reject slugs with no actual word chars.
    s_ascii = re.sub(r"-+", "-", s_ascii).strip("-")
    if not re.search(r"[a-z0-9]", s_ascii):
        return fallback
    return s_ascii


def generate_structure(
    project: str,
    story_seed: str,
    chapter_target: int = 1,
    seed_scope: str = "single_chapter",
    slug: str = "",
) -> dict:
    """Build context for converting a story seed into a unified scene structure.

    Args:
        project: Project name (operator-defined)
        story_seed: Author-provided story seed (free-form text)
        chapter_target: Number of chapters to structure
        seed_scope: "single_chapter" | "arc" | "season"
        slug: Optional output filename slug (auto-derived if empty)

    Returns:
        dict with instructions, output_path, tone_reference, template, seed.
    """
    if seed_scope not in VALID_SCOPES:
        return {
            "error": f"Invalid seed_scope '{seed_scope}'. "
            f"Must be one of {sorted(VALID_SCOPES)}",
        }

    project_dir = get_project_dir(project)
    planning_dir = project_dir / "planning"
    planning_dir.mkdir(parents=True, exist_ok=True)

    if not slug:
        first_line = next(
            (ln.strip() for ln in story_seed.splitlines() if ln.strip()), ""
        )
        slug = _slugify(first_line[:60], fallback=f"seed-{chapter_target}ch")

    date_str = datetime.now().strftime("%Y_%m_%d")
    output_path = planning_dir / f"STRUCTURE_FROM_SEED_{date_str}_{slug}.md"

    tone_reference = get_latest_decision(project, "tone")
    tone_display = tone_reference or "(no tone decision captured yet)"

    config = get_project_config(project)
    style = config.get("style", {})

    template = (
        f"# STRUCTURE FROM SEED — {slug}\n\n"
        f"## Meta\n"
        f"- Date: {date_str.replace('_', '-')}\n"
        f"- Project: {project}\n"
        f"- Source: story_to_structure\n"
        f"- Scope: {seed_scope}\n"
        f"- Target chapter(s): {chapter_target}\n"
        f"- Status: draft (작가 검토 대기)\n\n"
        f"## Original Seed\n"
        f"{story_seed}\n\n"
        f"## Structure\n\n"
        f"### Scene 1 — <장면 명>\n"
        f"- 목적 (purpose): <한 줄>\n"
        f"- 갈등 (conflict): <한 줄>\n"
        f"- 포지셔닝 (positioning): <장르 약속 어떻게 지키는지>\n"
        f"- POV: <캐릭터>\n"
        f"- 장소: <위치>\n"
        f"- 기능 (function): <이 장면이 큰 줄기에서 하는 역할>\n\n"
        f"### Scene 2 — ...\n\n"
        f"## Open Questions (작가 결정 필요)\n"
        f"- [ ] <AI가 처리 못 한 ambiguity 1>\n\n"
        f"## Tone Check\n"
        f"- 기대 톤: {tone_display}\n"
        f"- 이 구조에서 톤 회귀 위험: <있다/없다 + 어느 부분>\n"
    )

    instructions = (
        f"You are converting the author's story seed into the unified scene-structure "
        f"format for project '{project}'.\n\n"
        f"RULES:\n"
        f"1. Use the 6-slot template (purpose / conflict / positioning / POV / location / function) "
        f"for EVERY scene. No omissions.\n"
        f"2. Generate as many scenes as needed for {chapter_target} chapter(s) at scope='{seed_scope}'.\n"
        f"3. The 'Tone Check' section must reference the project's current tone lock "
        f"(provided in 'tone_reference'). If the seed implies a regression from that tone, "
        f"call it out under '톤 회귀 위험'.\n"
        f"4. 'Open Questions' must list every ambiguity the seed left unresolved — "
        f"do not invent answers. Empty list is acceptable but the header must stay.\n"
        f"5. Save the result to 'output_path' provided. Do NOT change the filename.\n"
        f"6. Write in Korean (project language).\n"
    )

    return {
        "tool": "story_to_structure",
        "project": project,
        "instructions": instructions,
        "output_path": str(output_path),
        "tone_reference": tone_display,
        "style_meta": style,
        "seed": story_seed,
        "chapter_target": chapter_target,
        "seed_scope": seed_scope,
        "slug": slug,
        "template": template,
    }
