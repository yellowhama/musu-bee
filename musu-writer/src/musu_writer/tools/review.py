"""Review tools — Generator ≠ Evaluator critique for planning stages.

Cross-context review: reviewer reads the output in a fresh context,
without seeing the generation process. This gives 28.6% F1 vs 24.6% self-review.
Max 3 rounds. PASS / PASS_WITH_FIXES / FAIL.
"""

from __future__ import annotations

from ..project_config import get_project_config

REVIEW_CRITERIA = {
    "review_direction": {
        "name": "방향+주제 리뷰",
        "reviews": ["direction.md", "theme.md"],
        "criteria": [
            "장르가 시장 데이터와 일치하는가? (리서치 근거)",
            "타겟 독자가 명확한가? (연령/성별/플랫폼)",
            "AI 작성 적합도가 S~A티어인가?",
            "경쟁 포화도가 5/10 이하인가?",
            "주제/전제가 한 문장으로 설명 가능한가?",
            "핵심 갈등이 3개 이상 명확한가?",
            "톤이 일관적인가?",
        ],
    },
    "review_characters": {
        "name": "캐릭터 리뷰",
        "reviews": ["canon/protagonist.md", "canon/characters/"],
        "criteria": [
            "주인공 보이스가 독특한가? (시니컬/자조 유머 등)",
            "내면 vs 외면 갭이 있는가?",
            "욕망/결함/거짓말이 명확한가?",
            "1화에서 매력을 보여줄 수 있는가? (Save the Cat)",
            "착각물 메커니즘이 작동하는가?",
            "조연이 독자적 목표를 가지고 있는가?",
            "케미 공식 5요소 중 3개 이상 충족하는가?",
            "AI 밋밋함 위험: 클리셰 조합이 아닌가?",
        ],
    },
    "review_synopsis": {
        "name": "시놉시스 리뷰",
        "reviews": ["planning/synopsis.md"],
        "criteria": [
            "로그라인이 한 줄로 후킹하는가?",
            "3막 구조가 명확한가?",
            "주인공의 변화 곡선이 보이는가?",
            "1편 1사이다가 매 아크에 있는가?",
            "시즌 엔딩 훅이 있는가?",
            "장르 이탈 없이 일관적인가?",
        ],
    },
    "review_outline": {
        "name": "아웃라인 리뷰",
        "reviews": ["planning/outline.md"],
        "criteria": [
            "매 화에 사이다가 있는가?",
            "클리프행어 유형이 다양한가? (5유형 중 3개 이상)",
            "착각물 발동 빈도가 적절한가?",
            "골든타임 3화 규칙 충족하는가?",
            "체인드 에피소드 구조인가? (독립+연결)",
            "긴장도 곡선이 아크별로 상승하는가?",
        ],
    },
    "review_driven": {
        "name": "캐릭터+이벤트 드리븐 리뷰",
        "reviews": ["planning/character_driven.md", "planning/event_driven.md"],
        "criteria": [
            "변화 곡선의 전환점이 명확한가?",
            "관계 역학에 갈등이 있는가?",
            "사건 체인의 인과관계가 논리적인가?",
            "반전 지점에 복선이 있는가?",
            "긴장도가 단조롭지 않은가?",
        ],
    },
    "review_world": {
        "name": "세계관 리뷰",
        "reviews": ["canon/world.md"],
        "criteria": [
            "세계 규칙이 일관적인가?",
            "경제가 구체적인가? (화폐/시세/임금)",
            "시스템 메시지 톤이 일관적인가?",
            "격리 등급 체계가 게임화되어 있는가?",
            "독자가 5분 안에 이해할 수 있는가?",
            "AI 할루시네이션 위험이 낮은 설정인가?",
        ],
    },
}


def get_review_context(review_type: str, project: str) -> dict:
    """Get review criteria and instructions for a planning stage review.

    Returns template for the reviewer (BW-Editor) to fill.
    """
    spec = REVIEW_CRITERIA.get(review_type)
    if not spec:
        return {"error": f"Unknown review type: {review_type}. Available: {list(REVIEW_CRITERIA.keys())}"}

    config = get_project_config(project)

    return {
        "skill": "planning_review",
        "review_type": review_type,
        "review_name": spec["name"],
        "project": project,
        "instructions": f"'{spec['name']}'을 수행하세요. "
        "아래 파일들을 읽고, criteria 체크리스트를 하나씩 평가하세요. "
        "PASS / PASS_WITH_FIXES / FAIL 판정. "
        "findings는 severity (CRITICAL/MAJOR/MINOR) + 구체적 근거 + 수정 방향. "
        "직접 재작성하지 마세요. 피드백만.",
        "files_to_review": spec["reviews"],
        "criteria": spec["criteria"],
        "output_template": {
            "verdict": "PASS | PASS_WITH_FIXES | FAIL",
            "findings": [
                {
                    "severity": "CRITICAL | MAJOR | MINOR",
                    "category": "에이전트가 채울 것",
                    "problem": "에이전트가 채울 것",
                    "evidence": "에이전트가 채울 것: 파일에서 인용",
                    "fix_direction": "에이전트가 채울 것",
                }
            ],
            "preserve": ["에이전트가 채울 것: 잘 된 부분, 수정하면 안 되는 것"],
            "review_round": 1,
        },
        "design_principles": "planning/design_principles.md를 상위 기준으로 사용",
        "project_style": config.get("style", {}),
        "max_rounds": 3,
    }
