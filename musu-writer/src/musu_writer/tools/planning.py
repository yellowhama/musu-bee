"""Project planning tools — 8 stages from direction to worldbuilding.

Each tool provides templates + rules + context for the agent to fill.
Results are saved to the project's planning/ directory.
"""

from __future__ import annotations

from ..references import load_project_ref_by_key
from ..project_config import get_project_config, get_project_dir


def _base_context(project: str, step: str, instructions: str) -> dict:
    config = get_project_config(project)
    return {
        "skill": f"planning_{step}",
        "project": project,
        "project_config": config.get("project", {}),
        "style": config.get("style", {}),
        "instructions": instructions,
        "save_dir": str(get_project_dir(project) / "planning"),
    }


def get_direction_context(project: str) -> dict:
    """Stage 1: 장르/시장/타겟 독자 결정."""
    ctx = _base_context(project, "direction",
        "프로젝트의 방향을 결정하세요. 시장 리서치 결과를 참고해서 "
        "장르, 서브장르, 타겟 시장, 타겟 독자를 확정하세요. "
        "결과를 planning/direction.md에 저장하세요.")
    ctx["template"] = {
        "genre": "에이전트가 채울 것: 메인 장르",
        "subgenre": "에이전트가 채울 것: 서브장르 (예: 헌터물+회귀+시스템)",
        "target_market": "에이전트가 채울 것: 1차 시장 (한국/미국/일본)",
        "target_platform": "에이전트가 채울 것: 발행 플랫폼",
        "target_reader": {
            "age": "", "gender": "", "reading_habits": "",
            "what_they_want": "에이전트가 채울 것: 독자가 이 장르에서 원하는 것",
            "what_they_hate": "에이전트가 채울 것: 독자가 싫어하는 것",
        },
        "comparable_works": "에이전트가 채울 것: 비교 작품 3~5개 (왜 히트했는지)",
        "our_differentiator": "에이전트가 채울 것: 우리 작품만의 차별점",
    }
    return ctx


def get_theme_context(project: str) -> dict:
    """Stage 2: 주제/소재/핵심 갈등."""
    ctx = _base_context(project, "theme",
        "프로젝트의 주제와 소재를 결정하세요. "
        "direction.md를 읽고 장르에 맞는 주제를 잡으세요. "
        "결과를 planning/theme.md에 저장하세요.")
    ctx["template"] = {
        "theme": "에이전트가 채울 것: 핵심 주제 (한 문장)",
        "premise": "에이전트가 채울 것: 전제 (What if...?)",
        "core_conflict": "에이전트가 채울 것: 핵심 갈등",
        "stakes": "에이전트가 채울 것: 걸린 것 (주인공이 잃을 수 있는 것)",
        "tone": "에이전트가 채울 것: 톤 (코미디? 다크? 사이다?)",
        "hook": "에이전트가 채울 것: 첫 3화 후킹 (독자를 잡는 장치)",
    }
    ctx["depends_on"] = ["planning/direction.md"]
    return ctx


def get_character_sheets_context(project: str) -> dict:
    """Stage 3: 캐릭터 시트."""
    ctx = _base_context(project, "character_sheets",
        "주인공 + 핵심 인물(3~5명)의 캐릭터 시트를 작성하세요. "
        "theme.md와 direction.md를 읽고, 장르/주제에 맞는 캐릭터를 설계하세요. "
        "결과를 canon/protagonist.md + canon/characters/에 저장하세요.")
    ctx["character_template"] = {
        "name": "",
        "age": "",
        "role": "에이전트가 채울 것: 이야기에서의 역할",
        "occupation": "에이전트가 채울 것: 직업/신분",
        "desire": "에이전트가 채울 것: 핵심 욕망 (뭘 원하는가)",
        "flaw": "에이전트가 채울 것: 핵심 결함",
        "lie": "에이전트가 채울 것: 자기가 믿는 거짓말",
        "ghost": "에이전트가 채울 것: 과거의 상처",
        "voice": "에이전트가 채울 것: 말투/어법 (예시 대사 3개)",
        "failure_mode": "에이전트가 채울 것: 이 캐릭터만의 실패 방식",
        "arc": "에이전트가 채울 것: 변화 방향 (시작 → 끝)",
        "visual": "에이전트가 채울 것: 첫눈에 보이는 특징",
    }
    ctx["depends_on"] = ["planning/direction.md", "planning/theme.md"]
    return ctx


