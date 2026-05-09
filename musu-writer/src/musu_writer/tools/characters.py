"""Character design tool — loads references + provides template for agent."""

from __future__ import annotations

from ..references import load_project_ref_by_key, load_ref


def get_character_context(chapter: str, project: str = "false-dane") -> dict:
    """Load all context needed for character design.

    Returns structured packet with:
    - character_card_gate: rules for character cards
    - existing_characters: current character table + voice bible
    - template: empty character card template
    """
    # Skill reference
    card_gate = load_ref("character", "character-card-gate.md", project=project)

    # Project context
    char_table = load_project_ref_by_key("character_table", project)
    voice_bible = load_project_ref_by_key("voice_bible", project)
    visual_bible = load_project_ref_by_key("visual_bible", project)
    cast_lock = load_project_ref_by_key("cast_lock", project)

    card_template = {
        "name": "",
        "title_or_job": "",
        "scene_job": "에이전트가 채울 것: 이 장면에서 뭘 하는 중인가",
        "protected_asset": "에이전트가 채울 것: 오늘 뭘 보호하나 (돈/시간/얼굴/안전/일)",
        "first_glance_detail": "에이전트가 채울 것: 첫눈에 보이는 것 하나",
        "close_up_detail": "에이전트가 채울 것: 가까울 때만 보이는 세부",
        "body_habit_under_stress": "에이전트가 채울 것: 스트레스 아래 신체 습관",
        "speech_to_eadric": "에이전트가 채울 것: 에드릭에게 하는 말투",
        "speech_to_superior": "에이전트가 채울 것: 상급자에게 하는 말투",
        "speech_to_inferior": "에이전트가 채울 것: 하급자에게 하는 말투",
        "wants_today": "",
        "fears_today": "",
        "wont_say": "",
        "eadric_misreads_as": "",
        "failure_mode": "에이전트가 채울 것: 이 캐릭터만의 실패 방식",
        "trace_left": "에이전트가 채울 것: 장면 후 남기는 흔적",
        "recognition_path": "에이전트가 채울 것: 다음 등장에서 독자가 인정할 수 있는 특징",
    }

    return {
        "skill": "character",
        "chapter": chapter,
        "instructions": "아래 character_card_gate 규칙을 읽고, 이 장에 등장하는 캐릭터마다 "
        "card_template을 채우세요. 부역 캐릭터도 자산 보호 + 실패 모드가 있어야 합니다. "
        "설명만 전달하는 캐릭터는 만들지 마세요.",
        "character_card_gate": card_gate,
        "existing_characters": {
            "character_table": char_table[:4000] if char_table else None,
            "voice_bible": voice_bible[:4000] if voice_bible else None,
            "visual_bible": visual_bible[:3000] if visual_bible else None,
            "cast_lock": cast_lock[:2000] if cast_lock else None,
        },
        "card_template": card_template,
    }
