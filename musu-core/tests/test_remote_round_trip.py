"""Integration test: A→B remote execution round-trip via musu-worker ASGI app.

Simulates Machine A (RemoteProcessAdapter) calling Machine B (musu-worker
/execute/process) using httpx.ASGITransport so no real TCP socket is needed.
This validates the full HTTP request/response path through the worker.

Acceptance criterion from MUS-937:
  "통합 테스트 1개: A→B remote execution round-trip"
"""
from __future__ import annotations

import asyncio
import os
from unittest.mock import patch

import httpx
import pytest

from musu_core.adapters.base import AdapterContext
from musu_core.adapters.remote_process import RemoteProcessAdapter


WORKER_URL = "http://worker-test:9700"


def _make_ctx(**config) -> AdapterContext:
    return AdapterContext(
        run_id="integration-test",
        prompt="",
        agent_id="agent-a",
        agent_name="CEO",
        agent_role="ceo",
        adapter_type="remote_process",
        config={"worker_url": WORKER_URL, **config},
    )


def _asgi_client_factory(app):
    """Return a drop-in for httpx.AsyncClient that routes through *app* in-process."""
    transport = httpx.ASGITransport(app=app)
    _orig = httpx.AsyncClient

    class _InProcessClient:
        def __init__(self, timeout=None):
            self._inner = _orig(transport=transport, timeout=timeout)

        async def __aenter__(self):
            await self._inner.__aenter__()
            return self._inner

        async def __aexit__(self, *exc_info):
            await self._inner.__aexit__(*exc_info)

    return _InProcessClient


def test_remote_process_round_trip_echo():
    """RemoteProcessAdapter → musu-worker /execute/process → echo (no real socket).

    Machine A adapter builds the HTTP request; musu-worker ASGI app handles it
    in-process; the result comes back through RemoteProcessAdapter as an
    AdapterResult.  Proves the A→B contract without a live Machine B.
    """
    # musu-worker app must be importable; open-auth mode (no token in env).
    musu_worker = pytest.importorskip("musu_worker", reason="musu-worker not installed")
    from musu_worker.main import app  # noqa: PLC0415

    adapter = RemoteProcessAdapter()
    ctx = _make_ctx(command="echo", args=["hello-from-machine-b"])

    with patch("httpx.AsyncClient", _asgi_client_factory(app)):
        result = asyncio.run(adapter.execute(ctx))

    assert result.success, f"Round-trip failed: {result.error!r}"
    assert "hello-from-machine-b" in result.summary
