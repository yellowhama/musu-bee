"""Shared reference file loader — project-agnostic.

Loads skill-local references (codex), project references, and wiki references.
All functions take a `project` parameter to support multiple projects.
"""

from __future__ import annotations

import os
from pathlib import Path

from .project_config import (
    get_codex_skill_name,
    get_project_config,
    get_project_dir,
    get_ref_path,
    get_wiki_prefixes,
    PROJECT_ROOT,
)

CODEX_SKILLS = Path(os.environ.get(
    "CODEX_SKILLS_PATH",
    os.path.expanduser("~/.codex/skills"),
))

WIKI_DIR = PROJECT_ROOT / "llm-wiki" / "wiki"


def _skill_ref_dir(project: str, skill: str) -> Path | None:
    """Get the references directory for a skill, respecting project overrides."""
    skill_name = get_codex_skill_name(project, skill)
    ref_dir = CODEX_SKILLS / skill_name / "references"
    if ref_dir.exists():
        return ref_dir

    # Fallback: try generic skill name (without project prefix)
    generic_dir = CODEX_SKILLS / skill / "references"
    if generic_dir.exists():
        return generic_dir

    # Fallback: try writer-craft common directory
    craft_dir = CODEX_SKILLS / "writer-craft" / "references"
    if craft_dir.exists():
        return craft_dir

    return None


def load_ref(skill: str, filename: str, project: str = "false-dane") -> str | None:
    """Load a skill-local reference file."""
    ref_dir = _skill_ref_dir(project, skill)
    if ref_dir is None:
        return None
    path = ref_dir / filename
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def load_project_ref(relative_path: str, project: str = "false-dane") -> str | None:
    """Load a project-level reference file."""
    project_dir = get_project_dir(project)
    path = project_dir / relative_path
    if not path.exists():
        path = PROJECT_ROOT / relative_path
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def load_project_ref_by_key(ref_key: str, project: str = "false-dane") -> str | None:
    """Load a project reference by config key (e.g. 'character_table')."""
    rel_path = get_ref_path(project, ref_key)
    if not rel_path:
        return None
    return load_project_ref(rel_path, project)


def load_wiki(page_prefix: str, project: str = "false-dane") -> str | None:
    """Load a wiki page by prefix match."""
    if not WIKI_DIR.exists():
        return None
    for f in WIKI_DIR.iterdir():
        if f.name.startswith(page_prefix) and f.suffix == ".md":
            return f.read_text(encoding="utf-8")
    return None


def load_project_wikis(project: str = "false-dane") -> list[str]:
    """Load all wiki pages matching the project's prefix filters."""
    prefixes = get_wiki_prefixes(project)
    if not prefixes or not WIKI_DIR.exists():
        return []
    results = []
    for f in WIKI_DIR.iterdir():
        if any(f.name.startswith(p) for p in prefixes) and f.suffix == ".md":
            results.append(str(f))
    return results


def list_skill_refs(skill: str, project: str = "false-dane") -> list[str]:
    """List available reference files for a skill."""
    ref_dir = _skill_ref_dir(project, skill)
    if ref_dir is None or not ref_dir.exists():
        return []
    return [f.name for f in ref_dir.iterdir() if f.is_file()]


def get_chapter_context(chapter: str, project: str = "false-dane") -> dict:
    """Load standard context files for a chapter session."""
    ctx = {}
    project_dir = get_project_dir(project)

    # Canon
    canon_dir = PROJECT_ROOT / "canon"
    project_canon = project_dir / "canon"
    canon_dirs = [d for d in [project_canon, canon_dir] if d.exists()]
    ctx["canon_files"] = []
    for d in canon_dirs:
        ctx["canon_files"].extend([str(f) for f in d.glob("*.md")])

    # Planning
    planning_dir = project_dir / "planning"
    if planning_dir.exists():
        ctx["planning_files"] = [str(f) for f in planning_dir.glob("*.md")][:10]

    # Current draft
    drafts_dir = project_dir / "drafts"
    if drafts_dir.exists():
        chapter_num = chapter.replace("CH", "").replace("ch", "").zfill(3)
        drafts = sorted(drafts_dir.glob(f"CHAPTER_{chapter_num}_DRAFT_v*.md"))
        if drafts:
            ctx["latest_draft"] = str(drafts[-1])
            ctx["draft_versions"] = [str(d) for d in drafts]

    # State
    state_dir = project_dir / "state"
    if not state_dir.exists():
        state_dir = PROJECT_ROOT / "state"
    if state_dir.exists():
        progress = state_dir / "progress.md"
        if progress.exists():
            ctx["progress"] = str(progress)
        todo = state_dir / "TODO_EXECUTION_BOARD.md"
        if todo.exists():
            ctx["todo_board"] = str(todo)

    # Reviews
    reviews_dir = project_dir / "reviews"
    if reviews_dir.exists():
        chapter_num = chapter.replace("CH", "").replace("ch", "").zfill(3)
        ctx["review_files"] = [str(f) for f in reviews_dir.glob(f"*{chapter_num}*")][:10]

    # Wiki
    ctx["wiki_files"] = load_project_wikis(project)

    # Project config
    config = get_project_config(project)
    ctx["project_name"] = config.get("project", {}).get("name", project)
    ctx["style"] = config.get("style", {})

    return ctx
