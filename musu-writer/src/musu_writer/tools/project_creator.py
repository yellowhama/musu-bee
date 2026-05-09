"""Project creation tool — auto-generates project structure + config.toml."""

from __future__ import annotations

import os
import time
from pathlib import Path

from ..project_config import PROJECT_ROOT


def create_project_structure(
    name: str,
    display_name: str = "",
    language: str = "ko",
    genre: str = "",
    tone: str = "",
    protagonist: str = "",
    reference_works: list[str] | None = None,
) -> dict:
    """Create a new project directory structure + config.toml.

    Returns dict with created paths and config content.
    """
    project_dir = PROJECT_ROOT / "projects" / name

    if project_dir.exists():
        return {"error": f"Project '{name}' already exists at {project_dir}"}

    # Create directory structure
    dirs = ["canon", "planning", "drafts", "reviews", "state", "research"]
    for d in dirs:
        (project_dir / d).mkdir(parents=True, exist_ok=True)

    # Generate config.toml
    display = display_name or name
    refs = reference_works or []
    refs_toml = ", ".join(f'"{r}"' for r in refs)

    config_content = f'''[project]
name = "{name}"
display_name = "{display}"
language = "{language}"

[references]
# 프로젝트별 참조 파일 — 아래 키에 경로를 채우세요
# character_table = "planning/{name.upper()}_CHARACTER_TABLE.md"
# voice_bible = ""
# act_spine = ""

[wiki]
prefix_filters = []

[style]
tone = "{tone}"
protagonist = "{protagonist}"
reference_works = [{refs_toml}]

[codex_skills]
# 프로젝트 전용 코덱스 스킬이 없으면 공통 게이트만 사용
# writer = "{name}-writer"
'''

    config_path = project_dir / "config.toml"
    config_path.write_text(config_content, encoding="utf-8")

    # Create initial canon placeholder
    canon_content = f"""# {display} — 주인공 초기 설정

**이름**: {protagonist or '(미정)'}
**장르**: {genre or '(미정)'}
**톤**: {tone or '(미정)'}

## 핵심 설정
(에이전트 또는 유저가 채울 것)

## 세계관
(에이전트 또는 유저가 채울 것)
"""
    (project_dir / "canon" / "protagonist.md").write_text(canon_content, encoding="utf-8")

    # Create state/progress.md
    progress_content = f"""# {display} — Progress Log

**Created**: {time.strftime('%Y-%m-%d')}
**Status**: 기획 단계

## Log
- {time.strftime('%Y-%m-%d')}: 프로젝트 생성
"""
    (project_dir / "state" / "progress.md").write_text(progress_content, encoding="utf-8")

    return {
        "project_name": name,
        "project_dir": str(project_dir),
        "config_path": str(config_path),
        "created_dirs": [str(project_dir / d) for d in dirs],
        "created_files": [
            str(config_path),
            str(project_dir / "canon" / "protagonist.md"),
            str(project_dir / "state" / "progress.md"),
        ],
    }


def get_project_foundation_template(project: str) -> dict:
    """Get templates for designing a project's foundation.

    Returns templates for character design, world building, and act structure
    that the agent should fill based on market research and genre decisions.
    """
    return {
        "skill": "project_foundation",
        "project": project,
        "instructions": "시장 리서치 결과와 장르/소재 결정을 바탕으로 "
        "아래 템플릿을 채워서 프로젝트의 기초를 설계하세요. "
        "결과를 해당 프로젝트의 planning/ 디렉토리에 저장하세요.",
        "templates": {
            "protagonist": {
                "name": "",
                "age": "",
                "role": "에이전트가 채울 것: 직업/신분",
                "desire": "에이전트가 채울 것: 핵심 욕망",
                "flaw": "에이전트가 채울 것: 핵심 결함",
                "lie": "에이전트가 채울 것: 자기가 믿는 거짓말",
                "voice": "에이전트가 채울 것: 말투/어법 특징",
                "reference_characters": "에이전트가 채울 것: 참고 캐릭터 (톤 레퍼런스)",
            },
            "world": {
                "setting": "에이전트가 채울 것: 시대/장소",
                "rules": "에이전트가 채울 것: 세계 규칙 (마법/시스템/사회)",
                "factions": "에이전트가 채울 것: 주요 세력",
                "economy": "에이전트가 채울 것: 경제/생계",
                "conflict_source": "에이전트가 채울 것: 핵심 갈등 원천",
            },
            "act_spine": {
                "act_1": "에이전트가 채울 것: 1막 (설정, 후킹, 변화 촉발)",
                "act_2": "에이전트가 채울 것: 2막 (상승, 시련, 반전)",
                "act_3": "에이전트가 채울 것: 3막 (절정, 해결, 다음 시즌 훅)",
                "chapter_count_target": "에이전트가 채울 것: 목표 화수",
                "release_cadence": "에이전트가 채울 것: 발행 주기",
            },
        },
    }
