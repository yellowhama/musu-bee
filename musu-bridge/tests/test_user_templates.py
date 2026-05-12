"""v13.5 — user-saved templates loaded dynamically from ~/.musu/companies/_templates."""
from __future__ import annotations

import os
import sys

import pytest
import yaml

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from company_templates import (  # noqa: E402
    _load_user_templates,
    _user_template_to_internal,
    get_template,
    list_template_keys,
)


@pytest.fixture
def fake_home(tmp_path, monkeypatch):
    """Redirect ~/.musu/companies/_templates to a tmp dir per test."""
    monkeypatch.setenv("HOME", str(tmp_path))
    return tmp_path / ".musu" / "companies" / "_templates"


def _write(dir_, name, data):
    dir_.mkdir(parents=True, exist_ok=True)
    (dir_ / name).write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")


# ── _user_template_to_internal ─────────────────────────────────────────────

def test_internal_shape_has_agents():
    yaml_data = {
        "slug": "test-startup",
        "displayName": "Test (generic startup)",
        "departments": [
            {"name": "CEO Office", "role": "Lead", "agentCount": 1, "phase": "day-1"},
            {"name": "Engineering", "role": "Engineer", "agentCount": 2, "phase": "day-1"},
        ],
    }
    internal = _user_template_to_internal(yaml_data)
    assert internal["description"] == "Test (generic startup)"
    assert len(internal["agents"]) == 2
    assert internal["agents"][0]["role"] == "Lead"
    assert internal["agents"][0]["name"] == "ceo-office"
    assert "{company_name}" in internal["agents"][0]["instructions"]
    assert "{purpose}" in internal["agents"][0]["instructions"]


def test_internal_shape_empty_departments_ok():
    internal = _user_template_to_internal({"slug": "empty", "departments": []})
    assert internal["agents"] == []


# ── _load_user_templates ───────────────────────────────────────────────────

def test_load_user_templates_returns_empty_when_dir_missing(fake_home):
    assert _load_user_templates() == {}


def test_load_user_templates_picks_up_yaml_files(fake_home):
    _write(fake_home, "alpha.yaml", {
        "slug": "alpha-startup",
        "displayName": "Alpha (generic startup)",
        "departments": [
            {"name": "CEO Office", "role": "Lead", "agentCount": 1, "phase": "day-1"},
        ],
    })
    _write(fake_home, "beta.yaml", {
        "slug": "beta-startup",
        "displayName": "Beta",
        "departments": [
            {"name": "Engineering", "role": "Engineer", "agentCount": 2, "phase": "day-1"},
        ],
    })
    out = _load_user_templates()
    assert set(out.keys()) == {"alpha-startup", "beta-startup"}
    assert out["alpha-startup"]["agents"][0]["role"] == "Lead"


def test_load_user_templates_skips_invalid_files(fake_home):
    fake_home.mkdir(parents=True)
    (fake_home / "broken.yaml").write_text(": :::garbage", encoding="utf-8")
    (fake_home / "no-slug.yaml").write_text("foo: bar\n", encoding="utf-8")
    _write(fake_home, "good.yaml", {
        "slug": "good-startup",
        "displayName": "Good",
        "departments": [{"name": "X", "role": "Lead", "agentCount": 1, "phase": "day-1"}],
    })
    out = _load_user_templates()
    assert list(out.keys()) == ["good-startup"]


# ── get_template / list_template_keys ──────────────────────────────────────

def test_builtin_template_still_resolves(fake_home):
    """Built-in 'dev-team' should always resolve regardless of user dir state."""
    tmpl = get_template("dev-team")
    assert tmpl is not None
    assert "agents" in tmpl


def test_user_template_resolves_via_get_template(fake_home):
    _write(fake_home, "smoke.yaml", {
        "slug": "smoke-startup",
        "displayName": "Smoke",
        "departments": [{"name": "X", "role": "Lead", "agentCount": 1, "phase": "day-1"}],
    })
    tmpl = get_template("smoke-startup")
    assert tmpl is not None
    assert tmpl["description"] == "Smoke"


def test_builtin_wins_on_slug_collision(fake_home):
    """If a user template tries to shadow 'dev-team', built-in wins."""
    _write(fake_home, "dev-team.yaml", {
        "slug": "dev-team",
        "displayName": "Shadowed",
        "departments": [],
    })
    tmpl = get_template("dev-team")
    assert tmpl is not None
    # Built-in dev-team has 4 agents (lead/planner/engineer/qa)
    assert len(tmpl["agents"]) == 4


def test_list_keys_includes_user_templates(fake_home):
    _write(fake_home, "x.yaml", {
        "slug": "x-startup",
        "displayName": "X",
        "departments": [{"name": "A", "role": "Lead", "agentCount": 1, "phase": "day-1"}],
    })
    keys = list_template_keys()
    assert "dev-team" in keys
    assert "x-startup" in keys
