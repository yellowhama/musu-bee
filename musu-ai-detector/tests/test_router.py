"""Tests for language detection and routing."""

import pytest

from musu_ai_detector.router import detect_language, run_detection


def test_detect_korean():
    text = "에드릭은 창을 들었다. 바이킹의 방패가 부서졌다. 피가 눈 위에 떨어졌다."
    assert detect_language(text) == "ko"


def test_detect_english():
    text = "The quick brown fox jumps over the lazy dog. This is a test paragraph."
    assert detect_language(text) == "en"


def test_detect_mixed():
    text = """에드릭은 창을 들었다. 바이킹의 방패가 부서졌다.

The mercenary captain gave the order. They marched through the snow.

레오프릭이 웃었다. "이게 전쟁이지."

Winter was coming and the Saxon army needed supplies."""
    result = detect_language(text)
    assert result in ("mixed", "ko", "en")


def test_detect_short_text():
    text = "안녕"
    result = detect_language(text)
    assert result in ("ko", "en")


@pytest.mark.asyncio
async def test_run_detection_returns_pending():
    """Tool returns features, not verdicts. Verdict should be 'pending'."""
    text = "에드릭은 창을 들었다. 바이킹의 방패가 부서졌다."
    result = await run_detection(text, language="ko")
    assert result.verdict == "pending"
    assert result.filter_result is not None
    assert "katfish" in result.filter_result.filter_name
    assert len(result.filter_result.features) > 0


@pytest.mark.asyncio
async def test_run_detection_korean_includes_spans():
    """Korean detection should include pattern spans."""
    text = "결론적으로, AI에 대해 논의할 필요가 있다. 이를 통해 혁신적인 변화를 이끌 수 있다."
    result = await run_detection(text, language="ko")
    assert len(result.spans) > 0  # Pattern filter found AI tells


@pytest.mark.asyncio
async def test_run_detection_english():
    text = "The quick brown fox jumps over the lazy dog repeatedly."
    result = await run_detection(text, language="en")
    assert result.verdict == "pending"
    assert result.filter_result.filter_name == "zippy"
