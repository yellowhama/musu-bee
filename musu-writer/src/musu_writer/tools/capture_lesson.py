"""Capture lesson tool — appends company-level lessons to lessons/<type>.md.

Company asset (not project-scoped). Pure file operation. Prepend-only.
"""

from __future__ import annotations

from datetime import datetime

from ..references import get_lessons_dir

VALID_TYPES = {"repeated_correction", "failure_recovery", "company_pattern"}
VALID_SOURCES = {"false-dane", "hunter-reborn", "both", ""}


def append_lesson(
    lesson_type: str,
    statement: str,
    source_project: str = "",
    context: str = "",
) -> dict:
    """Append a company-level lesson to lessons/<type>.md (prepend, newest on top).

    Args:
        lesson_type: One of "repeated_correction" | "failure_recovery" | "company_pattern"
        statement: The lesson, in author's own words
        source_project: Where the lesson came from
            ("false-dane" | "hunter-reborn" | "both" | "")
        context: Optional rationale or background

    Returns:
        dict with file path, lesson count, type, source_project, timestamp.
    """
    if lesson_type not in VALID_TYPES:
        return {
            "error": f"Invalid lesson_type '{lesson_type}'. "
            f"Must be one of {sorted(VALID_TYPES)}",
        }
    if source_project not in VALID_SOURCES:
        return {
            "error": f"Invalid source_project '{source_project}'. "
            f"Must be one of {sorted(VALID_SOURCES)}",
        }

    lessons_dir = get_lessons_dir()
    path = lessons_dir / f"{lesson_type}.md"

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    source_display = source_project or "(unspecified)"

    new_entry = (
        f"## {timestamp}\n"
        f"**Statement**: {statement}\n\n"
        f"**Source project**: {source_display}\n\n"
        + (f"**Context**: {context}\n\n" if context else "")
        + "**Source**: capture_lesson\n\n"
        "---\n\n"
    )

    title_label = lesson_type.replace("_", " ").title()
    title_block = (
        f"# {title_label} — Company Lessons (Bloodline Writers)\n\n"
        "회사 차원 학습 자산. Append-only. 가장 최근 lesson이 위쪽.\n"
        "**Statement** / **Source project** / **Context** 필드.\n\n"
        "---\n\n"
    )

    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if existing.startswith("# "):
            marker_idx = existing.find("\n## ")
            if marker_idx == -1:
                content = existing.rstrip() + "\n\n" + new_entry
            else:
                title_part = existing[: marker_idx + 1]
                body_part = existing[marker_idx + 1:]
                content = title_part + new_entry + body_part
        else:
            content = title_block + new_entry + existing
    else:
        content = title_block + new_entry

    path.write_text(content, encoding="utf-8")

    lesson_count = content.count("\n## ")

    return {
        "tool": "capture_lesson",
        "type": lesson_type,
        "file": str(path),
        "lesson_count": lesson_count,
        "source_project": source_display,
        "statement": statement,
        "timestamp": timestamp,
    }
