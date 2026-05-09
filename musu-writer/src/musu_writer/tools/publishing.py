"""Publishing tools — platform formatting, metadata, cover prompts."""

from __future__ import annotations

import time
from pathlib import Path

from ..project_config import get_project_config, get_project_dir, PROJECT_ROOT


PLATFORM_SPECS = {
    "novelpia": {
        "name": "노벨피아",
        "max_chars": 6000,
        "min_chars": 3000,
        "format": "plain_text",
        "title_max": 30,
        "summary_max": 200,
        "tags_max": 10,
        "ai_policy": "disclosure_recommended",
        "notes": "자유연재 → 프리미엄 전환 가능. AI 사용 공시 권장.",
    },
    "kakaopage": {
        "name": "카카오페이지",
        "max_chars": 7000,
        "min_chars": 4000,
        "format": "plain_text",
        "title_max": 20,
        "summary_max": 150,
        "tags_max": 5,
        "ai_policy": "unclear",
        "notes": "정책 불명확. 투고 시 확인 필요.",
    },
    "royalroad": {
        "name": "Royal Road",
        "max_words": 3000,
        "min_words": 1500,
        "format": "markdown_light",
        "title_max": 100,
        "summary_max": 500,
        "tags_max": 20,
        "ai_policy": "tag_required",
        "notes": "AI-Assisted 태그 필수. AI-Generated 태그 권장.",
    },
    "kindle": {
        "name": "Amazon Kindle (KDP)",
        "format": "epub_or_docx",
        "ai_policy": "disclosure_required",
        "notes": "AI 사용 공시 필수. 미공시 시 계정 정지 가능.",
    },
}


def get_publish_context(project: str, chapter: str, platform: str = "") -> dict:
    """Get publishing context — platform specs, metadata templates."""
    config = get_project_config(project)
    project_dir = get_project_dir(project)

    if platform and platform in PLATFORM_SPECS:
        platforms = {platform: PLATFORM_SPECS[platform]}
    else:
        platforms = PLATFORM_SPECS

    return {
        "skill": "publishing",
        "project": project,
        "chapter": chapter,
        "instructions": "발행 패키지를 준비하세요. "
        "드래프트를 읽고, 플랫폼 규격에 맞는 제목/요약/태그를 생성하세요. "
        f"결과를 publish/{project}/{chapter}/에 저장하세요.",
        "platform_specs": platforms,
        "metadata_template": {
            "title": "에이전트가 채울 것: 화 제목",
            "series_title": config.get("project", {}).get("display_name", project),
            "summary": "에이전트가 채울 것: 화 요약 (스포일러 없이, 후킹)",
            "tags": "에이전트가 채울 것: 태그 목록",
            "content_warnings": "에이전트가 채울 것: 경고 (폭력, 욕설 등)",
            "author_note": "에이전트가 채울 것: 작가의 말 (선택)",
        },
        "cover_prompt_template": {
            "style": "에이전트가 채울 것: 이미지 스타일 (만화풍/사실적/미니멀)",
            "subject": "에이전트가 채울 것: 중심 피사체",
            "mood": "에이전트가 채울 것: 분위기 (다크/밝은/긴장)",
            "colors": "에이전트가 채울 것: 주요 색상",
            "text_overlay": "에이전트가 채울 것: 제목 텍스트 배치",
            "negative_prompt": "에이전트가 채울 것: 피할 요소",
        },
        "translation_template": {
            "source_language": config.get("project", {}).get("language", "ko"),
            "target_language": "en" if config.get("project", {}).get("language") == "ko" else "ko",
            "notes": "에이전트가 채울 것: 번역 시 주의사항 (고유명사, 말장난 등)",
        },
        "save_dir": str(PROJECT_ROOT / "publish" / project / chapter),
    }


def save_publish_package(project: str, chapter: str, content: str) -> str:
    """Save a publishing package."""
    pub_dir = PROJECT_ROOT / "publish" / project / chapter
    pub_dir.mkdir(parents=True, exist_ok=True)
    path = pub_dir / f"publish_package_{time.strftime('%Y%m%d')}.md"
    path.write_text(content, encoding="utf-8")
    return str(path)
