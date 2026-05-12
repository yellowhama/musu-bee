"""v12-onboarding B — template-decision endpoint + decision logic."""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from handlers import (  # noqa: E402
    _decision_score,
    _decision_tokens,
    decide_template_for_mission,
)


# ── unit: tokenizer ────────────────────────────────────────────────────────

def test_tokens_drop_stop_words_and_lowercase():
    tokens = _decision_tokens("We will Build a Software DEV Team")
    # "we", "will", "build", "a", "team" are stop-words → only "software", "dev"
    assert "software" in tokens
    assert "dev" in tokens
    assert "we" not in tokens
    assert "a" not in tokens
    assert "build" not in tokens


def test_tokens_strip_punctuation():
    tokens = _decision_tokens("hello, world! e-mail digest.")
    assert "hello" in tokens
    assert "world" in tokens
    assert "email" not in tokens  # hyphen splits to "e" + "mail"
    assert "mail" in tokens
    assert "digest" in tokens


# ── unit: scoring ──────────────────────────────────────────────────────────

def test_score_zero_on_empty_mission():
    assert _decision_score(set(), {"foo", "bar"}) == 0.0


def test_score_full_overlap():
    assert _decision_score({"foo", "bar"}, {"foo", "bar", "baz"}) == 1.0


def test_score_partial_overlap():
    # mission {a,b,c}, template {a,b,d} → 2/3
    score = _decision_score({"a", "b", "c"}, {"a", "b", "d"})
    assert abs(score - 2 / 3) < 1e-6


# ── decision: found vs research ────────────────────────────────────────────

def test_dev_team_mission_matches():
    """Software/engineer mission should match the 'dev-team' template."""
    result = decide_template_for_mission(
        mission="Software dev team for SaaS engineer planner qa",
        company_name="TechCo",
    )
    assert result["decision"] == "found"
    # dev-team has roles: Team Lead, Planner, Engineer, QA — should win.
    assert result["template"] == "dev-team"
    assert "preview" in result
    assert any(a.get("role") == "Engineer" for a in result["preview"]["agents"])
    assert 0.0 < result["score"] <= 1.0


def test_no_match_returns_research():
    """A mission with no template keyword overlap goes to research branch."""
    result = decide_template_for_mission(
        mission="Raise alpacas in Mongolia and sell wool",
        company_name="WoolCo",
    )
    assert result["decision"] == "research"
    assert result["research_task_id"].startswith("task-")
    assert result["estimated_seconds"] == 30
    assert result["company_name"] == "WoolCo"


def test_decision_is_deterministic_for_same_mission():
    """Same mission → same template + same score (research_task_id varies by uuid)."""
    a = decide_template_for_mission("software engineer dev planner qa team", "X")
    b = decide_template_for_mission("software engineer dev planner qa team", "X")
    assert a["decision"] == b["decision"]
    if a["decision"] == "found":
        assert a["template"] == b["template"]
        assert a["score"] == b["score"]


# ── HTTP endpoint ──────────────────────────────────────────────────────────

def _api_client():
    from fastapi.testclient import TestClient
    from server import app
    token = os.environ.get("MUSU_BRIDGE_TOKEN", "test-token")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


def test_endpoint_found_branch():
    client = _api_client()
    resp = client.post(
        "/api/companies/onboarding/template-decision",
        json={
            "mission": "Software engineer dev planner qa team building a SaaS",
            "company_name": "TechCo",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["decision"] == "found"
    assert data["template"] == "dev-team"


def test_endpoint_research_branch():
    client = _api_client()
    resp = client.post(
        "/api/companies/onboarding/template-decision",
        json={"mission": "Raise alpacas in Mongolia", "company_name": "WoolCo"},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["decision"] == "research"
    assert data["research_task_id"].startswith("task-")


def test_endpoint_rejects_empty_mission():
    client = _api_client()
    resp = client.post(
        "/api/companies/onboarding/template-decision",
        json={"mission": "", "company_name": "TechCo"},
    )
    assert resp.status_code == 422


def test_endpoint_rejects_missing_company_name():
    client = _api_client()
    resp = client.post(
        "/api/companies/onboarding/template-decision",
        json={"mission": "Building software"},
    )
    assert resp.status_code == 422
