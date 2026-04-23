"""Tests for GET /health/ready — DB connectivity + agent channel health checks."""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from server import app

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


# ── DB check ──────────────────────────────────────────────────────────────────

def test_health_ready_db_ok():
    """DB healthy → 200 with status=ready and db=ok."""
    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = [{"1": 1}]

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["db"] == "ok"


def test_health_ready_db_error_returns_503():
    """DB unavailable → 503 with status=not_ready."""
    with patch("server._get_heartbeat_backend", side_effect=Exception("db down")):
        resp = client.get("/health/ready")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["db"] == "error"


# ── Agent channel check ───────────────────────────────────────────────────────

def test_health_ready_includes_agent_channels():
    """Healthy DB + no open CBs → response includes agents field."""
    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = [{"1": 1}]

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 200
    assert "agents" in resp.json()


def test_health_ready_all_channels_closed():
    """All standard channels closed → agents all show ok."""
    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = [{"1": 1}]

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 200
    agents = resp.json()["agents"]
    assert isinstance(agents, dict)
    for ch in ("engineer", "cto", "ceo", "qa"):
        assert ch in agents
        assert agents[ch] == "ok"


def test_health_ready_open_cb_channel_degraded():
    """Open CB on 'engineer' channel → agents.engineer=degraded, status still 200."""
    mock_backend = MagicMock()
    mock_backend._db.execute.return_value = [{"1": 1}]

    def mock_is_open(channel):
        return channel == "engineer"

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.side_effect = mock_is_open
            resp = client.get("/health/ready")

    assert resp.status_code == 200
    body = resp.json()
    assert body["agents"]["engineer"] == "degraded"
    assert body["agents"]["ceo"] == "ok"


def test_health_ready_503_when_db_fails():
    """DB failure → always 503 regardless of channel state."""
    with patch("server._get_heartbeat_backend", side_effect=Exception("timeout")):
        resp = client.get("/health/ready")

    assert resp.status_code == 503
    assert resp.json()["status"] == "not_ready"
