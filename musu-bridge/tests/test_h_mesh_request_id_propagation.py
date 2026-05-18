"""V23.5 H-4a: X-Request-ID HTTP mesh propagation behind feature flag.

Verifies _forward_http behaviour for MUSU_X_REQUEST_ID_PROPAGATION_ENABLED:
  - Flag OFF (default)     → no X-Request-ID header on outbound request
  - Flag ON  + rid set     → X-Request-ID present with exact value
  - Flag ON  + rid empty   → no X-Request-ID header (empty is not propagated)
  - Flag ON                → existing Authorization header preserved
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

import mesh_router as mesh_router_mod
from mesh_router import CircuitBreaker, MeshRouter
from server import _request_id_var


def _make_router() -> MeshRouter:
    """Build a MeshRouter with a single remote node + bearer token (no nodes.toml)."""
    router = MeshRouter.__new__(MeshRouter)
    router._path = None  # type: ignore[assignment]
    router._self_name = "local"
    router._node_urls = {"remote": "http://remote:8070"}
    router._node_agents = {"remote": ["agent_a"]}
    router._agent_nodes = {"agent_a": "remote"}
    router._node_tokens = {"remote": "peer-secret"}
    router._node_mac = {}
    router._node_broadcast = {}
    router._node_fingerprints = {}
    router._health_cache = {}
    router._loaded = True
    router._cb = CircuitBreaker(failure_threshold=3, cooldown_seconds=60)
    return router


def _install_capture(monkeypatch, captured: dict) -> None:
    """Replace httpx.AsyncClient with one that records the outgoing request and
    returns a 200 OK JSON body, so _forward_http exits via the happy path."""

    def _handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        captured["url"] = str(request.url)
        return httpx.Response(200, json={"response": "ok"})

    transport = httpx.MockTransport(_handler)
    real_async_client = httpx.AsyncClient

    def _factory(*args, **kwargs):
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(mesh_router_mod.httpx, "AsyncClient", _factory)


@pytest.mark.asyncio
async def test_flag_off_default_no_request_id_header(monkeypatch):
    """Flag unset → no X-Request-ID header (default OFF, zero behavioural change)."""
    monkeypatch.delenv("MUSU_X_REQUEST_ID_PROPAGATION_ENABLED", raising=False)
    captured: dict = {}
    _install_capture(monkeypatch, captured)

    router = _make_router()
    token = _request_id_var.set("trace-should-not-leak")
    try:
        result = await router._forward_http(
            "http://remote:8070", "agent_a", "user", "hello", None, None
        )
    finally:
        _request_id_var.reset(token)

    assert result == {"response": "ok"}
    headers = {k.lower(): v for k, v in captured["headers"].items()}
    assert "x-request-id" not in headers


@pytest.mark.asyncio
async def test_flag_on_with_request_id_sets_header(monkeypatch):
    """Flag=1 + rid set → X-Request-ID present with exact value, Authorization preserved."""
    monkeypatch.setenv("MUSU_X_REQUEST_ID_PROPAGATION_ENABLED", "1")
    captured: dict = {}
    _install_capture(monkeypatch, captured)

    router = _make_router()
    token = _request_id_var.set("trace-abc-123")
    try:
        result = await router._forward_http(
            "http://remote:8070", "agent_a", "user", "hello", None, None
        )
    finally:
        _request_id_var.reset(token)

    assert result == {"response": "ok"}
    headers = {k.lower(): v for k, v in captured["headers"].items()}
    assert headers.get("x-request-id") == "trace-abc-123"
    # Authorization still applied alongside the new header.
    assert headers.get("authorization") == "Bearer peer-secret"


@pytest.mark.asyncio
async def test_flag_on_empty_request_id_omits_header(monkeypatch):
    """Flag=1 but rid is empty/unset → header omitted (empty is not propagated)."""
    monkeypatch.setenv("MUSU_X_REQUEST_ID_PROPAGATION_ENABLED", "1")
    captured: dict = {}
    _install_capture(monkeypatch, captured)

    router = _make_router()
    # No ContextVar token set → _get_request_id() returns "".
    result = await router._forward_http(
        "http://remote:8070", "agent_a", "user", "hello", None, None
    )

    assert result == {"response": "ok"}
    headers = {k.lower(): v for k, v in captured["headers"].items()}
    assert "x-request-id" not in headers


@pytest.mark.asyncio
async def test_flag_on_preserves_existing_headers(monkeypatch):
    """Flag=1 → X-Request-ID added without disturbing Authorization (bearer token)."""
    monkeypatch.setenv("MUSU_X_REQUEST_ID_PROPAGATION_ENABLED", "1")
    captured: dict = {}
    _install_capture(monkeypatch, captured)

    router = _make_router()
    token = _request_id_var.set("trace-preserved")
    try:
        await router._forward_http(
            "http://remote:8070", "agent_a", "user", "hello", None, None
        )
    finally:
        _request_id_var.reset(token)

    headers = {k.lower(): v for k, v in captured["headers"].items()}
    assert headers.get("authorization") == "Bearer peer-secret"
    assert headers.get("x-request-id") == "trace-preserved"


def test_get_request_id_helper_returns_empty_when_unset():
    """_get_request_id() returns "" when ContextVar default (None) is in effect."""
    from mesh_router import _get_request_id

    # Setting the var to None explicitly to mirror outside-request-context state.
    token = _request_id_var.set(None)
    try:
        assert _get_request_id() == ""
    finally:
        _request_id_var.reset(token)


def test_get_request_id_helper_returns_value_when_set():
    """_get_request_id() returns the ContextVar value when set."""
    from mesh_router import _get_request_id

    token = _request_id_var.set("rid-xyz")
    try:
        assert _get_request_id() == "rid-xyz"
    finally:
        _request_id_var.reset(token)
