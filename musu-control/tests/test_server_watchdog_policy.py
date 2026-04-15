import asyncio
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from musu_control import server


class _WatchdogStubClient:
    def __init__(self) -> None:
        self.company_id = "company-1"
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []
        self.get_sequences: dict[str, list[Any]] = defaultdict(list)
        self.post_sequences: dict[str, list[Any]] = defaultdict(list)
        self.post_errors: dict[str, Exception] = {}

    async def get(self, path: str, **_: Any) -> Any:
        self.calls.append(("GET", path, None))
        queue = self.get_sequences[path]
        if not queue:
            raise RuntimeError(f"missing stub sequence for GET {path}")
        if len(queue) == 1:
            return queue[0]
        return queue.pop(0)

    async def post(self, path: str, body: dict | None = None) -> Any:
        self.calls.append(("POST", path, body or {}))
        if path in self.post_errors:
            raise self.post_errors[path]
        queue = self.post_sequences[path]
        if not queue:
            return {"status": "cancelled"}
        if len(queue) == 1:
            return queue[0]
        return queue.pop(0)


def _run(coro: Any, stub: _WatchdogStubClient) -> dict[str, Any]:
    original_client = server._client
    server._client = stub
    try:
        result = asyncio.run(coro)
    finally:
        server._client = original_client
    return json.loads(result)


