"""Tests for project config and multi-project support."""

from musu_writer.project_config import (
    get_codex_skill_name,
    get_project_config,
    get_project_dir,
    get_ref_path,
    get_wiki_prefixes,
)


def test_false_dane_config_loads():
    config = get_project_config("false-dane")
    assert config["project"]["name"] == "false-dane"
    assert config["project"]["language"] == "ko"


def test_false_dane_references():
    config = get_project_config("false-dane")
    refs = config["references"]
    assert "character_table" in refs
    assert "FALSE_DANE" in refs["character_table"]


def test_false_dane_wiki_prefixes():
    prefixes = get_wiki_prefixes("false-dane")
    assert "293_FALSE_DANE" in prefixes


def test_false_dane_codex_skills():
    name = get_codex_skill_name("false-dane", "writer")
    assert name == "false-dane-writer"

    name = get_codex_skill_name("false-dane", "rhythm")
    assert name == "false-dane-rhythm-drafter"


def test_bloodline_config_loads():
    config = get_project_config("bloodline")
    assert config["project"]["name"] == "bloodline"


def test_unknown_project_returns_minimal():
    config = get_project_config("nonexistent-project")
    assert config["project"]["name"] == "nonexistent-project"
    assert config["references"] == {}


def test_project_dir():
    d = get_project_dir("false-dane")
    assert "projects/false-dane" in str(d)


def test_ref_path():
    path = get_ref_path("false-dane", "character_table")
    assert "CHARACTER_TABLE" in path


def test_ref_path_unknown_key():
    path = get_ref_path("false-dane", "nonexistent_key")
    assert path is None