def get_synopsis_context(project: str) -> dict:
    """Stage 4: 시놉시스."""
    ctx = _base_context(project, "synopsis",
        "전체 이야기를 1~2페이지로 요약하세요. "
        "시작 → 전개 → 위기 → 절정 → 결말. "
        "캐릭터의 변화 곡선이 보여야 합니다. "
        "결과를 planning/synopsis.md에 저장하세요.")
    ctx["template"] = {
        "logline": "에이전트가 채울 것: 한 줄 요약",
        "act_1": "에이전트가 채울 것: 설정 + 촉발 사건",
        "act_2_rising": "에이전트가 채울 것: 상승 + 시련",
        "act_2_midpoint": "에이전트가 채울 것: 중간 반전",
        "act_2_falling": "에이전트가 채울 것: 하강 + 최대 위기",
        "act_3": "에이전트가 채울 것: 절정 + 해결",
        "season_hook": "에이전트가 채울 것: 시즌 엔딩 훅 (다음 시즌 떡밥)",
    }
    ctx["depends_on"] = ["planning/direction.md", "planning/theme.md", "canon/protagonist.md"]
    return ctx


def get_outline_context(project: str) -> dict:
    """Stage 5: 디테일 아웃라인."""
    ctx = _base_context(project, "outline",
        "시놉시스를 화별 아웃라인으로 확장하세요. "
        "각 화마다: 핵심 사건, 등장인물, 상태 변화, 다음화 훅. "
        "결과를 planning/outline.md에 저장하세요.")
    ctx["chapter_template"] = {
        "chapter_num": 0,
        "title": "",
        "core_event": "에이전트가 채울 것: 이 화의 핵심 사건",
        "characters_present": [],
        "want": "에이전트가 채울 것: 주인공이 이 화에서 원하는 것",
        "conflict": "에이전트가 채울 것: 갈등/장애물",
        "change": "에이전트가 채울 것: 화 끝에 바뀌는 것",
        "hook": "에이전트가 채울 것: 다음화를 누르게 만드는 것",
    }
    ctx["depends_on"] = ["planning/synopsis.md", "canon/protagonist.md"]
    return ctx


def get_character_driven_context(project: str) -> dict:
    """Stage 6: 캐릭터 드리븐 설계."""
    ctx = _base_context(project, "character_driven",
        "캐릭터 중심 서사를 설계하세요. "
        "각 핵심 인물의 변화 곡선, 관계 역학, 내면 갈등을 구체화하세요. "
        "결과를 planning/character_driven.md에 저장하세요.")
    ctx["template"] = {
        "protagonist_arc": {
            "start": "에이전트가 채울 것: 1화의 주인공 상태",
            "midpoint": "에이전트가 채울 것: 중간 지점 변화",
            "end": "에이전트가 채울 것: 시즌 끝 상태",
            "key_decisions": "에이전트가 채울 것: 캐릭터를 바꾸는 결정 3~5개",
        },
        "relationship_dynamics": [
            {
                "pair": "에이전트가 채울 것: 캐릭터 A ↔ B",
                "initial": "에이전트가 채울 것: 초기 관계",
                "tension": "에이전트가 채울 것: 갈등 원인",
                "evolution": "에이전트가 채울 것: 관계 변화",
            }
        ],
        "internal_conflicts": "에이전트가 채울 것: 주인공의 내면 갈등 (욕망 vs 결함)",
    }
    ctx["depends_on"] = ["planning/outline.md", "canon/protagonist.md"]
    return ctx


