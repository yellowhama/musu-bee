"""Tests for business tools — market research, project creation, analytics, learning."""

from musu_writer.tools.market_research import get_market_research_context, get_latest_market_report
from musu_writer.tools.project_creator import create_project_structure, get_project_foundation_template
from musu_writer.tools.analytics import ingest_metrics_template, get_feedback_analysis_template
from musu_writer.tools.learning import get_lesson_extraction_template, share_lesson_template
import shutil
from pathlib import Path


def test_market_research_all():
    ctx = get_market_research_context("all")
    assert ctx["skill"] == "market_research"
    assert "kr" in ctx["target_regions"]
    assert "us" in ctx["target_regions"]
    assert "report_template" in ctx


def test_market_research_kr():
    ctx = get_market_research_context("kr", "회귀")
    assert "kr" in ctx["target_regions"]
    assert ctx["genre_focus"] == "회귀"
    assert "카카오페이지" in ctx["target_regions"]["kr"]["platforms"]


def test_market_research_us():
    ctx = get_market_research_context("us", "LitRPG")
    assert "Royal Road" in ctx["target_regions"]["us"]["platforms"]


def test_no_market_report_yet():
    report = get_latest_market_report("all")
    # May or may not have reports — just check structure
    assert isinstance(report, dict)


def test_project_creation(tmp_path, monkeypatch):
    import musu_writer.tools.project_creator as pc
    monkeypatch.setattr(pc, "PROJECT_ROOT", tmp_path)

    result = create_project_structure(
        name="test-novel",
        display_name="테스트 소설",
        genre="progression-fantasy",
        tone="dark-comedy",
        protagonist="김철수",
    )
    assert result["project_name"] == "test-novel"
    assert (tmp_path / "projects" / "test-novel" / "config.toml").exists()
    assert (tmp_path / "projects" / "test-novel" / "canon" / "protagonist.md").exists()
    assert (tmp_path / "projects" / "test-novel" / "drafts").exists()


def test_project_creation_duplicate(tmp_path, monkeypatch):
    import musu_writer.tools.project_creator as pc
    monkeypatch.setattr(pc, "PROJECT_ROOT", tmp_path)

    create_project_structure(name="dup-test")
    result = create_project_structure(name="dup-test")
    assert "error" in result


def test_project_foundation_template():
    tmpl = get_project_foundation_template("test-project")
    assert tmpl["skill"] == "project_foundation"
    assert "protagonist" in tmpl["templates"]
    assert "world" in tmpl["templates"]
    assert "act_spine" in tmpl["templates"]


def test_analytics_chapter():
    ctx = ingest_metrics_template("demo-project", "CH01")
    assert ctx["skill"] == "analytics"
    assert "metrics_template" in ctx
    assert "kakaopage" in ctx["metrics_template"]["platforms"]


def test_analytics_project_wide():
    ctx = get_feedback_analysis_template("demo-project")
    assert ctx["skill"] == "feedback_analysis"
    assert "analysis_template" in ctx
    assert "improvement_signals" in ctx["analysis_template"]


def test_learning_extraction():
    ctx = get_lesson_extraction_template("demo-project")
    assert ctx["skill"] == "lesson_extraction"
    assert "project_specific_lessons" in ctx["template"]
    assert "shareable_lessons" in ctx["template"]


def test_learning_sharing():
    ctx = share_lesson_template("project-a", "project-b")
    assert ctx["skill"] == "lesson_sharing"
    assert ctx["from_project"] == "project-a"
    assert ctx["to_project"] == "project-b"
