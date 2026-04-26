import asyncio
import json
from typing import Any

from musu_control import server


class _WriterStubClient:
    def __init__(self) -> None:
        self.company_id = "company-writers"
        self.calls: list[tuple[str, str, dict[str, Any] | None]] = []
        self.issue_counter = 0

    async def get(self, path: str, **params: Any) -> Any:
        self.calls.append(("GET", path, params or None))
        if path == "/companies/company-writers/agents":
            return [
                {"id": "agent-lead", "name": "BW-Lead"},
                {"id": "agent-pm-fd", "name": "BW-PM-FalseDane"},
                {"id": "agent-pm-bl", "name": "BW-PM-Bloodline"},
                {"id": "agent-research", "name": "BW-Researcher"},
                {"id": "agent-writer", "name": "BW-Writer"},
                {"id": "agent-editor", "name": "BW-Editor"},
            ]
        if path == "/companies/company-writers/projects":
            return [
                {"id": "project-fd", "name": "False Dane"},
                {"id": "project-bl", "name": "Bloodline"},
            ]
        if path == "/companies/company-writers/goals":
            return [
                {
                    "id": "goal-1",
                    "title": "False Dane — CHAPTER_002 — Reeve pilot",
                    "status": "active",
                    "projectId": "project-fd",
                }
            ]
        if path == "/companies/company-writers/issues":
            return [
                {
                    "id": "issue-lead",
                    "identifier": "MUS-1",
                    "title": "CHAPTER_002 — company direction lock",
                    "status": "done",
                    "priority": "medium",
                    "goalId": "goal-1",
                    "assigneeAgentId": "agent-lead",
                },
                {
                    "id": "issue-writer",
                    "identifier": "MUS-2",
                    "title": "CHAPTER_002 — draft and revision",
                    "status": "in_progress",
                    "priority": "high",
                    "goalId": "goal-1",
                    "assigneeAgentId": "agent-writer",
                },
            ]
        raise RuntimeError(f"unexpected GET {path}")

    async def post(self, path: str, body: dict | None = None) -> Any:
        payload = body or {}
        self.calls.append(("POST", path, payload))
        if path == "/companies/company-writers/goals":
            return {
                "id": "goal-new",
                "title": payload.get("title"),
                "status": payload.get("status", "active"),
                "projectId": payload.get("projectId"),
            }
        if path == "/companies/company-writers/issues":
            self.issue_counter += 1
            return {
                "id": f"issue-{self.issue_counter}",
                "identifier": f"MUS-{self.issue_counter}",
                "title": payload.get("title"),
                "status": payload.get("status", "open"),
                "goalId": payload.get("goalId"),
                "projectId": payload.get("projectId"),
                "assigneeAgentId": payload.get("assigneeAgentId") or payload.get("assignee_id"),
            }
        raise RuntimeError(f"unexpected POST {path}")


class _WriterLegacyStubClient(_WriterStubClient):
    async def get(self, path: str, **params: Any) -> Any:
        if path == "/companies/company-writers/goals":
            return [
                {
                    "id": "goal-legacy",
                    "title": "False Dane — CHAPTER_003_SMOKE — legacy api path",
                    "status": "active",
                    "projectId": "project-fd",
                }
            ]
        if path == "/companies/company-writers/issues":
            return [
                {
                    "id": "legacy-lead",
                    "identifier": None,
                    "title": "CHAPTER_003_SMOKE — company direction lock",
                    "status": "open",
                    "priority": "medium",
                    "assignee_id": "agent-lead",
                },
                {
                    "id": "legacy-writer",
                    "identifier": None,
                    "title": "CHAPTER_003_SMOKE — draft and revision",
                    "status": "open",
                    "priority": "high",
                    "assignee_id": "agent-writer",
                },
            ]
        return await super().get(path, **params)

    async def post(self, path: str, body: dict | None = None) -> Any:
        payload = body or {}
        self.calls.append(("POST", path, payload))
        if path == "/companies/company-writers/goals":
            return {
                "id": "goal-legacy",
                "title": payload.get("title"),
                "status": payload.get("status", "active"),
            }
        if path == "/companies/company-writers/issues":
            self.issue_counter += 1
            return {
                "id": f"legacy-issue-{self.issue_counter}",
                "identifier": None,
                "title": payload.get("title"),
                "status": payload.get("status", "open"),
                "assignee_id": payload.get("assignee_id"),
            }
        raise RuntimeError(f"unexpected POST {path}")


