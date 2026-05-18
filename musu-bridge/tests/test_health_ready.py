"""Tests for GET /health/ready — DB connectivity + agent channel health checks."""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from server import app, MIGRATIONS_MIN_VERSION

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


def _mock_db_execute(user_version: int = MIGRATIONS_MIN_VERSION):
    """Build an execute() side_effect that returns SELECT 1 for non-PRAGMA
    queries and ``[(user_version,)]`` for ``PRAGMA user_version``.

    Matches Database.execute() contract (returns list[Row], not Cursor).
    """
    def _side_effect(sql, *args, **kwargs):
        if "user_version" in sql:
            return [(user_version,)]
        return [(1,)]
    return _side_effect


# ── DB check ──────────────────────────────────────────────────────────────────

def test_health_ready_db_ok():
    """DB healthy + schema current → 200 with status=ready and db=ok."""
    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _mock_db_execute()

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
    mock_backend._db.execute.side_effect = _mock_db_execute()

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 200
    assert "agents" in resp.json()


def test_health_ready_all_channels_closed():
    """All standard channels closed → agents all show ok."""
    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _mock_db_execute()

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
    mock_backend._db.execute.side_effect = _mock_db_execute()

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


# ── Schema watermark check (V23.5 H-3) ─────────────────────────────────────────

def test_health_ready_schema_below_min_returns_503():
    """user_version < MIGRATIONS_MIN_VERSION → 503 with reason=schema_below_min."""
    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _mock_db_execute(user_version=10)

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["reason"] == "schema_below_min"
    assert body["user_version"] == 10
    assert body["min"] == MIGRATIONS_MIN_VERSION


def test_health_ready_schema_zero_returns_503():
    """Fresh DB pre-apply_pending (user_version=0) → 503."""
    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _mock_db_execute(user_version=0)

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 503
    body = resp.json()
    assert body["reason"] == "schema_below_min"
    assert body["user_version"] == 0


def test_health_ready_schema_at_min_returns_200():
    """user_version == MIGRATIONS_MIN_VERSION → 200 with user_version exposed."""
    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _mock_db_execute(
        user_version=MIGRATIONS_MIN_VERSION
    )

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["user_version"] == MIGRATIONS_MIN_VERSION


def test_health_ready_schema_above_min_returns_200():
    """user_version > MIGRATIONS_MIN_VERSION (future migration, same binary) →
    200. Forward-compat: a binary at version N should accept a DB at N+k
    because additive migrations are backward-compatible by Const VI."""
    mock_backend = MagicMock()
    mock_backend._db.execute.side_effect = _mock_db_execute(
        user_version=MIGRATIONS_MIN_VERSION + 5
    )

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 200


def test_health_ready_user_version_unreadable_returns_503():
    """PRAGMA user_version raising (corrupted DB) → 503 with reason."""
    mock_backend = MagicMock()

    def _exec(sql, *args, **kwargs):
        if "user_version" in sql:
            raise RuntimeError("pragma failed")
        return [(1,)]
    mock_backend._db.execute.side_effect = _exec

    with patch("server._get_heartbeat_backend", return_value=mock_backend):
        with patch("server._channel_cb") as mock_cb:
            mock_cb.is_open.return_value = False
            resp = client.get("/health/ready")

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "not_ready"
    assert body["reason"] == "user_version_unreadable"


def test_health_ready_min_matches_migrations_length():
    """MIGRATIONS_MIN_VERSION must equal len(MIGRATIONS) — drift here means
    a new migration was added without bumping the gate (or vice versa)."""
    from musu_core.migrations import MIGRATIONS
    assert MIGRATIONS_MIN_VERSION == len(MIGRATIONS), (
        f"MIGRATIONS_MIN_VERSION={MIGRATIONS_MIN_VERSION} but "
        f"len(MIGRATIONS)={len(MIGRATIONS)}. Bump server.MIGRATIONS_MIN_VERSION "
        f"when adding a migration."
    )
