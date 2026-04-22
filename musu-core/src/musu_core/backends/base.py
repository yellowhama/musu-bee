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
    def get_agent_by_name(self, name: str, company_id: str | None = None) -> dict[str, Any] | None:
        """Return agent dict by name.  If company_id given, prefer scoped agent."""

    @abstractmethod
    def list_agents(self, company_id: str | None = None) -> list[dict[str, Any]]:
        """Return active agents.  If company_id given, return only that company's."""

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

    # --- Messages (chat history) ---

    @abstractmethod
    def create_message(
        self,
        session_id: str,
        role: str,
        content: str,
        model: str | None = None,
        agent_id: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Append a message to a session and return the message dict."""

    @abstractmethod
    def get_message(self, message_id: str) -> dict[str, Any] | None:
        """Return a message dict by id, or None if not found."""

    @abstractmethod
    def list_messages(
        self,
        session_id: str,
        limit: int | None = None,
        before_id: str | None = None,
        agent_id: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return messages for a session ordered by creation time (ascending).

        Filters: *before_id* for cursor pagination, *agent_id* to narrow by
        originating agent, *date_from*/*date_to* as ISO-8601 timestamps.
        If *limit* is given, at most that many messages are returned (from the
        tail of the window).
        """

    @abstractmethod
    def delete_message(self, message_id: str) -> bool:
        """Delete a message by id.  Returns True if a row was deleted."""
