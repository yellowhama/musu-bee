"""LocalBackend — SQLite-backed storage for agents, tasks, comments, execution_log."""

from __future__ import annotations

import json
import uuid
from typing import Any

from musu_core.adapters.base import AdapterResult
from musu_core.agents import Agent, AgentRegistry
from musu_core.backends.base import BackendABC
from musu_core.db import Database, get_db
from musu_core.tasks import Comment, Task, TaskQueue


def _agent_to_dict(agent: Any) -> dict[str, Any]:
    return {
        "id": agent.id,
        "name": agent.name,
        "role": agent.role,
        "adapter_type": agent.adapter_type,
        "adapter_config": agent.adapter_config,
        "status": agent.status,
        "created_at": agent.created_at,
        "updated_at": agent.updated_at,
    }


def _task_to_dict(task: Any) -> dict[str, Any]:
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "priority": task.priority,
        "assignee_agent_id": task.assignee_agent_id,
        "parent_id": task.parent_id,
        "meta": task.meta,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


def _comment_to_dict(comment: Any) -> dict[str, Any]:
    return {
        "id": comment.id,
        "task_id": comment.task_id,
        "author_agent_id": comment.author_agent_id,
        "author_kind": comment.author_kind,
        "body": comment.body,
        "created_at": comment.created_at,
    }


class LocalBackend(BackendABC):
    """
    Thin facade that wires together AgentRegistry, TaskQueue, and the
    execution_log table using a single SQLite Database instance.
    """

    def __init__(self, db_path: str) -> None:
        self._db: Database = get_db(db_path)
        self.agents = AgentRegistry(self._db)
        self.tasks = TaskQueue(self._db)

    # --- Execution log helpers ---

    def log_execution_started(
        self,
        run_id: str,
        agent_id: str | None,
        task_id: str | None,
        adapter_type: str,
        prompt_snippet: str,
    ) -> None:
        self._db.execute(
            """
            INSERT INTO execution_log (id, task_id, agent_id, adapter_type, event, payload)
            VALUES (?, ?, ?, ?, 'started', ?)
            """,
            (
                run_id,
                task_id,
                agent_id,
                adapter_type,
                json.dumps({"prompt_snippet": prompt_snippet[:300]}),
            ),
        )

    def log_execution_result(self, result: AdapterResult, task_id: str | None = None) -> None:
        event = "completed" if result.success else "failed"
        payload: dict[str, Any] = {
            "summary_snippet": result.summary[:300] if result.summary else "",
            "session_id": result.session_id,
            "error": result.error,
        }
        if result.usage:
            payload["usage"] = {
                "input_tokens": result.usage.input_tokens,
                "cached_input_tokens": result.usage.cached_input_tokens,
                "output_tokens": result.usage.output_tokens,
            }
        if result.cost_usd is not None:
            payload["cost_usd"] = result.cost_usd

        self._db.execute(
            """
            INSERT OR IGNORE INTO execution_log (id, task_id, agent_id, adapter_type, event, payload)
            VALUES (?, ?, NULL, '', ?, ?)
            """,
            (str(uuid.uuid4()), task_id, event, json.dumps(payload)),
        )
        # Update the 'started' row if it exists
        self._db.execute(
            """
            UPDATE execution_log SET event = ?, payload = ?
            WHERE id = ? AND event = 'started'
            """,
            (event, json.dumps(payload), result.run_id),
        )

    def get_execution_log(
        self, task_id: str | None = None, agent_id: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if task_id:
            clauses.append("task_id = ?")
            params.append(task_id)
        if agent_id:
            clauses.append("agent_id = ?")
            params.append(agent_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        rows = self._db.execute(
            f"SELECT * FROM execution_log {where} ORDER BY created_at DESC LIMIT ?",
            tuple(params),
        )
        return [
            {
                "id": r["id"],
                "task_id": r["task_id"],
                "agent_id": r["agent_id"],
                "adapter_type": r["adapter_type"],
                "event": r["event"],
                "payload": json.loads(r["payload"] or "{}"),
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    # --- BackendABC implementation ---

    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        agent = self.agents.get(agent_id)
        return _agent_to_dict(agent) if agent else None

    def get_agent_by_name(self, name: str) -> dict[str, Any] | None:
        agent = self.agents.get_by_name(name)
        return _agent_to_dict(agent) if agent else None

    def list_agents(self) -> list[dict[str, Any]]:
        return [_agent_to_dict(a) for a in self.agents.list(status="active")]

    def create_task(
        self,
        title: str,
        description: str = "",
        assignee_agent_id: str | None = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        task = self.tasks.create(
            title=title,
            description=description,
            assignee_agent_id=assignee_agent_id,
            priority=kwargs.get("priority", "medium"),
            parent_id=kwargs.get("parent_id"),
            meta=kwargs.get("meta"),
        )
        return _task_to_dict(task)

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        task = self.tasks.get(task_id)
        return _task_to_dict(task) if task else None

    def list_tasks(
        self,
        status: str | None = None,
        assignee_agent_id: str | None = None,
    ) -> list[dict[str, Any]]:
        return [_task_to_dict(t) for t in self.tasks.list(status=status, assignee_agent_id=assignee_agent_id)]

    def add_comment(
        self,
        task_id: str,
        body: str,
        author_agent_id: str | None = None,
        author_kind: str = "agent",
    ) -> dict[str, Any]:
        comment = self.tasks.add_comment(
            task_id=task_id,
            body=body,
            author_agent_id=author_agent_id,
            author_kind=author_kind,
        )
        return _comment_to_dict(comment)

    def get_comments(self, task_id: str) -> list[dict[str, Any]]:
        return [_comment_to_dict(c) for c in self.tasks.get_comments(task_id)]

    def close(self) -> None:
        self._db.close()
