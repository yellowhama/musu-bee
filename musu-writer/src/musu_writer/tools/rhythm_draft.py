"""Rhythm draft (3안) tool — loads references + provides context for agent."""

from __future__ import annotations

from ..references import load_project_ref, load_project_ref_by_key, load_ref, load_wiki


def get_rhythm_context(chapter: str, draft_path: str = "", project: str = "") -> dict:
    """Load all context needed for a rhythm pass (3안).

    Returns scene tempo targets, rhythm patterns, and negative patterns
    for the agent to adjust paragraph breath and pacing.
    """
    # Skill references (rhythm)
    rhythm_gate = load_ref("rhythm", "rhythm-gate.md", project=project)
    ref_rhythm = load_ref("rhythm", "reference-rhythm-study.md", project=project)
    negative = load_ref("rhythm", "rhythm-negative-pattern-gate.md", project=project)

    # Cross-skill references
    karpathy = load_ref("writer", "karpathy-execution-gate.md", project=project)

    # Project context
    rhythm_comparison = load_project_ref(
        "reviews/CHAPTER_001_005_SENTENCE_RHYTHM_REFERENCE_COMPARISON_2026_04_29.md",
        project=project,
    )

    # Wiki
    palette = load_wiki("293_FALSE_DANE", project=project)
    prose_comparison = load_wiki("296_FALSE_DANE", project=project)

    scene_tempo_targets = {
        "battle": "짧은 라인 (충격/명령/통증). 충격 전후 한 문장만 길게.",
        "market_guild": "약간 더 긴 문장 (일/돈/냄새/손). 깨끗한 탁구 금지.",
        "authority": "물건 배치로 압력. 권력자 라인은 짧아도 무거움.",
        "con_bluff": "파동 리듬. 에드릭 역할팔기 때 말 길 가능. 마크 신체로 자르기.",
        "pursuit": "관찰 리듬. 짧은 위치확인 + 환경 문장 교대.",
        "aftermath": "불규칙 호흡 복귀. 죽음 움직이는 중 농담 금지.",
    }

    return {
        "skill": "rhythm_3an",
        "chapter": chapter,
        "draft_path": draft_path,
        "instructions": "3안 호흡작가로서 리듬을 조정하세요. "
        "플롯/캐릭터 의도 변경 금지. 사용자 닻 변경 금지. "
        "각 장면에 장면 타입을 매핑하고, 해당 템포 목표에 맞게 조정.",
        "scene_tempo_targets": scene_tempo_targets,
        "references": {
            "rhythm_gate": rhythm_gate[:4000] if rhythm_gate else None,
            "reference_rhythm_study": ref_rhythm[:3000] if ref_rhythm else None,
            "negative_patterns": negative[:3000] if negative else None,
            "karpathy_gate": karpathy[:2000] if karpathy else None,
        },
        "project_context": {
            "rhythm_comparison": rhythm_comparison[:3000] if rhythm_comparison else None,
            "sentence_palette": palette[:2000] if palette else None,
            "prose_comparison": prose_comparison[:2000] if prose_comparison else None,
        },
        "practical_moves": [
            "인접 짧은 설명 문장 병합 (한 호흡)",
            "충격/발견/방해 순간에 한 문장 끊기",
            "빠른 대사 사이 신체 비트 삽입",
            "작업 세부 먼저 들어가기 (동전/외투/말/칼/줄)",
            "반복 단락 끝 펀치라인 제거",
            "낮은 세계 장면에 어수선함 (일하는 사람들)",
            "관청 장면에 고요함 (물건 배치/눈 피하기)",
        ],
        "hard_failures": [
            "모든 문장 길게 또는 짧게 만들기",
            "리듬 = 쉼표 배치라고 오해",
            "명확 행동을 문학 흐름으로 교체",
            "사용자 생생한 라인을 평탄화",
            "모든 장면에서 같은 클리핑 펀치",
            "-었다/-였다 10개 문장 같은 닫힘",
        ],
    }
