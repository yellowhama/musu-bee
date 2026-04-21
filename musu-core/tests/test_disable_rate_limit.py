"""Test that MUSU_DISABLE_RATE_LIMIT=1 suppresses rate limiting in apply_musu_middlewares."""
from __future__ import annotations

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _make_app(disable: bool) -> FastAPI:
    # Import fresh each time by reloading or using a factory.
    # We monkey-patch the env, then build the app.
    from musu_core.middleware import apply_musu_middlewares

    app = FastAPI()

    @app.get("/ping")
    async def ping():
        return {"ok": True}

    if disable:
        os.environ["MUSU_DISABLE_RATE_LIMIT"] = "1"
    else:
        os.environ.pop("MUSU_DISABLE_RATE_LIMIT", None)

    apply_musu_middlewares(
        app,
        rate_limit_capacity=5,  # low cap so we hit it easily
        rate_limit_window_seconds=60,
        rate_limit_key_type="ip",
    )
    return app


def test_rate_limit_disabled_no_429():
    """With MUSU_DISABLE_RATE_LIMIT=1, sending 10 requests never returns 429."""
    app = _make_app(disable=True)
    client = TestClient(app, raise_server_exceptions=False)
    for _ in range(10):
        r = client.get("/ping")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_rate_limit_enabled_returns_429():
    """Without the flag, exceeding capacity=5 returns 429."""
    app = _make_app(disable=False)
    client = TestClient(app, raise_server_exceptions=False)
    statuses = [client.get("/ping").status_code for _ in range(10)]
    assert 429 in statuses, "Expected at least one 429 when rate limit is active"
