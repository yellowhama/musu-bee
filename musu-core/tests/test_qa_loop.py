"""Tests for musu_core.qa_score — QA scoring and pass/fail logic."""
import pytest
from musu_core.qa_score import QAScore, PASS_THRESHOLD


class TestQAScore:
    def test_all_above_threshold_passes(self):
        score = QAScore(functionality=8, correctness=7, completeness=9, code_quality=7)
        assert score.pass_ is True

    def test_one_below_threshold_fails(self):
        score = QAScore(functionality=8, correctness=6, completeness=9, code_quality=7)
        assert score.pass_ is False

    def test_all_perfect(self):
        score = QAScore(functionality=10, correctness=10, completeness=10, code_quality=10)
        assert score.pass_ is True

    def test_all_minimum_pass(self):
        score = QAScore(functionality=7, correctness=7, completeness=7, code_quality=7)
        assert score.pass_ is True

    def test_all_one_below(self):
        score = QAScore(functionality=6, correctness=6, completeness=6, code_quality=6)
        assert score.pass_ is False

    def test_failing_criteria_list(self):
        score = QAScore(functionality=8, correctness=5, completeness=9, code_quality=6)
        failing = score.failing_criteria
        assert any("correctness" in c for c in failing)
        assert any("code_quality" in c for c in failing)
        assert not any("functionality" in c for c in failing)

    def test_threshold_value(self):
        assert PASS_THRESHOLD == 7

    def test_feedback_stored(self):
        score = QAScore(functionality=8, correctness=8, completeness=8, code_quality=8, feedback="looks good")
        assert score.feedback == "looks good"

    def test_iteration_default(self):
        score = QAScore(functionality=8, correctness=8, completeness=8, code_quality=8)
        assert score.iteration == 1
