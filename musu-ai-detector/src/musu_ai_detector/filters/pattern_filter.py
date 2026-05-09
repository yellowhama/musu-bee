"""Korean AI-tell pattern detection filter.

Implements regex/keyword-based detection of 40+ AI writing patterns
from the im-not-ai taxonomy (v1.5.1). Returns span-level findings.

Categories:
A. 번역투 (Translation-ese)
B. 영어 인용·용어 과다
C. 구조적 AI 패턴
D. AI 특유 관용구
E. 리듬·문장 길이 균일성
F. 과도한 수식·중복
G. 과도한 Hedging
H. 접속사 남발
I. 형식명사·의존명사 과다
J. 시각 장식 남용
"""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass, field

from ..models import FilterResult, Span


@dataclass
class PatternMatch:
    category: str
    label: str
    severity: str  # S1, S2, S3
    text: str
    start: int
    end: int
    reason: str
    suggested_fix: str = ""


# ── A. 번역투 ──────────────────────────────────────────────

A_PATTERNS = [
    ("A-1", "번역투: ~에 대해 남발", "S1",
     r"에\s*대해(?:서)?|에\s*대하여", "목적격 조사로 직결"),
    ("A-2", "번역투: ~를 통해 남발", "S1",
     r"(?:을|를)\s*통해(?:서)?|(?:을|를)\s*통하여", "~로, ~해서로 분산"),
    ("A-3", "번역투: ~에 있어서", "S1",
     r"에\s*있어서|(?:문제|상황|경우|측면|분야|점)에\s*있어", "~에서, ~을 볼 때"),
    ("A-7", "번역투: 가지고 있다", "S1",
     r"(?:을|를)\s*가지고\s*있", "형용사형으로 돌려 서술"),
    ("A-8", "번역투: 이중 피동", "S1",
     r"되어지[다는ㄴ고며]|되어진|지게\s*되[다었]", "단일 피동 또는 능동으로"),
    ("A-4", "번역투: ~라는 점에서", "S2",
     r"(?:다|라)는\s*점에서", "~라서, ~이므로"),
    ("A-5", "번역투: ~와 관련하여", "S2",
     r"(?:와|과)\s*관련(?:하여|된|해서)", "조사 직결"),
    ("A-6", "번역투: ~에 기반하여", "S2",
     r"에\s*기반(?:하여|해서|한)|(?:을|를)\s*바탕으로", "~로, ~을 보고"),
    ("A-9", "번역투: ~에 의해 피동", "S2",
     r"에\s*의해(?:서)?|에\s*의한", "행위자를 주어로"),
    ("A-10", "번역투: ~할 수 있다 남발", "S2",
     r"[가-힣]+[할일을]\s*수\s*있[다습]", "확정 서술로"),
    ("A-11", "번역투: ~을 위해 남발", "S2",
     r"(?:을|를)\s*위해(?:서)?", "~하도록"),
    ("A-12", "번역투: 만들어지다/이루어지다", "S2",
     r"만들어지[다었는]|이루어지[다었는]|이루어졌", "능동으로"),
    ("A-15", "번역투: 추상 주어+만능 동사", "S2",
     r"(?:의\s*등장은|의\s*출현은|의\s*도입은)\s*[가-힣]*(?:보여준다|제공한다|가져온다|시사한다)",
     "행위자를 주어로"),
]

# ── D. AI 특유 관용구 ──────────────────────────────────────

D_PATTERNS = [
    ("D-1", "AI 관용구: 종결·요약류", "S1",
     r"결론적으로|요약하면|종합하면|정리하자면|라고\s*할\s*수\s*있다|라고\s*볼\s*수\s*있다|라\s*하겠다|에\s*다름\s*아니다",
     "삭제 또는 구체 서술로"),
    ("D-2", "AI 관용구: 의의·중요성 과장", "S1",
     r"시사하는\s*바가\s*크다|주목할\s*만하다|간과할\s*수\s*없다|무시할\s*수\s*없다|지평을\s*연다|방점을\s*찍는|의미심장하다|그\s*의미가\s*적지\s*않",
     "삭제 또는 구체화"),
    ("D-3", "AI 관용구: 열거 도입", "S1",
     r"크게\s*(?:세|두|네|다섯)\s*가지로|다음과\s*같은\s*(?:특징|장점|이유)|다음과\s*같이\s*요약",
     "직접 서술로"),
    ("D-4", "AI 관용구: hype 어휘", "S1",
     r"혁신적인|획기적인|전례\s*없는|압도적(?:인)?|막강한|폭발적(?:인)?|파격적(?:인)?|대대적(?:인)?|가능성을\s*열어|새로운\s*장을\s*열|시대가\s*도래",
     "구체 근거로 대체"),
    ("D-6", "AI 관용구: 완결 공식형 결말", "S2",
     r"(?:해야|나아가야|나아갈)\s*할?\s*(?:때|시점|순간)입니다|때이다",
     "구체 동사 단언으로"),
    ("D-7", "AI 관용구: 변환 공식 X에서 Y로", "S2",
     r"[''][가-힣\s]+['']에서\s*[''][가-힣\s]+['']로|을\s*넘어\s*[''][가-힣\s]+['']로",
     "직접 단언으로"),
]

