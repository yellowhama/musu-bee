"""Capture decision tool — appends author decisions to decisions/<type>.md.

Pure file operation. No LLM call. Prepend-only (newest on top).
"""

from __future__ import annotations

from datetime import datetime

from ..references import get_decisions_dir

VALID_TYPES = {"tone", "character_core", "publish", "other"}


def append_decision(
    project: str,
    decision_type: str,
    statement: str,
    context: str = "",
) -> dict:
    """Append a decision entry to decisions/<type>.md (prepend, newest on top).

    Args:
        project: Project name (operator-defined)
        decision_type: One of "tone" | "character_core" | "publish" | "other"
        statement: Author's decision in their own words
        context: Optional context/rationale

    Returns:
        dict with file path, decision count, type, and timestamp.
    """
    if not project:
        return {"error": "project is required (no default)"}

    if decision_type not in VALID_TYPES:
        return {
            "error": f"Invalid decision_type '{decision_type}'. Must be one of {sorted(VALID_TYPES)}",
        }

    decisions_dir = get_decisions_dir(project)
    path = decisions_dir / f"{decision_type}.md"

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    new_entry = (
        f"## {timestamp}\n"
        f"**Statement**: {statement}\n\n"
        + (f"**Context**: {context}\n\n" if context else "")
        + "**Source**: capture_decision\n\n"
        "---\n\n"
    )

    title_block = (
        f"# {decision_type.title()} Decisions — {project}\n\n"
        "작가의 결정 누적. Append-only. 가장 최근 결정이 위쪽.\n\n"
        "---\n\n"
    )

    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if existing.startswith("# "):
            # Split title block (everything until first '## ' or '---' after title)
            marker_idx = existing.find("\n## ")
            if marker_idx == -1:
                # No prior entries — append after title block as-is
                content = existing.rstrip() + "\n\n" + new_entry
            else:
                title_part = existing[: marker_idx + 1]
                body_part = existing[marker_idx + 1:]
                content = title_part + new_entry + body_part
        else:
            # Unexpected (no title) — prepend full title block
            content = title_block + new_entry + existing
    else:
        content = title_block + new_entry

    path.write_text(content, encoding="utf-8")

    decision_count = content.count("\n## ")

    return {
        "tool": "capture_decision",
        "project": project,
        "type": decision_type,
        "file": str(path),
        "decision_count": decision_count,
        "statement": statement,
        "timestamp": timestamp,
    }
