"""musu-control: Paperclip control plane MCP server — 23 tools via FastMCP."""

import json
from typing import Any

try:
    from mcp.server.fastmcp import FastMCP
except ModuleNotFoundError as exc:
    raise ModuleNotFoundError(
        "MCP runtime is not installed. Install the 'mcp' package."
    ) from exc

from .client import PaperclipClient

mcp = FastMCP("musu-control")
_client: PaperclipClient | None = None


def _get_client() -> PaperclipClient:
    global _client
    if _client is None:
        _client = PaperclipClient()
    return _client


def _fmt(data: Any) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False)


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
    except Exception as e:
        return f"Error listing agents: {e}"


@mcp.tool()
async def get_agent(agent_id: str) -> str:
    """Get details for a specific agent by ID or short name."""
    try:
        c = _get_client()
        data = await c.get(f"/agents/{agent_id}")
        return _fmt(data)
    except Exception as e:
        return f"Error getting agent {agent_id}: {e}"


@mcp.tool()
async def pause_agent(agent_id: str, reason: str = "") -> str:
    """Pause an agent (stops it from picking up new work)."""
    try:
        c = _get_client()
        body: dict = {}
        if reason:
            body["reason"] = reason
        data = await c.post(f"/agents/{agent_id}/pause", body)
        return _fmt(data)
    except Exception as e:
        return f"Error pausing agent {agent_id}: {e}"


@mcp.tool()
async def resume_agent(agent_id: str) -> str:
    """Resume a paused agent."""
    try:
        c = _get_client()
        data = await c.post(f"/agents/{agent_id}/resume")
        return _fmt(data)
    except Exception as e:
        return f"Error resuming agent {agent_id}: {e}"


@mcp.tool()
async def invoke_heartbeat(agent_id: str) -> str:
    """Manually trigger a heartbeat run for an agent."""
    try:
        c = _get_client()
        data = await c.post(f"/agents/{agent_id}/heartbeat/invoke")
        return _fmt(data)
    except Exception as e:
        return f"Error invoking heartbeat for {agent_id}: {e}"


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
    except Exception as e:
        return f"Error building org chart: {e}"


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
    except Exception as e:
        return f"Error listing issues: {e}"


@mcp.tool()
async def get_issue(issue_id: str) -> str:
    """Get full details of an issue by ID or identifier (e.g. MUS-123)."""
    try:
        c = _get_client()
        data = await c.get(f"/issues/{issue_id}")
        return _fmt(data)
    except Exception as e:
        return f"Error getting issue {issue_id}: {e}"


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
    except Exception as e:
        return f"Error creating issue: {e}"


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
    except Exception as e:
        return f"Error updating issue {issue_id}: {e}"


@mcp.tool()
async def checkout_issue(issue_id: str, agent_id: str) -> str:
    """Checkout an issue for an agent (marks it in_progress and locks it)."""
    try:
        c = _get_client()
        body = {
            "agentId": agent_id,
            "expectedStatuses": ["todo", "backlog", "blocked"],
        }
        data = await c.post(f"/issues/{issue_id}/checkout", body)
        return _fmt(data)
    except Exception as e:
        return f"Error checking out issue {issue_id}: {e}"


@mcp.tool()
async def add_comment(issue_id: str, body: str) -> str:
    """Add a comment to an issue."""
    try:
        c = _get_client()
        data = await c.post(f"/issues/{issue_id}/comments", {"body": body})
        return _fmt(data)
    except Exception as e:
        return f"Error adding comment to {issue_id}: {e}"


@mcp.tool()
async def get_comments(issue_id: str) -> str:
    """Get all comments on an issue."""
    try:
        c = _get_client()
        data = await c.get(f"/issues/{issue_id}/comments")
        return _fmt(data)
    except Exception as e:
        return f"Error getting comments for {issue_id}: {e}"


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
    except Exception as e:
        return f"Error getting dashboard: {e}"


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
    except Exception as e:
        return f"Error listing runs: {e}"


@mcp.tool()
async def get_activity(limit: int = 50) -> str:
    """Get recent company activity feed."""
    try:
        c = _get_client()
        data = await c.get(f"/companies/{c.company_id}/activity", limit=limit)
        return _fmt(data)
    except Exception as e:
        return f"Activity endpoint unavailable: {e}"


@mcp.tool()
async def get_costs_summary() -> str:
    """Get total cost summary for the company."""
    try:
        c = _get_client()
        data = await c.get(f"/companies/{c.company_id}/costs/summary")
        return _fmt(data)
    except Exception as e:
        return f"Costs endpoint unavailable: {e}"


@mcp.tool()
async def get_costs_by_agent() -> str:
    """Get cost breakdown grouped by agent."""
    try:
        c = _get_client()
        data = await c.get(f"/companies/{c.company_id}/costs/by-agent")
        return _fmt(data)
    except Exception as e:
        return f"Costs-by-agent endpoint unavailable: {e}"


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
    except Exception as e:
        return f"Error listing projects: {e}"


@mcp.tool()
async def get_project(project_id: str) -> str:
    """Get details of a project by ID."""
    try:
        c = _get_client()
        data = await c.get(f"/projects/{project_id}")
        return _fmt(data)
    except Exception as e:
        return f"Error getting project {project_id}: {e}"


@mcp.tool()
async def list_goals() -> str:
    """List all goals in the company."""
    try:
        c = _get_client()
        data = await c.get(f"/companies/{c.company_id}/goals")
        return _fmt(data)
    except Exception as e:
        return f"Error listing goals: {e}"


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
    except Exception as e:
        return f"Error listing approvals: {e}"


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
    except Exception as e:
        return f"Error resolving approval {approval_id}: {e}"


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
