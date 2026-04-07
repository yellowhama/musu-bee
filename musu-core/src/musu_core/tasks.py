"""Task Queue + Comments."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

from musu_core.db import Database


@dataclass
class Task:
    id: str
    title: str
    description: str
    status: str
    priority: str
    assignee_agent_id: str | None
    parent_id: str | None
    meta: dict[str, Any]
    created_at: str
    updated_at: str

    @staticmethod
    def from_row(row: Any) -> "Task":
        return Task(
            id=row["id"],
            title=row["title"],
            description=row["description"] or "",
            status=row["status"],
            priority=row["priority"],
            assignee_agent_id=row["assignee_agent_id"],
            parent_id=row["parent_id"],
            meta=json.loads(row["meta"] or "{}"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


@dataclass
class Comment:
    id: str
    task_id: str
    author_agent_id: str | None
    author_kind: str
    body: str
    created_at: str

    @staticmethod
    def from_row(row: Any) -> "Comment":
        return Comment(
            id=row["id"],
            task_id=row["task_id"],
            author_agent_id=row["author_agent_id"],
            author_kind=row["author_kind"],
            body=row["body"],
            created_at=row["created_at"],
        )


class TaskQueue:
    def __init__(self, db: Database) -> None:
        self._db = db

    # --- Task CRUD ---

    def create(
        self,
        title: str,
        description: str = "",
        priority: str = "medium",
        assignee_agent_id: str | None = None,
        parent_id: str | None = None,
        meta: dict[str, Any] | None = None,
        task_id: str | None = None,
    ) -> Task:
        tid = task_id or str(uuid.uuid4())
        rows = self._db.execute(
            """
            INSERT INTO tasks (id, title, description, priority, assignee_agent_id, parent_id, meta)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING *
            """,
            (tid, title, description, priority, assignee_agent_id, parent_id, json.dumps(meta or {})),
        )
        return Task.from_row(rows[0])

    def get(self, task_id: str) -> Task | None:
        rows = self._db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        return Task.from_row(rows[0]) if rows else None

    def list(
        self,
        status: str | None = None,
        assignee_agent_id: str | None = None,
        limit: int = 100,
    ) -> list[Task]:
        clauses: list[str] = []
        params: list[Any] = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        if assignee_agent_id:
            clauses.append("assignee_agent_id = ?")
            params.append(assignee_agent_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        rows = self._db.execute(
            f"SELECT * FROM tasks {where} ORDER BY created_at DESC LIMIT ?",
            tuple(params),
        )
        return [Task.from_row(r) for r in rows]

    def update(
        self,
        task_id: str,
        *,
        title: str | None = None,
        description: str | None = None,
        status: str | None = None,
        priority: str | None = None,
        assignee_agent_id: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> Task | None:
        task = self.get(task_id)
        if task is None:
            return None
        rows = self._db.execute(
            """
            UPDATE tasks
            SET title = ?, description = ?, status = ?, priority = ?,
                assignee_agent_id = ?, meta = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
            RETURNING *
            """,
            (
                title if title is not None else task.title,
                description if description is not None else task.description,
                status if status is not None else task.status,
                priority if priority is not None else task.priority,
                assignee_agent_id if assignee_agent_id is not None else task.assignee_agent_id,
                json.dumps(meta if meta is not None else task.meta),
                task_id,
            ),
        )
        return Task.from_row(rows[0]) if rows else None

    def next_todo(self, assignee_agent_id: str | None = None) -> Task | None:
        """Return the highest-priority todo task (optionally filtered by agent)."""
        priority_order = "CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"
        if assignee_agent_id:
            rows = self._db.execute(
                f"""
                SELECT * FROM tasks
                WHERE status = 'todo' AND assignee_agent_id = ?
                ORDER BY {priority_order}, created_at
                LIMIT 1
                """,
                (assignee_agent_id,),
            )
        else:
            rows = self._db.execute(
                f"""
                SELECT * FROM tasks
                WHERE status = 'todo'
                ORDER BY {priority_order}, created_at
                LIMIT 1
                """
            )
        return Task.from_row(rows[0]) if rows else None

    # --- Comments ---

    def add_comment(
        self,
        task_id: str,
        body: str,
        author_agent_id: str | None = None,
        author_kind: str = "agent",
        comment_id: str | None = None,
    ) -> Comment:
        cid = comment_id or str(uuid.uuid4())
        rows = self._db.execute(
            """
            INSERT INTO comments (id, task_id, author_agent_id, author_kind, body)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
            """,
            (cid, task_id, author_agent_id, author_kind, body),
        )
        return Comment.from_row(rows[0])

    def get_comments(self, task_id: str) -> list[Comment]:
        rows = self._db.execute(
            "SELECT * FROM comments WHERE task_id = ? ORDER BY created_at",
            (task_id,),
        )
        return [Comment.from_row(r) for r in rows]
