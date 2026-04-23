"""musu-control: Paperclip control plane MCP server — 24 tools via FastMCP."""

import json
import logging
import os
import pathlib
import re
import tomllib
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

try:
    from mcp.server.fastmcp import FastMCP
    from mcp.types import CallToolResult, TextContent
except ModuleNotFoundError as exc:
    raise ModuleNotFoundError(
        "MCP runtime is not installed. Install the 'mcp' package."
    ) from exc

from .client import PaperclipClient

mcp = FastMCP("musu-control")
_client: PaperclipClient | None = None
logger = logging.getLogger(__name__)

_ACTIVE_RUN_STATUSES = {"queued", "running"}
_TERMINAL_RUN_STATUSES = {"succeeded", "failed", "cancelled"}
_CHECKOUT_EXPECTED_STATUSES = ["todo", "backlog", "blocked", "in_progress", "in_review"]
_EXECUTION_LOCK_MAX_AGE_SECONDS = 60 * 60
_WATCHDOG_STALE_THRESHOLD_SECONDS = 30 * 60
_WATCHDOG_ISSUE_STATUS_FILTER = "todo,in_progress,blocked,in_review"
_WATCHDOG_PERMISSION_HINTS = ("board access required", "permission", "forbidden")
_GATE_HEADLINE_RE = re.compile(r"\bG[123]\s*:\s*(PASS|FAIL)\b", re.IGNORECASE)
_EVIDENCE_LINK_RE = re.compile(
    r"(https?://\S+|/api/heartbeat-runs/[0-9a-f-]+|runtime/generated/|work/reports/|/home/)",
    re.IGNORECASE,
)


def _get_client() -> PaperclipClient:
    global _client
    if _client is None:
        _client = PaperclipClient()
    return _client


def _fmt(data: Any) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False)


def _status(value: Any) -> str:
    return str(value or "").strip().lower()


def _tool_error(message: str) -> str:
    """Return a stable client-facing error while keeping internals in logs."""
    logger.exception(message)
    return message


