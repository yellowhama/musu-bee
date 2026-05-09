"""Project configuration loader.

Each project has a config.toml that declares its references, wiki prefixes,
style settings, and codex skill overrides. If no config.toml exists,
falls back to false-dane defaults for backward compatibility.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

PROJECT_ROOT = Path(os.environ.get(
    "WRITER_PROJECT_ROOT",
    os.path.expanduser("~/writer"),
))


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

    Falls back to hardcoded false-dane defaults if no config found.
    """
    config_path = PROJECT_ROOT / "projects" / project / "config.toml"
    config = _load_toml(config_path)

    if config:
        return config

    # Fallback: false-dane defaults (backward compatibility)
    if project == "false-dane":
        return _false_dane_defaults()

    # Unknown project with no config — return minimal defaults
    return {
        "project": {"name": project, "language": "ko"},
        "references": {},
        "wiki": {"prefix_filters": []},
        "style": {},
        "codex_skills": {},
    }


def _false_dane_defaults() -> dict:
    """Hardcoded defaults for false-dane (backward compatibility)."""
    return {
        "project": {
            "name": "false-dane",
            "display_name": "거짓 데인",
            "language": "ko",
        },
        "references": {
            "character_table": "planning/FALSE_DANE_CHARACTER_TABLE.md",
            "voice_bible": "planning/canon_bibles/FALSE_DANE_CHARACTER_FOUNDATION_AND_VOICE_BIBLE.md",
            "visual_bible": "planning/FALSE_DANE_CHARACTER_VISUAL_AND_INTRO_BIBLE.md",
            "act_spine": "planning/ACT_01_REHARDENED_SPINE.md",
            "cast_lock": "planning/SEASON_01_RECURRING_SUPPORTING_CAST_LOCK.md",
            "char_story_map": "planning/canon_bibles/FALSE_DANE_CHARACTER_STORY_MAP_2026_05_01.md",
            "dialogue_research": "planning/FALSE_DANE_DIALOGUE_MOUTHFEEL_RESEARCH.md",
            "ensemble_spec": "planning/FALSE_DANE_PREPRO_WORLD_ENSEMBLE_AGENT_SPEC.md",
            "ref_voice_bible": "planning/FALSE_DANE_REFERENCE_BASED_CHARACTER_VOICE_BIBLE.md",
        },
        "wiki": {
            "prefix_filters": ["293_FALSE_DANE", "296_FALSE_DANE"],
        },
        "style": {
            "tone": "picaresque-black-comedy",
            "protagonist": "에드릭",
            "reference_works": ["ASOIAF", "장길산"],
        },
        "codex_skills": {
            "writer": "false-dane-writer",
            "rhythm": "false-dane-rhythm-drafter",
            "mouth": "false-dane-second-drafter",
            "worldbuilder": "false-dane-prepro-worldbuilder",
            "critic": "false-dane-reference-critic",
            "continuity": "false-dane-continuity-auditor",
            "character": "false-dane-character-designer",
            "operator": "false-dane-operator",
        },
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
