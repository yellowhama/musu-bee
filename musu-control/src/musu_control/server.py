"""musu-control: Paperclip control plane MCP server — 24 tools via FastMCP."""

import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

try:
    from mcp.server.fastmcp import FastMCP
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
        data = await c.get(f"/companies/{c.company_id}/agents")
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
        agents: list[dict] = await c.get(f"/companies/{c.company_id}/agents")

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
        data = await c.get(f"/companies/{c.company_id}/issues", **params)
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
    status: str = "todo",
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
        data = await c.post(f"/companies/{c.company_id}/issues", body)
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
        data = await c.get(f"/companies/{c.company_id}/dashboard")
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
        data = await c.get(f"/companies/{c.company_id}/heartbeat-runs", **params)
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
        agents_data = await c.get(f"/companies/{c.company_id}/agents")
        issues_data = await c.get(
            f"/companies/{c.company_id}/issues",
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
        data = await c.get(f"/companies/{c.company_id}/activity", limit=limit)
        return _fmt(data)
    except Exception:
        return _tool_error("Activity endpoint unavailable.")


@mcp.tool()
async def get_costs_summary() -> str:
    """Get total cost summary for the company."""
    try:
        c = _get_client()
        data = await c.get(f"/companies/{c.company_id}/costs/summary")
        return _fmt(data)
    except Exception:
        return _tool_error("Costs endpoint unavailable.")


@mcp.tool()
async def get_costs_by_agent() -> str:
    """Get cost breakdown grouped by agent."""
    try:
        c = _get_client()
        data = await c.get(f"/companies/{c.company_id}/costs/by-agent")
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
async def list_goals() -> str:
    """List all goals in the company."""
    try:
        c = _get_client()
        data = await c.get(f"/companies/{c.company_id}/goals")
        return _fmt(data)
    except Exception:
        return _tool_error("Error listing goals.")


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
# Async task delegation (musu-bridge direct)
# ──────────────────────────────────────────────

_MUSU_BRIDGE_URL = os.environ.get("MUSU_BRIDGE_URL", "http://127.0.0.1:8070")


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
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{_MUSU_BRIDGE_URL}/api/tasks/delegate",
                json={"channel": channel, "sender_id": sender_id, "text": instruction},
            )
            resp.raise_for_status()
            data = resp.json()
        return _fmt({"task_id": data["task_id"], "status": data.get("status", "running"), "channel": channel})
    except Exception:
        return _tool_error(f"Error delegating task to channel={channel!r}.")


@mcp.tool()
async def get_task_status(task_id: str) -> str:
    """Poll the status of a delegated task.

    Returns status and a short summary (≤500 chars) — not the full agent output.
    Status values: pending | running | done | failed

    Args:
        task_id: The task_id returned by delegate_task
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
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
    except Exception:
        return _tool_error(f"Error fetching task status for {task_id!r}.")


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
