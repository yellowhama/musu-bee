"""Tests for pattern filter (im-not-ai taxonomy)."""

from musu_ai_detector.filters.pattern_filter import run_pattern_filter


def test_detects_translation_ese():
    """A-1, A-2: 번역투 탐지."""
    text = "AI 규제에 대해 논의할 필요가 있다. 데이터 분석을 통해 인사이트를 얻는다."
    result, spans = run_pattern_filter(text)
    categories = {s.category for s in spans}
    assert "A-1" in categories  # ~에 대해
    assert "A-2" in categories  # ~를 통해


def test_detects_ai_cliches():
    """D-1, D-2: AI 관용구 탐지."""
    text = "결론적으로, 이 연구는 시사하는 바가 크다. 혁신적인 접근이 필요하다."
    result, spans = run_pattern_filter(text)
    categories = {s.category for s in spans}
    assert "D-1" in categories  # 결론적으로
    assert "D-2" in categories  # 시사하는 바가 크다
    assert "D-4" in categories  # 혁신적인


def test_detects_structural_patterns():
    """C-1: 기계적 병렬."""
    text = "첫째, AI는 빠르다. 둘째, AI는 정확하다. 셋째, AI는 저렴하다."
    result, spans = run_pattern_filter(text)
    c1_spans = [s for s in spans if s.category == "C-1"]
    assert len(c1_spans) >= 3


def test_detects_hedging():
    """G-1: 추측형 종결."""
    text = "이것은 중요한 것으로 보인다. 변화가 있을 것으로 판단된다."
    result, spans = run_pattern_filter(text)
    categories = {s.category for s in spans}
    assert "G-1" in categories


def test_detects_conjunction_spam():
    """H-1: 문두 접속사."""
    text = "또한 이것은 중요하다.\n따라서 변화가 필요하다.\n나아가 혁신이 필수적이다."
    result, spans = run_pattern_filter(text)
    h1_spans = [s for s in spans if s.category == "H-1"]
    assert len(h1_spans) >= 2


def test_novel_text_clean():
    """소설 텍스트는 AI 패턴이 적어야 한다."""
    text = """에드릭은 창을 들었다. 바이킹의 방패가 부서졌다. 피가 눈 위에 떨어졌다.

"내리지 마, 배 빈다!"

토르켈이 옆에서 입술을 핥았다. 술에 취하면 자기가 북쪽 피라고 떠들었다.

"잡소리 그만하고 방패 들어."

토르켈은 웃었다."""
    result, spans = run_pattern_filter(text)
    # Novel text should have very few AI patterns
    s1_count = sum(1 for s in spans if s.severity == "S1")
    assert s1_count == 0  # No S1 patterns in human-like novel text
    assert result.score < 0.3  # Low AI score


def test_obvious_ai_text_high_score():
    """전형적 AI 텍스트는 높은 점수."""
    text = """결론적으로, AI 기술에 대해 논의할 필요가 있다. 데이터 분석을 통해
인사이트를 얻을 수 있다. 이는 매우 중요한 것으로 보인다.
또한 혁신적인 접근이 필요하다. 따라서 이 문제에 있어서 주목할 만한 변화가
시사하는 바가 크다고 할 수 있다. 나아가 크게 세 가지로 나눌 수 있다.
첫째, 효율성을 높일 수 있다. 둘째, 비용을 줄일 수 있다. 셋째, 시간을 단축할 수 있다."""
    result, spans = run_pattern_filter(text)
    assert result.score > 0.5
    assert len(spans) > 10
    s1_count = sum(1 for s in spans if s.severity == "S1")
    assert s1_count >= 5


def test_score_proportional_to_findings():
    """점수는 findings 수에 비례해야."""
    clean = "에드릭은 칼을 뽑았다."
    dirty = "결론적으로 이에 대해 통해 혁신적인 시사하는 바가 크다."

    r_clean, _ = run_pattern_filter(clean)
    r_dirty, _ = run_pattern_filter(dirty)

    assert r_dirty.score > r_clean.score
