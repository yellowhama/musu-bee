"""v14.1 — LLM-aware decision: mock the gemini adapter and check happy + fallback paths."""
from __future__ import annotations

import asyncio
import json
import os
import sys
from dataclasses import dataclass, field
from typing import Any

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import handlers  # noqa: E402
from handlers import (  # noqa: E402
    _parse_llm_json,
    decide_template_for_mission,
    decide_template_for_mission_with_llm,
)


# ── _parse_llm_json ────────────────────────────────────────────────────────

def test_parse_plain_json():
    assert _parse_llm_json('{"decision":"found","template":"dev-team"}') == {
        "decision": "found",
        "template": "dev-team",
    }


def test_parse_json_inside_markdown_fence():
    text = "```json\n{\"decision\":\"research\",\"reason\":\"new\"}\n```"
    assert _parse_llm_json(text) == {"decision": "research", "reason": "new"}


def test_parse_json_inside_prose():
    text = 'Sure, here is the decision: {"decision":"found","template":"dev-team"} let me know.'
    assert _parse_llm_json(text) == {"decision": "found", "template": "dev-team"}


def test_parse_empty_returns_none():
    assert _parse_llm_json("") is None
    assert _parse_llm_json("no json here") is None


def test_parse_malformed_returns_none():
    assert _parse_llm_json('{"decision":"found"') is None  # missing close


# ── decide_template_for_mission_with_llm ───────────────────────────────────


@dataclass
class _FakeResult:
    success: bool = True
    summary: str = ""
    run_id: str = "fake"
    session_id: str | None = None
    cost_usd: float | None = None
    error: str | None = None
    raw: dict = field(default_factory=dict)
    is_retriable: bool = False
    error_code: Any = None
    usage: Any = None


class _FakeAdapter:
    """Adapter double — returns a canned `summary` and records the prompt."""

    def __init__(self, response: str, should_fail: bool = False, raise_exc: bool = False):
        self._response = response
        self._should_fail = should_fail
        self._raise_exc = raise_exc
        self.last_prompt: str | None = None

    @property
    def adapter_type(self) -> str:
        return "gemini_local"

    async def execute(self, ctx) -> _FakeResult:
        self.last_prompt = ctx.prompt
        if self._raise_exc:
            raise RuntimeError("adapter blew up")
        return _FakeResult(success=not self._should_fail, summary=self._response)


@pytest.fixture
def patch_adapter(monkeypatch):
    """Replace musu_core.adapters.registry.get_adapter with a controllable fake."""

    installed: dict[str, Any] = {"adapter": None}

    def install(adapter):
        installed["adapter"] = adapter

    def fake_get_adapter(adapter_type: str):
        return installed["adapter"]

    # Avoid touching real adapters import path by stubbing the registry
    # symbol used inside _call_decision_adapter.
    import musu_core.adapters.registry as registry
    monkeypatch.setattr(registry, "get_adapter", fake_get_adapter)
    return install


# ── happy path: LLM returns 'found' for dev-team mission ───────────────────


def test_llm_found_dev_team(patch_adapter):
    patch_adapter(_FakeAdapter(
        response='{"decision":"found","template":"dev-team","reason":"SaaS engineering"}',
    ))
    result = asyncio.run(decide_template_for_mission_with_llm(
        mission="Build a SaaS product with a small engineering team",
        company_name="TechCo",
        timeout_seconds=2.0,
    ))
    assert result["decision"] == "found"
    assert result["template"] == "dev-team"
    assert result["score"] == 0.95
    assert "SaaS engineering" in result["reason"]
    assert any(a["role"] == "Engineer" for a in result["preview"]["agents"])


# ── research path ──────────────────────────────────────────────────────────


def test_llm_research_branch(patch_adapter):
    patch_adapter(_FakeAdapter(
        response='{"decision":"research","reason":"unique mission, no template matches"}',
    ))
    result = asyncio.run(decide_template_for_mission_with_llm(
        mission="Run a national bird-watching collective with hardware sensors",
        company_name="AvianOrg",
        timeout_seconds=2.0,
    ))
    assert result["decision"] == "research"
    assert result["research_task_id"].startswith("task-")
    assert "unique mission" in result["reason"]


# ── invalid template name → fall back ──────────────────────────────────────


