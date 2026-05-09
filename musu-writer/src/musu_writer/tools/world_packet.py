"""World/ensemble packet tool — loads references + provides template for agent."""

from __future__ import annotations

from ..references import load_project_ref_by_key, load_ref


def get_world_context(chapter: str, project: str = "false-dane") -> dict:
    """Load all context needed for world/ensemble packet creation.

    Returns structured packet with:
    - decomposition_gate: rules for world packet creation
    - project_context: act spine, character table, cast lock
    - template: empty world packet sections
    """
    # Skill references
    decomp_gate = load_ref("worldbuilder", "world-ensemble-decomposition-gate.md", project=project)
    textbook = load_ref("worldbuilder", "textbook-method.md", project=project)

    # Project context
    act_spine = load_project_ref_by_key("act_spine", project)
    char_table = load_project_ref_by_key("character_table", project)
    cast_lock = load_project_ref_by_key("cast_lock", project)
    ensemble_spec = load_project_ref_by_key("ensemble_spec", project)

    template = {
        "chapter_job": {
            "chapter": chapter,
            "prior_state": "에이전트가 채울 것",
            "required_changes": "에이전트가 채울 것",
            "user_anchors": [],
        },
        "place_already_working": {
            "what_earns_money_here": "",
            "who_opens_and_closes": "",
            "who_waits": "",
            "who_moves_goods": "",
            "who_controls_access": "",
            "who_can_punish_without_trial": "",
        },
        "supporting_actors": [
            {
                "name": "",
                "doing_now": "",
                "wants": "",
                "fears": "",
                "wont_say": "",
                "eadric_misreads": "",
                "trace_left": "",
                "visible_detail": "",
                "protecting_today": "",
            }
        ],
        "offscreen_faction_motion": [
            {
                "faction": "",
                "moving_or_hiding_or_counting": "",
                "trace_into_this_chapter": "",
                "low_person_forced_to_adjust": "",
            }
        ],
        "objects_and_procedures": [
            {
                "object": "",
                "function": "에이전트가 채울 것: 인증/놀라게/거짓말 가능/경로 바꾸기/빚 만들기 등",
            }
        ],
        "eadric_knowledge_split": {
            "sees_correctly": "",
            "misreads_as_money_or_danger": "",
            "reader_knows_but_eadric_doesnt": "",
            "nobody_knows_yet": "",
        },
        "scene_pressure_inserts": [
            "에이전트가 채울 것: 3~7개 구체적 방식으로 세계 압력 삽입"
        ],
        "character_intro_debt": [
            {
                "name": "",
                "recognition_path": "",
                "first_action_proves": "",
            }
        ],
    }

    return {
        "skill": "worldbuilder",
        "chapter": chapter,
        "instructions": "아래 decomposition_gate 규칙을 읽고, template의 모든 섹션을 채우세요. "
        "에드릭 POV에만 갇히지 말고 세계가 자체적으로 돌아가는 장소를 만드세요. "
        "최소 에드릭 외 3명이 원하는 것이 있어야 하고, 최소 1개 오프스크린 파벌 흔적이 필요합니다.",
        "decomposition_gate": decomp_gate,
        "textbook_method": textbook,
        "project_context": {
            "act_spine": act_spine[:4000] if act_spine else None,
            "character_table": char_table[:3000] if char_table else None,
            "cast_lock": cast_lock[:2000] if cast_lock else None,
            "ensemble_spec": ensemble_spec[:3000] if ensemble_spec else None,
        },
        "template": template,
    }
