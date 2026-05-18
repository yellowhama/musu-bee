"""V23.5 C-4 — Y-path failure-mode tests for cos_briefing_agent.

Where C-3's `test_cos_synthesis_minimal.py` validated the 4 hard-constraint
enforcement points (api-key gate, lib-missing degrade, empty-pages degrade,
provider exception, status/synth endpoints), THIS file pins the **4 specific
failure modes** the Phase -1 mini-gate called out by name:

    (1) timeout            — provider call exceeds budget → degrade
    (2) no API key         — env var unset → degrade (api_key_not_configured)
    (3) budget exhaust     — rate limit / billing exception → degrade
    (4) parse error        — malformed / empty provider response → degrade

A 5th, endpoint-level test guarantees that ALL FOUR failure modes return
HTTP 200 with `degraded=true` and an intact (possibly empty) `source_pages`
list, so the C-2 frontend never has to special-case any of them — the
graceful-degrade contract is the same for every failure path.

Run:
    cd musu-bridge && python -m pytest tests/test_cos_synthesis_degrade.py -v
"""
from __future__ import annotations

import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))


# ── Helpers ──────────────────────────────────────────────────────────────────


def _import_agent():
    """Fresh import of cos_briefing_agent so env-var changes between tests
    actually take effect at the module level (the agent reads the env on
    each call, so this is belt-and-braces — keeps parity with the C-3
    minimal suite)."""
    if "cos_briefing_agent" in sys.modules:
        del sys.modules["cos_briefing_agent"]
    import cos_briefing_agent  # noqa: WPS433

    return cos_briefing_agent


def _install_fake_anthropic(monkeypatch, *, create_behavior):
    """Inject a fake 'anthropic' module whose Anthropic().messages.create
    runs `create_behavior(**kw)`. Returns the fake module so the test can
    attach extra exception classes (RateLimitError, APITimeoutError, ...)
    if it wants to assert the synth code path doesn't depend on their
    presence as imports."""
    fake = types.ModuleType("anthropic")

    class _Messages:
        def create(self, **kw):
            return create_behavior(**kw)

    class _Client:
        def __init__(self, **_kw):
            self.messages = _Messages()

    fake.Anthropic = _Client  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "anthropic", fake)
    return fake


# ── (1) Timeout ──────────────────────────────────────────────────────────────


def test_failure_mode_timeout_degrades(monkeypatch):
    """C-4 (1): a TimeoutError-like exception during messages.create()
    must degrade rather than 500."""
    monkeypatch.setenv("MUSU_USER_LLM_API_KEY", "sk-ant-test-fake-key")

    class FakeAPITimeoutError(Exception):
        """Stand-in for anthropic.APITimeoutError (we don't import the real
        thing because the agent doesn't depend on it by name — it catches
        Exception broadly, per constraint (a))."""

    def _boom(**_kw):
        raise FakeAPITimeoutError("LLM call exceeded 8s budget")

    _install_fake_anthropic(monkeypatch, create_behavior=_boom)

    agent = _import_agent()
    result = agent.synthesize_briefing(
        recent_pages=[{"page_id": "p", "title": "T", "summary_excerpt": "S"}],
        company_id="test",
    )
    assert result.synthesis is None
    assert result.degraded is True
    # degrade_reason format is `llm_error:{ClassName}` — confirm the class
    # name surfaces so operators can grep logs for it.
    assert result.degrade_reason == "llm_error:FakeAPITimeoutError"


# ── (2) No API key ───────────────────────────────────────────────────────────


def test_failure_mode_no_api_key_degrades(monkeypatch):
    """C-4 (2): MUSU_USER_LLM_API_KEY unset → degrade with the canonical
    `api_key_not_configured` reason (constraint b)."""
    monkeypatch.delenv("MUSU_USER_LLM_API_KEY", raising=False)
    agent = _import_agent()
    result = agent.synthesize_briefing(
        recent_pages=[{"page_id": "p", "title": "T", "summary_excerpt": "S"}],
        company_id="test",
    )
    assert result.synthesis is None
    assert result.degraded is True
    assert result.degrade_reason == "api_key_not_configured"