def _run(coro: Any, stub: _WriterStubClient) -> dict[str, Any]:
    original_client = server._client
    server._client = stub
    try:
        result = asyncio.run(coro)
    finally:
        server._client = original_client
    return json.loads(result)


def test_get_vault_secret_returns_one_value(monkeypatch) -> None:
    monkeypatch.setattr(
        server,
        "_read_vault",
        lambda: {"bridge": {"token": "abc"}, "nodes": {"5070": {"ip": "1.2.3.4"}}},
    )
    result = asyncio.run(server.get_vault_secret("bridge.token"))
    payload = json.loads(result)
    assert payload == {"secret_path": "bridge.token", "value": "abc"}


def test_list_vault_secret_keys_omits_meta(monkeypatch) -> None:
    monkeypatch.setattr(
        server,
        "_read_vault",
        lambda: {
            "_note": "ignore",
            "bridge": {"token": "abc"},
            "nodes": {"5070": {"ip": "1.2.3.4", "_warning": "ignore"}},
        },
    )
    result = asyncio.run(server.list_vault_secret_keys())
    payload = json.loads(result)
    assert payload["keys"] == ["bridge.token", "nodes.5070.ip"]


def test_create_writer_sprint_bundle_creates_goal_and_role_mapped_issues() -> None:
    stub = _WriterStubClient()
    payload = _run(
        server.create_writer_sprint_bundle(
            project_name="False Dane",
            sprint_id="CHAPTER_002",
            title="Reeve pilot",
            artifact_path="projects/false-dane/drafts/CHAPTER_002_DRAFT_v2.md",
            brief="Push Chapter 002 to release-ready draft.",
            source_files="canon/protagonist.md\ncanon/reeve.md",
            acceptance_criteria="- no canon drift\n- reeve false relief lands",
        ),
        stub,
    )

    assert payload["goal"]["id"] == "goal-new"
    assert payload["goal"]["projectId"] == "project-fd"
    assert payload["compatibilityMode"] == "native_goal_linking"
    assert [issue["handle"] for issue in payload["issues"]] == [
        "BW-Lead",
        "BW-PM-FalseDane",
        "BW-Researcher",
        "BW-Writer",
        "BW-Editor",
    ]
    post_issue_calls = [call for call in stub.calls if call[0] == "POST" and call[1] == "/companies/company-writers/issues"]
    assert len(post_issue_calls) == 5
    writer_issue = post_issue_calls[3][2]
    assert writer_issue["assigneeAgentId"] == "agent-writer"
    assert writer_issue["goalId"] == "goal-new"
    assert writer_issue["projectId"] == "project-fd"


def test_get_writer_sprint_status_summarizes_goal_issues() -> None:
    stub = _WriterStubClient()
    payload = _run(
        server.get_writer_sprint_status(
            sprint_id="CHAPTER_002",
            project_name="False Dane",
        ),
        stub,
    )

    assert payload["goal"]["id"] == "goal-1"
    assert payload["issueCount"] == 2
    assert payload["issues"][0]["assignee"] == "BW-Lead"
    assert payload["issues"][1]["assignee"] == "BW-Writer"


def test_create_writer_sprint_bundle_legacy_schema_preserves_assignment() -> None:
    stub = _WriterLegacyStubClient()
    payload = _run(
        server.create_writer_sprint_bundle(
            project_name="False Dane",
            sprint_id="CHAPTER_003_SMOKE",
            title="legacy api path",
        ),
        stub,
    )

    assert payload["compatibilityMode"] == "legacy_issue_schema"
    assert [issue["assigneeAgentId"] for issue in payload["issues"]] == [
        "agent-lead",
        "agent-pm-fd",
        "agent-research",
        "agent-writer",
        "agent-editor",
    ]
    post_issue_calls = [call for call in stub.calls if call[0] == "POST" and call[1] == "/companies/company-writers/issues"]
    assert post_issue_calls[0][2]["assignee_id"] == "agent-lead"


def test_get_writer_sprint_status_falls_back_to_sprint_title_for_legacy_schema() -> None:
    stub = _WriterLegacyStubClient()
    payload = _run(
        server.get_writer_sprint_status(
            goal_id="goal-legacy",
        ),
        stub,
    )

    assert payload["matchMode"] == "sprint_title"
    assert payload["sprintId"] == "CHAPTER_003_SMOKE"
    assert payload["issueCount"] == 2
    assert payload["issues"][0]["assignee"] == "BW-Lead"