def test_llm_invalid_template_falls_back(patch_adapter):
    patch_adapter(_FakeAdapter(
        response='{"decision":"found","template":"nonexistent-team","reason":"oops"}',
    ))
    # Mission tokens won't strongly match anything → expect research fallback.
    result = asyncio.run(decide_template_for_mission_with_llm(
        mission="Raise alpacas in Mongolia",
        company_name="WoolCo",
        timeout_seconds=2.0,
    ))
    # Fell through to deterministic path → research (no template match for alpacas).
    assert result["decision"] == "research"


# ── malformed JSON → deterministic fallback ────────────────────────────────


def test_llm_malformed_response_falls_back(patch_adapter):
    patch_adapter(_FakeAdapter(response="this is not JSON at all"))
    result = asyncio.run(decide_template_for_mission_with_llm(
        mission="Software engineer dev planner qa SaaS team",
        company_name="TechCo",
        timeout_seconds=2.0,
    ))
    # Deterministic path matches dev-team.
    assert result["decision"] == "found"
    assert result["template"] == "dev-team"
    # score < 0.95 — confirms deterministic match, not LLM.
    assert result["score"] < 0.95


# ── adapter raises → fallback ──────────────────────────────────────────────


def test_llm_adapter_exception_falls_back(patch_adapter):
    patch_adapter(_FakeAdapter(response="", raise_exc=True))
    result = asyncio.run(decide_template_for_mission_with_llm(
        mission="Raise alpacas in Mongolia",
        company_name="WoolCo",
        timeout_seconds=2.0,
    ))
    # Fallback path → research (no token match).
    assert result["decision"] == "research"


# ── adapter not registered → fallback ──────────────────────────────────────


def test_llm_no_adapter_falls_back(patch_adapter):
    patch_adapter(None)  # get_adapter() returns None
    result = asyncio.run(decide_template_for_mission_with_llm(
        mission="Software engineer dev planner qa SaaS team",
        company_name="TechCo",
        timeout_seconds=2.0,
    ))
    assert result["decision"] == "found"
    assert result["template"] == "dev-team"


# ── research task: LLM design path ─────────────────────────────────────────


def test_research_llm_writes_proposal(monkeypatch):
    """The async _run_llm_research, when given a valid LLM response, should
    overwrite the task's proposal with the LLM-designed structure."""
    monkeypatch.setattr(handlers, "_RESEARCH_TASKS", {})
    monkeypatch.setattr(handlers, "_RESEARCH_LLM_TASKS", {})

    proposal_json = json.dumps({
        "slug": "avian-startup",
        "displayName": "AvianOrg (citizen science)",
        "departments": [
            {"name": "Field Ops", "role": "Field Lead", "agentCount": 1, "phase": "day-1"},
            {"name": "Hardware", "role": "Hardware Engineer", "agentCount": 2, "phase": "day-1"},
        ],
    })

    async def fake_call_adapter(prompt, timeout_seconds):
        return proposal_json

    monkeypatch.setattr(handlers, "_call_decision_adapter", fake_call_adapter)

    tid = handlers.start_research_task(mission="bird watching", company_name="AvianOrg")
    asyncio.run(handlers._run_llm_research(tid, "bird watching", "AvianOrg"))

    state = handlers._RESEARCH_TASKS[tid]
    assert state["status"] == "ready"
    assert state["proposal"]["slug"] == "avian-startup"
    assert len(state["proposal"]["departments"]) == 2


def test_research_llm_falls_back_on_garbage(monkeypatch):
    monkeypatch.setattr(handlers, "_RESEARCH_TASKS", {})
    monkeypatch.setattr(handlers, "_RESEARCH_LLM_TASKS", {})

    async def fake_call_adapter(prompt, timeout_seconds):
        return "not json"

    monkeypatch.setattr(handlers, "_call_decision_adapter", fake_call_adapter)

    tid = handlers.start_research_task(mission="x", company_name="WoolCo")
    asyncio.run(handlers._run_llm_research(tid, "x", "WoolCo"))

    state = handlers._RESEARCH_TASKS[tid]
    assert state["status"] == "ready"
    # Generic-startup fallback always has exactly 5 departments.
    assert len(state["proposal"]["departments"]) == 5
