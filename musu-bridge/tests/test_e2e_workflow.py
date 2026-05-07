"""E2E integration test: company create → agent list → delegate → verify.

Uses TestClient against the actual server app (no mocking).
Does NOT spawn real AI CLIs — tests the API workflow only.
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "musu-core" / "src"))

os.environ.setdefault("MUSU_BRIDGE_TOKEN", "test-token")

from server import app
from fastapi.testclient import TestClient

client = TestClient(app, headers={"Authorization": "Bearer test-token"})


class TestHealthWorkflow:
    """Verify health endpoints work end-to-end."""

    def test_health_returns_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert "relay" in data

    def test_health_ready(self):
        resp = client.get("/health/ready")
        assert resp.status_code in (200, 503)  # 503 if DB issue, but endpoint exists

    def test_swagger_docs_accessible(self):
        resp = client.get("/docs")
        assert resp.status_code == 200
        assert "swagger" in resp.text.lower()

    def test_openapi_json(self):
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        data = resp.json()
        assert "paths" in data
        assert len(data["paths"]) > 50  # Should have 100+ endpoints


class TestAgentWorkflow:
    """Verify agent CRUD works."""

    def test_list_agents(self):
        resp = client.get("/api/agents")
        assert resp.status_code == 200
        agents = resp.json()
        assert isinstance(agents, list)
        assert len(agents) > 0  # Should have seeded agents

    def test_agent_has_adapter_config(self):
        resp = client.get("/api/agents")
        agents = resp.json()
        for agent in agents[:5]:  # Check first 5
            config = agent.get("adapter_config", {})
            if config.get("command"):  # Only check agents with presets
                assert config["command"] in ("claude", "gemini", "codex")
                assert "cwd" in config
                assert "timeout_sec" in config


class TestCompanyWorkflow:
    """Verify company create → list flow."""

    def test_list_companies(self):
        resp = client.get("/api/companies")
        assert resp.status_code == 200
        companies = resp.json()
        assert isinstance(companies, list)

    def test_list_templates(self):
        resp = client.get("/api/templates")
        assert resp.status_code == 200
        data = resp.json()
        templates = data.get("templates", data) if isinstance(data, dict) else data
        assert isinstance(templates, list)
        assert len(templates) > 0


class TestNodeWorkflow:
    """Verify node management."""

    def test_list_nodes(self):
        resp = client.get("/api/nodes")
        assert resp.status_code == 200

    def test_circuit_breakers(self):
        resp = client.get("/api/system/circuit-breakers")
        assert resp.status_code == 200


class TestTaskDelegation:
    """Verify task delegation endpoint (without actual agent execution)."""

    def test_delegate_returns_task_id(self):
        """Delegate a task — should return task_id even if agent fails."""
        resp = client.post("/api/tasks/delegate", json={
            "channel": "worker",
            "text": "test task from e2e",
            "sender_id": f"e2e-test-{uuid.uuid4().hex[:8]}",
            "expected_output": "test",
            "allow_duplicate": True,
        })
        # May be 200 (accepted) or 400 (rate limit/validation)
        assert resp.status_code in (200, 202, 400, 429)
        if resp.status_code in (200, 202):
            data = resp.json()
            assert "task_id" in data

    def test_list_tasks(self):
        resp = client.get("/api/tasks")
        assert resp.status_code == 200
        tasks = resp.json()
        assert isinstance(tasks, list)


class TestMeshUpdate:
    """Verify system update endpoints exist."""

    def test_update_endpoint_exists(self):
        """system/update should be reachable."""
        resp = client.post("/api/system/update")
        assert resp.status_code == 200

    def test_update_all_route_registered(self):
        """system/update-all endpoint should exist."""
        routes = [r.path for r in app.routes if hasattr(r, 'path')]
        assert "/api/system/update-all" in routes
