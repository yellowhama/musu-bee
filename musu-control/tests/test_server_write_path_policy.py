import asyncio
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from musu_control import server


class _StubClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []
        self.get_sequences: dict[str, list[Any]] = defaultdict(list)

    async def post(self, path: str, body: dict | None = None) -> dict:
        payload = body or {}
        self.calls.append(("POST", path, payload))
        return {"ok": True, "path": path, "body": payload}

    async def get(self, path: str, **_: Any) -> Any:
        self.calls.append(("GET", path, None))
        queue = self.get_sequences[path]
        if not queue:
            raise RuntimeError(f"missing stub sequence for GET {path}")
        if len(queue) == 1:
            return queue[0]
        return queue.pop(0)


def _run(coro: Any, stub: _StubClient) -> dict[str, Any]:
    original_client = server._client
    server._client = stub
    try:
        result = asyncio.run(coro)
    finally:
        server._client = original_client
    return json.loads(result)


def test_resume_agent_retries_to_clear_stale_paused_at() -> None:
    stub = _StubClient()
    stub.get_sequences["/agents/agent-1"] = [
        {"id": "agent-1", "status": "running", "pausedAt": "2026-04-08T00:00:00Z"},
        {"id": "agent-1", "status": "running", "pausedAt": None},
    ]

    payload = _run(server.resume_agent("agent-1", "resume-now"), stub)

    assert payload["policy"]["invariant"] == "non_paused_status_requires_pausedAt_null"
    assert payload["policy"]["enforced"] is True
    assert payload["policy"]["action"] == "retry_resume_once"
    post_calls = [c for c in stub.calls if c[0] == "POST" and c[1] == "/agents/agent-1/resume"]
    assert len(post_calls) == 2


def test_checkout_issue_blocks_stale_execution_lock_without_active_run() -> None:
    stale = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    stub = _StubClient()
    stub.get_sequences["/issues/issue-1"] = [
        {
            "id": "issue-1",
            "identifier": "MUS-1",
            "status": "blocked",
            "executionRunId": "run-stale-1",
            "executionLockedAt": stale,
            "activeRun": None,
        }
    ]
    stub.get_sequences["/heartbeat-runs/run-stale-1"] = [
        {"id": "run-stale-1", "status": "running", "issueId": "issue-1"},
    ]

    payload = _run(server.checkout_issue("issue-1", "agent-1"), stub)

    assert "Policy blocked checkout" in payload["error"]
    assert payload["policy"]["reason"] == "stale_execution_locked_at"
    assert payload["policy"]["owner"] == "board"
    assert payload["policy"]["details"]["maxAgeSeconds"] == 3600
    assert payload["policy"]["details"]["activeRunSource"] == "heartbeat_run_fallback"
    assert not any(c for c in stub.calls if c[0] == "POST" and c[1] == "/issues/issue-1/checkout")


def test_checkout_issue_blocks_mismatched_execution_and_active_run_ids() -> None:
    stub = _StubClient()
    stub.get_sequences["/issues/issue-2"] = [
        {
            "id": "issue-2",
            "identifier": "MUS-2",
            "status": "in_progress",
            "executionRunId": "run-lock-2",
            "executionLockedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "activeRun": {"id": "run-live-2", "status": "running", "issueId": "issue-2"},
        }
    ]

    payload = _run(server.checkout_issue("issue-2", "agent-2"), stub)

    assert "Policy blocked checkout" in payload["error"]
    assert payload["policy"]["reason"] == "mismatched_active_run_id"
    assert payload["policy"]["details"] == {
        "executionRunId": "run-lock-2",
        "activeRunId": "run-live-2",
        "activeRunSource": "issue",
    }
    assert not any(c for c in stub.calls if c[0] == "POST" and c[1] == "/issues/issue-2/checkout")


def test_checkout_issue_blocks_stale_execution_locked_at() -> None:
    stale = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
    stub = _StubClient()
    stub.get_sequences["/issues/issue-3"] = [
        {
            "id": "issue-3",
            "identifier": "MUS-3",
            "status": "in_progress",
            "executionRunId": "run-lock-3",
            "executionLockedAt": stale,
            "activeRun": {"id": "run-lock-3", "status": "running", "issueId": "issue-3"},
        }
    ]

    payload = _run(server.checkout_issue("issue-3", "agent-3"), stub)

    assert "Policy blocked checkout" in payload["error"]
    assert payload["policy"]["reason"] == "stale_execution_locked_at"
    assert payload["policy"]["details"]["maxAgeSeconds"] == 3600
    assert payload["policy"]["details"]["lockAgeSeconds"] > payload["policy"]["details"]["maxAgeSeconds"]
    assert not any(c for c in stub.calls if c[0] == "POST" and c[1] == "/issues/issue-3/checkout")