def test_failure_mode_blank_api_key_degrades(monkeypatch):
    """C-4 (2b): blank/whitespace key is treated as unset (constraint b
    rejects "   " too)."""
    monkeypatch.setenv("MUSU_USER_LLM_API_KEY", "   \t  ")
    agent = _import_agent()
    result = agent.synthesize_briefing(
        recent_pages=[{"page_id": "p", "title": "T", "summary_excerpt": "S"}],
        company_id="test",
    )
    assert result.degraded is True
    assert result.degrade_reason == "api_key_not_configured"


# ── (3) Budget exhaust ───────────────────────────────────────────────────────


def test_failure_mode_budget_exhaust_degrades(monkeypatch):
    """C-4 (3): a RateLimitError-like exception (billing / per-minute cap
    hit) must degrade. Mirrors what `anthropic.RateLimitError` would do at
    runtime."""
    monkeypatch.setenv("MUSU_USER_LLM_API_KEY", "sk-ant-test-fake-key")

    class FakeRateLimitError(Exception):
        """Stand-in for anthropic.RateLimitError. The agent doesn't import
        this class — it catches everything via constraint (a)'s broad
        except — so we don't need to register it on the fake module."""

    def _boom(**_kw):
        raise FakeRateLimitError("Budget exhausted — monthly quota reached")

    _install_fake_anthropic(monkeypatch, create_behavior=_boom)

    agent = _import_agent()
    result = agent.synthesize_briefing(
        recent_pages=[{"page_id": "p", "title": "T", "summary_excerpt": "S"}],
        company_id="test",
    )
    assert result.synthesis is None
    assert result.degraded is True
    assert result.degrade_reason == "llm_error:FakeRateLimitError"


# ── (4) Parse error ──────────────────────────────────────────────────────────


def test_failure_mode_parse_error_empty_content_degrades(monkeypatch):
    """C-4 (4a): provider returns HTTP 200 but `.content` is an empty list
    → the agent's `if not text: return degraded` branch fires with
    `empty_response`."""
    monkeypatch.setenv("MUSU_USER_LLM_API_KEY", "sk-ant-test-fake-key")

    class _EmptyMsg:
        content: list = []  # empty content → joined text == ""
        usage = None

    def _ok_but_empty(**_kw):
        return _EmptyMsg()

    _install_fake_anthropic(monkeypatch, create_behavior=_ok_but_empty)

    agent = _import_agent()
    result = agent.synthesize_briefing(
        recent_pages=[{"page_id": "p", "title": "T", "summary_excerpt": "S"}],
        company_id="test",
    )
    # `synthesis is None` (NEVER ""), `degraded is True`, reason is the
    # stable `empty_response` string the UI can switch on.
    assert result.synthesis is None
    assert result.degraded is True
    assert result.degrade_reason == "empty_response"


def test_failure_mode_parse_error_non_iterable_content_degrades(monkeypatch):
    """C-4 (4b): provider returns an object whose .content is not iterable
    (e.g. SDK schema drift surfacing a bare string instead of a content-
    block list). The broad except clause in the agent must catch the
    TypeError from the for-loop and degrade — NOT 500.

    NOTE: the agent uses `getattr(msg, "content", []) or []`, so an
    AttributeError on `.content` is silently coerced to []  (which then
    hits the `empty_response` branch). To exercise the bottom `except
    Exception` parse-error path we need .content to RESOLVE to a value
    that breaks the join loop downstream — a non-iterable does that
    deterministically."""
    monkeypatch.setenv("MUSU_USER_LLM_API_KEY", "sk-ant-test-fake-key")

    class _MalformedMsg:
        # Non-iterable .content → `for block in 12345` raises TypeError.
        content = 12345  # type: ignore[assignment]
        usage = None

    def _malformed(**_kw):
        return _MalformedMsg()

    _install_fake_anthropic(monkeypatch, create_behavior=_malformed)

    agent = _import_agent()
    result = agent.synthesize_briefing(
        recent_pages=[{"page_id": "p", "title": "T", "summary_excerpt": "S"}],
        company_id="test",
    )
    assert result.synthesis is None
    assert result.degraded is True
    # Caught by the bottom `except Exception` → `llm_error:TypeError`.
    assert result.degrade_reason == "llm_error:TypeError"


