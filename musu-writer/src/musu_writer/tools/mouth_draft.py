"""Mouth draft (2안) tool — loads references + provides context for agent."""

from __future__ import annotations

from ..references import load_project_ref_by_key, load_ref, load_wiki


def get_mouth_context(chapter: str, draft_path: str = "", project: str = "") -> dict:
    """Load all context needed for a mouth/dialogue pass (2안).

    Returns dialogue hardening rules, mouthfeel references, AI-tell gate,
    and prose polish guides for the agent to finalize lines.
    """
    # Skill references (mouth/second-drafter)
    dialogue_hardening = load_ref("mouth", "dialogue-reference-hardening.md", project=project)
    ref_mouth = load_ref("mouth", "reference-mouth-study.md", project=project)
    dialogue_mouth = load_ref("mouth", "dialogue-mouth.md", project=project)
    prose_polish = load_ref("mouth", "prose-polish.md", project=project)
    negative_patterns = load_ref("mouth", "sentence-negative-pattern-gate.md", project=project)
    ai_tell_gate = load_ref("mouth", "korean-ai-tell-gate.md", project=project)
    second_draft_gate = load_ref("mouth", "second-draft-gate.md", project=project)
    user_anchor = load_ref("mouth", "user-anchor-pass.md", project=project)

    # Cross-skill
    karpathy = load_ref("writer", "karpathy-execution-gate.md", project=project)

    # Project context
    mouthfeel_research = load_project_ref_by_key("dialogue_research", project)
    voice_bible = load_project_ref_by_key("ref_voice_bible", project)

    # Wiki
    palette = load_wiki("293_FALSE_DANE", project=project)

    return {
        "skill": "mouth_2an",
        "chapter": chapter,
        "draft_path": draft_path,
        "instructions": "2안 말맛작가로서 최종 라인을 다듬으세요. "
        "사건 척추 변경 금지. 리듬 모양 보존. "
        "말맛 = 캐릭터 목소리 + 어법 + 사회적 거래. 장식 스타일이 아님. "
        "AI-tell 패턴(번역투, 보고서 구조, 균일 리듬)을 잡고 로컬 수리.",
        "workflow": [
            "1. Karpathy 게이트 (대상·정확 문제·건드리지 말 것·검증)",
            "2. 사건 척추 동결",
            "3. 대사 패스 (설명→밀기/거래/조롱/거절/명령)",
            "4. 산문 패스 (코드 금언→행동/신체 비용/사회 결과)",
            "5. AI-tell 패스 (번역투/보고서/균일 리듬 잡기)",
            "6. 이름 패스 (기능 레이블 이름 제거)",
            "7. 참고문헌 패스 (ASOIAF/장길산 역학 확인)",
            "8. 최종 카덴스 검사",
        ],
        "references": {
            "dialogue_hardening": dialogue_hardening[:4000] if dialogue_hardening else None,
            "dialogue_mouth": dialogue_mouth[:3000] if dialogue_mouth else None,
            "prose_polish": prose_polish[:3000] if prose_polish else None,
            "ai_tell_gate": ai_tell_gate[:3000] if ai_tell_gate else None,
            "negative_patterns": negative_patterns[:3000] if negative_patterns else None,
            "karpathy_gate": karpathy[:2000] if karpathy else None,
            "user_anchor_pass": user_anchor[:2000] if user_anchor else None,
        },
        "project_context": {
            "mouthfeel_research": mouthfeel_research[:3000] if mouthfeel_research else None,
            "voice_bible": voice_bible[:3000] if voice_bible else None,
            "sentence_palette": palette[:2000] if palette else None,
        },
        "hard_failures": [
            "멋진 소리만 하고 아무것도 안 바뀐 라인",
            "압축하다가 코드화",
            "사용자 대사를 안전 말로 교체",
            "모든 캐릭터가 에드릭처럼 말하기",
            "대사 = 브리핑",
            "비유가 행동 숨김",
            "방/냄새/침묵이 사람 대신 행동 수행",
            "요약어/압축어 사용",
        ],
    }
