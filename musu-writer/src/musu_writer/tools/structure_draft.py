"""Structure draft (1안) tool — loads references + provides context for agent."""

from __future__ import annotations

from ..references import load_project_ref_by_key, load_ref, load_wiki


def get_structure_context(chapter: str, project: str = "") -> dict:
    """Load all context needed for a structure-first draft (1안).

    Returns rules, gates, and project context for the agent to write
    a plain, structure-clear first draft.
    """
    # Skill references (writer)
    brief = load_ref("writer", "brief.md", project=project)
    structure_gate = load_ref("writer", "structure-reference-gate.md", project=project)
    event_link = load_ref("writer", "event-link-structure-gate.md", project=project)
    outline_val = load_ref("writer", "outline-validation.md", project=project)
    karpathy = load_ref("writer", "karpathy-execution-gate.md", project=project)
    scene_gate = load_ref("writer", "scene-gate.md", project=project)
    cwt = load_ref("writer", "cwt-scaffold-gate.md", project=project)
    user_anchor = load_ref("writer", "user-anchor-pass.md", project=project)

    # Project context
    char_table = load_project_ref_by_key("character_table", project)
    voice_bible = load_project_ref_by_key("ref_voice_bible", project)

    # Wiki
    palette = load_wiki("293_FALSE_DANE", project=project)

    abc_gate = {
        "A": "행동 순서 명확. 누가 뭘 했는지 안 보이면 실패.",
        "B": "기본 물건 중복 없음. 납 토큰과 뼈 점수는 다른 기능.",
        "C": "원인이 보임. 에드릭이 약탈하러 간 건 약탈할 게 있어서.",
        "D": "대사가 돈 얻기/비난 피하기/위험 차단 시도처럼 들림.",
        "E": "새 문장이 새 함축 사실/사회 규칙/혼동을 만들지 않음.",
    }

    return {
        "skill": "writer_1an",
        "chapter": chapter,
        "instructions": "1안 구조작가로서 초안을 작성하세요. "
        "스타일 전에 의미→행동→신체감각→결과. 쿨한 산문 금지. "
        "ABC 게이트를 통과해야 합니다. 사용자 닻은 변경 불가.",
        "abc_gate": abc_gate,
        "references": {
            "brief": brief[:4000] if brief else None,
            "structure_gate": structure_gate[:4000] if structure_gate else None,
            "scene_gate": scene_gate[:3000] if scene_gate else None,
            "karpathy_gate": karpathy[:3000] if karpathy else None,
            "user_anchor_pass": user_anchor[:2000] if user_anchor else None,
        },
        "project_context": {
            "character_table": char_table[:3000] if char_table else None,
            "voice_bible": voice_bible[:3000] if voice_bible else None,
            "sentence_palette": palette[:3000] if palette else None,
        },
        "hard_failures": [
            "ABC 게이트 실패 (누가 했는지 모름)",
            "중학교 산문 (일반화, 가짜 깊이, 멋진 라인)",
            "1차 초안에 장식 금언",
            "배틀 시작에 시대 설명 강연",
            "강한 라인을 정돈된 라인으로 교체",
            "캐릭터가 관찰 리포트 말하기",
            "에드릭이 살아남음으로만 끝내기",
        ],
    }
