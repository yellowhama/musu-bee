"""Promote approved canon candidates from canon/_candidates/ to canon/.

Pure file operation. No LLM call. Filters by 'Decision: [x] approve' lines
(by_section mode) or moves whole files (whole_file mode).
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ..project_config import get_project_dir
from ..references import get_canon_candidates_dir

VALID_MODES = {"by_section", "whole_file"}
APPROVAL_MARKERS = ("Decision: [x] approve", "Decision: [X] approve")


def _approved_sections(content: str) -> list[str]:
    """Return ### Candidate sections that contain a 'Decision: [x] approve' line.

    Sections are bounded by either the next '### Candidate' or any other '## '
    top-level header. Tail-of-file is also flushed.
    """
    sections: list[str] = []
    current: list[str] = []
    in_candidate = False

    def _flush():
        if current:
            section_text = "".join(current)
            if any(m in section_text for m in APPROVAL_MARKERS):
                sections.append(section_text.rstrip())

    for line in content.splitlines(keepends=True):
        if line.startswith("### Candidate"):
            _flush()
            current.clear()
            current.append(line)
            in_candidate = True
        elif line.startswith("## ") and in_candidate:
            # New top-level header — end of candidate block
            _flush()
            current.clear()
            in_candidate = False
        elif in_candidate:
            current.append(line)
    if in_candidate:
        _flush()
    return sections


def _validate_target_path(target_canon_path: str) -> str | None:
    """Return error message if target_canon_path is unsafe, else None."""
    if not target_canon_path:
        return "target_canon_path is required"
    if target_canon_path.startswith("/"):
        return "target_canon_path must be relative within canon/ (no absolute paths)"
    parts = Path(target_canon_path).parts
    if ".." in parts:
        return "target_canon_path must not contain '..'"
    return None


def promote(
    project: str,
    candidate_file: str,
    target_canon_path: str,
    mode: str = "by_section",
) -> dict:
    """Promote approved candidates from canon/_candidates/<candidate_file>
    to canon/<target_canon_path>.

    Args:
        project: Project name (operator-defined). Required.
        candidate_file: Filename inside canon/_candidates/.
        target_canon_path: Path inside canon/, relative.
        mode: "by_section" (default) or "whole_file".

    Returns:
        dict with promotion result, or {"error": ...} on validation failure.
    """
    if not project:
        return {"error": "project is required (no default)"}
    if mode not in VALID_MODES:
        return {"error": f"Invalid mode '{mode}'. Must be one of {sorted(VALID_MODES)}"}

    target_err = _validate_target_path(target_canon_path)
    if target_err:
        return {"error": target_err}

    candidates_dir = get_canon_candidates_dir(project)
    candidate_path = candidates_dir / candidate_file
    if not candidate_path.exists():
        return {"error": f"candidate file not found: {candidate_path}"}

    content = candidate_path.read_text(encoding="utf-8")

    if mode == "by_section":
        approved = _approved_sections(content)
        if not approved:
            return {
                "error": (
                    f"No approved candidates found in {candidate_file}. "
                    "Mark candidates with 'Decision: [x] approve' first."
                ),
            }
        promoted_payload = "\n\n".join(approved) + "\n"
        promoted_count = len(approved)
    else:
        # whole_file: take everything after the first blank line following the title
        # (skip the meta block), or fall back to full content if structure unclear.
        promoted_payload = content
        promoted_count = 1

    canon_dir = get_project_dir(project) / "canon"
    target_path = canon_dir / target_canon_path
    target_existed_before = target_path.exists()
    target_path.parent.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    header_line = (
        f"\n<!-- promoted from _candidates/{candidate_file} at {timestamp} "
        f"(mode={mode}, count={promoted_count}) -->\n\n"
    )

    if target_existed_before:
        existing = target_path.read_text(encoding="utf-8")
        if not existing.endswith("\n"):
            existing += "\n"
        new_content = existing + header_line + promoted_payload
    else:
        new_content = (
            f"# {target_canon_path}\n\n"
            f"(canon promoted from candidates — initial file)\n"
            f"{header_line}{promoted_payload}"
        )

    target_path.write_text(new_content, encoding="utf-8")

    # Append promotion log to candidate file
    promotion_log_entry = (
        f"- {timestamp} → canon/{target_canon_path} "
        f"(mode={mode}, count={promoted_count})\n"
    )
    if "## Promotion Log" in content:
        # Append to existing log section
        updated_candidate = content.rstrip() + "\n" + promotion_log_entry
    else:
        updated_candidate = content.rstrip() + "\n\n## Promotion Log\n" + promotion_log_entry
    candidate_path.write_text(updated_candidate, encoding="utf-8")

    return {
        "tool": "promote_canon_candidate",
        "project": project,
        "candidate_file": candidate_file,
        "target_canon_path": target_canon_path,
        "target_full_path": str(target_path),
        "mode": mode,
        "promoted_count": promoted_count,
        "target_existed_before": target_existed_before,
        "timestamp": timestamp,
    }