def _parse_iso(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _has_gate_headline(body: str) -> bool:
    return bool(_GATE_HEADLINE_RE.search(body))


def _has_evidence_link(body: str) -> bool:
    return bool(_EVIDENCE_LINK_RE.search(body))


async def _read_agent(c: Any, agent_id: str) -> dict[str, Any] | None:
    if not hasattr(c, "get"):
        return None
    data = await c.get(f"/agents/{agent_id}")
    if isinstance(data, dict):
        return data
    return None


async def _resolve_active_run(c: Any, issue: dict[str, Any]) -> tuple[dict[str, Any] | None, str]:
    raw_active_run = issue.get("activeRun")
    if isinstance(raw_active_run, dict) and raw_active_run:
        return raw_active_run, "issue"

    execution_run_id = str(issue.get("executionRunId") or "")
    if not execution_run_id:
        return None, "none"
    if not hasattr(c, "get"):
        return None, "heartbeat_run_lookup_unavailable"
    try:
        run = await c.get(f"/heartbeat-runs/{execution_run_id}")
    except Exception:
        return None, "heartbeat_run_lookup_error"
    if not isinstance(run, dict) or not run:
        return None, "heartbeat_run_fallback_empty"
    return {
        "id": run.get("id"),
        "status": run.get("status"),
        "issueId": run.get("issueId"),
    }, "heartbeat_run_fallback"


def _agent_pause_invariant_ok(agent: dict[str, Any], expected_status: str) -> bool:
    status = _status(agent.get("status"))
    paused_at = agent.get("pausedAt")
    if expected_status == "paused":
        return status == "paused" and bool(paused_at)
    return status != "paused" and not paused_at


def _issue_lock_policy(
    issue: dict[str, Any],
    active_run: dict[str, Any] | None = None,
    active_run_source: str = "issue",
) -> dict[str, Any]:
    execution_run_id = str(issue.get("executionRunId") or "")
    if not execution_run_id:
        return {"ok": True, "reason": "unlocked_issue"}

    resolved_active_run = active_run
    if resolved_active_run is None:
        raw_active_run = issue.get("activeRun")
        if isinstance(raw_active_run, dict) and raw_active_run:
            resolved_active_run = raw_active_run
        else:
            resolved_active_run = None
            active_run_source = "issue"

    if not isinstance(resolved_active_run, dict) or not resolved_active_run:
        return {
            "ok": False,
            "reason": "missing_active_run_for_locked_issue",
            "details": {
                "executionRunId": execution_run_id,
                "activeRunSource": active_run_source,
            },
            "recommended_owner_action": f"POST /api/heartbeat-runs/{execution_run_id}/cancel",
        }

    active_run_id = str(resolved_active_run.get("id") or "")
    if active_run_id != execution_run_id:
        return {
            "ok": False,
            "reason": "mismatched_active_run_id",
            "details": {
                "executionRunId": execution_run_id,
                "activeRunId": active_run_id or None,
                "activeRunSource": active_run_source,
            },
            "recommended_owner_action": f"POST /api/heartbeat-runs/{execution_run_id}/cancel",
        }

    active_run_issue_id = resolved_active_run.get("issueId")
    issue_id = issue.get("id")
    if active_run_issue_id != issue_id:
        return {
            "ok": False,
            "reason": "run_issue_link_mismatch",
            "details": {
                "issueId": issue_id,
                "runId": active_run_id,
                "runIssueId": active_run_issue_id,
                "activeRunSource": active_run_source,
            },
            "recommended_owner_action": f"POST /api/heartbeat-runs/{execution_run_id}/cancel",
        }

    active_status = _status(resolved_active_run.get("status"))
    if active_status not in _ACTIVE_RUN_STATUSES:
        return {
            "ok": False,
            "reason": "invalid_active_run_status",
            "details": {
                "activeRunStatus": active_status,
                "activeRunSource": active_run_source,
            },
            "recommended_owner_action": f"POST /api/heartbeat-runs/{execution_run_id}/cancel",
        }

    locked_at = _parse_iso(issue.get("executionLockedAt"))
    if locked_at is None:
        return {
            "ok": False,
            "reason": "invalid_execution_locked_at",
            "recommended_owner_action": f"POST /api/heartbeat-runs/{execution_run_id}/cancel",
        }

    lock_age_seconds = int((datetime.now(timezone.utc) - locked_at).total_seconds())
    if lock_age_seconds > _EXECUTION_LOCK_MAX_AGE_SECONDS:
        return {
            "ok": False,
            "reason": "stale_execution_locked_at",
            "details": {
                "activeRunSource": active_run_source,
                "lockAgeSeconds": lock_age_seconds,
                "maxAgeSeconds": _EXECUTION_LOCK_MAX_AGE_SECONDS,
            },
            "recommended_owner_action": f"POST /api/heartbeat-runs/{execution_run_id}/cancel",
        }

    return {
        "ok": True,
        "reason": "coherent_execution_lock",
        "details": {
            "executionRunId": execution_run_id,
            "activeRunId": active_run_id,
            "activeRunStatus": active_status,
            "activeRunSource": active_run_source,
            "lockAgeSeconds": lock_age_seconds,
            "maxAgeSeconds": _EXECUTION_LOCK_MAX_AGE_SECONDS,
        },
    }


def _run_age_seconds(run: dict[str, Any], now: datetime) -> tuple[int | None, str]:
    started_at = _parse_iso(run.get("startedAt"))
    if started_at is not None:
        return int((now - started_at).total_seconds()), "startedAt"
    created_at = _parse_iso(run.get("createdAt"))
    if created_at is not None:
        return int((now - created_at).total_seconds()), "createdAt"
    return None, "missing"


def _watchdog_error_details(exc: Exception) -> dict[str, Any]:
    status_code: int | None = None
    message = str(exc)
    if isinstance(exc, httpx.HTTPStatusError):
        response = exc.response
        status_code = response.status_code
        try:
            payload = response.json()
            if isinstance(payload, dict):
                message = str(payload.get("error") or payload.get("message") or message)
            else:
                message = str(payload)
        except ValueError:
            text = response.text.strip()
            if text:
                message = text
    return {
        "statusCode": status_code,
        "message": message,
    }


def _is_watchdog_permission_boundary(err: dict[str, Any]) -> bool:
    status_code = err.get("statusCode")
    if status_code in {401, 403}:
        return True
    message = str(err.get("message") or "").lower()
    return any(hint in message for hint in _WATCHDOG_PERMISSION_HINTS)


def _classify_watchdog_run(
    issue: dict[str, Any],
    run: dict[str, Any],
    now: datetime,
    stale_threshold_seconds: int,
) -> dict[str, Any]:
    run_id = str(run.get("id") or issue.get("executionRunId") or "")
    issue_id = str(issue.get("id") or "")
    run_status = _status(run.get("status"))
    issue_status = _status(issue.get("status"))
    row: dict[str, Any] = {
        "runId": run_id or None,
        "issueId": issue_id or None,
        "status": run_status or "unknown",
        "issueStatus": issue_status or "unknown",
        "action": "none",
        "result": "observed",
        "reasonCode": "unclassified",
    }
    if not run_id:
        row["result"] = "fail_closed_no_action"
        row["reasonCode"] = "missing_run_id"
        return row
    if run_status in _TERMINAL_RUN_STATUSES:
        row["result"] = "terminal_no_action"
        row["reasonCode"] = "terminal_run_status"
        return row
    if run_status not in _ACTIVE_RUN_STATUSES:
        row["result"] = "fail_closed_no_action"
        row["reasonCode"] = "unknown_run_status"
        return row

    age_seconds, age_source = _run_age_seconds(run, now)
    row["ageSeconds"] = age_seconds
    row["ageSource"] = age_source
    row["staleThresholdSeconds"] = stale_threshold_seconds
    if age_seconds is None:
        row["result"] = "fail_closed_no_action"
        row["reasonCode"] = "missing_run_timestamp"
        return row
    if age_seconds > stale_threshold_seconds:
        row["action"] = "cancel_run"
        row["result"] = "pending_action"
        row["reasonCode"] = f"stale_{run_status}_over_threshold"
        return row

    row["result"] = "healthy_no_action"
    row["reasonCode"] = "active_within_threshold"
    return row


def _error_state_recurrence_rows(
    agents: list[dict[str, Any]],
    issues: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    issues_by_agent: dict[str, list[dict[str, Any]]] = {}
    for issue in issues:
        agent_id = str(issue.get("assigneeAgentId") or "")
        if not agent_id:
            continue
        issues_by_agent.setdefault(agent_id, []).append(issue)

    for agent in agents:
        if _status(agent.get("status")) != "error":
            continue
        agent_id = str(agent.get("id") or "")
        assigned_issues = issues_by_agent.get(agent_id, [])
        if not assigned_issues:
            continue
        for issue in assigned_issues:
            rows.append(
                {
                    "runId": issue.get("executionRunId"),
                    "issueId": issue.get("id"),
                    "status": "error",
                    "issueStatus": _status(issue.get("status")) or "unknown",
                    "action": "request_owner_reset_agent",
                    "result": "detected",
                    "reasonCode": "agent_error_state_recurrence",
                    "agentId": agent_id,
                    "agentName": agent.get("name"),
                }
            )
    return rows


# ──────────────────────────────────────────────
# Agent group (6)
# ──────────────────────────────────────────────

@mcp.tool()
async def list_agents() -> str:
    """List all agents in the company."""
    try:
        c = _get_client()
        agents_path = f"/companies/{c.company_id}/agents" if c.company_id else "/agents"
        data = await c.get(agents_path)
        return _fmt(data)
    except Exception:
        return _tool_error("Error listing agents.")


@mcp.tool()
async def get_agent(agent_id: str) -> str:
    """Get details for a specific agent by ID or short name."""
    try:
        c = _get_client()
        data = await c.get(f"/agents/{agent_id}")
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error getting agent {agent_id}.")


@mcp.tool()
async def pause_agent(agent_id: str, reason: str = "") -> str:
    """Pause an agent (stops it from picking up new work)."""
    try:
        c = _get_client()
        body: dict = {}
        if reason:
            body["reason"] = reason
        data = await c.post(f"/agents/{agent_id}/pause", body)
        after = await _read_agent(c, agent_id)
        if after is None:
            return _fmt(data)
        if _agent_pause_invariant_ok(after, "paused"):
            return _fmt(data)
        reconcile_body = {
            "reason": reason or "policy_reconcile: paused status requires pausedAt",
        }
        retry_result = await c.post(f"/agents/{agent_id}/pause", reconcile_body)
        retry_after = await _read_agent(c, agent_id)
        coherent = bool(retry_after and _agent_pause_invariant_ok(retry_after, "paused"))
        return _fmt(
            {
                "result": data,
                "reconcile_retry": retry_result,
                "policy": {
                    "invariant": "paused_status_requires_pausedAt",
                    "enforced": coherent,
                    "action": "retry_pause_once",
                },
                "agent_after": retry_after or after,
            }
        )
    except Exception:
        return _tool_error(f"Error pausing agent {agent_id}.")


@mcp.tool()
async def resume_agent(agent_id: str, reason: str = "") -> str:
    """Resume a paused agent."""
    try:
        c = _get_client()
        body: dict = {}
        if reason:
            body["reason"] = reason
        data = await c.post(f"/agents/{agent_id}/resume", body)
        after = await _read_agent(c, agent_id)
        if after is None:
            return _fmt(data)
        if _agent_pause_invariant_ok(after, "resumed"):
            return _fmt(data)
        reconcile_body = {
            "reason": reason or "policy_reconcile: resumed status requires pausedAt null",
        }
        retry_result = await c.post(f"/agents/{agent_id}/resume", reconcile_body)
        retry_after = await _read_agent(c, agent_id)
        coherent = bool(retry_after and _agent_pause_invariant_ok(retry_after, "resumed"))
        return _fmt(
            {
                "result": data,
                "reconcile_retry": retry_result,
                "policy": {
                    "invariant": "non_paused_status_requires_pausedAt_null",
                    "enforced": coherent,
                    "action": "retry_resume_once",
                },
                "agent_after": retry_after or after,
            }
        )
    except Exception:
        return _tool_error(f"Error resuming agent {agent_id}.")


@mcp.tool()
async def invoke_heartbeat(agent_id: str) -> str:
    """Manually trigger a heartbeat run for an agent."""
    try:
        c = _get_client()
        data = await c.post(f"/agents/{agent_id}/heartbeat/invoke")
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error invoking heartbeat for {agent_id}.")


@mcp.tool()
async def get_org_chart() -> str:
    """Return the company org chart formatted as an indented tree by chain of command."""
    try:
        c = _get_client()
        agents_path = f"/companies/{c.company_id}/agents" if c.company_id else "/agents"
        agents: list[dict] = await c.get(agents_path)

        # Build adjacency: managerId -> [agent, ...]
        by_manager: dict[str | None, list[dict]] = {}
        for a in agents:
            coc: list[dict] = a.get("chainOfCommand") or []
            parent_id = coc[-1]["id"] if coc else None
            by_manager.setdefault(parent_id, []).append(a)

        lines: list[str] = []

        def _walk(manager_id: str | None, depth: int = 0) -> None:
            for a in by_manager.get(manager_id, []):
                indent = "  " * depth
                lines.append(f"{indent}- {a.get('name')} ({a.get('role', '?')}) [{a.get('id','')}]")
                _walk(a["id"], depth + 1)

        _walk(None)
        return "\n".join(lines) if lines else "No agents found."
    except Exception:
        return _tool_error("Error building org chart.")


# ──────────────────────────────────────────────
# Issue group (7)
# ──────────────────────────────────────────────

@mcp.tool()
async def list_issues(
    status: str = "",
    assignee_agent_id: str = "",
    q: str = "",
    limit: int = 50,
) -> str:
    """List issues. Optionally filter by status (comma-separated), assignee agent ID, or search query."""
    try:
        c = _get_client()
        params: dict = {"limit": limit}
        if status:
            params["status"] = status
        if assignee_agent_id:
            params["assigneeAgentId"] = assignee_agent_id
        if q:
            params["q"] = q
        issues_path = f"/companies/{c.company_id}/issues" if c.company_id else "/issues"
        data = await c.get(issues_path, **params)
        return _fmt(data)
    except Exception:
        return _tool_error("Error listing issues.")


@mcp.tool()
async def get_issue(issue_id: str) -> str:
    """Get full details of an issue by ID or identifier (e.g. MUS-123)."""
    try:
        c = _get_client()
        data = await c.get(f"/issues/{issue_id}")
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error getting issue {issue_id}.")


@mcp.tool()
async def create_issue(
    title: str,
    description: str = "",
    status: str = "open",
    priority: str = "medium",
    assignee_agent_id: str = "",
    parent_id: str = "",
    goal_id: str = "",
    project_id: str = "",
) -> str:
    """Create a new issue in the company."""
    try:
        c = _get_client()
        body: dict = {"title": title, "status": status, "priority": priority}
        if description:
            body["description"] = description
        if assignee_agent_id:
            body["assigneeAgentId"] = assignee_agent_id
        if parent_id:
            body["parentId"] = parent_id
        if goal_id:
            body["goalId"] = goal_id
        if project_id:
            body["projectId"] = project_id
        issues_path = f"/companies/{c.company_id}/issues" if c.company_id else "/issues"
        data = await c.post(issues_path, body)
        return _fmt(data)
    except Exception:
        return _tool_error("Error creating issue.")


@mcp.tool()
async def update_issue(
    issue_id: str,
    status: str = "",
    priority: str = "",
    title: str = "",
    description: str = "",
    assignee_agent_id: str = "",
    comment: str = "",
) -> str:
    """Update an issue's fields. Only provided (non-empty) fields are sent."""
    try:
        c = _get_client()
        issue_before = await c.get(f"/issues/{issue_id}")
        if isinstance(issue_before, dict):
            resolved_before, resolved_before_source = await _resolve_active_run(c, issue_before)
            lock_policy = _issue_lock_policy(issue_before, resolved_before, resolved_before_source)
        else:
            lock_policy = {"ok": True, "reason": "unavailable_issue_snapshot"}

        if not lock_policy.get("ok", False):
            return _fmt(
                {
                    "error": "Policy blocked update: execution lock coherence preflight failed.",
                    "policy": {
                        "invariant": "locked_issue_requires_active_run_truth",
                        "enforced": False,
                        "owner": "board",
                        "reason": lock_policy.get("reason"),
                        "details": lock_policy.get("details"),
                        "suggested_action": lock_policy.get("recommended_owner_action"),
                    },
                    "issue": {
                        "id": issue_before.get("id"),
                        "identifier": issue_before.get("identifier"),
                        "status": issue_before.get("status"),
                        "executionRunId": issue_before.get("executionRunId"),
                    },
                }
            )

        body: dict = {}
        if status:
            body["status"] = status
        if priority:
            body["priority"] = priority
        if title:
            body["title"] = title
        if description:
            body["description"] = description
        if assignee_agent_id:
            body["assigneeAgentId"] = assignee_agent_id
        if comment:
            body["comment"] = comment
        if not body:
            return "No fields provided to update."
        data = await c.patch(f"/issues/{issue_id}", body)
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error updating issue {issue_id}.")


@mcp.tool()
async def checkout_issue(issue_id: str, agent_id: str) -> str:
    """Checkout an issue for an agent (marks it in_progress and locks it)."""
    try:
        c = _get_client()
        issue_before = await c.get(f"/issues/{issue_id}")
        if isinstance(issue_before, dict):
            resolved_before, resolved_before_source = await _resolve_active_run(c, issue_before)
            lock_policy = _issue_lock_policy(issue_before, resolved_before, resolved_before_source)
        else:
            lock_policy = {"ok": True, "reason": "unavailable_issue_snapshot"}
        if not lock_policy.get("ok", False):
            return _fmt(
                {
                    "error": "Policy blocked checkout: execution lock coherence preflight failed.",
                    "policy": {
                        "invariant": "locked_issue_requires_active_run_truth",
                        "enforced": False,
                        "owner": "board",
                        "reason": lock_policy.get("reason"),
                        "details": lock_policy.get("details"),
                        "suggested_action": lock_policy.get("recommended_owner_action"),
                    },
                    "issue": {
                        "id": issue_before.get("id"),
                        "identifier": issue_before.get("identifier"),
                        "status": issue_before.get("status"),
                        "executionRunId": issue_before.get("executionRunId"),
                        "activeRun": issue_before.get("activeRun"),
                        "resolvedActiveRunSource": resolved_before_source,
                        "resolvedActiveRun": resolved_before,
                    },
                }
            )
        body = {
            "agentId": agent_id,
            "expectedStatuses": _CHECKOUT_EXPECTED_STATUSES,
        }
        data = await c.post(f"/issues/{issue_id}/checkout", body)
        issue_after = await c.get(f"/issues/{issue_id}")
        if not isinstance(issue_after, dict):
            return _fmt(data)
        checkout_run_id = str(issue_after.get("checkoutRunId") or "")
        execution_run_id = str(issue_after.get("executionRunId") or "")
        resolved_after, resolved_after_source = await _resolve_active_run(c, issue_after)
        post_policy = _issue_lock_policy(issue_after, resolved_after, resolved_after_source)
        coherent = bool(
            checkout_run_id
            and execution_run_id
            and checkout_run_id == execution_run_id
            and post_policy.get("ok", False)
        )
        if coherent:
            return _fmt(data)
        return _fmt(
            {
                "result": data,
                "policy": {
                    "invariant": "checkout_and_execution_run_should_align_after_checkout",
                    "enforced": False,
                    "reason": post_policy.get("reason"),
                    "details": post_policy.get("details"),
                },
                "issue_after": {
                    "id": issue_after.get("id"),
                    "identifier": issue_after.get("identifier"),
                    "status": issue_after.get("status"),
                    "checkoutRunId": issue_after.get("checkoutRunId"),
                    "executionRunId": issue_after.get("executionRunId"),
                    "activeRun": issue_after.get("activeRun"),
                    "resolvedActiveRunSource": resolved_after_source,
                    "resolvedActiveRun": resolved_after,
                },
            }
        )
    except Exception:
        return _tool_error(f"Error checking out issue {issue_id}.")


@mcp.tool()
async def add_comment(issue_id: str, body: str) -> str:
    """Add a comment to an issue."""
    try:
        text = body.strip()
        if _has_gate_headline(text) and not _has_evidence_link(text):
            return _fmt(
                {
                    "error": "Policy blocked comment: gate verdict requires upstream evidence link.",
                    "policy": {
                        "invariant": "gate_verdict_requires_evidence_link",
                        "enforced": False,
                    },
                    "issue_id": issue_id,
                }
            )
        c = _get_client()
        data = await c.post(f"/issues/{issue_id}/comments", {"body": text})
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error adding comment to {issue_id}.")


@mcp.tool()
async def get_comments(issue_id: str) -> str:
    """Get all comments on an issue."""
    try:
        c = _get_client()
        data = await c.get(f"/issues/{issue_id}/comments")
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error getting comments for {issue_id}.")


# ──────────────────────────────────────────────
# Run / dashboard group (5)
# ──────────────────────────────────────────────

@mcp.tool()
async def get_dashboard() -> str:
    """Get the company dashboard summary (recent runs, costs, activity)."""
    try:
        c = _get_client()
        dashboard_path = f"/companies/{c.company_id}/dashboard" if c.company_id else "/dashboard"
        data = await c.get(dashboard_path)
        return _fmt(data)
    except Exception:
        return _tool_error("Error getting dashboard.")


@mcp.tool()
async def list_runs(agent_id: str = "", limit: int = 20) -> str:
    """List recent heartbeat runs. Optionally filter by agent ID."""
    try:
        c = _get_client()
        params: dict = {"limit": limit}
        if agent_id:
            params["agentId"] = agent_id
        runs_path = f"/companies/{c.company_id}/heartbeat-runs" if c.company_id else "/heartbeat-runs"
        data = await c.get(runs_path, **params)
        return _fmt(data)
    except Exception:
        return _tool_error("Error listing runs.")


@mcp.tool()
async def watchdog_detect_and_remediate(
    stale_threshold_seconds: int = _WATCHDOG_STALE_THRESHOLD_SECONDS,
    dry_run: bool = False,
) -> str:
    """Detect stale queued/running heartbeat runs and emit deterministic remediation evidence."""
    try:
        if stale_threshold_seconds <= 0:
            return _fmt({"error": "stale_threshold_seconds must be > 0"})

        c = _get_client()
        agents_data = await c.get(f"/companies/{c.company_id}/agents" if c.company_id else "/agents")
        issues_data = await c.get(
            f"/companies/{c.company_id}/issues" if c.company_id else "/issues",
            status=_WATCHDOG_ISSUE_STATUS_FILTER,
            limit=500,
        )
        agents = agents_data if isinstance(agents_data, list) else []
        issues = issues_data if isinstance(issues_data, list) else []
        now = datetime.now(timezone.utc)
        rows: list[dict[str, Any]] = []
        unresolved: list[str] = []
        run_cache: dict[str, dict[str, Any]] = {}

        for issue in issues:
            run_id = str(issue.get("executionRunId") or "")
            if not run_id:
                continue
            run = run_cache.get(run_id)
            if run is None:
                try:
                    run_payload = await c.get(f"/heartbeat-runs/{run_id}")
                    run = run_payload if isinstance(run_payload, dict) else {"id": run_id, "status": "unknown"}
                except Exception as exc:
                    run = {
                        "id": run_id,
                        "status": "unknown",
                        "_lookupError": _watchdog_error_details(exc),
                    }
                run_cache[run_id] = run

            row = _classify_watchdog_run(issue, run, now, stale_threshold_seconds)
            lookup_error = run.get("_lookupError")
            if isinstance(lookup_error, dict):
                row["reasonCode"] = "heartbeat_run_lookup_failed"
                row["result"] = "fail_closed_no_action"
                row["lookupError"] = lookup_error
                rows.append(row)
                continue

            if row.get("action") == "cancel_run":
                if dry_run:
                    row["result"] = "dry_run_cancel_skipped"
                else:
                    try:
                        cancel_data = await c.post(f"/heartbeat-runs/{run_id}/cancel")
                        row["result"] = "cancel_requested"
                        row["cancelResponseStatus"] = _status(
                            cancel_data.get("status") if isinstance(cancel_data, dict) else None
                        ) or "unknown"
                    except Exception as exc:
                        err = _watchdog_error_details(exc)
                        row["cancelError"] = err
                        if _is_watchdog_permission_boundary(err):
                            eta = (now + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
                            unresolved_line = (
                                f"[TBD: awaiting real data] action=board_cancel_run runId={run_id} "
                                f"owner=CEO/board eta={eta}"
                            )
                            row["action"] = "board_cancel_run"
                            row["result"] = "permission_boundary_blocked"
                            row["unresolved"] = unresolved_line
                            unresolved.append(unresolved_line)
                        else:
                            row["result"] = "cancel_failed"
            rows.append(row)

        rows.extend(_error_state_recurrence_rows(agents, issues))
        rows.sort(
            key=lambda r: (
                str(r.get("issueId") or ""),
                str(r.get("runId") or ""),
                str(r.get("reasonCode") or ""),
            )
        )
        stale_rows = [r for r in rows if str(r.get("reasonCode") or "").startswith("stale_")]
        report = {
            "generatedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "staleThresholdSeconds": stale_threshold_seconds,
            "dryRun": dry_run,
            "summary": {
                "issuesScanned": len(issues),
                "agentsScanned": len(agents),
                "rows": len(rows),
                "staleDetected": len(stale_rows),
                "cancelRequested": sum(1 for r in rows if r.get("result") == "cancel_requested"),
                "permissionBoundaryBlocked": sum(
                    1 for r in rows if r.get("result") == "permission_boundary_blocked"
                ),
                "errorStateRecurrenceDetected": sum(
                    1 for r in rows if r.get("reasonCode") == "agent_error_state_recurrence"
                ),
            },
            "rows": rows,
            "unresolved": unresolved,
        }
        return _fmt(report)
    except Exception:
        return _tool_error("Error running watchdog detector/remediator.")


@mcp.tool()
async def get_activity(limit: int = 50) -> str:
    """Get recent company activity feed."""
    try:
        c = _get_client()
        activity_path = f"/companies/{c.company_id}/activity" if c.company_id else "/audit"
        data = await c.get(activity_path, limit=limit)
        return _fmt(data)
    except Exception:
        return _tool_error("Activity endpoint unavailable.")


@mcp.tool()
async def get_costs_summary() -> str:
    """Get total cost summary for the company."""
    try:
        c = _get_client()
        costs_path = f"/companies/{c.company_id}/costs/summary" if c.company_id else "/costs/summary"
        data = await c.get(costs_path)
        return _fmt(data)
    except Exception:
        return _tool_error("Costs endpoint unavailable.")


@mcp.tool()
async def get_costs_by_agent() -> str:
    """Get cost breakdown grouped by agent."""
    try:
        c = _get_client()
        costs_path = f"/companies/{c.company_id}/costs/by-agent" if c.company_id else "/costs/by-agent"
        data = await c.get(costs_path)
        return _fmt(data)
    except Exception:
        return _tool_error("Costs-by-agent endpoint unavailable.")


# ──────────────────────────────────────────────
# Project group (3)
# ──────────────────────────────────────────────

@mcp.tool()
async def list_projects() -> str:
    """List all projects in the company."""
    try:
        c = _get_client()
        data = await c.get(f"/companies/{c.company_id}/projects")
        return _fmt(data)
    except Exception:
        return _tool_error("Error listing projects.")


@mcp.tool()
async def get_project(project_id: str) -> str:
    """Get details of a project by ID."""
    try:
        c = _get_client()
        data = await c.get(f"/projects/{project_id}")
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error getting project {project_id}.")


@mcp.tool()
async def list_goals(status: str = "") -> str:
    """List goals. Optionally filter by status (active, completed, cancelled)."""
    try:
        c = _get_client()
        params: dict = {}
        if status:
            params["status"] = status
        data = await c.get(f"/companies/{c.company_id}/goals", **params)
        return _fmt(data)
    except Exception:
        return _tool_error("Error listing goals.")


@mcp.tool()
async def create_goal(
    title: str,
    description: str = "",
    due_date: str = "",
) -> str:
    """Create a new goal for the company.

    Goals represent high-level objectives. Break them into issues for execution.
    """
    try:
        c = _get_client()
        body: dict = {"title": title, "description": description}
        if due_date:
            body["due_date"] = due_date
        data = await c.post(f"/companies/{c.company_id}/goals", body)
        return _fmt(data)
    except Exception:
        return _tool_error("Error creating goal.")


@mcp.tool()
async def update_goal(
    goal_id: str,
    title: str = "",
    description: str = "",
    status: str = "",
    due_date: str = "",
) -> str:
    """Update a goal. Only non-empty fields are changed.

    Set status to 'completed' when all linked issues are done.
    """
    try:
        c = _get_client()
        body: dict = {}
        if title:
            body["title"] = title
        if description:
            body["description"] = description
        if status:
            body["status"] = status
        if due_date:
            body["due_date"] = due_date
        if not body:
            return "No fields to update."
        data = await c.patch(f"/goals/{goal_id}", body)
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error updating goal {goal_id}.")


@mcp.tool()
async def delete_goal(goal_id: str) -> str:
    """Delete a goal by ID."""
    try:
        c = _get_client()
        data = await c.delete(f"/goals/{goal_id}")
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error deleting goal {goal_id}.")


# ──────────────────────────────────────────────
# Approval group (2)
# ──────────────────────────────────────────────

@mcp.tool()
async def list_approvals(status: str = "") -> str:
    """List approvals. Optionally filter by status (pending, approved, rejected)."""
    try:
        c = _get_client()
        params: dict = {}
        if status:
            params["status"] = status
        data = await c.get(f"/companies/{c.company_id}/approvals", **params)
        return _fmt(data)
    except Exception:
        return _tool_error("Error listing approvals.")


@mcp.tool()
async def resolve_approval(approval_id: str, decision: str, note: str = "") -> str:
    """Resolve an approval. decision must be 'approve' or 'reject'."""
    try:
        c = _get_client()
        if decision not in ("approve", "reject"):
            return "decision must be 'approve' or 'reject'"
        body: dict = {}
        if note:
            body["decisionNote"] = note
        data = await c.post(f"/approvals/{approval_id}/{decision}", body)
        return _fmt(data)
    except Exception:
        return _tool_error(f"Error resolving approval {approval_id}.")


# ──────────────────────────────────────────────
# Remote File Access
# ──────────────────────────────────────────────


@mcp.tool()
async def read_remote_file(node_url: str, path: str) -> str:
    """Read a file from a remote device via its bridge API.

    node_url: bridge URL (e.g., "http://100.121.211.106:8070")
    path: file path on the remote device (must be under home dir)
    """
    try:
        c = _get_client()
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{node_url}/api/files/read",
                params={"path": path},
                headers={"Authorization": f"Bearer {os.environ.get('PAPERCLIP_API_KEY', '')}"},
            )
            resp.raise_for_status()
            return _fmt(resp.json())
    except Exception as exc:
        return _tool_error(f"Failed to read remote file: {exc}")


@mcp.tool()
async def list_remote_files(node_url: str, path: str = "~", pattern: str = "*") -> str:
    """List files in a directory on a remote device.

    node_url: bridge URL (e.g., "http://100.121.211.106:8070")
    path: directory path (default: home)
    pattern: glob pattern (e.g., "*.txt", "*.md")
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{node_url}/api/files/list",
                params={"path": path, "pattern": pattern},
                headers={"Authorization": f"Bearer {os.environ.get('PAPERCLIP_API_KEY', '')}"},
            )
            resp.raise_for_status()
            return _fmt(resp.json())
    except Exception as exc:
        return _tool_error(f"Failed to list remote files: {exc}")


# ──────────────────────────────────────────────
# Group Messages (CEO Board / Team Channels)
# ──────────────────────────────────────────────


@mcp.tool()
async def post_board_message(group_id: str, text: str) -> str:
    """Post a message to a group channel (e.g., ceo-board).

    Use for inter-device CEO communication and team coordination.
    group_id examples: 'ceo-board', '{company_id}-team'
    """
    try:
        c = _get_client()
        data = await c.post(f"/groups/{group_id}/messages", {"text": text, "sender_id": ""})
        return _fmt(data)
    except Exception:
        return _tool_error("Error posting board message.")


@mcp.tool()
async def reply_board_message(group_id: str, reply_to: str, text: str) -> str:
    """Reply to a specific message. The original author gets notified.

    reply_to: the message ID you're replying to
    """
    try:
        c = _get_client()
        data = await c.post(f"/groups/{group_id}/messages", {"text": text, "sender_id": "", "reply_to": reply_to})
        return _fmt(data)
    except Exception:
        return _tool_error("Error replying to message.")


@mcp.tool()
async def get_vault_secret(key: str) -> str:
    """Read a secret from the vault (~/.musu/secrets/vault.json).

    key: dot-separated path (e.g., "bridge.token", "nodes.5070.ip", "forgejo.url")
    Use this to get auth tokens for cross-device API calls.
    """
    import json as _json
    vault_path = os.path.expanduser("~/.musu/secrets/vault.json")
    try:
        with open(vault_path) as f:
            d = _json.load(f)
        keys = key.split(".")
        v = d
        for k in keys:
            v = v[k]
        return str(v)
    except FileNotFoundError:
        return _tool_error("Vault not found. Run scripts/vault.sh to create.")
    except KeyError:
        return _tool_error(f"Key '{key}' not found in vault.")


@mcp.tool()
async def check_notifications() -> str:
    """Check your unread notifications (replies to your messages)."""
    try:
        c = _get_client()
        sender = os.environ.get("MUSU_NODE_NAME", "unknown")
        data = await c.get(f"/notifications/{sender}")
        if not data:
            return "No unread notifications."
        return _fmt(data)
    except Exception:
        return _tool_error("Error checking notifications.")


@mcp.tool()
async def read_board_messages(group_id: str, limit: int = 10) -> str:
    """Read recent messages from a group channel.

    Use to check what other CEOs/team leads have posted.
    """
    try:
        c = _get_client()
        data = await c.get(f"/groups/{group_id}/messages", limit=limit)
        return _fmt(data)
    except Exception:
        return _tool_error("Error reading board messages.")


# ──────────────────────────────────────────────
# Async task delegation (musu-bridge direct)
# ──────────────────────────────────────────────

_MUSU_BRIDGE_URL = os.environ.get("MUSU_BRIDGE_URL", "http://127.0.0.1:8070")


def _bridge_headers() -> dict[str, str]:
    """Return auth headers for musu-bridge requests."""
    token = os.environ.get("MUSU_BRIDGE_TOKEN", "")
    if not token:
        _tf = os.path.expanduser("~/.musu/bridge_token")
        try:
            with open(_tf) as _f:
                token = _f.read().strip()
        except OSError:
            pass
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


@mcp.tool()
async def delegate_task(
    channel: str,
    instruction: str,
    sender_id: str = "orchestrator",
) -> str:
    """Delegate a task to an agent asynchronously via musu-bridge.

    Returns a task_id immediately — the agent runs in the background.
    Use get_task_status(task_id) to poll for completion.

    Args:
        channel: Agent channel name (e.g. "engineer", "ceo", "qa")
        instruction: The task instruction / message for the agent
        sender_id: Identifier for the requester (default: "orchestrator")
    """
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_bridge_headers()) as client:
            resp = await client.post(
                f"{_MUSU_BRIDGE_URL}/api/tasks/delegate",
                json={"channel": channel, "sender_id": sender_id, "text": instruction},
            )
            resp.raise_for_status()
            data = resp.json()
        return _fmt({"task_id": data["task_id"], "status": data.get("status", "running"), "channel": channel})
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        return _tool_error(f"Error delegating task to channel={channel!r}: {exc}")


@mcp.tool()
async def get_task_status(task_id: str) -> str:
    """Poll the status of a delegated task.

    Returns status and a short summary (≤500 chars) — not the full agent output.
    Status values: pending | running | done | failed

    Args:
        task_id: The task_id returned by delegate_task
    """
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_bridge_headers()) as client:
            resp = await client.get(f"{_MUSU_BRIDGE_URL}/api/tasks/{task_id}")
            if resp.status_code == 404:
                return f"Task {task_id!r} not found."
            resp.raise_for_status()
            data = resp.json()
        # Return only orchestrator-relevant fields (not full output)
        return _fmt({
            "task_id": task_id,
            "status": data.get("status"),
            "summary": data.get("summary"),
            "error": data.get("error"),
            "channel": data.get("channel"),
            "created_at": data.get("created_at"),
            "updated_at": data.get("updated_at"),
        })
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        return _tool_error(f"Error fetching task status for {task_id!r}: {exc}")


@mcp.tool()
async def list_tasks(
    status: str | None = None,
    channel: str | None = None,
    limit: int = 20,
    before_id: str | None = None,
) -> str:
    """List delegated tasks, newest first.

    Args:
        status: Filter by status — pending | running | done | failed (omit for all)
        channel: Filter by agent channel name (e.g. "engineer")
        limit: Max results to return (default: 20, max: 500)
        before_id: Cursor pagination — return tasks older than this task_id
    """
    try:
        params: dict[str, str | int] = {"limit": limit}
        if status:
            params["status"] = status
        if channel:
            params["channel"] = channel
        if before_id:
            params["before_id"] = before_id
        async with httpx.AsyncClient(timeout=10.0, headers=_bridge_headers()) as client:
            resp = await client.get(f"{_MUSU_BRIDGE_URL}/api/tasks", params=params)
            if resp.status_code == 400:
                return _tool_error(resp.json().get("detail", "Bad request"))
            resp.raise_for_status()
            tasks = resp.json()
        return _fmt({"count": len(tasks), "tasks": tasks})
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        return _tool_error(f"Error listing tasks: {exc}")


@mcp.tool()
async def cancel_task(task_id: str) -> str:
    """Cancel a running delegated task.

    Cancels the asyncio task if still running and marks it failed/cancelled in DB.
    No-ops if task is already done or failed (returns the current status).

    Args:
        task_id: The task_id returned by delegate_task
    """
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_bridge_headers()) as client:
            resp = await client.delete(f"{_MUSU_BRIDGE_URL}/api/tasks/{task_id}")
            if resp.status_code == 404:
                return f"Task {task_id!r} not found."
            resp.raise_for_status()
            return _fmt(resp.json())
    except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPStatusError) as exc:
        return _tool_error(f"Error cancelling task {task_id!r}: {exc}")


# ──────────────────────────────────────────────
# MCP Apps — 인터랙티브 UI 뷰 (Phase 17R, 공식 ext-apps 스펙)
# SEP-1865 Stable 2026-01-26 기준
# 기존 텍스트 툴과 공존. _view / poll_ 접미사로 구분.
# ──────────────────────────────────────────────

_VIEWS_DIST = pathlib.Path(__file__).parents[3] / "musu-bee/views/dist"
_UI_MIME = "text/html"


def _read_view_html(view: str) -> str:
    """로컬 dist에서 standalone HTML 읽기."""
    html_path = _VIEWS_DIST / f"{view}/index.html"
    if html_path.exists():
        return html_path.read_text(encoding="utf-8")
    return f"<!DOCTYPE html><html><body><p>View not built: run <code>npm run build:{view}</code> in musu-bee/views/</p></body></html>"


# ── resources (mimeType: text/html;profile=mcp-app) ────────────

@mcp.resource("ui://musu-control/tasks", mime_type=_UI_MIME)
async def _res_tasks() -> str:
    return _read_view_html("tasks")


@mcp.resource("ui://musu-control/task-detail", mime_type=_UI_MIME)
async def _res_task_detail() -> str:
    return _read_view_html("tasks")


@mcp.resource("ui://musu-control/agents", mime_type=_UI_MIME)
async def _res_agents() -> str:
    return _read_view_html("nodes")


@mcp.resource("ui://musu-control/activity", mime_type=_UI_MIME)
async def _res_activity() -> str:
    return _read_view_html("tasks")


@mcp.resource("ui://musu-control/costs", mime_type=_UI_MIME)
async def _res_costs() -> str:
    return _read_view_html("tasks")


# ── 공통 데이터 fetch 헬퍼 ───────────────────────

async def _fetch_tasks(
    status: str | None,
    channel: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    try:
        params: dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status
        if channel:
            params["channel"] = channel
        async with httpx.AsyncClient(timeout=10.0, headers=_bridge_headers()) as c:
            resp = await c.get(f"{_MUSU_BRIDGE_URL}/api/tasks", params=params)
            resp.raise_for_status()
            raw = resp.json()
        return raw if isinstance(raw, list) else raw.get("tasks", [])
    except Exception:
        return []


async def _fetch_agents() -> list[dict[str, Any]]:
    try:
        c = _get_client()
        agents_path = f"/companies/{c.company_id}/agents" if c.company_id else "/agents"
        data = await c.get(agents_path)
        return data if isinstance(data, list) else []
    except Exception:
        return []


# ── model-visible view tools ────────────────────

@mcp.tool()
async def show_tasks_view(
    status: str | None = None,
    channel: str | None = None,
    limit: int = 20,
) -> CallToolResult:
    """위임 태스크를 인터랙티브 뷰로 표시. 필터와 실시간 폴링 지원.

    Args:
        status: 필터 — pending | running | done | failed (생략 시 전체)
        channel: 에이전트 채널명 필터
        limit: 최대 표시 개수 (기본 20)
    """
    tasks = await _fetch_tasks(status, channel, limit)
    return CallToolResult(
        content=[TextContent(type="text", text=f"태스크 {len(tasks)}개")],
        structuredContent={"tasks": tasks, "filters": {"status": status, "channel": channel}},
    )


@mcp.tool()
async def show_task_detail_view(task_id: str) -> CallToolResult:
    """단일 태스크 상세를 인터랙티브 뷰로 표시.

    Args:
        task_id: delegate_task가 반환한 task_id
    """
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=_bridge_headers()) as c:
            resp = await c.get(f"{_MUSU_BRIDGE_URL}/api/tasks/{task_id}")
            resp.raise_for_status()
            task = resp.json()
    except Exception:
        task = {}

    return CallToolResult(
        content=[TextContent(type="text", text=f"Task {task_id[:8]}… — {task.get('status', 'unknown')}")],
        structuredContent={"task": task},
    )


@mcp.tool()
async def show_agents_view() -> CallToolResult:
    """에이전트 목록을 인터랙티브 뷰로 표시."""
    agents = await _fetch_agents()
    return CallToolResult(
        content=[TextContent(type="text", text=f"에이전트 {len(agents)}개")],
        structuredContent={"agents": agents},
    )


@mcp.tool()
async def show_activity_view(limit: int = 30) -> CallToolResult:
    """최근 회사 활동을 인터랙티브 로그 뷰로 표시.

    Args:
        limit: 최대 표시 개수 (기본 30)
    """
    try:
        c = _get_client()
        activity_path = f"/companies/{c.company_id}/activity" if c.company_id else "/audit"
        data = await c.get(activity_path, limit=limit)
        entries = data if isinstance(data, list) else data.get("items", [])
    except Exception:
        entries = []

    return CallToolResult(
        content=[TextContent(type="text", text=f"활동 {len(entries)}개")],
        structuredContent={"entries": entries},
    )


@mcp.tool()
async def show_costs_view() -> CallToolResult:
    """에이전트별 비용을 인터랙티브 차트 뷰로 표시."""
    try:
        c = _get_client()
        costs_path = f"/companies/{c.company_id}/costs/by-agent" if c.company_id else "/costs/by-agent"
        data = await c.get(costs_path)
        agents_cost = data if isinstance(data, list) else data.get("agents", [])
    except Exception:
        agents_cost = []

    return CallToolResult(
        content=[TextContent(type="text", text=f"에이전트 비용 {len(agents_cost)}개")],
        structuredContent={"agents_cost": agents_cost},
    )


# ── Nodes management tools ──

def _read_nodes_toml() -> dict[str, Any]:
    """Read nodes.toml from ~/.musu/nodes.toml."""
    nodes_path = pathlib.Path.home() / ".musu" / "nodes.toml"
    if not nodes_path.exists():
        return {"mesh": {"nodes": []}}
    try:
        with open(nodes_path, "rb") as f:
            data = tomllib.load(f)
        return data
    except Exception as e:
        logger.error(f"Failed to read nodes.toml: {e}")
        return {"mesh": {"nodes": []}}


async def _fetch_node_health(node: dict[str, Any], worker_port: int) -> dict[str, Any]:
    """Fetch health and capabilities from a node's musu-worker."""
    tailscale_ip = node.get("tailscale_ip", "")
    if not tailscale_ip:
        return {
            "name": node.get("name", "unknown"),
            "status": "error",
            "error": "No tailscale_ip configured",
        }

    worker_url = f"http://{tailscale_ip}:{worker_port}"
    node_info = {
        "name": node.get("name", "unknown"),
        "tailscale_ip": tailscale_ip,
        "worker_url": worker_url,
        "roles": node.get("roles", []),
        "gpu": node.get("gpu", ""),
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Fetch /health
            health_resp = await client.get(f"{worker_url}/health")
            health_data = health_resp.json() if health_resp.status_code == 200 else {}

            # Fetch /capabilities
            cap_resp = await client.get(f"{worker_url}/capabilities")
            cap_data = cap_resp.json() if cap_resp.status_code == 200 else {}

            node_info.update({
                "status": "online" if health_resp.status_code == 200 else "degraded",
                "health": health_data,
                "capabilities": cap_data,
            })
    except Exception as e:
        node_info.update({
            "status": "offline",
            "error": str(e),
        })

    return node_info


@mcp.tool()
async def list_nodes() -> CallToolResult:
    """List all nodes from nodes.toml with their health status."""
    try:
        config = _read_nodes_toml()
        mesh = config.get("mesh", {})
        nodes = mesh.get("nodes", [])
        worker_port = int(mesh.get("worker_port", 9700))

        nodes_info = []
        for node in nodes:
            node_info = await _fetch_node_health(node, worker_port)
            nodes_info.append(node_info)

        return CallToolResult(
            content=[TextContent(type="text", text=f"Found {len(nodes_info)} nodes")],
            structuredContent={"nodes": nodes_info, "worker_port": worker_port},
        )
    except Exception as e:
        return CallToolResult(
            content=[TextContent(type="text", text=f"Error listing nodes: {str(e)}")],
            isError=True,
        )


@mcp.tool()
async def execute_remote_process(
    node_name: str,
    command: str,
    args: list[str] | None = None,
    cwd: str | None = None,
    timeout_sec: int = 30,
) -> CallToolResult:
    """Execute a remote process on a specific node via musu-worker."""
    try:
        config = _read_nodes_toml()
        mesh = config.get("mesh", {})
        nodes = mesh.get("nodes", [])
        worker_port = int(mesh.get("worker_port", 9700))

        # Find the target node
        target_node = None
        for node in nodes:
            if node.get("name") == node_name:
                target_node = node
                break

        if not target_node:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Node '{node_name}' not found in nodes.toml")],
                isError=True,
            )

        tailscale_ip = target_node.get("tailscale_ip", "")
        if not tailscale_ip:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Node '{node_name}' has no tailscale_ip")],
                isError=True,
            )

        worker_url = f"http://{tailscale_ip}:{worker_port}"

        # Prepare payload
        payload = {
            "command": command,
            "args": args or [],
            "timeout_sec": timeout_sec,
            "env": {},
        }
        if cwd:
            payload["cwd"] = cwd

        # Execute remote process
        token = os.environ.get("MUSU_WORKER_TOKEN")
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=timeout_sec + 5.0) as client:
            resp = await client.post(
                f"{worker_url}/execute/process",
                json=payload,
                headers=headers,
            )

            if resp.status_code == 200:
                result = resp.json()
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Command executed on {node_name}")],
                    structuredContent={"node": node_name, "result": result},
                )
            else:
                error_text = resp.text
                return CallToolResult(
                    content=[TextContent(type="text", text=f"Remote execution failed: {error_text}")],
                    isError=True,
                )
    except Exception as e:
        return CallToolResult(
            content=[TextContent(type="text", text=f"Error executing remote process: {str(e)}")],
            isError=True,
        )


