"""Unit tests for Phase 13+14+15 agent control endpoints."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent))

from server import app  # noqa: E402

client = TestClient(app, headers={"Authorization": "Bearer test-token"})

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_AGENT = {
    "id": "agent-001",
    "name": "ceo",
    "role": "CEO",
    "adapter_type": "process",
    "adapter_config": {},
    "status": "active",
    "created_at": "2026-04-17T00:00:00.000Z",
    "updated_at": "2026-04-17T00:00:00.000Z",
}

_COMPANY = {
    "id": "company-001",
    "name": "musu_corp",
    "template_key": "default",
    "workspace_id": "ws-musu",
    "meta": {},
    "created_at": "2026-04-17T00:00:00.000Z",
    "updated_at": "2026-04-17T00:00:00.000Z",
}

_ISSUE = {
    "id": "issue-001",
    "company_id": "company-001",
    "title": "Test issue",
    "description": "",
    "status": "open",
    "priority": "medium",
    "assignee_id": None,
    "checkout_by": None,
    "checkout_at": None,
    "created_at": "2026-04-17T00:00:00.000Z",
    "updated_at": "2026-04-17T00:00:00.000Z",
}

_APPROVAL = {
    "id": "approval-001",
    "company_id": "company-001",
    "task_id": None,
    "status": "pending",
    "requested_by": "ceo",
    "reason": "needs approval",
    "created_at": "2026-04-17T00:00:00.000Z",
    "updated_at": "2026-04-17T00:00:00.000Z",
}

_PROJECT = {
    "id": "project-001",
    "company_id": "company-001",
    "project_name": "musu-bridge",
    "status": "active",
    "assigned_to": None,
    "created_at": "2026-04-17T00:00:00.000Z",
    "updated_at": "2026-04-17T00:00:00.000Z",
}


# ---------------------------------------------------------------------------
# GET /api/agents/{id}
# ---------------------------------------------------------------------------


class TestGetAgent:
    def test_returns_200_with_agent_dict(self):
        with patch("server.get_agent_by_id", return_value=_AGENT):
            resp = client.get("/api/agents/agent-001")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == "agent-001"
        assert body["status"] == "active"

    def test_unknown_id_returns_404(self):
        with patch("server.get_agent_by_id", return_value=None):
            resp = client.get("/api/agents/nonexistent")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/agents/{id}/pause  &  /resume
# ---------------------------------------------------------------------------


class TestAgentPauseResume:
    def test_pause_sets_status_paused(self):
        paused = {**_AGENT, "status": "paused"}
        with patch("server.set_agent_status", return_value=paused):
            resp = client.post("/api/agents/agent-001/pause")
        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"

    def test_pause_unknown_agent_returns_404(self):
        with patch("server.set_agent_status", return_value=None):
            resp = client.post("/api/agents/nonexistent/pause")
        assert resp.status_code == 404

    def test_resume_sets_status_active(self):
        active = {**_AGENT, "status": "active"}
        with patch("server.set_agent_status", return_value=active):
            resp = client.post("/api/agents/agent-001/resume")
        assert resp.status_code == 200
        assert resp.json()["status"] == "active"

    def test_resume_unknown_agent_returns_404(self):
        with patch("server.set_agent_status", return_value=None):
            resp = client.post("/api/agents/nonexistent/resume")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/companies/{id}/activity
# ---------------------------------------------------------------------------


class TestCompanyActivity:
    def test_returns_200_list(self):
        with patch("server.get_company", return_value=_COMPANY):
            resp = client.get("/api/companies/company-001/activity")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_unknown_company_returns_404(self):
        with patch("server.get_company", return_value=None):
            resp = client.get("/api/companies/nonexistent/activity")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/admin/peer-status
# ---------------------------------------------------------------------------


class TestPeerStatus:
    def test_returns_cloud_registry_enabled_bool(self):
        resp = client.get("/api/admin/peer-status")
        assert resp.status_code == 200
        body = resp.json()
        assert "cloud_registry_enabled" in body
        assert isinstance(body["cloud_registry_enabled"], bool)


# ---------------------------------------------------------------------------
# Issues CRUD
# ---------------------------------------------------------------------------


class TestIssues:
    def test_list_issues_200(self):
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_issue_records", return_value=[_ISSUE]):
            resp = client.get("/api/companies/company-001/issues")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_list_issues_unknown_company_404(self):
        with patch("server.get_company", return_value=None):
            resp = client.get("/api/companies/nonexistent/issues")
        assert resp.status_code == 404

    def test_create_issue_201(self):
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.create_issue_record", return_value=_ISSUE):
            resp = client.post(
                "/api/companies/company-001/issues",
                json={"title": "Test issue"},
            )
        assert resp.status_code == 201
        assert resp.json()["id"] == "issue-001"

    def test_get_issue_200(self):
        with patch("server.get_issue_record", return_value=_ISSUE):
            resp = client.get("/api/issues/issue-001")
        assert resp.status_code == 200

    def test_get_issue_404(self):
        with patch("server.get_issue_record", return_value=None):
            resp = client.get("/api/issues/nonexistent")
        assert resp.status_code == 404

    def test_update_issue_200(self):
        updated = {**_ISSUE, "status": "in_progress"}
        with patch("server.get_issue_record", return_value=_ISSUE), \
             patch("server.update_issue_record", return_value=updated):
            resp = client.patch("/api/issues/issue-001", json={"status": "in_progress"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    def test_checkout_issue_200(self):
        checked = {**_ISSUE, "checkout_by": "agent-001"}
        with patch("server.checkout_issue_record", return_value=checked):
            resp = client.post("/api/issues/issue-001/checkout", json={"agent_id": "agent-001"})
        assert resp.status_code == 200

    def test_list_issue_comments_200(self):
        with patch("server.get_issue_record", return_value=_ISSUE), \
             patch("server.list_issue_comment_records", return_value=[]):
            resp = client.get("/api/issues/issue-001/comments")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# Approvals
# ---------------------------------------------------------------------------


class TestApprovals:
    def test_list_approvals_200(self):
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_approval_records", return_value=[_APPROVAL]):
            resp = client.get("/api/companies/company-001/approvals")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_resolve_approval_200(self):
        resolved = {**_APPROVAL, "status": "approved"}
        with patch("server.resolve_approval_record", return_value=resolved):
            resp = client.post("/api/approvals/approval-001/approved")
        assert resp.status_code == 200
        assert resp.json()["status"] == "approved"

    def test_resolve_approval_invalid_decision_422(self):
        resp = client.post("/api/approvals/approval-001/maybe")
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


class TestProjects:
    def test_list_projects_200(self):
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_project_records", return_value=[_PROJECT]):
            resp = client.get("/api/companies/company-001/projects")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_get_project_200(self):
        with patch("server.get_project_record", return_value=_PROJECT):
            resp = client.get("/api/projects/project-001")
        assert resp.status_code == 200

    def test_get_project_404(self):
        with patch("server.get_project_record", return_value=None):
            resp = client.get("/api/projects/nonexistent")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Goals stub
# ---------------------------------------------------------------------------


class TestGoals:
    def test_list_goals_returns_empty_list(self):
        with patch("server.get_company", return_value=_COMPANY):
            resp = client.get("/api/companies/company-001/goals")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# Costs
# ---------------------------------------------------------------------------


class TestCosts:
    def test_costs_summary_200(self):
        summary = {"total_requests": 42, "done": 40, "failed": 2, "period_days": 30}
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.get_costs_summary_record", return_value=summary):
            resp = client.get("/api/companies/company-001/costs/summary")
        assert resp.status_code == 200
        assert resp.json()["total_requests"] == 42

    def test_costs_by_agent_200(self):
        by_agent = [{"agent_name": "ceo", "request_count": 30}]
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.get_costs_by_agent_record", return_value=by_agent):
            resp = client.get("/api/companies/company-001/costs/by-agent")
        assert resp.status_code == 200
        assert len(resp.json()) == 1
