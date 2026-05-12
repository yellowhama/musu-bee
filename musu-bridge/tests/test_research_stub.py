"""v12-onboarding D — research stub task + template persistence."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# Import after sys.path setup.
def _reload_handlers():
    import importlib
    import handlers as h
    importlib.reload(h)
    return h


@pytest.fixture
def handlers_mod(tmp_path, monkeypatch):
    """Reload handlers with HOME redirected to tmp so template writes are isolated."""
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    h = _reload_handlers()
    return h


# ── start_research_task ────────────────────────────────────────────────────

def test_start_research_returns_task_prefix(handlers_mod):
    tid = handlers_mod.start_research_task("build a saas", "Foo Co")
    assert tid.startswith("task-")
    state = handlers_mod.get_research_task(tid)
    assert state is not None
    assert state["status"] == "running"
    assert state["mission"] == "build a saas"
    assert state["company_name"] == "Foo Co"


def test_get_research_task_missing_returns_none(handlers_mod):
    assert handlers_mod.get_research_task("task-nonesuch") is None


def test_research_task_becomes_ready_after_delay(handlers_mod, monkeypatch):
    """After the stub delay elapses, status flips to 'ready' with a proposal."""
    tid = handlers_mod.start_research_task("alpacas", "WoolCo")

    # Fast-forward by patching the time module the handlers module uses.
    real_time = handlers_mod._time.time
    started = handlers_mod._RESEARCH_TASKS[tid]["started_at"]
    monkeypatch.setattr(
        handlers_mod._time, "time", lambda: started + 10
    )
    state = handlers_mod.get_research_task(tid)
    assert state["status"] == "ready"
    assert "proposal" in state
    proposal = state["proposal"]
    assert proposal["slug"].endswith("-startup")
    assert len(proposal["departments"]) == 5
    monkeypatch.setattr(handlers_mod._time, "time", real_time)


# ── slugify ────────────────────────────────────────────────────────────────

def test_slugify_handles_spaces_and_case(handlers_mod):
    assert handlers_mod._slugify("Foo Bar BAZ") == "foo-bar-baz"


def test_slugify_strips_punctuation_and_repeats(handlers_mod):
    assert handlers_mod._slugify("Hello!! World!!") == "hello-world"


def test_slugify_empty_falls_back(handlers_mod):
    assert handlers_mod._slugify("---!!!") == "company"


# ── save_proposed_template ─────────────────────────────────────────────────

def test_save_proposed_template_writes_yaml(handlers_mod, tmp_path):
    proposal = handlers_mod._build_generic_startup_proposal("Test Co")
    path = handlers_mod.save_proposed_template("test-co-startup", proposal)
    assert path.exists()
    assert path.name == "test-co-startup.yaml"
    content = path.read_text(encoding="utf-8")
    assert "test-co-startup" in content
    assert "Engineering" in content
    # Idempotent overwrite.
    handlers_mod.save_proposed_template("test-co-startup", proposal)
    assert path.exists()


def test_save_template_creates_parent_dirs(handlers_mod, tmp_path):
    target = tmp_path / ".musu" / "companies" / "_templates"
    assert not target.exists()
    handlers_mod.save_proposed_template(
        "first-template",
        handlers_mod._build_generic_startup_proposal("First"),
    )
    assert target.is_dir()
    assert (target / "first-template.yaml").is_file()


# ── decide() also starts a real task on research branch ────────────────────

def test_decide_research_branch_returns_real_task_id(handlers_mod):
    result = handlers_mod.decide_template_for_mission(
        mission="raise alpacas in Mongolia", company_name="WoolCo"
    )
    assert result["decision"] == "research"
    tid = result["research_task_id"]
    assert tid.startswith("task-")
    # The task exists in the store now (not just a placeholder).
    state = handlers_mod.get_research_task(tid)
    assert state is not None
    assert state["company_name"] == "WoolCo"


# ── HTTP endpoints ─────────────────────────────────────────────────────────

def _api_client():
    from fastapi.testclient import TestClient
    from server import app
    token = os.environ.get("MUSU_BRIDGE_TOKEN", "test-token")
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


def test_research_poll_unknown_returns_404(handlers_mod):
    client = _api_client()
    resp = client.get("/api/companies/onboarding/research/task-nope")
    assert resp.status_code == 404


def test_research_full_flow_via_http(handlers_mod, tmp_path, monkeypatch):
    """End-to-end: decide → poll (fast-forwarded ready) → approve-template."""
    client = _api_client()

    decision = client.post(
        "/api/companies/onboarding/template-decision",
        json={"mission": "raise alpacas in Mongolia", "company_name": "WoolCo"},
    ).json()
    assert decision["decision"] == "research"
    tid = decision["research_task_id"]

    # Fast-forward time so the poll returns ready.
    started = handlers_mod._RESEARCH_TASKS[tid]["started_at"]
    monkeypatch.setattr(handlers_mod._time, "time", lambda: started + 10)

    poll = client.get(f"/api/companies/onboarding/research/{tid}").json()
    assert poll["status"] == "ready"
    proposal = poll["proposal"]

    # Approve & save.
    approve = client.post(
        "/api/companies/onboarding/approve-template",
        json={"slug": proposal["slug"], "proposal": proposal},
    )
    assert approve.status_code == 200, approve.text
    data = approve.json()
    assert data["saved"] is True
    assert data["slug"] == proposal["slug"]
    assert Path(data["path"]).exists()
