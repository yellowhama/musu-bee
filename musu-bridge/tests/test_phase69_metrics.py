"""Phase 69: Prometheus metrics + circuit-breaker observability endpoint tests."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from server import app

_AUTH = {"Authorization": "Bearer test-token"}
_client = TestClient(app, raise_server_exceptions=False)


class TestMetricsEndpoint:
    def test_metrics_returns_200(self):
        resp = _client.get("/metrics")
        assert resp.status_code == 200

    def test_metrics_content_type_is_prometheus(self):
        resp = _client.get("/metrics")
        assert "text/plain" in resp.headers.get("content-type", "")

    def test_metrics_contains_http_request_duration(self):
        _client.get("/health")
        resp = _client.get("/metrics")
        assert "http_request_duration" in resp.text or "http_requests" in resp.text

    def test_metrics_contains_active_tasks_count(self):
        resp = _client.get("/metrics")
        assert "active_tasks_count" in resp.text

    def test_metrics_contains_agent_tasks_total(self):
        resp = _client.get("/metrics")
        assert "agent_tasks_total" in resp.text


class TestCircuitBreakerEndpoint:
    def test_circuit_breakers_returns_200(self):
        mock_backend = MagicMock()
        mock_backend._db.execute.return_value = []

        with patch("server._get_heartbeat_backend", return_value=mock_backend):
            resp = _client.get("/api/system/circuit-breakers", headers=_AUTH)
        assert resp.status_code == 200

    def test_circuit_breakers_has_heartbeat_key(self):
        mock_backend = MagicMock()
        mock_backend._db.execute.return_value = []

        with patch("server._get_heartbeat_backend", return_value=mock_backend):
            resp = _client.get("/api/system/circuit-breakers", headers=_AUTH)
        data = resp.json()
        assert "heartbeat" in data

    def test_circuit_breakers_heartbeat_has_state(self):
        mock_backend = MagicMock()
        mock_backend._db.execute.return_value = []

        with patch("server._get_heartbeat_backend", return_value=mock_backend):
            resp = _client.get("/api/system/circuit-breakers", headers=_AUTH)
        data = resp.json()
        assert "state" in data["heartbeat"]
        assert data["heartbeat"]["state"] in ("open", "closed")

    def test_circuit_breakers_closed_when_no_failures(self):
        mock_backend = MagicMock()
        mock_backend._db.execute.side_effect = [
            [],           # SELECT running → no running tasks
            [{"cnt": 0}], # SELECT failed count → 0
        ]

        with patch("server._get_heartbeat_backend", return_value=mock_backend):
            resp = _client.get("/api/system/circuit-breakers", headers=_AUTH)
        data = resp.json()
        assert data["heartbeat"]["state"] == "closed"

    def test_circuit_breakers_open_when_too_many_failures(self):
        mock_backend = MagicMock()
        mock_backend._db.execute.side_effect = [
            [],           # SELECT running → no running tasks
            [{"cnt": 5}], # SELECT failed count → 5 > CIRCUIT_TRIP_THRESHOLD=3
        ]

        with patch("server._get_heartbeat_backend", return_value=mock_backend):
            resp = _client.get("/api/system/circuit-breakers", headers=_AUTH)
        data = resp.json()
        assert data["heartbeat"]["state"] == "open"

    def test_circuit_breakers_has_active_tasks(self):
        mock_backend = MagicMock()
        mock_backend._db.execute.return_value = []

        with patch("server._get_heartbeat_backend", return_value=mock_backend):
            resp = _client.get("/api/system/circuit-breakers", headers=_AUTH)
        data = resp.json()
        assert "active_tasks" in data
        assert isinstance(data["active_tasks"], int)