# ── app-only poll tools (visibility: ["app"], 모델 컨텍스트 오염 방지) ──

@mcp.tool()
async def poll_tasks(
    status: str | None = None,
    channel: str | None = None,
    limit: int = 20,
) -> CallToolResult:
    """[앱 전용] TasksView 폴링용 — 모델에 노출 안 됨."""
    tasks = await _fetch_tasks(status, channel, limit)
    return CallToolResult(
        content=[TextContent(type="text", text=f"태스크 {len(tasks)}개")],
        structuredContent={"tasks": tasks, "filters": {"status": status, "channel": channel}},
    )


@mcp.tool()
async def poll_agents() -> CallToolResult:
    """[앱 전용] NodesView 폴링용 — 모델에 노출 안 됨."""
    agents = await _fetch_agents()
    return CallToolResult(
        content=[TextContent(type="text", text=f"에이전트 {len(agents)}개")],
        structuredContent={"agents": agents},
    )


# ──────────────────────────────────────────────
# LLM Wiki — Central Memory System
# ──────────────────────────────────────────────

_WIKI_PATH = pathlib.Path.home() / "llm-wiki" / "wiki"
_WIKI_PATH.mkdir(parents=True, exist_ok=True)  # ensure dir exists for new users


def _wiki_title(content: str, fallback: str) -> str:
    for line in content.split("\n"):
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


