"""Pydantic request models for musu-bridge API endpoints.

Extracted from server.py to reduce file size.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── Route / Delegate ─────────────────────────────────────────────────────────

class RouteRequest(BaseModel):
    channel: str
    sender_id: str
    text: str = Field(max_length=10000)
    adapter_override: str | None = None
    cost_optimized: bool = False


class DelegateRequest(BaseModel):
    channel: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    sender_id: str = Field(default="orchestrator", min_length=1, max_length=128)
    text: str = Field(max_length=10000)
    use_qa_loop: bool = False
    qa_loop_max_iter: int = Field(default=3, ge=1, le=5)
    timeout_sec: int | None = Field(default=None, ge=30, le=3600)
    company_id: str | None = None


# ── Company ──────────────────────────────────────────────────────────────────

class CompanyCreateRequest(BaseModel):
    name: str
    id: str | None = None
    template_key: str = "default"
    workspace_id: str = ""
    meta: dict = {}
    purpose: str = ""
    work_dir: str = ""
    test_cmd: str = "python -m pytest -q"


class CompanyUpdateRequest(BaseModel):
    name: str | None = None
    template_key: str | None = None
    workspace_id: str | None = None
    meta: dict | None = None


# ── Agent ────────────────────────────────────────────────────────────────────

class AgentUpdateRequest(BaseModel):
    role: str | None = Field(default=None, description="New role string")
    model: str | None = Field(default=None, description="New model name (stored in adapter_config)")
    adapter_config_patch: dict | None = Field(default=None, description="Partial adapter_config patch")


# ── Workspace ────────────────────────────────────────────────────────────────

class WorkspaceUpdateRequest(BaseModel):
    active_company_id: str = Field(..., min_length=1)


# ── Issues ───────────────────────────────────────────────────────────────────

class IssueCreateRequest(BaseModel):
    title: str
    description: str = ""
    status: str = "open"
    priority: str = "medium"
    assignee_id: str | None = None


class IssueUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee_id: str | None = None


class IssueCommentRequest(BaseModel):
    body: str
    author_id: str | None = None
    author_kind: str = "agent"


class IssueCheckoutRequest(BaseModel):
    agent_id: str


# ── Projects ─────────────────────────────────────────────────────────────────

class ProjectCreateRequest(BaseModel):
    project_name: str
    status: Literal["active", "paused", "archived"] = "active"
    assigned_to: str | None = None


class ProjectUpdateRequest(BaseModel):
    project_name: str | None = None
    status: Literal["active", "paused", "archived"] | None = None
    assigned_to: str | None = None


# ── Goals ────────────────────────────────────────────────────────────────────

class GoalCreateRequest(BaseModel):
    title: str
    description: str = ""
    status: Literal["active", "completed", "cancelled"] = "active"
    due_date: str | None = None


class GoalUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: Literal["active", "completed", "cancelled"] | None = None
    due_date: str | None = None


# ── Heartbeat ────────────────────────────────────────────────────────────────

class HeartbeatInvokeRequest(BaseModel):
    prompt: str = Field(
        default=(
            "자율 개발 루프 실행: DEVELOPMENT_PROCESS.md를 읽고, "
            "미완료 Phase feature list를 확인한 후, "
            "Sprint Contract 작성 → Engineer 위임 → QA → 커밋 순서로 진행하라."
        ),
        max_length=2000,
    )
    sender_id: str = Field(default="system", max_length=128)


# ── Messaging ────────────────────────────────────────────────────────────────

class GroupMessageRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    sender_id: str = Field(default="", max_length=128)
    reply_to: str | None = Field(default=None, max_length=64)


class FeedbackRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    type: str = Field(default="suggestion", pattern=r"^(bug|suggestion|complaint)$")
