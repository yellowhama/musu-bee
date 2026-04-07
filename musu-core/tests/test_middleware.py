"""Tests for musu_core.middleware."""

from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from musu_core.errors import BadRequest, NotFound, Unauthorized
from musu_core.middleware import (
    ErrorHandlerMiddleware,
    RequestLoggerMiddleware,
    apply_musu_middlewares,
    require_bearer_token,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(raise_exc=None, bearer_token: str | None = None) -> FastAPI:
    """Build a minimal FastAPI app with musu middlewares wired up."""
    app = FastAPI()
    apply_musu_middlewares(app, bearer_token=bearer_token)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/error")
    async def error_route():
        if raise_exc is not None:
            raise raise_exc
        return {"ok": True}

    return app


# ---------------------------------------------------------------------------
# ErrorHandlerMiddleware
# ---------------------------------------------------------------------------


def test_error_handler_bad_request():
    app = _make_app(raise_exc=BadRequest("invalid input"))
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/error")
    assert resp.status_code == 400
    assert resp.json() == {"error": "invalid input", "code": "bad_request"}


def test_error_handler_not_found():
    app = _make_app(raise_exc=NotFound("resource missing"))
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/error")
    assert resp.status_code == 404
    assert resp.json()["code"] == "not_found"


def test_error_handler_generic_exception_returns_500():
    app = _make_app(raise_exc=RuntimeError("boom"))
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/error")
    assert resp.status_code == 500
    assert resp.json()["code"] == "internal_error"


# ---------------------------------------------------------------------------
# RequestLoggerMiddleware
# ---------------------------------------------------------------------------


def test_request_logger_records_entry(caplog):
    app = _make_app()
    with caplog.at_level(logging.INFO, logger="musu_core.middleware"):
        client = TestClient(app)
        resp = client.get("/health")
    assert resp.status_code == 200
    assert any("request" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# require_bearer_token / AuthMiddleware
# ---------------------------------------------------------------------------


def test_auth_missing_token_returns_401():
    app = _make_app(bearer_token="secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/error")
    assert resp.status_code == 401


def test_auth_wrong_token_returns_401():
    app = _make_app(bearer_token="secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/error", headers={"Authorization": "Bearer wrong"})
    assert resp.status_code == 401


def test_auth_correct_token_passes():
    app = _make_app(bearer_token="secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/error", headers={"Authorization": "Bearer secret"})
    assert resp.status_code == 200


def test_auth_health_bypasses_token():
    app = _make_app(bearer_token="secret")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# apply_musu_middlewares
# ---------------------------------------------------------------------------


def test_apply_no_bearer_token_no_auth():
    """Without bearer_token, all routes are accessible without auth."""
    app = _make_app(bearer_token=None)
    client = TestClient(app)
    resp = client.get("/error")
    assert resp.status_code == 200


def test_apply_with_bearer_token_enforces_auth():
    """With bearer_token set, protected routes require correct token."""
    app = _make_app(bearer_token="tok")
    client = TestClient(app, raise_server_exceptions=False)
    # No token → 401
    assert client.get("/error").status_code == 401
    # Correct token → 200
    assert client.get("/error", headers={"Authorization": "Bearer tok"}).status_code == 200
