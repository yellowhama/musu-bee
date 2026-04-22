"""PaperclipBackend — delegates to the Paperclip control plane API via httpx."""

from __future__ import annotations

import uuid
from typing import Any

import httpx

from musu_core.backends.base import BackendABC


def _agent_from_pc(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": data.get("id"),
        "name": data.get("name") or data.get("nameKey") or data.get("urlKey"),
        "role": data.get("role"),
        "adapter_type": (data.get("adapterConfig") or {}).get("type"),
        "adapter_config": data.get("adapterConfig"),
        "status": "active" if not data.get("deletedAt") else "inactive",
        "created_at": data.get("createdAt"),
        "updated_at": data.get("updatedAt"),
    }


def _task_from_pc(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": data.get("id"),
        "title": data.get("title"),
        "description": data.get("description", ""),
        "status": data.get("status"),
        "priority": data.get("priority", "medium"),
        "assignee_agent_id": data.get("assigneeAgentId"),
        "parent_id": data.get("parentId"),
        "meta": None,
        "created_at": data.get("createdAt"),
        "updated_at": data.get("updatedAt"),
    }


def _comment_from_pc(data: dict[str, Any], task_id: str) -> dict[str, Any]:
    return {
        "id": data.get("id"),
        "task_id": task_id,
        "author_agent_id": data.get("authorAgentId"),
        "author_kind": "agent" if data.get("authorAgentId") else "user",
        "body": data.get("body", ""),
        "created_at": data.get("createdAt"),
    }


class PaperclipBackend(BackendABC):
    """Routes agent/task operations to a Paperclip instance via its REST API."""

    def __init__(
        self,
        api_url: str,
        api_key: str,
        company_id: str,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.company_id = company_id
        self._client = httpx.Client(
            base_url=self.api_url,
            headers={"Authorization": f"Bearer {self.api_key}"},
            timeout=10.0,
        )

    # --- Health check ---

    def is_available(self) -> bool:
        """Return True if the Paperclip API is reachable."""
        try:
            resp = self._client.get("/api/agents/me")
            return resp.status_code < 500
        except Exception:
            return False

    # --- Internal helpers ---

    def _get(self, path: str, **params: Any) -> Any:
        resp = self._client.get(path, params={k: v for k, v in params.items() if v is not None})
        resp.raise_for_status()
        return resp.json()

    def _post(self, path: str, body: dict[str, Any]) -> Any:
        resp = self._client.post(path, json=body)
        resp.raise_for_status()
        return resp.json()

    # --- Agents ---

    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        try:
            data = self._get(f"/api/agents/{agent_id}")
            return _agent_from_pc(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    def get_agent_by_name(self, name: str, company_id: str | None = None) -> dict[str, Any] | None:
        agents = self.list_agents(company_id=company_id)
        for a in agents:
            if a.get("name") == name:
                return a
        return None

    def list_agents(self, company_id: str | None = None) -> list[dict[str, Any]]:
        data = self._get(f"/api/companies/{self.company_id}/agents")
        if isinstance(data, list):
            return [_agent_from_pc(a) for a in data]
        # paginated response
        items = data.get("items") or data.get("agents") or []
        return [_agent_from_pc(a) for a in items]

    # --- Tasks ---

    def create_task(
        self,
        title: str,
        description: str = "",
        assignee_agent_id: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "title": title,
            "description": description,
            "status": kwargs.get("status", "todo"),
            "priority": kwargs.get("priority", "medium"),
        }
        if assignee_agent_id:
            body["assigneeAgentId"] = assignee_agent_id
        if kwargs.get("parent_id"):
            body["parentId"] = kwargs["parent_id"]
        if kwargs.get("goal_id"):
            body["goalId"] = kwargs["goal_id"]
        data = self._post(f"/api/companies/{self.company_id}/issues", body)
        return _task_from_pc(data)

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        try:
            data = self._get(f"/api/issues/{task_id}")
            return _task_from_pc(data)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return None
            raise

    def list_tasks(
        self,
        status: str | None = None,
        assignee_agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        data = self._get(
            f"/api/companies/{self.company_id}/issues",
            status=status,
            assigneeAgentId=assignee_agent_id,
        )
        if isinstance(data, list):
            return [_task_from_pc(t) for t in data]
        items = data.get("items") or data.get("issues") or []
        return [_task_from_pc(t) for t in items]

    # --- Comments ---

    def add_comment(
        self,
        task_id: str,
        body: str,
        author_agent_id: str | None = None,
        author_kind: str = "agent",
    ) -> dict[str, Any]:
        data = self._post(f"/api/issues/{task_id}/comments", {"body": body})
        return _comment_from_pc(data, task_id)

    def get_comments(self, task_id: str) -> list[dict[str, Any]]:
        data = self._get(f"/api/issues/{task_id}/comments")
        if isinstance(data, list):
            return [_comment_from_pc(c, task_id) for c in data]
        items = data.get("items") or data.get("comments") or []
        return [_comment_from_pc(c, task_id) for c in items]

    # --- Messages (chat history) — not yet implemented for Paperclip ---

    def create_message(
        self,
        session_id: str,
        role: str,
        content: str,
        model: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError("Message history not yet implemented for PaperclipBackend")

    def get_message(self, message_id: str) -> dict[str, Any] | None:
        raise NotImplementedError("Message history not yet implemented for PaperclipBackend")

    def list_messages(
        self,
        session_id: str,
        limit: int | None = None,
        before_id: str | None = None,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError("Message history not yet implemented for PaperclipBackend")

    def delete_message(self, message_id: str) -> bool:
        raise NotImplementedError("Message history not yet implemented for PaperclipBackend")

    def close(self) -> None:
        self._client.close()