# ── C. 구조적 AI 패턴 ─────────────────────────────────────

C_PATTERNS = [
    ("C-1", "구조: 기계적 병렬 열거", "S1",
     r"첫째[,.]|둘째[,.]|셋째[,.]|넷째[,.]", "어휘 변주 또는 서술문으로"),
    ("C-5", "구조: 이모지 남발", "S1",
     r"[✅🚀💡⚠️📊🔥💪🎯🌟✨🤔💭📌🔑]", "전량 제거"),
    ("C-7", "구조: 먼저·반면·결국 3단 공식", "S2",
     r"^(?:먼저|우선),\s|^반면[,\s]|^결국[,\s]|^마지막으로[,\s]",
     "3개 중 2개 삭제"),
    ("C-9", "구조: 숫자 괄호 인덱싱", "S2",
     r"(?:^|\s)[1-5]\)\s", "서술문으로 녹이기"),
]

# ── F. 과도한 수식·중복 ───────────────────────────────────

F_PATTERNS = [
    ("F-1", "수식: 정도부사 중독", "S2",
     r"매우\s|정말\s|진짜로\s|대단히\s|극히\s|상당히\s", "대부분 삭제"),
    ("F-2", "수식: 동의어 이중 수식", "S2",
     r"중요하고\s*핵심적|새롭고\s*혁신적|지속적이고\s*꾸준한|효과적이고\s*효율적",
     "하나만 남김"),
    ("F-5", "수식: ~적 N 체인", "S2",
     r"(?:기술|구조|에이전트|시스템|경제|사회|문화|정치|전략|본질|근본)적(?:\s*(?:인|인\s)?\s*[가-힣]+)",
     "동사구로 해체"),
]

# ── G. 과도한 Hedging ─────────────────────────────────────

G_PATTERNS = [
    ("G-1", "완곡: 추측형 종결", "S2",
     r"(?:것으로|것이라고)\s*(?:보인다|판단된다|여겨진다|생각된다|추정된다)|인\s*듯하다",
     "단언할 수 있으면 단언"),
    ("G-2", "완곡: 이중 완곡", "S2",
     r"가능성이\s*있을\s*수\s*있|보여질\s*수\s*있", "하나만 남김"),
]

# ── H. 접속사 남발 ────────────────────────────────────────

H_PATTERNS = [
    ("H-1", "접속사: 문두 접속사 과다", "S2",
     r"^(?:또한|따라서|나아가|아울러|게다가|더욱이|한편)[,\s]",
     "70% 이상 제거"),
    ("H-3", "접속사: 이는~ 지시 반복", "S2",
     r"(?<![가-힣])이는\s|이\s*점에서\s|이\s*관점에서\s|이\s*말은\s", "앞 문장과 붙이기"),
    ("H-4", "접속사: 즉 남발", "S2",
     r"(?:^|\.\s*)즉[,\s]", "곧, 말하자면 등 변주"),
]

# ── I. 형식명사 과다 ──────────────────────────────────────

I_PATTERNS = [
    ("I-1", "형식명사: 것이다 종결", "S2",
     r"[가-힣]+[은는이가을를]\s*것이다|것입니다", "확정 서술로"),
    ("I-3", "형식명사: ~라는 것/뜻", "S2",
     r"(?:다|라)는\s*(?:것이다|뜻이다|뜻입니다|점이다)", "직접 종결로"),
    ("I-4", "형식명사: ~할 필요가 있다", "S2",
     r"[가-힣]+[할을]\s*필요가\s*있", "구체 주어+동사로"),
    ("I-5", "형식명사: ~이/가 필요하다", "S2",
     r"(?:혁신|변화|노력|개선|발전)이\s*필요하다", "누가 무엇을 해야 하는지"),
]

# ── J. 시각 장식 남용 ─────────────────────────────────────

J_PATTERNS = [
    ("J-1", "장식: 과도한 볼드", "S2",
     r"\*\*[가-힣A-Za-z0-9\s]{2,20}\*\*", "본문에서 볼드 거의 제거"),
    ("J-3", "장식: 대시 남용", "S3",
     r"\s—\s[가-힣]", "쉼표·괄호·별도 문장으로"),
]

ALL_PATTERNS = (
    A_PATTERNS + D_PATTERNS + C_PATTERNS + F_PATTERNS +
    G_PATTERNS + H_PATTERNS + I_PATTERNS + J_PATTERNS
)