@mcp.tool()
async def list_wiki_pages() -> str:
    """List all MUSU knowledge wiki pages with their IDs and titles."""
    try:
        pages = []
        for f in sorted(_WIKI_PATH.glob("*.md")):
            try:
                content = f.read_text(encoding="utf-8")
                title = _wiki_title(content, f.stem)
            except OSError:
                title = f.stem
            pages.append({"id": f.stem, "title": title})
        return _fmt(pages)
    except Exception:
        return _tool_error("Error listing wiki pages.")


@mcp.tool()
async def search_wiki(query: str) -> str:
    """Search the MUSU knowledge wiki. Returns matching pages with snippets.

    Use this to look up project context, architecture decisions, past work,
    agent specs, and any accumulated knowledge before starting a task.
    """
    try:
        q = query.strip().lower()
        if not q:
            return _fmt([])
        results = []
        for f in sorted(_WIKI_PATH.glob("*.md")):
            try:
                content = f.read_text(encoding="utf-8")
            except OSError:
                continue
            if q in content.lower():
                idx = content.lower().find(q)
                start = max(0, idx - 120)
                end = min(len(content), idx + 300)
                snippet = content[start:end].replace("\n", " ").strip()
                title = _wiki_title(content, f.stem)
                results.append({"id": f.stem, "title": title, "snippet": snippet})
        return _fmt(results[:20])
    except Exception:
        return _tool_error("Error searching wiki.")


