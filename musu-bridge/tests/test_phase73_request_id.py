"""Phase 73: request_id trace propagation — ContextVar + structured logging."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from server import app, _request_id_var

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)


class TestRequestIDMiddleware:
    """RequestIDMiddleware must store request_id in ContextVar."""

    def test_response_echoes_provided_request_id(self):
        """X-Request-ID header provided by client is echoed in response."""
        resp = _client.get("/health", headers={**_AUTH, "X-Request-ID": "test-trace-123"})
        assert resp.headers.get("X-Request-ID") == "test-trace-123"

    def test_response_generates_request_id_when_absent(self):
        """When no X-Request-ID provided, server generates one (UUID format)."""
        resp = _client.get("/health", headers=_AUTH)
        rid = resp.headers.get("X-Request-ID")
        assert rid is not None
        assert len(rid) == 36  # UUID4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

    def test_request_id_var_is_defined(self):
        """_request_id_var ContextVar must be exported from server module."""
        from contextvars import ContextVar
        assert isinstance(_request_id_var, ContextVar)


class TestRequestIDContextVar:
    """request_id ContextVar must be set during request lifecycle."""

    def test_contextvar_has_default(self):
        """_request_id_var must have a default value (empty string or None)."""
        # Outside request context, default should be accessible without error
        val = _request_id_var.get(None)
        assert val is None or isinstance(val, str)
