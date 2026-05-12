"""Market research tool — provides templates + context for trend analysis.

A trend-researcher agent does the actual web searching and analysis.
This tool provides structure, templates, and stores results.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from ..project_config import PROJECT_ROOT

RESEARCH_DIR = PROJECT_ROOT / "research" / "trends"


def get_market_research_context(region: str = "all", genre: str = "") -> dict:
    """Provide market research template and instructions.

    Args:
        region: "kr", "us", "jp", or "all"
        genre: specific genre to focus on (empty = all genres)
    """
    platforms = {
        "kr": {
            "platforms": ["카카오페이지", "노벨피아", "문피아", "시리즈"],
            "hot_genres": ["회귀", "먼치킨", "판타지", "로맨스 판타지", "현대 판타지", "무협"],
            "search_queries": [
                "카카오페이지 인기 웹소설 2026",
                "노벨피아 실시간 랭킹",
                "한국 웹소설 트렌드 2026",
            ],
        },
        "us": {
            "platforms": ["Royal Road", "Kindle Unlimited", "WebNovel", "Wattpad"],
            "hot_genres": ["LitRPG", "Progression Fantasy", "Xianxia", "Romance", "System Apocalypse", "Slice of Life"],
            "search_queries": [
                "Royal Road best rated 2026",
                "Kindle Unlimited web novel trending",
                "progression fantasy popular 2026",
            ],
        },
        "jp": {
            "platforms": ["小説家になろう", "カクヨム", "アルファポリス"],
            "hot_genres": ["異世界", "悪役令嬢", "追放", "スローライフ", "ダンジョン"],
            "search_queries": [
                "なろう ランキング 2026",
                "web小説 トレンド 2026",
            ],
        },
    }

    if region == "all":
        target_regions = ["kr", "us", "jp"]
    else:
        target_regions = [region]

    report_template = {
        "date": time.strftime("%Y-%m-%d"),
        "region": region,
        "genre_focus": genre or "all",
        "sections": {
            "top_trending": "에이전트가 채울 것: 현재 가장 인기 있는 작품 5개 (제목, 장르, 플랫폼, 왜 뜨는지)",
            "genre_trends": "에이전트가 채울 것: 장르별 트렌드 (상승/하락/신규)",
            "trope_patterns": "에이전트가 채울 것: 반복되는 트로프/소재 패턴",
            "reader_demands": "에이전트가 채울 것: 독자들이 원하는 것 (댓글/리뷰 기반)",
            "cross_market": "에이전트가 채울 것: 한/미/일 교차 히트 가능성",
            "opportunity_gaps": "에이전트가 채울 것: 아직 채워지지 않은 시장 갭",
            "recommendation": "에이전트가 채울 것: 우리가 써야 할 것 제안 (장르, 소재, 톤, 타겟)",
        },
    }

    competitor_template = {
        "title": "",
        "platform": "",
        "genre": "",
        "chapters": 0,
        "subscribers": "",
        "hook": "에이전트가 채울 것: 이 작품이 독자를 잡는 후킹 방식",
        "structure": "에이전트가 채울 것: 초반 5화 구조",
        "protagonist": "에이전트가 채울 것: 주인공 유형",
        "tropes": [],
        "strengths": [],
        "weaknesses": [],
        "what_to_learn": "에이전트가 채울 것: 우리가 배울 점",
    }

    return {
        "skill": "market_research",
        "instructions": "시장 리서치를 수행하세요. 웹 검색을 사용해서 아래 플랫폼의 "
        "현재 트렌드를 조사하고, report_template의 각 섹션을 채우세요. "
        "조사 결과를 research/trends/ 디렉토리에 저장하세요. "
        "경쟁작 분석은 competitor_template을 사용하세요.",
        "target_regions": {r: platforms.get(r, {}) for r in target_regions},
        "genre_focus": genre,
        "report_template": report_template,
        "competitor_template": competitor_template,
        "save_path": str(RESEARCH_DIR),
    }


def save_market_report(region: str, content: str) -> str:
    """Save a market research report."""
    RESEARCH_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{time.strftime('%Y-%m-%d')}_{region}_market_report.md"
    path = RESEARCH_DIR / filename
    path.write_text(content, encoding="utf-8")
    return str(path)


def get_latest_market_report(region: str = "all") -> dict:
    """Get the latest market report for a region."""
    if not RESEARCH_DIR.exists():
        return {"error": "No research directory found"}

    reports = sorted(RESEARCH_DIR.glob(f"*_{region}_market_report.md"), reverse=True)
    if not reports:
        # Try any report
        reports = sorted(RESEARCH_DIR.glob("*_market_report.md"), reverse=True)

    if not reports:
        return {"error": "No market reports found"}

    latest = reports[0]
    return {
        "path": str(latest),
        "filename": latest.name,
        "content": latest.read_text(encoding="utf-8")[:8000],
    }
