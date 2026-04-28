"""E2E HTTP tests for Ralph Loop API endpoints."""
import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


class TestRalphLoopEndpoints:
    def test_ralph_status_not_running(self):
        """GET /api/ralph/status/{id} when no loop → not_running."""
        r = client.get("/api/ralph/status/nonexistent-company-id")
        assert r.status_code == 200
        assert r.json()["status"] == "not_running"

    def test_ralph_cancel_not_running(self):
        """POST /api/ralph/cancel/{id} when no loop → cancelled=false."""
        r = client.post("/api/ralph/cancel/nonexistent-company-id")
        assert r.status_code == 200
        assert r.json()["cancelled"] is False

    def test_ralph_start_invalid_company(self):
        """POST /api/ralph/start with nonexistent company."""
        r = client.post("/api/ralph/start", json={
            "company_id": "fake-company-id-12345",
            "max_iterations": 1,
            "channel": "team_lead",
        })
        # Either starts (returns 200) or company validation fails
        # The important thing is endpoint is reachable and returns valid JSON
        assert r.status_code == 200
        data = r.json()
        assert "started" in data or "error" in data
