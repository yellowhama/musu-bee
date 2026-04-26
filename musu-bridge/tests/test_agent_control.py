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
    "companyId": "company-001",
    "goal_id": "goal-001",
    "goalId": "goal-001",
    "project_id": "project-001",
    "projectId": "project-001",
    "title": "Test issue",
    "description": "",
    "status": "open",
    "priority": "medium",
    "assignee_id": None,
    "assigneeAgentId": None,
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

    def test_list_issues_status_filter(self):
        """Verify ?status= query param is forwarded to list_issue_records."""
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_issue_records", return_value=[]) as mock:
            resp = client.get("/api/companies/company-001/issues?status=open")
        assert resp.status_code == 200
        mock.assert_called_once_with(
            company_id="company-001", status="open", assignee_id=None, goal_id=None, project_id=None, limit=100
        )

    def test_list_issues_assignee_filter(self):
        """Verify ?assignee_id= query param is forwarded."""
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_issue_records", return_value=[_ISSUE]) as mock:
            resp = client.get("/api/companies/company-001/issues?assignee_id=agent-001")
        assert resp.status_code == 200
        mock.assert_called_once_with(
            company_id="company-001", status=None, assignee_id="agent-001", goal_id=None, project_id=None, limit=100
        )

    def test_list_issues_camel_case_filters(self):
        """Verify camelCase query params are normalized."""
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_issue_records", return_value=[_ISSUE]) as mock:
            resp = client.get("/api/companies/company-001/issues?assigneeAgentId=agent-001&goalId=goal-001&projectId=project-001")
        assert resp.status_code == 200
        mock.assert_called_once_with(
            company_id="company-001",
            status=None,
            assignee_id="agent-001",
            goal_id="goal-001",
            project_id="project-001",
            limit=100,
        )

    def test_create_issue_with_status(self):
        """Verify status field is accepted in create payload."""
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.create_issue_record", return_value={**_ISSUE, "status": "in_progress"}) as mock:
            resp = client.post(
                "/api/companies/company-001/issues",
                json={"title": "Bug", "status": "in_progress"},
            )
        assert resp.status_code == 201
        assert mock.call_args.kwargs["status"] == "in_progress"

    def test_create_issue_accepts_goal_project_and_assignee_aliases(self):
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.create_issue_record", return_value=_ISSUE) as mock:
            resp = client.post(
                "/api/companies/company-001/issues",
                json={
                    "title": "Linked issue",
                    "goalId": "goal-001",
                    "projectId": "project-001",
                    "assigneeAgentId": "agent-001",
                },
            )
        assert resp.status_code == 201
        assert mock.call_args.kwargs["goal_id"] == "goal-001"
        assert mock.call_args.kwargs["project_id"] == "project-001"
        assert mock.call_args.kwargs["assignee_id"] == "agent-001"

    def test_checkout_issue_404_when_missing(self):
        """checkout_issue returns None for missing issue → 404."""
        with patch("server.checkout_issue_record", return_value=None):
            resp = client.post("/api/issues/nonexistent/checkout", json={"agent_id": "agent-001"})
        assert resp.status_code == 404


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

    def test_create_project_201(self):
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.create_project_record", return_value=_PROJECT):
            resp = client.post(
                "/api/companies/company-001/projects",
                json={"project_name": "API v2"},
            )
        assert resp.status_code == 201
        assert resp.json()["id"] == "project-001"

    def test_update_project_200(self):
        updated = {**_PROJECT, "status": "archived"}
        with patch("server.get_project_record", return_value=_PROJECT), \
             patch("server.update_project_record", return_value=updated):
            resp = client.patch("/api/projects/project-001", json={"status": "archived"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "archived"

    def test_update_project_404(self):
        with patch("server.get_project_record", return_value=None):
            resp = client.patch("/api/projects/nonexistent", json={"status": "archived"})
        assert resp.status_code == 404

    def test_delete_project_200(self):
        with patch("server.get_project_record", return_value=_PROJECT), \
             patch("server.delete_project_record", return_value=True):
            resp = client.delete("/api/projects/project-001")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True


# ---------------------------------------------------------------------------
# Goals stub
# ---------------------------------------------------------------------------


class TestGoals:
    def test_list_goals_returns_empty_list(self):
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_goal_records", return_value=[]):
            resp = client.get("/api/companies/company-001/goals")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_goals_returns_data(self):
        goal = {
            "id": "goal-001",
            "company_id": "company-001",
            "title": "Ship Phase 17",
            "description": "",
            "status": "active",
            "due_date": None,
            "meta": "{}",
            "created_at": "2026-04-17T00:00:00.000Z",
            "updated_at": "2026-04-17T00:00:00.000Z",
        }
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_goal_records", return_value=[goal]):
            resp = client.get("/api/companies/company-001/goals")
        assert resp.status_code == 200
        assert resp.json()[0]["title"] == "Ship Phase 17"

    def test_create_goal_201(self):
        goal = {
            "id": "goal-002",
            "company_id": "company-001",
            "title": "New goal",
            "description": "",
            "status": "active",
            "due_date": None,
            "meta": "{}",
            "created_at": "2026-04-17T00:00:00.000Z",
            "updated_at": "2026-04-17T00:00:00.000Z",
        }
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.create_goal_record", return_value=goal):
            resp = client.post(
                "/api/companies/company-001/goals",
                json={"title": "New goal"},
            )
        assert resp.status_code == 201
        assert resp.json()["title"] == "New goal"

    def test_get_goal_200(self):
        goal = {"id": "goal-001", "title": "Ship Phase 17", "status": "active"}
        with patch("server.get_goal_record", return_value=goal):
            resp = client.get("/api/goals/goal-001")
        assert resp.status_code == 200
        assert resp.json()["id"] == "goal-001"

    def test_get_goal_404(self):
        with patch("server.get_goal_record", return_value=None):
            resp = client.get("/api/goals/nonexistent")
        assert resp.status_code == 404

    def test_update_goal_200(self):
        updated = {"id": "goal-001", "title": "Ship Phase 17", "status": "completed"}
        with patch("server.get_goal_record", return_value=updated), \
             patch("server.update_goal_record", return_value=updated):
            resp = client.patch("/api/goals/goal-001", json={"status": "completed"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"

    def test_delete_goal_200(self):
        goal = {"id": "goal-001", "title": "Ship Phase 17"}
        with patch("server.get_goal_record", return_value=goal), \
             patch("server.delete_goal_record", return_value=True):
            resp = client.delete("/api/goals/goal-001")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True


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


# ---------------------------------------------------------------------------
# Phase 18: additional coverage
# ---------------------------------------------------------------------------


class TestGoalsPhase18:
    def test_list_goals_status_filter(self):
        """?status= parameter is forwarded to list_goal_records."""
        captured: list[dict] = []

        def mock_list(company_id: str, status: str | None = None):
            captured.append({"company_id": company_id, "status": status})
            return []

        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.list_goal_records", side_effect=mock_list):
            resp = client.get("/api/companies/company-001/goals?status=completed")
        assert resp.status_code == 200
        assert captured[0]["status"] == "completed"

    def test_create_goal_with_due_date(self):
        """due_date field is passed through and returned."""
        goal_with_due = {
            "id": "goal-due-001",
            "company_id": "company-001",
            "title": "Q2 revenue target",
            "description": "",
            "status": "active",
            "due_date": "2026-06-30",
            "meta": "{}",
            "created_at": "2026-04-18T00:00:00.000Z",
            "updated_at": "2026-04-18T00:00:00.000Z",
        }
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.create_goal_record", return_value=goal_with_due):
            resp = client.post(
                "/api/companies/company-001/goals",
                json={"title": "Q2 revenue target", "due_date": "2026-06-30"},
            )
        assert resp.status_code == 201
        assert resp.json()["due_date"] == "2026-06-30"

    def test_goal_status_invalid_422(self):
        """Invalid status value returns 422 before reaching the DB."""
        with patch("server.get_company", return_value=_COMPANY), \
             patch("server.create_goal_record", return_value={}):
            resp = client.post(
                "/api/companies/company-001/goals",
                json={"title": "Bad goal", "status": "invalid_status"},
            )
        assert resp.status_code == 422


class TestCheckoutPhase18:
    def test_checkout_issue_already_checked_out_404(self):
        """checkout_issue returns None when already checked out → 404."""
        with patch("server.checkout_issue_record", return_value=None):
            resp = client.post(
                "/api/issues/issue-001/checkout",
                json={"agent_id": "agent-002"},
            )
        assert resp.status_code == 404

    def test_checkout_issue_success_200(self):
        """checkout_issue returns updated issue → 200."""
        checked_out = {**_ISSUE, "checkout_by": "agent-002", "status": "in_progress"}
        with patch("server.checkout_issue_record", return_value=checked_out):
            resp = client.post(
                "/api/issues/issue-001/checkout",
                json={"agent_id": "agent-002"},
            )
        assert resp.status_code == 200
        assert resp.json()["checkout_by"] == "agent-002"
