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
