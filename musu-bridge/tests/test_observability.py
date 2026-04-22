"""Tests for Phase 66 observability: JSON logging, Request ID middleware, /health/ready."""
from __future__ import annotations

import json
import logging
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from server import JsonFormatter, RequestIDMiddleware, app

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# 1. /health/ready — DB OK
# ---------------------------------------------------------------------------

def test_health_ready_ok(tmp_path):
    """GET /health/ready → 200 {status: ready, db: ok} when DB is accessible."""
    resp = _client.get("/health/ready", headers=_AUTH)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ready"
    assert data["db"] == "ok"


# ---------------------------------------------------------------------------
# 2. /health/ready — DB error → 503
# ---------------------------------------------------------------------------

def test_health_ready_db_error():
    """GET /health/ready → 503 {status: not_ready, db: error} when DB fails."""
    with patch("server._get_heartbeat_backend") as mock_get_backend:
        mock_backend = MagicMock()
        mock_backend._db.execute.side_effect = Exception("DB connection failed")
        mock_get_backend.return_value = mock_backend

        resp = _client.get("/health/ready", headers=_AUTH)
        assert resp.status_code == 503
        data = resp.json()
        assert data["status"] == "not_ready"
        assert data["db"] == "error"


# ---------------------------------------------------------------------------
# 3. X-Request-ID auto-generated when not provided
# ---------------------------------------------------------------------------

def test_request_id_auto_generated():
    """Response should include X-Request-ID header even when not provided in request."""
    resp = _client.get("/health", headers=_AUTH)
    assert "x-request-id" in resp.headers or "X-Request-ID" in resp.headers
    # Validate it's a UUID
    header_val = resp.headers.get("x-request-id") or resp.headers.get("X-Request-ID")
    assert header_val is not None
    uuid.UUID(header_val)  # raises ValueError if not valid UUID


# ---------------------------------------------------------------------------
# 4. X-Request-ID echoed back when provided
# ---------------------------------------------------------------------------

def test_request_id_echoed():
    """If X-Request-ID is sent in request, same value must be echoed in response."""
    custom_id = str(uuid.uuid4())
    resp = _client.get("/health", headers={**_AUTH, "X-Request-ID": custom_id})
    header_val = resp.headers.get("x-request-id") or resp.headers.get("X-Request-ID")
    assert header_val == custom_id


# ---------------------------------------------------------------------------
# 5. JsonFormatter — produces valid JSON with required fields
# ---------------------------------------------------------------------------

def test_json_formatter_basic():
    """JsonFormatter should produce valid JSON with time, level, logger, msg fields."""
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test.logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=1,
        msg="hello world",
        args=(),
        exc_info=None,
    )
    output = formatter.format(record)
    data = json.loads(output)
    assert "time" in data
    assert data["level"] == "INFO"
    assert data["logger"] == "test.logger"
    assert data["msg"] == "hello world"


# ---------------------------------------------------------------------------
# 6. JsonFormatter — exception info included as exc field
# ---------------------------------------------------------------------------

def test_json_formatter_with_exception():
    """JsonFormatter should include exc field when exception info is present."""
    formatter = JsonFormatter()
    try:
        raise ValueError("test error")
    except ValueError:
        import sys
        exc_info = sys.exc_info()

    record = logging.LogRecord(
        name="test.logger",
        level=logging.ERROR,
        pathname="test.py",
        lineno=1,
        msg="something failed",
        args=(),
        exc_info=exc_info,
    )
    output = formatter.format(record)
    data = json.loads(output)
    assert "exc" in data
    assert "ValueError" in data["exc"]


# ---------------------------------------------------------------------------
# 7. JsonFormatter — request_id field when set on record
# ---------------------------------------------------------------------------

def test_json_formatter_request_id():
    """JsonFormatter should include request_id field when set on log record."""
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="test.logger",
        level=logging.DEBUG,
        pathname="test.py",
        lineno=1,
        msg="with id",
        args=(),
        exc_info=None,
    )
    record.request_id = "abc-123"
    output = formatter.format(record)
    data = json.loads(output)
    assert data.get("request_id") == "abc-123"


# ---------------------------------------------------------------------------
# 8. RequestIDMiddleware class exists and is importable
# ---------------------------------------------------------------------------

def test_request_id_middleware_class():
    """RequestIDMiddleware must be importable from server and subclass BaseHTTPMiddleware."""
    from starlette.middleware.base import BaseHTTPMiddleware
    assert issubclass(RequestIDMiddleware, BaseHTTPMiddleware)


# ---------------------------------------------------------------------------
# 9. /health/ready accessible (auth bypass or open endpoint check)
# ---------------------------------------------------------------------------

def test_health_ready_no_auth():
    """GET /health/ready should respond (may be 401 or 200, but not 404/500)."""
    resp = _client.get("/health/ready")
    assert resp.status_code in (200, 401, 403)
