"""Analytics tool — reader metrics collection + feedback analysis templates."""

from __future__ import annotations

import json
import time
from pathlib import Path

from ..project_config import PROJECT_ROOT


def get_analytics_dir(project: str) -> Path:
    d = PROJECT_ROOT / "analytics" / project
    d.mkdir(parents=True, exist_ok=True)
    return d


def ingest_metrics_template(project: str, chapter: str) -> dict:
    """Template for ingesting reader metrics from platforms."""
    return {
        "skill": "analytics",
        "project": project,
        "chapter": chapter,
        "instructions": "아래 metrics_template을 채워서 analytics/{project}/ 에 저장하세요. "
        "플랫폼별 지표를 수집하고, 이전 챕터와 비교하세요.",
        "metrics_template": {
            "chapter": chapter,
            "date": time.strftime("%Y-%m-%d"),
            "platforms": {
                "kakaopage": {
                    "views": 0,
                    "likes": 0,
                    "comments": 0,
                    "retention_rate": "에이전트가 채울 것: 다음 화 넘어간 비율",
                },
                "novelpia": {"views": 0, "likes": 0, "comments": 0, "retention_rate": ""},
                "royalroad": {"views": 0, "followers": 0, "ratings": 0, "avg_rating": 0.0},
            },
            "comment_analysis": {
                "positive": [],
                "negative": [],
                "requests": [],
                "most_mentioned_character": "",
                "most_discussed_scene": "",
            },
            "retention": {
                "drop_off_point": "에이전트가 채울 것: 가장 많이 이탈한 지점",
                "hook_effectiveness": "에이전트가 채울 것: 첫 화 후킹이 효과적이었나",
                "binge_rate": "에이전트가 채울 것: 연속 읽기 비율",
            },
        },
        "save_path": str(get_analytics_dir(project)),
    }


def save_metrics(project: str, chapter: str, metrics_json: str) -> str:
    """Save chapter metrics."""
    d = get_analytics_dir(project)
    path = d / f"{chapter}_metrics_{time.strftime('%Y%m%d')}.json"
    path.write_text(metrics_json, encoding="utf-8")
    return str(path)


def get_feedback_analysis_template(project: str) -> dict:
    """Template for analyzing accumulated reader feedback."""
    return {
        "skill": "feedback_analysis",
        "project": project,
        "instructions": "축적된 metrics 파일들을 읽고 아래 분석 템플릿을 채우세요. "
        "챕터별 추세를 비교하고 개선 신호를 추출하세요.",
        "analysis_template": {
            "project": project,
            "date": time.strftime("%Y-%m-%d"),
            "overall_trend": "에이전트가 채울 것: 전체 추세 (상승/하락/유지)",
            "best_performing_chapters": [],
            "worst_performing_chapters": [],
            "reader_retention_trend": "에이전트가 채울 것",
            "top_reader_requests": [],
            "character_popularity": {},
            "improvement_signals": [
                {
                    "signal": "에이전트가 채울 것",
                    "evidence": "에이전트가 채울 것: 어떤 데이터에서 나왔나",
                    "recommendation": "에이전트가 채울 것: 다음 챕터에 어떻게 적용",
                    "priority": "high/medium/low",
                }
            ],
        },
        "metrics_dir": str(get_analytics_dir(project)),
    }