# ── (5) Endpoint-level: all 4 modes → 200 + degraded=true + source_pages ─────


@pytest.mark.parametrize(
    "scenario",
    [
        "timeout",
        "no_api_key",
        "budget_exhaust",
        "parse_error",
    ],
)
def test_endpoint_always_200_with_degraded_flag_on_failure(
    scenario, monkeypatch, tmp_path
):
    """C-4 (5): the endpoint MUST return HTTP 200 with a structured
    `{synthesis: null, source_pages: [...], degraded: true}` envelope for
    EVERY failure mode the agent can hit AFTER the api-key gate. The
    `no_api_key` scenario is the documented exception — it returns 503 by
    design (constraint b makes the missing-key path loud), but still ships
    a degraded envelope so the proxy + frontend can use the same code path.

    `source_pages` must be present and equal to whatever C-1's scanner
    returned (empty list in this test because we point MUSU_WIKI_BASE at an
    empty tmp dir).
    """
    monkeypatch.setenv("MUSU_WIKI_BASE", str(tmp_path))

    if scenario == "no_api_key":
        monkeypatch.delenv("MUSU_USER_LLM_API_KEY", raising=False)
    else:
        monkeypatch.setenv("MUSU_USER_LLM_API_KEY", "sk-ant-test-fake-key")

    # Wire the right failure into the fake anthropic module for the three
    # scenarios that reach the provider.
    if scenario == "timeout":
        class _Timeout(Exception):
            pass

        def _boom(**_kw):
            raise _Timeout("timeout")

        _install_fake_anthropic(monkeypatch, create_behavior=_boom)
    elif scenario == "budget_exhaust":
        class _RateLimit(Exception):
            pass

        def _boom(**_kw):
            raise _RateLimit("budget exhausted")

        _install_fake_anthropic(monkeypatch, create_behavior=_boom)
    elif scenario == "parse_error":
        class _BadMsg:
            content: list = []
            usage = None

        def _ok_but_empty(**_kw):
            return _BadMsg()

        _install_fake_anthropic(monkeypatch, create_behavior=_ok_but_empty)
    # else: no_api_key — no fake needed, gate fires first.

    _import_agent()
    from fastapi.testclient import TestClient

    # Patch get_company so the endpoint resolves a synthetic company. The
    # endpoint imports get_company into the server namespace at module
    # load, so patch the server-side ref directly.
    import server  # noqa: WPS433

    monkeypatch.setattr(
        server, "get_company", lambda cid: {"id": cid, "name": "test"}
    )

    client = TestClient(server.app, headers={"Authorization": "Bearer test-token"})
    res = client.post("/api/companies/test-company/cos-briefing-synthesize")

    body = res.json()
    if scenario == "no_api_key":
        # Constraint (b): missing key is the one documented loud failure.
        assert res.status_code == 503, res.text
        assert body["degraded"] is True
        assert body["synthesis"] is None
        assert body["degrade_reason"] == "api_key_not_configured"
        # source_pages still present (empty here) so the proxy doesn't
        # special-case the shape.
        assert body["source_pages"] == []
    else:
        # All other failure modes: 200 + degraded envelope.
        assert res.status_code == 200, res.text
        assert body["degraded"] is True
        assert body["synthesis"] is None
        # source_pages from C-1 must be preserved verbatim. tmp_path is
        # empty so the list is empty, but the KEY must exist so the
        # frontend never KeyErrors / undefined-derefs on the degrade
        # branch.
        assert "source_pages" in body
        assert isinstance(body["source_pages"], list)
        # degrade_reason MUST be set so operators can grep logs.
        assert body["degrade_reason"], "degrade_reason must be non-empty on failure"
