"""Tests for KatFishNet Korean filter."""

from musu_ai_detector.filters.katfish_filter import (
    _analyze_comma_features,
    _analyze_pos_ngram_diversity,
    _features_to_score,
    _split_sentences,
    run_katfish,
)


def test_split_sentences():
    text = "에드릭은 창을 들었다. 바이킹이 달려왔다. 피가 눈 위에 떨어졌다."
    sentences = _split_sentences(text)
    assert len(sentences) >= 2


def test_comma_features_basic():
    morphs = [["나는", ",", "여기서", ",", "싸운다"]]
    pos = [["NP", "SP", "MAG", "SP", "VV"]]
    features = _analyze_comma_features(morphs, pos)
    assert "comma_include_rate" in features
    assert features["comma_include_rate"] == 1.0
    assert features["avg_comma_usage_rate"] > 0


def test_comma_features_no_commas():
    morphs = [["에드릭", "은", "창", "을", "들", "었", "다"]]
    pos = [["NNP", "JX", "NNG", "JKO", "VV", "EP", "EF"]]
    features = _analyze_comma_features(morphs, pos)
    assert features["comma_include_rate"] == 0.0


def test_pos_ngram_diversity():
    pos = [
        ["NNP", "JX", "NNG", "JKO", "VV", "EP", "EF"],
        ["NP", "JX", "MAG", "VV", "EC", "VX", "EF"],
    ]
    features = _analyze_pos_ngram_diversity(pos)
    assert "avg_pos_1gram_diversity" in features
    assert "avg_pos_3gram_diversity" in features
    assert all(0 <= v <= 1 for v in features.values())


def test_features_to_score():
    comma = {"std_relative_position": 0.15, "avg_pos_diversity": 0.7}
    ngram = {"avg_pos_3gram_diversity": 0.8, "avg_pos_5gram_diversity": 0.9}
    score = _features_to_score(comma, ngram)
    assert 0.0 <= score <= 1.0
    # High diversity → likely human → low score
    assert score < 0.5


def test_features_to_score_ai_like():
    comma = {"std_relative_position": 0.02, "avg_pos_diversity": 0.3}
    ngram = {"avg_pos_3gram_diversity": 0.4, "avg_pos_5gram_diversity": 0.5}
    score = _features_to_score(comma, ngram)
    assert score > 0.5  # Low diversity → likely AI


def test_run_katfish_short_text():
    result = run_katfish("안녕하세요")
    assert result.filter_name == "katfish"
    assert 0.0 <= result.score <= 1.0


def test_run_katfish_longer_text():
    text = """
    에드릭은 창을 들었다. 바이킹의 방패가 부서졌다. 피가 눈 위에 떨어졌다.
    레오프릭이 웃었다. 시그리드가 검을 뽑았다. 윈은 방패 뒤에 숨었다.
    대장이 명령을 내렸다. 용병들이 달려갔다. 전투가 시작되었다.
    """
    result = run_katfish(text)
    assert result.filter_name == "katfish"
    assert 0.0 <= result.score <= 1.0
    assert len(result.features) > 0
