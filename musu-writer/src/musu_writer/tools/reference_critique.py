"""Reference critique tool — loads ASOIAF + 장길산 comparison framework."""

from __future__ import annotations

from ..references import load_project_ref, load_ref


def get_critique_context(chapter: str, draft_path: str = "", project: str = "") -> dict:
    """Load all context needed for reference-based critique.

    Returns comparison framework for ASOIAF (vertical pressure)
    and 장길산 (horizontal pressure).
    """
    # Skill references
    critique_gate = load_ref("critic", "reference-critique-gate.md", project=project)
    finding_taxonomy = load_ref("critic", "finding-taxonomy.md", project=project)
    scoreless_routing = load_ref("critic", "scoreless-routing-critique-gate.md", project=project)

    # Cross-skill
    karpathy = load_ref("writer", "karpathy-execution-gate.md", project=project)

    # Project context
    voice_transfer = load_project_ref(
        "research/JANG_ASOIAF_CHARACTER_VOICE_TRANSFER_REPORT.md", project=project
    )
    comparative = load_project_ref(
        "research/REFERENCE_COMPARATIVE_QUALITATIVE_REPORT.md", project=project
    )

    output_template = {
        "verdict": "PASS | PASS_WITH_FIXES | FAIL",
        "critical_failures": [
            {
                "severity": "",
                "assigned_to": "1안 | 2안 | 3안 | prepro",
                "problem": "",
                "evidence": "원고 인용",
                "reference_mechanic": "어떤 역학이 참고문헌에서는 작동하나",
                "why_problem": "",
                "fix_direction": "",
                "do_not_touch": "",
            }
        ],
        "asoiaf_comparison": {
            "rank_before_words": "",
            "superior_economy": "",
            "subordinate_adjustment": "",
            "political_object_cost": "",
            "consequence_through_office": "",
        },
        "jangilsan_comparison": {
            "everyone_has_work": "",
            "info_through_trade": "",
            "place_lives_without_protagonist": "",
            "people_work_while_talking": "",
            "refusal_visible": "",
        },
        "routing": {
            "prepro_world_ensemble": [],
            "writer_1an": [],
            "mouth_2an": [],
            "rhythm_3an": [],
        },
        "do_not_fix": [],
        "next_priority": [],
    }

    return {
        "skill": "reference_critic",
        "chapter": chapter,
        "draft_path": draft_path,
        "instructions": "비평가로서 원고를 ASOIAF + 장길산과 비교하세요. "
        "재쓰기 금지. 비평만. output_template을 채우세요. "
        "ASOIAF = 세로 압력 (계급/관직/침묵/결과). "
        "장길산 = 가로 압력 (군중/거래/빚/신체/일).",
        "references": {
            "critique_gate": critique_gate[:4000] if critique_gate else None,
            "finding_taxonomy": finding_taxonomy[:3000] if finding_taxonomy else None,
            "scoreless_routing": scoreless_routing[:3000] if scoreless_routing else None,
            "karpathy_gate": karpathy[:2000] if karpathy else None,
        },
        "project_context": {
            "voice_transfer": voice_transfer[:3000] if voice_transfer else None,
            "comparative_report": comparative[:3000] if comparative else None,
        },
        "output_template": output_template,
        "hard_failures": [
            "모호한 칭찬 또는 비판",
            "비교 기준 없는 점수",
            "추상어로 덮기 (분위기, 상징, 다크함)",
            "직접 재쓰기",
            "참고문헌 이름만 부르기 (역학 설명 없음)",
        ],
    }
