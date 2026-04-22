"""Tests for global runs and costs endpoints."""
from __future__ import annotations

import os

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")
os.environ.setdefault("MUSU_DISABLE_RATE_LIMIT", "1")

from fastapi.testclient import TestClient

from server import app

_HEADERS = {"Authorization": "Bearer test-token"}
_CLIENT = TestClient(app, raise_server_exceptions=False)


def test_runs_recent_returns_list():
    r = _CLIENT.get("/api/runs/recent?limit=10", headers=_HEADERS)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_runs_recent_limit_param():
    r = _CLIENT.get("/api/runs/recent?limit=5", headers=_HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert len(data) <= 5


def test_costs_summary_returns_dict():
    r = _CLIENT.get("/api/costs/summary", headers=_HEADERS)
    assert r.status_code == 200
    data = r.json()
    assert "total_requests" in data
    assert "by_status" in data
    assert "period" in data


def test_costs_by_agent_returns_list():
    r = _CLIENT.get("/api/costs/by-agent", headers=_HEADERS)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_endpoints_require_auth():
    for path in ["/api/runs/recent", "/api/costs/summary", "/api/costs/by-agent"]:
        r = _CLIENT.get(path)
        assert r.status_code in (401, 403), f"{path} should require auth"


def test_runs_recent_includes_token_fields():
    """get_runs_recent() 응답에 input_tokens, output_tokens, cost_usd, duration_sec 포함 확인."""
    import pytest
    from musu_core.backends.local import LocalBackend

    db_path = os.environ.get("MUSU_DB_PATH", "/tmp/musu_test.db")
    backend = LocalBackend(db_path)
    backend._db.execute(
        "INSERT OR REPLACE INTO route_executions (id, channel, sender_id, input, company_id, status, input_tokens, output_tokens, cost_usd, duration_sec, created_at)"
        " VALUES ('test-tok-1', 'engineer', 'test', 'hello', 'test-co', 'done', 42, 17, 0.001, 1.5, datetime('now'))"
    )
    rows = backend.get_runs_recent(limit=10)
    tok_row = next((r for r in rows if r["id"] == "test-tok-1"), None)
    assert tok_row is not None
    assert tok_row.get("input_tokens") == 42
    assert tok_row.get("output_tokens") == 17
    assert tok_row.get("cost_usd") == pytest.approx(0.001)
    assert tok_row.get("duration_sec") == pytest.approx(1.5)
