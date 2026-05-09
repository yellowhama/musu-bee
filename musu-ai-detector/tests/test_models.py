"""Tests for data models."""

from musu_ai_detector.models import DetectionResult, FilterResult, FixResult, Span


def test_span_to_dict():
    span = Span(
        text="결론적으로",
        start=100,
        end=105,
        category="D-1",
        severity="S1",
        reason="AI 관용구",
        suggested_fix="",
    )
    d = span.to_dict()
    assert d["text"] == "결론적으로"
    assert d["start"] == 100
    assert d["severity"] == "S1"


def test_filter_result_to_dict():
    fr = FilterResult(filter_name="katfish", score=0.73, features={"pos_3gram": 0.6})
    d = fr.to_dict()
    assert d["filter_name"] == "katfish"
    assert d["score"] == 0.73


def test_detection_result_to_dict():
    result = DetectionResult(
        text="테스트 텍스트",
        language="ko",
        verdict="ai",
        score=0.8,
    )
    d = result.to_dict()
    assert d["language"] == "ko"
    assert d["verdict"] == "ai"
    assert "run_id" in d


def test_fix_result_to_dict():
    fr = FixResult(
        run_id="test-123",
        original_text="원본",
        fixed_text="수정됨",
        method="im-not-ai",
    )
    d = fr.to_dict()
    assert d["method"] == "im-not-ai"
    assert d["fixed_text"] == "수정됨"