def _iso_utc(seconds_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _base_agents() -> list[dict[str, Any]]:
    return [{"id": "agent-1", "name": "Founding Engineer", "status": "running"}]


def test_watchdog_detect_and_remediate_cancels_stale_active_run() -> None:
    stub = _WatchdogStubClient()
    stub.get_sequences["/companies/company-1/agents"] = [_base_agents()]
    stub.get_sequences["/companies/company-1/issues"] = [
        [
            {
                "id": "issue-1",
                "identifier": "MUS-1",
                "status": "in_progress",
                "assigneeAgentId": "agent-1",
                "executionRunId": "run-1",
            }
        ]
    ]
    stub.get_sequences["/heartbeat-runs/run-1"] = [
        {
            "id": "run-1",
            "status": "queued",
            "issueId": "issue-1",
            "createdAt": _iso_utc(7200),
        }
    ]

    payload = _run(server.watchdog_detect_and_remediate(stale_threshold_seconds=300), stub)

    stale_row = next(r for r in payload["rows"] if r["runId"] == "run-1")
    assert stale_row["reasonCode"] == "stale_queued_over_threshold"
    assert stale_row["action"] == "cancel_run"
    assert stale_row["result"] == "cancel_requested"
    assert payload["summary"]["staleDetected"] == 1
    cancel_calls = [c for c in stub.calls if c[0] == "POST" and c[1] == "/heartbeat-runs/run-1/cancel"]
    assert len(cancel_calls) == 1


def test_watchdog_detect_and_remediate_reports_healthy_non_anomaly_without_cancel() -> None:
    stub = _WatchdogStubClient()
    stub.get_sequences["/companies/company-1/agents"] = [_base_agents()]
    stub.get_sequences["/companies/company-1/issues"] = [
        [
            {
                "id": "issue-2",
                "identifier": "MUS-2",
                "status": "in_progress",
                "assigneeAgentId": "agent-1",
                "executionRunId": "run-2",
            }
        ]
    ]
    stub.get_sequences["/heartbeat-runs/run-2"] = [
        {
            "id": "run-2",
            "status": "running",
            "issueId": "issue-2",
            "createdAt": _iso_utc(120),
        }
    ]

    payload = _run(server.watchdog_detect_and_remediate(stale_threshold_seconds=900), stub)

    row = next(r for r in payload["rows"] if r["runId"] == "run-2")
    assert row["reasonCode"] == "active_within_threshold"
    assert row["result"] == "healthy_no_action"
    assert row["action"] == "none"
    assert payload["summary"]["staleDetected"] == 0
    assert not any(c for c in stub.calls if c[0] == "POST" and c[1].endswith("/cancel"))


def test_watchdog_detect_and_remediate_fail_closed_for_unknown_run_status() -> None:
    stub = _WatchdogStubClient()
    stub.get_sequences["/companies/company-1/agents"] = [_base_agents()]
    stub.get_sequences["/companies/company-1/issues"] = [
        [
            {
                "id": "issue-3",
                "identifier": "MUS-3",
                "status": "blocked",
                "assigneeAgentId": "agent-1",
                "executionRunId": "run-3",
            }
        ]
    ]
    stub.get_sequences["/heartbeat-runs/run-3"] = [
        {
            "id": "run-3",
            "status": "mystery",
            "issueId": "issue-3",
            "createdAt": _iso_utc(7200),
        }
    ]

    payload = _run(server.watchdog_detect_and_remediate(stale_threshold_seconds=300), stub)

    row = next(r for r in payload["rows"] if r["runId"] == "run-3")
    assert row["reasonCode"] == "unknown_run_status"
    assert row["result"] == "fail_closed_no_action"
    assert row["action"] == "none"
    assert not any(c for c in stub.calls if c[0] == "POST" and c[1].endswith("/cancel"))


def test_watchdog_detect_and_remediate_permission_boundary_emits_tbd_unresolved_row() -> None:
    stub = _WatchdogStubClient()
    stub.get_sequences["/companies/company-1/agents"] = [_base_agents()]
    stub.get_sequences["/companies/company-1/issues"] = [
        [
            {
                "id": "issue-4",
                "identifier": "MUS-4",
                "status": "blocked",
                "assigneeAgentId": "agent-1",
                "executionRunId": "run-4",
            }
        ]
    ]
    stub.get_sequences["/heartbeat-runs/run-4"] = [
        {
            "id": "run-4",
            "status": "running",
            "issueId": "issue-4",
            "createdAt": _iso_utc(7200),
        }
    ]
    request = httpx.Request("POST", "http://127.0.0.1:3100/api/heartbeat-runs/run-4/cancel")
    response = httpx.Response(403, request=request, json={"error": "Board access required"})
    stub.post_errors["/heartbeat-runs/run-4/cancel"] = httpx.HTTPStatusError(
        "Forbidden",
        request=request,
        response=response,
    )

    payload = _run(server.watchdog_detect_and_remediate(stale_threshold_seconds=300), stub)

    row = next(r for r in payload["rows"] if r["runId"] == "run-4")
    assert row["action"] == "board_cancel_run"
    assert row["result"] == "permission_boundary_blocked"
    assert "[TBD: awaiting real data] action=board_cancel_run runId=run-4 owner=CEO/board eta=" in row["unresolved"]
    assert payload["unresolved"]


def test_watchdog_detect_and_remediate_detects_agent_error_state_recurrence() -> None:
    stub = _WatchdogStubClient()
    stub.get_sequences["/companies/company-1/agents"] = [
        [
            {"id": "agent-err", "name": "Founding Engineer", "status": "error"},
        ]
    ]
    stub.get_sequences["/companies/company-1/issues"] = [
        [
            {
                "id": "issue-5",
                "identifier": "MUS-5",
                "status": "in_progress",
                "assigneeAgentId": "agent-err",
                "executionRunId": "run-5",
            }
        ]
    ]
    stub.get_sequences["/heartbeat-runs/run-5"] = [
        {
            "id": "run-5",
            "status": "running",
            "issueId": "issue-5",
            "createdAt": _iso_utc(120),
        }
    ]

    payload = _run(
        server.watchdog_detect_and_remediate(stale_threshold_seconds=900, dry_run=True),
        stub,
    )

    recurrence_row = next(r for r in payload["rows"] if r["reasonCode"] == "agent_error_state_recurrence")
    assert recurrence_row["issueId"] == "issue-5"
    assert recurrence_row["runId"] == "run-5"
    assert recurrence_row["status"] == "error"
    assert recurrence_row["action"] == "request_owner_reset_agent"
    assert recurrence_row["result"] == "detected"
