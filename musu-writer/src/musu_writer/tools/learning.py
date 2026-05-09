"""Learning tool — feedback loop, cross-project lessons, sprint injection."""

from __future__ import annotations

import time
from pathlib import Path

from ..project_config import PROJECT_ROOT


LESSONS_DIR = PROJECT_ROOT / "docs" / "shared_lessons"


def get_lesson_extraction_template(project: str) -> dict:
    """Template for extracting lessons from analytics results."""
    return {
        "skill": "lesson_extraction",
        "project": project,
        "instructions": "analytics/{project}/ 의 분석 결과를 읽고 교훈을 추출하세요. "
        "프로젝트 고유 교훈과 공유 가능한 교훈을 분리하세요. "
        "결과를 analytics/{project}/lessons_learned.md 에 저장하세요.",
        "template": {
            "project": project,
            "date": time.strftime("%Y-%m-%d"),
            "project_specific_lessons": [
                {
                    "lesson": "에이전트가 채울 것",
                    "evidence": "에이전트가 채울 것: 어떤 데이터에서 배웠나",
                    "apply_to": "에이전트가 채울 것: 어떤 챕터/장면에 적용",
                    "action": "에이전트가 채울 것: 구체적 조치",
                }
            ],
            "shareable_lessons": [
                {
                    "lesson": "에이전트가 채울 것: 다른 프로젝트에도 적용 가능한 교훈",
                    "evidence": "",
                    "applicable_to": "에이전트가 채울 것: 어떤 장르/상황에 적용 가능",
                }
            ],
            "style_guide_updates": [
                "에이전트가 채울 것: config.toml이나 스킬 참조에 반영할 변경"
            ],
            "sprint_contract_injection": {
                "next_chapter": "에이전트가 채울 것: 다음 챕터 계약에 추가할 조건",
                "acceptance_criteria_additions": [],
            },
        },
    }


def apply_lesson_to_sprint(project: str, chapter: str, lesson_summary: str) -> dict:
    """Prepare lesson injection into a sprint contract."""
    return {
        "skill": "lesson_application",
        "project": project,
        "chapter": chapter,
        "instructions": f"아래 교훈을 {chapter} sprint contract에 반영하세요. "
        "기존 acceptance criteria에 추가하거나, 금지사항에 추가하세요. "
        "교훈이 이 프로젝트에 맞지 않으면 무시하세요.",
        "lesson_summary": lesson_summary,
        "action": "sprint_contract에 추가할 줄을 생성하세요",
    }


def share_lesson_template(from_project: str, to_project: str) -> dict:
    """Template for sharing lessons between projects."""
    return {
        "skill": "lesson_sharing",
        "from_project": from_project,
        "to_project": to_project,
        "instructions": f"{from_project}의 shareable_lessons를 읽고, "
        f"{to_project}에 적용 가능한 것만 선별하세요. "
        f"적용 가능한 교훈을 docs/shared_lessons/에 저장하세요.",
        "shared_lessons_dir": str(LESSONS_DIR),
    }


def save_shared_lesson(from_project: str, content: str) -> str:
    """Save a shared lesson to the common lessons directory."""
    LESSONS_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{time.strftime('%Y-%m-%d')}_{from_project}_lesson.md"
    path = LESSONS_DIR / filename
    path.write_text(content, encoding="utf-8")
    return str(path)
