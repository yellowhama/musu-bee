"""v15.2 — adapter probe endpoint: ok / timeout / exception / not-installed."""
from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass, field
from typing import Any

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from handlers import probe_adapter  # noqa: E402


# ── Fake adapter doubles (mirrors test_template_decision_llm.py) ──────────


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
    def __init__(self, response: str = "ok", should_fail: bool = False,
                 raise_exc: bool = False, sleep_seconds: float = 0.0,
                 error_text: str | None = None):
        self._response = response
        self._should_fail = should_fail
        self._raise_exc = raise_exc
        self._sleep_seconds = sleep_seconds
        self._error_text = error_text

    @property
    def adapter_type(self) -> str:
        return "gemini_local"

    async def execute(self, ctx) -> _FakeResult:
        if self._sleep_seconds:
            await asyncio.sleep(self._sleep_seconds)
        if self._raise_exc:
            raise RuntimeError("adapter blew up")
        return _FakeResult(
            success=not self._should_fail,
            summary=self._response,
            error=self._error_text,
        )


@pytest.fixture
def patch_adapter(monkeypatch):
    """Replace musu_core.adapters.registry.get_adapter with a controllable fake."""
    installed: dict[str, Any] = {"adapter": None}

    def install(adapter):
        installed["adapter"] = adapter

    def fake_get_adapter(adapter_type: str):
        return installed["adapter"]

    import musu_core.adapters.registry as registry
    monkeypatch.setattr(registry, "get_adapter", fake_get_adapter)
    return install


# ── happy path ────────────────────────────────────────────────────────────


def test_probe_ok(patch_adapter):
    patch_adapter(_FakeAdapter(response="ok"))
    result = asyncio.run(probe_adapter("gemini_local", timeout_seconds=2.0))
    assert result["ok"] is True
    assert result["reason"] == "ok"
    assert isinstance(result["latency_ms"], float)
    assert result["latency_ms"] >= 0


# ── adapter not installed ─────────────────────────────────────────────────


def test_probe_not_installed(patch_adapter):
    patch_adapter(None)  # registry.get_adapter returns None
    result = asyncio.run(probe_adapter("gemini_local", timeout_seconds=2.0))
    assert result["ok"] is False
    assert "not installed" in result["reason"]
    assert "latency_ms" not in result


# ── exception path ────────────────────────────────────────────────────────


def test_probe_adapter_raises(patch_adapter):
    patch_adapter(_FakeAdapter(response="", raise_exc=True))
    result = asyncio.run(probe_adapter("gemini_local", timeout_seconds=2.0))
    assert result["ok"] is False
    assert "RuntimeError" in result["reason"]
    assert "blew up" in result["reason"]


# ── success=False from adapter ───────────────────────────────────────────


def test_probe_adapter_returns_failure(patch_adapter):
    patch_adapter(_FakeAdapter(
        response="", should_fail=True, error_text="rate limited"))
    result = asyncio.run(probe_adapter("gemini_local", timeout_seconds=2.0))
    assert result["ok"] is False
    assert "rate limited" in result["reason"]
    assert "latency_ms" in result
