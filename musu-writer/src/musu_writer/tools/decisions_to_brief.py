"""Decisions to brief tool — compresses decisions/ + canon/ into a brief draft.

Pure context provider. No LLM call. Returns a `suggested_brief` markdown text
that Claude Code / the author reads, then manually merges into PROJECT_BRIEF.md.

Motivation: FD PROJECT_BRIEF.md grew to ~26KB through round-0/1/2 accumulation.
Auto-compression at the tool level avoids LLM-side hallucination — we just
collect latest entries by type + canon titles and let the author/Claude judge.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ..project_config import get_project_dir
from ..references import collect_canon_summary, collect_decisions_summary


def decisions_to_brief(project: str) -> dict:
    """Build a brief dryrun from decisions/ + canon/ for a project.

    Args:
        project: Project name (operator-defined). Required.

    Returns:
        dict with decisions_summary, canon_summary, current brief path/size,
        suggested_brief markdown, and a note that this is a dryrun.
    """
    if not project:
        return {"error": "project is required (no default)"}

    project_dir = get_project_dir(project)
    if not project_dir.exists():
        return {"error": f"project dir not found: {project_dir}"}

    decisions_summary = collect_decisions_summary(project)
    canon_summary = collect_canon_summary(project)

    brief_path = project_dir / "PROJECT_BRIEF.md"
    brief_size = brief_path.stat().st_size if brief_path.exists() else 0

    date_str = datetime.now().strftime("%Y-%m-%d")

    lines: list[str] = []
    lines.append(f"# {project} — PROJECT BRIEF (suggested)")
    lines.append("")
    lines.append(f"_Generated {date_str} by decisions_to_brief (dryrun)._")
    lines.append("")
    lines.append("## Decisions (latest per type)")
    lines.append("")
    if decisions_summary:
        for decision_type, statement in sorted(decisions_summary.items()):
            lines.append(f"- **{decision_type}**: {statement}")
    else:
        lines.append("_No decisions captured yet._")
    lines.append("")
    lines.append("## Canon (titles only)")
    lines.append("")
    if canon_summary:
        for entry in canon_summary:
            file = entry.get("file", "")
            title = entry.get("title", "")
            if title:
                lines.append(f"- `{file}` — {title}")
            else:
                lines.append(f"- `{file}`")
    else:
        lines.append("_No canon files yet._")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("_이건 dryrun. 작가가 PROJECT_BRIEF.md에 직접 머지하거나, "
                 "Claude Code가 작가 검토 후 반영할 것._")
    lines.append("")

    suggested_brief = "\n".join(lines)

    instructions = (
        f"You are compressing decisions + canon for project '{project}' "
        f"into a brief.\n\n"
        f"RULES:\n"
        f"1. This tool is a CONTEXT PROVIDER — it does not write the brief.\n"
        f"2. Read 'suggested_brief' (provided, draft text).\n"
        f"3. Compare with 'current_brief_path' (existing PROJECT_BRIEF.md, "
        f"size={brief_size} bytes).\n"
        f"4. If existing brief is bloated (>10KB) and suggested_brief covers "
        f"the same ground, propose to the author replacing the existing brief.\n"
        f"5. Author decides final content. Do not auto-write PROJECT_BRIEF.md "
        f"without explicit author approval.\n"
        f"6. This is for project '{project}' only. Do not reference the other "
        f"project.\n"
    )

    return {
        "tool": "decisions_to_brief",
        "project": project,
        "decisions_summary": decisions_summary,
        "canon_summary": canon_summary,
        "current_brief_path": str(brief_path),
        "current_brief_size_bytes": brief_size,
        "suggested_brief": suggested_brief,
        "instructions": instructions,
        "note": "dryrun. 작가가 PROJECT_BRIEF.md에 직접 머지할 것.",
    }
