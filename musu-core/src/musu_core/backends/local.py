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

    # --- Messages (chat history) ---

    def create_message(
        self,
        session_id: str,
        role: str,
        content: str,
        model: str | None = None,
        agent_id: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        msg_id = str(uuid.uuid4())
        self._db.execute(
            """
            INSERT INTO messages (id, session_id, role, content, model, agent_id, meta)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (msg_id, session_id, role, content, model, agent_id, json.dumps(meta or {})),
        )
        row = self._db.execute("SELECT * FROM messages WHERE id = ?", (msg_id,))
        return self._msg_row_to_dict(row[0])

    def get_message(self, message_id: str) -> dict[str, Any] | None:
        rows = self._db.execute("SELECT * FROM messages WHERE id = ?", (message_id,))
        if not rows:
            return None
        return self._msg_row_to_dict(rows[0])

    def list_messages(
        self,
        session_id: str,
        limit: int | None = None,
        before_id: str | None = None,
        agent_id: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> list[dict[str, Any]]:
        conditions = ["session_id = ?"]
        params: list[Any] = [session_id]

        if before_id is not None:
            anchor = self._db.execute(
                "SELECT created_at FROM messages WHERE id = ?", (before_id,)
            )
            if not anchor:
                return []
            conditions.append("created_at < ?")
            params.append(anchor[0]["created_at"])

        if agent_id is not None:
            conditions.append("agent_id = ?")
            params.append(agent_id)

        if date_from is not None:
            conditions.append("created_at >= ?")
            params.append(date_from)

        if date_to is not None:
            conditions.append("created_at <= ?")
            params.append(date_to)

        where = " AND ".join(conditions)
        rows = self._db.execute(
            f"SELECT * FROM messages WHERE {where} ORDER BY created_at ASC",
            tuple(params),
        )
        if limit is not None:
            rows = rows[-limit:]
        return [self._msg_row_to_dict(r) for r in rows]

    def delete_message(self, message_id: str) -> bool:
        rows_before = self._db.execute(
            "SELECT id FROM messages WHERE id = ?", (message_id,)
        )
        if not rows_before:
            return False
        self._db.execute("DELETE FROM messages WHERE id = ?", (message_id,))
        return True

    @staticmethod
    def _msg_row_to_dict(row: Any) -> dict[str, Any]:
        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "role": row["role"],
            "content": row["content"],
            "model": row["model"],
            "agent_id": row["agent_id"],
            "meta": json.loads(row["meta"] or "{}"),
            "created_at": row["created_at"],
        }

    # --- Fallback metrics ---

    def record_fallback_metric(
        self,
        agent_id: str | None,
        run_id: str,
        fallback_reason: str,
        fallback_adapter: str = "",
        chain_exhausted: bool = False,
    ) -> None:
        self._db.execute(
            """
            INSERT INTO fallback_metrics
                (id, agent_id, run_id, fallback_reason, fallback_adapter, chain_exhausted)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                agent_id,
                run_id,
                fallback_reason,
                fallback_adapter,
                1 if chain_exhausted else 0,
            ),
        )

    def get_fallback_metrics(
        self,
        agent_id: str | None = None,
        since_days: int = 30,
    ) -> list[dict[str, Any]]:
        """Return fallback metric rows created within *since_days* days.

        Rows are ordered newest-first.  Pass *agent_id* to filter to one agent.
        """
        clauses: list[str] = [
            "created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)"
        ]
        params: list[Any] = [f"-{since_days} days"]
        if agent_id:
            clauses.append("agent_id = ?")
            params.append(agent_id)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._db.execute(
            f"SELECT * FROM fallback_metrics {where} ORDER BY created_at DESC",
            tuple(params),
        )
        return [
            {
                "id": r["id"],
                "agent_id": r["agent_id"],
                "run_id": r["run_id"],
                "fallback_reason": r["fallback_reason"],
                "fallback_adapter": r["fallback_adapter"],
                "chain_exhausted": bool(r["chain_exhausted"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def prune_fallback_metrics(self, retain_days: int = 30) -> int:
        """Delete rows older than *retain_days* days.  Returns deleted count."""
        rows_before = self._db.execute(
            "SELECT COUNT(*) AS n FROM fallback_metrics"
            " WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)",
            (f"-{retain_days} days",),
        )
        count = rows_before[0]["n"] if rows_before else 0
        if count:
            self._db.execute(
                "DELETE FROM fallback_metrics"
                " WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)",
                (f"-{retain_days} days",),
            )
        return count

    def close(self) -> None:
        self._db.close()