@mcp.tool()
async def get_wiki_page(page_id: str) -> str:
    """Get the full content of a MUSU wiki page by its ID.

    page_id examples: '00_INDEX', '52_MUSU_MASTER_PLAN', '95_MUSU_PHASE26_CEO_WEB_TASK_INTERFACE_2026-04-20'
    Use list_wiki_pages() first to find the correct ID.
    """
    try:
        safe_id = re.sub(r"[^a-zA-Z0-9_\-]", "", page_id)
        path = _WIKI_PATH / f"{safe_id}.md"
        if not path.exists():
            available = [f.stem for f in sorted(_WIKI_PATH.glob("*.md"))][:20]
            return _fmt({"error": f"Page '{safe_id}' not found.", "available": available})
        content = path.read_text(encoding="utf-8")
        title = _wiki_title(content, safe_id)
        return _fmt({"id": safe_id, "title": title, "content": content})
    except Exception:
        return _tool_error("Error fetching wiki page.")


# ──────────────────────────────────────────────
# Company Charter
# ──────────────────────────────────────────────

_CHARTER_PATH = pathlib.Path(
    os.environ.get("MUSU_CHARTER_PATH", "")
) if os.environ.get("MUSU_CHARTER_PATH") else pathlib.Path(
    os.environ.get("MUSU_WORKSPACE", "/home/hugh51/musu-functions")
) / ".musu" / "charter.md"


