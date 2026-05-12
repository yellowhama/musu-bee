"""Project configuration loader.

Each project owns a ``projects/<name>/config.toml`` under WRITER_PROJECT_ROOT
declaring references, wiki prefixes, style, and codex skill overrides. The
deployment image stays empty — projects live under the operator's writer
workspace, never inside this repo. Project-specific defaults are not embedded
in this module; consult the operator's config.toml instead.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

PROJECT_ROOT = Path(os.environ.get(
    "WRITER_PROJECT_ROOT",
    os.path.expanduser("~/writer"),
))


def default_project() -> str:
    """The active project name. Empty string when nothing is configured.

    Callers should pass ``project or default_project()`` so generic deployments
    can run with no project bound.
    """
    return os.environ.get("MUSU_DEFAULT_PROJECT", "")


def _load_toml(path: Path) -> dict:
    """Load a TOML file. Returns empty dict on failure."""
    if not path.exists():
        return {}
    try:
        import tomllib
        with open(path, "rb") as f:
            return tomllib.load(f)
    except Exception:
        return {}


@lru_cache(maxsize=16)
def get_project_config(project: str) -> dict:
    """Load project config from projects/{project}/config.toml.

    Returns a minimal stub when no config.toml is found; this lets generic
    deployments and CI run without an active project.
    """
    if not project:
        return {
            "project": {"name": "", "language": "ko"},
            "references": {},
            "wiki": {"prefix_filters": []},
            "style": {},
            "codex_skills": {},
        }
    config_path = PROJECT_ROOT / "projects" / project / "config.toml"
    config = _load_toml(config_path)
    if config:
        return config
    return {
        "project": {"name": project, "language": "ko"},
        "references": {},
        "wiki": {"prefix_filters": []},
        "style": {},
        "codex_skills": {},
    }


def get_project_dir(project: str) -> Path:
    """Get the project directory path."""
    return PROJECT_ROOT / "projects" / project


def get_ref_path(project: str, ref_key: str) -> str | None:
    """Get a project reference file path by key."""
    config = get_project_config(project)
    return config.get("references", {}).get(ref_key)


def get_wiki_prefixes(project: str) -> list[str]:
    """Get wiki page prefix filters for a project."""
    config = get_project_config(project)
    return config.get("wiki", {}).get("prefix_filters", [])


def get_codex_skill_name(project: str, skill: str) -> str:
    """Get the codex skill directory name for a project.

    Falls back to generic skill name if no project-specific override.
    """
    config = get_project_config(project)
    return config.get("codex_skills", {}).get(skill, skill)
