"""Continuity audit tool — loads references + provides template for agent."""

from __future__ import annotations

from ..references import load_project_ref, load_project_ref_by_key, load_ref


def get_continuity_context(chapter: str, project: str = "false-dane") -> dict:
    """Load all context needed for a continuity audit.

    Returns structured packet with:
    - knowledge_tracker_gate: the rules for knowledge layer separation
    - canon_files: available canon
    - planning_context: character maps, faction trackers
    - template: the empty template the agent should fill
    """
    # Skill reference
    knowledge_gate = load_ref("continuity", "knowledge-evidence-tracker-gate.md", project=project)

    # Project context
    char_story_map = load_project_ref_by_key("char_story_map", project)
    faction_tracker = load_project_ref("state/FACTION_ARC_TRACKER_BOARD.md", project=project)
    progress = load_project_ref("state/progress.md", project=project)

    template = {
        "knowledge_layers": {
            "actual_truth": "에이전트가 채울 것: 이 장에서 실제 진실",
            "eadric_knows": "에이전트가 채울 것: 에드릭이 아는 것",
            "eadric_assumes": "에이전트가 채울 것: 에드릭이 잘못 가정하는 것",
            "reader_knows": "에이전트가 채울 것: 독자가 아는 것",
            "allies_know": "에이전트가 채울 것: 동맹이 아는 것",
            "enemies_know": "에이전트가 채울 것: 적이 아는 것",
            "street_rumor": "에이전트가 채울 것: 거리 소문",
            "record_trail": "에이전트가 채울 것: 기록 흔적 (장부, 표식, 인장)",
        },
        "evidence_trail": [
            {
                "object": "에이전트가 채울 것",
                "current_holder": "",
                "last_holder": "",
                "witnesses": [],
                "can_prove": "",
                "false_conclusion": "",
                "must_not_reveal": "",
                "next_pressure": "",
            }
        ],
        "causality_check": {
            "what_forced_this_chapter": "",
            "what_changed": "",
            "who_knows_more_now": "",
            "who_has_wrong_info_now": "",
            "objects_moved": [],
            "why_next_must_happen": "",
        },
        "forbidden_reveals": [
            "Orm plot — 아직 안 나옴",
            "왕 암살 답 — 아직 안 나옴",
            "표시 체계 설명 — 아직 안 나옴",
        ],
    }

    return {
        "skill": "continuity",
        "chapter": chapter,
        "instructions": "아래 knowledge_tracker_gate 규칙을 읽고, template의 각 항목을 채우세요. "
        "지식 레이어를 절대 병합하지 마세요. 증거 경로마다 소유자·증인을 추적하세요.",
        "knowledge_tracker_gate": knowledge_gate,
        "project_context": {
            "character_story_map": char_story_map[:4000] if char_story_map else None,
            "faction_tracker": faction_tracker[:3000] if faction_tracker else None,
            "progress": progress[:2000] if progress else None,
        },
        "template": template,
    }