@mcp.tool()
async def read_charter() -> str:
    """Read the company charter (mission, priorities, constraints).

    The charter is the CEO's primary strategy document.
    Read this FIRST on every heartbeat to understand WHY the company exists.
    """
    try:
        if _CHARTER_PATH.exists():
            return _CHARTER_PATH.read_text(encoding="utf-8")
        return "(No charter found. Create one with update_charter.)"
    except Exception:
        return _tool_error("Error reading charter.")


@mcp.tool()
async def update_charter(content: str) -> str:
    """Update the company charter. Provide the full markdown content.

    Use this to add learned constraints or update priorities based on experience.
    """
    try:
        _CHARTER_PATH.parent.mkdir(parents=True, exist_ok=True)
        _CHARTER_PATH.write_text(content, encoding="utf-8")
        return f"Charter updated ({len(content)} chars)."
    except Exception:
        return _tool_error("Error updating charter.")


# ──────────────────────────────────────────────
# Auto-Research Tools
# ──────────────────────────────────────────────


@mcp.tool()
async def web_search(query: str, max_results: int = 5) -> str:
    """Search the web for information. Returns structured results.

    Requires MUSU_SEARCH_API_KEY env var (Tavily API key).
    Use this to research unfamiliar topics before implementation.
    """
    api_key = os.environ.get("MUSU_SEARCH_API_KEY", "")
    if not api_key:
        return _fmt({"error": "MUSU_SEARCH_API_KEY not configured. Set Tavily API key to enable web search."})
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.tavily.com/search",
                json={"api_key": api_key, "query": query, "max_results": max_results, "include_answer": True},
            )
            resp.raise_for_status()
            data = resp.json()
            results = []
            if data.get("answer"):
                results.append({"type": "answer", "content": data["answer"]})
            for r in data.get("results", [])[:max_results]:
                results.append({"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")[:300]})
            return _fmt({"query": query, "results": results})
    except Exception as exc:
        return _tool_error(f"Web search failed: {exc}")