def _find_patterns(text: str) -> list[PatternMatch]:
    """Run all regex patterns against text."""
    matches = []
    lines = text.split("\n")

    for cat_id, label, severity, pattern, fix in ALL_PATTERNS:
        # Some patterns are line-start anchored
        if pattern.startswith("^"):
            for i, line in enumerate(lines):
                for m in re.finditer(pattern, line, re.MULTILINE):
                    # Calculate absolute offset
                    line_start = sum(len(l) + 1 for l in lines[:i])
                    abs_start = line_start + m.start()
                    abs_end = line_start + m.end()
                    matches.append(PatternMatch(
                        category=cat_id, label=label, severity=severity,
                        text=m.group(), start=abs_start, end=abs_end,
                        reason=label, suggested_fix=fix,
                    ))
        else:
            for m in re.finditer(pattern, text):
                matches.append(PatternMatch(
                    category=cat_id, label=label, severity=severity,
                    text=m.group(), start=m.start(), end=m.end(),
                    reason=label, suggested_fix=fix,
                ))

    return matches


def _analyze_rhythm(text: str) -> list[PatternMatch]:
    """Detect rhythm uniformity (Category E)."""
    matches = []
    sentences = [s.strip() for s in re.split(r'[.!?。]\s*', text) if s.strip()]

    if len(sentences) < 5:
        return matches

    lengths = [len(s) for s in sentences]
    mean_len = statistics.mean(lengths)
    stdev_len = statistics.stdev(lengths) if len(lengths) > 1 else 0

    # E-1: Low sentence length variance
    if stdev_len < 8 and mean_len > 15:
        matches.append(PatternMatch(
            category="E-1", label="리듬: 문장 길이 균일",
            severity="S2", text=f"stdev={stdev_len:.1f}, mean={mean_len:.1f}",
            start=0, end=0,
            reason=f"문장 길이 표준편차 {stdev_len:.1f} (8 미만: 균일)",
            suggested_fix="단문/장문 혼합으로 리듬 변주",
        ))

    # E-2: Same ending pattern
    endings = [s[-2:] if len(s) >= 2 else s for s in sentences]
    most_common = max(set(endings), key=endings.count)
    ratio = endings.count(most_common) / len(endings)
    if ratio > 0.5:
        matches.append(PatternMatch(
            category="E-2", label="리듬: 동일 종결어미 반복",
            severity="S2", text=f"'{most_common}' {ratio:.0%}",
            start=0, end=0,
            reason=f"종결어미 '{most_common}'가 {ratio:.0%} 반복",
            suggested_fix="종결어미 변주",
        ))

    # E-3: All paragraphs same sentence count
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if len(paragraphs) >= 3:
        para_sent_counts = []
        for p in paragraphs:
            sents = [s for s in re.split(r'[.!?。]\s*', p) if s.strip()]
            para_sent_counts.append(len(sents))
        if para_sent_counts and len(set(para_sent_counts)) == 1 and para_sent_counts[0] >= 3:
            matches.append(PatternMatch(
                category="E-3", label="리듬: 문단 길이 균일",
                severity="S2", text=f"모든 문단 {para_sent_counts[0]}문장",
                start=0, end=0,
                reason=f"모든 문단이 {para_sent_counts[0]}문장으로 균일",
                suggested_fix="1문장 문단 / 6문장 문단을 섞기",
            ))

    return matches


def run_pattern_filter(text: str) -> tuple[FilterResult, list[Span]]:
    """Run im-not-ai pattern detection on text.

    Returns (FilterResult, list[Span]).
    """
    pattern_matches = _find_patterns(text)
    rhythm_matches = _analyze_rhythm(text)
    all_matches = pattern_matches + rhythm_matches

    # Calculate severity-weighted score
    severity_weights = {"S1": 5.0, "S2": 2.0, "S3": 0.5}
    weighted_sum = sum(severity_weights.get(m.severity, 1.0) for m in all_matches)

    # Normalize to 0-1 (based on text length)
    text_len = max(len(text), 1)
    density = sum(m.end - m.start for m in all_matches if m.end > m.start) / text_len

    # Score: combine weighted count + density
    # Typical AI text: 20+ findings per 1000 chars
    findings_per_1k = len(all_matches) / (text_len / 1000)
    score = min(1.0, findings_per_1k / 30)  # 30 findings/1k = score 1.0

    # Category summary
    category_counts: dict[str, int] = {}
    for m in all_matches:
        cat = m.category[0]  # A, B, C, ...
        category_counts[cat] = category_counts.get(cat, 0) + 1

    # S1 count is a strong signal
    s1_count = sum(1 for m in all_matches if m.severity == "S1")
    if s1_count >= 3:
        score = max(score, 0.7)
    elif s1_count >= 1:
        score = max(score, 0.5)

    spans = [
        Span(
            text=m.text, start=m.start, end=m.end,
            category=m.category, severity=m.severity,
            reason=m.reason, suggested_fix=m.suggested_fix,
        )
        for m in all_matches
    ]

    features = {
        "total_findings": len(all_matches),
        "s1_count": s1_count,
        "s2_count": sum(1 for m in all_matches if m.severity == "S2"),
        "s3_count": sum(1 for m in all_matches if m.severity == "S3"),
        "severity_weighted_score": weighted_sum,
        "ai_tell_density": round(density, 4),
        "findings_per_1k_chars": round(findings_per_1k, 2),
        "category_summary": category_counts,
    }

    return FilterResult(
        filter_name="pattern",
        score=round(score, 3),
        features=features,
    ), spans