def get_event_driven_context(project: str) -> dict:
    """Stage 7: 이벤트 드리븐 설계."""
    ctx = _base_context(project, "event_driven",
        "사건 중심 서사를 설계하세요. "
        "사건 체인, 반전 지점, 긴장도 곡선을 구체화하세요. "
        "결과를 planning/event_driven.md에 저장하세요.")
    ctx["template"] = {
        "event_chain": [
            {
                "event": "에이전트가 채울 것",
                "trigger": "에이전트가 채울 것: 이 사건이 일어나는 원인",
                "consequence": "에이전트가 채울 것: 결과",
                "chapter": "에이전트가 채울 것: 몇 화",
            }
        ],
        "twists": [
            {
                "twist": "에이전트가 채울 것",
                "foreshadowing": "에이전트가 채울 것: 복선 (몇 화에서)",
                "reveal": "에이전트가 채울 것: 공개 (몇 화에서)",
            }
        ],
        "tension_curve": "에이전트가 채울 것: 화별 긴장도 (1~10) 대략적 그래프",
    }
    ctx["depends_on"] = ["planning/outline.md", "planning/character_driven.md"]
    return ctx


def get_worldbuilding_context(project: str) -> dict:
    """Stage 8: 세계관 확정."""
    ctx = _base_context(project, "worldbuilding",
        "세계관을 확정하세요. 규칙, 경제, 사회, 마법/시스템을 구체화하세요. "
        "이전 단계(방향, 주제, 캐릭터, 아웃라인)와 일관성 유지. "
        "결과를 canon/world.md에 저장하세요.")
    ctx["template"] = {
        "rules": "에이전트가 채울 것: 세계의 규칙 (마법/시스템/기술)",
        "economy": "에이전트가 채울 것: 경제 (화폐, 시세, 생계)",
        "society": "에이전트가 채울 것: 사회 구조 (계급, 권력, 법)",
        "geography": "에이전트가 채울 것: 주요 장소",
        "history": "에이전트가 채울 것: 핵심 역사 (현재에 영향 주는 것만)",
        "daily_life": "에이전트가 채울 것: 일반인의 일상 (세계 밀도용)",
        "constraints": "에이전트가 채울 것: 세계의 제약 (뭐가 불가능한지)",
    }
    ctx["depends_on"] = [
        "planning/direction.md", "planning/theme.md",
        "planning/outline.md", "canon/protagonist.md",
    ]
    return ctx


def get_chapter_beats_context(project: str, chapter: str) -> dict:
    """Stage 9: 화별 비트 설계 (챕터 세션에서 사용)."""
    ctx = _base_context(project, "chapter_beats",
        f"{chapter} 비트를 설계하세요. "
        "outline.md에서 이 화의 아웃라인을 읽고, "
        "장면별 비트(행동/대사/감정 변화)를 구체적으로 쪼개세요. "
        f"결과를 planning/chapter_beats/{chapter}_beats.md에 저장하세요.")
    ctx["chapter"] = chapter
    ctx["beat_template"] = {
        "beat_num": 0,
        "scene": "에이전트가 채울 것: 장소 + 시간",
        "characters": [],
        "action": "에이전트가 채울 것: 뭐가 일어나는지",
        "dialogue_hint": "에이전트가 채울 것: 핵심 대사 방향",
        "emotional_shift": "에이전트가 채울 것: 감정 변화",
        "props": "에이전트가 채울 것: 이 장면에서 역할하는 소품",
        "money": "에이전트가 채울 것: 돈/경제 관련 (있으면)",
    }
    ctx["depends_on"] = [
        "planning/outline.md", "planning/character_driven.md",
        "planning/event_driven.md", "canon/world.md",
    ]
    return ctx