@mcp.tool()
async def web_fetch(url: str) -> str:
    """Fetch a URL and return its text content (max 10KB).

    Use for reading documentation, API references, blog posts, etc.
    HTML is stripped to plain text.
    """
    if not url.startswith(("http://", "https://")):
        return _tool_error("URL must start with http:// or https://")
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "MUSU-Research/1.0"})
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            text = resp.text
            # Strip HTML tags for readability
            if "html" in content_type:
                text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
                text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
                text = re.sub(r"<[^>]+>", " ", text)
                text = re.sub(r"\s+", " ", text).strip()
            # Cap at 10KB
            if len(text) > 10240:
                text = text[:10240] + "\n\n... (truncated at 10KB)"
            return _fmt({"url": url, "content": text, "length": len(text)})
    except Exception as exc:
        return _tool_error(f"Fetch failed: {exc}")


@mcp.tool()
async def write_wiki_page(page_id: str, content: str) -> str:
    """Write a wiki page to the MUSU knowledge base.

    page_id: alphanumeric + underscore + hyphen (e.g., '130_TOPIC_NAME_2026-04-22')
    content: full Markdown content for the page.
    Used by CTO/researcher agents to save research findings.
    """
    safe_id = re.sub(r"[^a-zA-Z0-9_\-]", "", page_id)
    if not safe_id:
        return _tool_error("Invalid page_id: must contain alphanumeric characters")
    path = _WIKI_PATH / f"{safe_id}.md"
    try:
        path.write_text(content, encoding="utf-8")
        title = _wiki_title(content, safe_id)
        return _fmt({"written": str(path), "title": title, "page_id": safe_id, "size": len(content)})
    except Exception as exc:
        return _tool_error(f"Write failed: {exc}")


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
