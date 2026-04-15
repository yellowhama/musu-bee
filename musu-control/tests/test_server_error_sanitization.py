import asyncio
import re
from pathlib import Path
from typing import Callable, Awaitable

import pytest

from musu_control import server

_LEAK_SENTINEL = "TOP_SECRET:/internal/path?token=abc123"


class _BoomClient:
    company_id = "company-1"

    async def get(self, path: str, **kwargs):  # noqa: ARG002
        raise RuntimeError(_LEAK_SENTINEL)

    async def post(self, path: str, body: dict | None = None):  # noqa: ARG002
        raise RuntimeError(_LEAK_SENTINEL)

    async def patch(self, path: str, body: dict | None = None):  # noqa: ARG002
        raise RuntimeError(_LEAK_SENTINEL)


def _run(coro: Awaitable[str]) -> str:
    original_client = server._client
    server._client = _BoomClient()
    try:
        return asyncio.run(coro)
    finally:
        server._client = original_client


@pytest.mark.parametrize(
    ("name", "build_coro"),
    [
        ("list_agents", lambda: server.list_agents()),
        ("get_agent", lambda: server.get_agent("agent-1")),
        ("pause_agent", lambda: server.pause_agent("agent-1", "test")),
        ("resume_agent", lambda: server.resume_agent("agent-1", "test")),
        ("invoke_heartbeat", lambda: server.invoke_heartbeat("agent-1")),
        ("get_org_chart", lambda: server.get_org_chart()),
        ("list_issues", lambda: server.list_issues()),
        ("get_issue", lambda: server.get_issue("MUS-1")),
        ("create_issue", lambda: server.create_issue(title="Test issue")),
        ("update_issue", lambda: server.update_issue("MUS-1", status="in_progress")),
        ("checkout_issue", lambda: server.checkout_issue("MUS-1", "agent-1")),
        ("add_comment", lambda: server.add_comment("MUS-1", "regular note")),
        ("get_comments", lambda: server.get_comments("MUS-1")),
        ("get_dashboard", lambda: server.get_dashboard()),
        ("list_runs", lambda: server.list_runs()),
        ("get_activity", lambda: server.get_activity()),
        ("get_costs_summary", lambda: server.get_costs_summary()),
        ("get_costs_by_agent", lambda: server.get_costs_by_agent()),
        ("list_projects", lambda: server.list_projects()),
        ("get_project", lambda: server.get_project("project-1")),
        ("list_goals", lambda: server.list_goals()),
        ("list_approvals", lambda: server.list_approvals()),
        ("resolve_approval", lambda: server.resolve_approval("approval-1", "approve")),
    ],
)
def test_tool_errors_do_not_reflect_exception_details(
    name: str,
    build_coro: Callable[[], Awaitable[str]],
) -> None:
    result = _run(build_coro())
    assert _LEAK_SENTINEL not in result, f"{name} leaked raw exception details"
    assert "RuntimeError" not in result, f"{name} leaked exception class details"


def test_server_source_has_no_raw_exception_interpolation() -> None:
    source = Path(server.__file__).read_text(encoding="utf-8")
    assert re.search(r'return\s+f"[^"\n]*\{e\}[^"\n]*"', source) is None
