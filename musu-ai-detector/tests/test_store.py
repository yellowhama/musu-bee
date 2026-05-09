"""Tests for result store."""

import os
import tempfile

import pytest

from musu_ai_detector.models import DetectionResult, FilterResult
from musu_ai_detector.store import list_results, load_result, save_result


@pytest.fixture(autouse=True)
def temp_store(monkeypatch, tmp_path):
    """Use temp directory for store."""
    import musu_ai_detector.store as store_mod

    monkeypatch.setattr(store_mod, "STORE_DIR", tmp_path)
    return tmp_path


def test_save_and_load():
    result = DetectionResult(
        text="테스트",
        language="ko",
        verdict="ai",
        score=0.8,
        filter_result=FilterResult(filter_name="katfish", score=0.7),
    )
    run_id = save_result(result)

    loaded = load_result(run_id)
    assert loaded is not None
    assert loaded.language == "ko"
    assert loaded.verdict == "ai"
    assert loaded.score == 0.8
    assert loaded.text == "테스트"
    assert loaded.filter_result.filter_name == "katfish"


def test_load_nonexistent():
    result = load_result("nonexistent-id")
    assert result is None


def test_list_results():
    for i in range(3):
        save_result(DetectionResult(text=f"test {i}", verdict="ai", score=0.5 + i * 0.1))

    results = list_results()
    assert len(results) == 3
