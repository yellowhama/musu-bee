"""PaperclipBackend — stub that delegates to the Paperclip control plane API.

This is a thin stub. Full implementation follows in a later ticket once
musu-core LocalBackend is proven in production.
"""

from __future__ import annotations

from typing import Any

from musu_core.backends.base import BackendABC


class PaperclipBackend(BackendABC):
    """
    Routes agent/task operations to a Paperclip instance instead of local SQLite.

    Not yet fully implemented — raises NotImplementedError on most operations.
    Used only for feature-detection / health checks at startup.
    """

    def __init__(
        self,
        api_url: str,
        api_key: str,
        company_id: str,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.company_id = company_id

    # --- Health check ---

    def is_available(self) -> bool:
        """Return True if the Paperclip API is reachable."""
        try:
            import urllib.request

            req = urllib.request.Request(
                f"{self.api_url}/api/agents/me",
                headers={"Authorization": f"Bearer {self.api_key}"},
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                return resp.status < 500
        except Exception:
            return False

    # --- Stubs (to be implemented) ---

    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        raise NotImplementedError("PaperclipBackend.get_agent not yet implemented")

    def get_agent_by_name(self, name: str) -> dict[str, Any] | None:
        raise NotImplementedError("PaperclipBackend.get_agent_by_name not yet implemented")

    def list_agents(self) -> list[dict[str, Any]]:
        raise NotImplementedError("PaperclipBackend.list_agents not yet implemented")

    def create_task(
        self,
        title: str,
        description: str = "",
        assignee_agent_id: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        raise NotImplementedError("PaperclipBackend.create_task not yet implemented")

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        raise NotImplementedError("PaperclipBackend.get_task not yet implemented")

    def list_tasks(
        self,
        status: str | None = None,
        assignee_agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError("PaperclipBackend.list_tasks not yet implemented")

    def add_comment(
        self,
        task_id: str,
        body: str,
        author_agent_id: str | None = None,
        author_kind: str = "agent",
    ) -> dict[str, Any]:
        raise NotImplementedError("PaperclipBackend.add_comment not yet implemented")

    def get_comments(self, task_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError("PaperclipBackend.get_comments not yet implemented")