def test_checkout_issue_allows_heartbeat_run_fallback_when_issue_projection_is_null() -> None:
    fresh = (datetime.now(timezone.utc) - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    stub = _StubClient()
    stub.get_sequences["/issues/issue-3b"] = [
        {
            "id": "issue-3b",
            "identifier": "MUS-3B",
            "status": "in_progress",
            "executionRunId": "run-3b",
            "executionLockedAt": fresh,
            "activeRun": None,
        },
        {
            "id": "issue-3b",
            "identifier": "MUS-3B",
            "status": "in_progress",
            "checkoutRunId": "run-3b",
            "executionRunId": "run-3b",
            "executionLockedAt": fresh,
            "activeRun": None,
        },
    ]
    stub.get_sequences["/heartbeat-runs/run-3b"] = [
        {"id": "run-3b", "status": "queued", "issueId": "issue-3b"},
        {"id": "run-3b", "status": "queued", "issueId": "issue-3b"},
    ]

    payload = _run(server.checkout_issue("issue-3b", "agent-3b"), stub)

    assert payload.get("ok") is True
    checkout_call = next(c for c in stub.calls if c[0] == "POST" and c[1] == "/issues/issue-3b/checkout")
    assert checkout_call[2]["agentId"] == "agent-3b"
    fallback_reads = [c for c in stub.calls if c[0] == "GET" and c[1] == "/heartbeat-runs/run-3b"]
    assert len(fallback_reads) == 2


def test_checkout_issue_blocks_terminal_heartbeat_run_fallback() -> None:
    fresh = (datetime.now(timezone.utc) - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    stub = _StubClient()
    stub.get_sequences["/issues/issue-3c"] = [
        {
            "id": "issue-3c",
            "identifier": "MUS-3C",
            "status": "in_progress",
            "executionRunId": "run-3c",
            "executionLockedAt": fresh,
            "activeRun": None,
        }
    ]
    stub.get_sequences["/heartbeat-runs/run-3c"] = [
        {"id": "run-3c", "status": "cancelled", "issueId": "issue-3c"},
    ]

    payload = _run(server.checkout_issue("issue-3c", "agent-3c"), stub)

    assert "Policy blocked checkout" in payload["error"]
    assert payload["policy"]["reason"] == "invalid_active_run_status"
    assert payload["policy"]["details"] == {
        "activeRunStatus": "cancelled",
        "activeRunSource": "heartbeat_run_fallback",
    }
    assert not any(c for c in stub.calls if c[0] == "POST" and c[1] == "/issues/issue-3c/checkout")


def test_checkout_issue_valid_lock_allows_checkout_and_alignment() -> None:
    fresh = (datetime.now(timezone.utc) - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    stub = _StubClient()
    stub.get_sequences["/issues/issue-4"] = [
        {
            "id": "issue-4",
            "identifier": "MUS-4",
            "status": "in_progress",
            "executionRunId": "run-4",
            "executionLockedAt": fresh,
            "activeRun": {"id": "run-4", "status": "running", "issueId": "issue-4"},
        },
        {
            "id": "issue-4",
            "identifier": "MUS-4",
            "status": "in_progress",
            "checkoutRunId": "run-4",
            "executionRunId": "run-4",
            "executionLockedAt": fresh,
            "activeRun": {"id": "run-4", "status": "running", "issueId": "issue-4"},
        },
    ]

    payload = _run(server.checkout_issue("issue-4", "agent-4"), stub)

    assert payload.get("ok") is True
    checkout_call = next(c for c in stub.calls if c[0] == "POST" and c[1] == "/issues/issue-4/checkout")
    assert checkout_call[2] == {
        "agentId": "agent-4",
        "expectedStatuses": ["todo", "backlog", "blocked", "in_progress", "in_review"],
    }


def test_add_comment_blocks_gate_verdict_without_evidence_link() -> None:
    stub = _StubClient()

    payload = _run(server.add_comment("issue-3", "G1: PASS"), stub)

    assert "Policy blocked comment" in payload["error"]
    assert payload["policy"]["invariant"] == "gate_verdict_requires_evidence_link"
    assert not any(c for c in stub.calls if c[0] == "POST")


def test_add_comment_allows_gate_verdict_with_evidence_link() -> None:
    stub = _StubClient()

    payload = _run(
        server.add_comment(
            "issue-4",
            "G1: PASS evidence runtime/generated/paperclip_state_audit_last_run.json",
        ),
        stub,
    )

    assert payload["ok"] is True
    post_call = next(c for c in stub.calls if c[0] == "POST")
    assert post_call[1] == "/issues/issue-4/comments"


def test_checkout_issue_blocks_run_issue_link_mismatch() -> None:
    stub = _StubClient()
    stub.get_sequences["/issues/issue-5"] = [
        {
            "id": "issue-5",
            "identifier": "MUS-5",
            "status": "in_progress",
            "executionRunId": "run-5",
            "executionLockedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "activeRun": None,
        }
    ]
    stub.get_sequences["/heartbeat-runs/run-5"] = [
        {"id": "run-5", "status": "running", "issueId": "wrong-issue"},
    ]

    payload = _run(server.checkout_issue("issue-5", "agent-5"), stub)

    assert "Policy blocked checkout" in payload["error"]
    assert payload["policy"]["reason"] == "run_issue_link_mismatch"
    assert payload["policy"]["details"]["runIssueId"] == "wrong-issue"
    assert payload["policy"]["details"]["issueId"] == "issue-5"
    assert not any(c for c in stub.calls if c[0] == "POST" and c[1] == "/issues/issue-5/checkout")


def test_update_issue_blocks_run_issue_link_mismatch() -> None:
    stub = _StubClient()
    stub.get_sequences["/issues/issue-6"] = [
        {
            "id": "issue-6",
            "identifier": "MUS-6",
            "status": "in_progress",
            "executionRunId": "run-6",
            "executionLockedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "activeRun": None,
        }
    ]
    stub.get_sequences["/heartbeat-runs/run-6"] = [
        {"id": "run-6", "status": "running", "issueId": "wrong-issue"},
    ]

    payload = _run(server.update_issue("issue-6", status="done"), stub)

    assert "Policy blocked update" in payload["error"]
    assert payload["policy"]["reason"] == "run_issue_link_mismatch"
    assert payload["policy"]["details"]["runIssueId"] == "wrong-issue"
    assert payload["policy"]["details"]["issueId"] == "issue-6"
    assert not any(c for c in stub.calls if c[0] == "PATCH" and c[1] == "/issues/issue-6")
