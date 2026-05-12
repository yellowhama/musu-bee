"""Research-to-canon tool — extracts canon candidates from a research report.

Pure context provider. No LLM call. Claude Code reads the returned
template + existing canon index + character_core reference and writes
the candidate file for author review.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from ..project_config import get_project_dir
from ..references import get_canon_candidates_dir, get_latest_decision

VALID_CATEGORIES = {"world", "character", "system", "rule", "auto"}


def _index_existing_canon(project: str) -> dict:
    """Build a lightweight index of existing canon files: {path: first 200 chars}.

    Excludes the _candidates/ subdirectory. Includes one level of subdirs.
    """
    canon_dir = get_project_dir(project) / "canon"
    if not canon_dir.exists():
        return {}
    index: dict = {}
    for f in sorted(canon_dir.glob("*.md")):
        try:
            text = f.read_text(encoding="utf-8")
            index[f.name] = text[:200].replace("\n", " ")
        except OSError:
            continue
    for sub in sorted(canon_dir.iterdir()):
        if sub.is_dir() and sub.name != "_candidates":
            for f in sorted(sub.glob("*.md")):
                try:
                    text = f.read_text(encoding="utf-8")
                    index[f"{sub.name}/{f.name}"] = text[:200].replace("\n", " ")
                except OSError:
                    continue
    return index


def extract_candidates(
    project: str,
    research_file: str,
    canon_category: str = "auto",
) -> dict:
    """Build context for extracting canon candidates from a research report.

    Args:
        project: Project name
        research_file: Filename inside research/ (e.g. "ANGLO_SAXON_LEGAL_STAKES.md").
                       May include subdirs ("references/MAPPING.md").
        canon_category: "world" | "character" | "system" | "rule" | "auto"

    Returns:
        dict with instructions, output_path, research_content, existing_canon_index,
        character_core_reference, template.
    """
    if canon_category not in VALID_CATEGORIES:
        return {
            "error": f"Invalid canon_category '{canon_category}'. "
            f"Must be one of {sorted(VALID_CATEGORIES)}",
        }

    project_dir = get_project_dir(project)
    research_path = project_dir / "research" / research_file

    if not research_path.exists():
        return {
            "error": f"research file not found: {research_path}",
        }

    research_content = research_path.read_text(encoding="utf-8")

    existing_canon = _index_existing_canon(project)
    character_core_ref = get_latest_decision(project, "character_core")
    character_display = character_core_ref or "(no character_core decision captured yet)"

    candidates_dir = get_canon_candidates_dir(project)
    safe_stem = Path(research_file).stem.replace("/", "_")
    # Also flatten any subdir in research_file path for the prefix
    safe_full = research_file.replace("/", "_").rsplit(".", 1)[0]
    output_path = candidates_dir / f"{safe_full}_canon_candidates.md"

    date_str = datetime.now().strftime("%Y-%m-%d")

    canon_index_block = (
        "\n".join(f"- `{name}` — {snippet}" for name, snippet in existing_canon.items())
        if existing_canon
        else "(no existing canon files)"
    )

    template = (
        f"# Canon Candidates — {research_file}\n\n"
        f"## Meta\n"
        f"- Source: research/{research_file}\n"
        f"- Generated: {date_str}\n"
        f"- Category: {canon_category}\n"
        f"- Status: pending_review\n\n"
        f"## Candidates\n\n"
        f"### Candidate 1 — <한 줄 제목>\n"
        f"- **Statement**: <리서치에서 추출한 fact / rule>\n"
        f"- **Source quote**: <리서치 파일에서 그대로 인용>\n"
        f"- **Suggested canon path**: `canon/<file>.md` 또는 `canon/<file>.md#section`\n"
        f"- **Risk**: <기존 canon과 충돌 가능성 / 작품 톤과 충돌>\n"
        f"- **Decision**: [ ] approve  [ ] modify  [ ] reject\n\n"
        f"### Candidate 2 — ...\n\n"
        f"## Conflicts with Existing Canon\n"
        f"<리스트: 어느 후보가 어느 canon 파일과 충돌하는지. 없으면 '(no conflicts found)' 작성.>\n\n"
        f"## How to Promote\n"
        f"승인된 후보는 작가가 직접 `canon/` 폴더에 추가/수정한다. "
        f"향후 `promote_canon_candidate` 도구가 자동화할 예정.\n"
    )

    instructions = (
        f"You are extracting canon candidates from a research report for project '{project}'.\n\n"
        f"RULES:\n"
        f"1. Read the full 'research_content' (provided).\n"
        f"2. Extract every fact / rule / world-element / character-trait that is "
        f"stable enough to become canon. Skip transient analysis or opinion.\n"
        f"3. For each candidate, fill ALL 5 slots: Statement, Source quote, "
        f"Suggested canon path, Risk, Decision (leave checkboxes blank).\n"
        f"4. Cross-check each candidate against 'existing_canon_index'. If a candidate "
        f"could conflict with an existing canon file, note it under 'Conflicts with Existing Canon'.\n"
        f"5. Cross-check against 'character_core_reference'. If a candidate redefines "
        f"character core in a way the author has already locked, flag in Risk.\n"
        f"6. Category is '{canon_category}'. If 'auto', infer per candidate.\n"
        f"7. Save the result to 'output_path'. Do NOT change the filename.\n"
        f"8. Write in Korean (project language). Quotes from research keep original language.\n"
    )

    return {
        "tool": "research_to_canon",
        "project": project,
        "research_file": research_file,
        "instructions": instructions,
        "output_path": str(output_path),
        "research_content": research_content,
        "existing_canon_index": existing_canon,
        "character_core_reference": character_display,
        "canon_category": canon_category,
        "template": template,
        "canon_index_block": canon_index_block,
        "stem": safe_stem,
    }
