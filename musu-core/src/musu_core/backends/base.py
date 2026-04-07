"""BackendABC — abstract interface for musu-core storage backends."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BackendABC(ABC):
    """
    All storage backends (Local SQLite, Paperclip API, …) implement this interface.
    Methods return plain dicts so callers are not coupled to concrete dataclasses.
    """

    # --- Agents ---

    @abstractmethod
    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        """Return agent dict by id, or None if not found."""

    @abstractmethod
    def get_agent_by_name(self, name: str) -> dict[str, Any] | None:
        """Return agent dict by name, or None if not found."""

    @abstractmethod
    def list_agents(self) -> list[dict[str, Any]]:
        """Return all active agents."""

    # --- Tasks ---

    @abstractmethod
    def create_task(
        self,
        title: str,
        description: str = "",
        assignee_agent_id: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Create and return a task dict."""

    @abstractmethod
    def get_task(self, task_id: str) -> dict[str, Any] | None:
        """Return task dict by id, or None if not found."""

    @abstractmethod
    def list_tasks(
        self,
        status: str | None = None,
        assignee_agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return task dicts matching the given filters."""

    # --- Comments ---

    @abstractmethod
    def add_comment(
        self,
        task_id: str,
        body: str,
        author_agent_id: str | None = None,
        author_kind: str = "agent",
    ) -> dict[str, Any]:
        """Append a comment to a task and return the comment dict."""

    @abstractmethod
    def get_comments(self, task_id: str) -> list[dict[str, Any]]:
        """Return all comments for a task, ordered by creation time."""
