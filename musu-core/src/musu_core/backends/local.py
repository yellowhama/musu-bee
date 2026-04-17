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

    def create_agent(
        self,
        agent_id: str | None = None,
        name: str = "",
        role: str = "",
        adapter_type: str = "process",
        adapter_config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        agent = self.agents.create(
            name=name,
            role=role,
            adapter_type=adapter_type,
            adapter_config=adapter_config or {},
            agent_id=agent_id,
        )
        return _agent_to_dict(agent)

    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        agent = self.agents.get(agent_id)
        return _agent_to_dict(agent) if agent else None

    def get_agent_by_name(self, name: str) -> dict[str, Any] | None:
        agent = self.agents.get_by_name(name)
        return _agent_to_dict(agent) if agent else None

    def list_agents(self) -> list[dict[str, Any]]:
        return [_agent_to_dict(a) for a in self.agents.list(status="active")]

    def update_agent(self, agent_id: str, **kwargs: Any) -> dict[str, Any] | None:
        """Update agent fields. Returns updated agent dict or None if not found."""
        agent = self.agents.update(agent_id, **kwargs)
        return _agent_to_dict(agent) if agent else None

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
        conditions = ["m.session_id = ?"]
        params: list[Any] = [session_id]

        if before_id is not None:
            anchor = self._db.execute(
                "SELECT created_at FROM messages WHERE id = ?", (before_id,)
            )
            if not anchor:
                return []
            conditions.append("m.created_at < ?")
            params.append(anchor[0]["created_at"])

        if agent_id is not None:
            conditions.append("m.agent_id = ?")
            params.append(agent_id)

        if date_from is not None:
            conditions.append("m.created_at >= ?")
            params.append(date_from)

        if date_to is not None:
            conditions.append("m.created_at <= ?")
            params.append(date_to)

        where = " AND ".join(conditions)
        rows = self._db.execute(
            f"SELECT m.*, a.name AS agent_name FROM messages m"
            f" LEFT JOIN agents a ON m.agent_id = a.id"
            f" WHERE {where} ORDER BY m.created_at ASC",
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
        d: dict[str, Any] = {
            "id": row["id"],
            "session_id": row["session_id"],
            "role": row["role"],
            "content": row["content"],
            "model": row["model"],
            "agent_id": row["agent_id"],
            "meta": json.loads(row["meta"] or "{}"),
            "created_at": row["created_at"],
        }
        # agent_name is present when list_messages JOINs the agents table
        agent_name = row["agent_name"] if "agent_name" in row.keys() else None
        if agent_name is not None:
            d["agent_name"] = agent_name
        return d

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

    # --- Route execution durability ---

    def create_route_execution(
        self,
        exec_id: str,
        channel: str,
        sender_id: str,
        input_text: str,
        company_id: str | None = None,
    ) -> None:
        """Insert a new route execution record with status='pending'."""
        self._db.execute(
            """
            INSERT INTO route_executions (id, channel, sender_id, input, status, company_id)
            VALUES (?, ?, ?, ?, 'pending', ?)
            """,
            (exec_id, channel, sender_id, input_text, company_id),
        )

    def update_route_execution(
        self,
        exec_id: str,
        status: str,
        output: str | None = None,
        error: str | None = None,
        node: str | None = None,
    ) -> None:
        """Update status (and optional output/error/node) for a route execution."""
        self._db.execute(
            """
            UPDATE route_executions
            SET status = ?, output = ?, error = ?, node = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
            """,
            (status, output, error, node, exec_id),
        )

    def get_route_execution(self, exec_id: str) -> dict[str, Any] | None:
        """Return a single route execution by id, or None if not found."""
        rows = self._db.execute(
            "SELECT * FROM route_executions WHERE id = ?",
            (exec_id,),
        )
        return dict(rows[0]) if rows else None

    def list_route_executions(
        self,
        status: str | None = None,
        limit: int = 50,
        before_id: str | None = None,
        channel: str | None = None,
    ) -> list[dict[str, Any]]:
        """List route executions with optional filters and cursor pagination."""
        clauses: list[str] = []
        params: list = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        if channel:
            clauses.append("channel = ?")
            params.append(channel)
        if before_id:
            clauses.append(
                "created_at < (SELECT created_at FROM route_executions WHERE id = ?)"
            )
            params.append(before_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        rows = self._db.execute(
            f"SELECT * FROM route_executions {where} ORDER BY created_at DESC LIMIT ?",
            tuple(params),
        )
        return [dict(r) for r in rows]

    def list_pending_route_executions(self) -> list[dict[str, Any]]:
        """Return pending/running executions with retry_count < 3."""
        rows = self._db.execute(
            "SELECT * FROM route_executions"
            " WHERE status IN ('pending', 'running') AND retry_count < 3"
            " ORDER BY created_at ASC"
        )
        return [dict(r) for r in rows]

    def increment_retry_count(self, exec_id: str) -> None:
        """Increment retry_count for a route execution (called before each re-dispatch)."""
        self._db.execute(
            "UPDATE route_executions"
            " SET retry_count = retry_count + 1,"
            " updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
            " WHERE id = ?",
            (exec_id,),
        )

    def fail_stale_route_executions(self, max_retries: int = 3) -> None:
        """Mark pending/running executions that hit the retry ceiling as failed."""
        self._db.execute(
            "UPDATE route_executions"
            " SET status = 'failed',"
            " error = 'max retries exceeded',"
            " updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
            " WHERE status IN ('pending', 'running') AND retry_count >= ?",
            (max_retries,),
        )

    # --- Company helpers ---

    def create_company(
        self,
        name: str,
        template_key: str = "default",
        workspace_id: str = "",
        meta: dict | None = None,
        company_id: str | None = None,
    ) -> dict[str, Any]:
        company_id = company_id or str(uuid.uuid4())
        meta_json = json.dumps(meta or {})
        self._db.execute(
            "INSERT INTO companies (id, name, template_key, workspace_id, meta) VALUES (?, ?, ?, ?, ?)",
            (company_id, name, template_key, workspace_id, meta_json),
        )
        row = self._db.execute("SELECT * FROM companies WHERE id = ?", (company_id,))
        return dict(row[0])

    def list_companies(self, workspace_id: str | None = None) -> list[dict[str, Any]]:
        if workspace_id:
            rows = self._db.execute(
                "SELECT * FROM companies WHERE workspace_id = ? ORDER BY created_at DESC",
                (workspace_id,),
            )
        else:
            rows = self._db.execute("SELECT * FROM companies ORDER BY created_at DESC")
        return [dict(r) for r in rows]

    def get_company(self, company_id: str) -> dict[str, Any] | None:
        rows = self._db.execute("SELECT * FROM companies WHERE id = ?", (company_id,))
        return dict(rows[0]) if rows else None

    def update_company(self, company_id: str, **kwargs: Any) -> dict[str, Any] | None:
        allowed = {"name", "template_key", "workspace_id", "meta"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return self.get_company(company_id)
        if "meta" in updates and isinstance(updates["meta"], dict):
            updates["meta"] = json.dumps(updates["meta"])
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        set_clause += ", updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
        self._db.execute(
            f"UPDATE companies SET {set_clause} WHERE id = ?",
            (*updates.values(), company_id),
        )
        return self.get_company(company_id)

    def delete_company(self, company_id: str) -> bool:
        rows = self._db.execute("DELETE FROM companies WHERE id = ? RETURNING id", (company_id,))
        return len(rows) > 0

    def bulk_upsert_companies(self, companies: list[dict[str, Any]]) -> int:
        """Upsert a batch of company records using last-write-wins on updated_at.

        Only replaces a local record if the incoming updated_at is strictly newer.
        Returns the number of records actually written.
        """
        if not companies:
            return 0
        ids = [c["id"] for c in companies if c.get("id")]
        if not ids:
            return 0
        placeholders = ",".join("?" * len(ids))
        existing_rows = self._db.execute(
            f"SELECT id, updated_at FROM companies WHERE id IN ({placeholders})",
            tuple(ids),
        )
        local_ts: dict[str, str] = {r["id"]: r["updated_at"] for r in existing_rows}

        written = 0
        for c in companies:
            cid = c.get("id")
            if not cid:
                continue
            remote_ts = c.get("updated_at", "")
            # Skip if local record is same age or newer
            if cid in local_ts and local_ts[cid] >= remote_ts:
                continue
            meta = c.get("meta", {})
            meta_json = json.dumps(meta) if isinstance(meta, dict) else (meta or "{}")
            self._db.execute(
                """
                INSERT INTO companies (id, name, template_key, workspace_id, meta, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name         = excluded.name,
                    template_key = excluded.template_key,
                    workspace_id = excluded.workspace_id,
                    meta         = excluded.meta,
                    updated_at   = excluded.updated_at
                """,
                (
                    cid,
                    c.get("name", ""),
                    c.get("template_key", "default"),
                    c.get("workspace_id", ""),
                    meta_json,
                    c.get("created_at", ""),
                    remote_ts,
                ),
            )
            written += 1
        return written

    def bulk_insert_messages(self, messages: list[dict[str, Any]]) -> int:
        """Insert a batch of messages, ignoring duplicates (append-only, dedup by id).

        Returns the number of new records inserted.
        """
        if not messages:
            return 0
        written = 0
        for m in messages:
            mid = m.get("id")
            if not mid:
                continue
            meta = m.get("meta", {})
            meta_json = json.dumps(meta) if isinstance(meta, dict) else (meta or "{}")
            self._db.execute(
                """
                INSERT OR IGNORE INTO messages
                    (id, session_id, role, content, model, agent_id, meta, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mid,
                    m.get("session_id", ""),
                    m.get("role", "user"),
                    m.get("content", ""),
                    m.get("model"),
                    m.get("agent_id"),
                    meta_json,
                    m.get("created_at", ""),
                ),
            )
            written += 1
        return written

    # --- Issues ---

    def create_issue(
        self,
        company_id: str,
        title: str,
        description: str = "",
        status: str = "open",
        priority: str = "medium",
        assignee_id: str | None = None,
    ) -> dict[str, Any]:
        issue_id = str(uuid.uuid4())
        self._db.execute(
            """
            INSERT INTO issues (id, company_id, title, description, status, priority, assignee_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (issue_id, company_id, title, description, status, priority, assignee_id),
        )
        rows = self._db.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        return dict(rows[0])

    def get_issue(self, issue_id: str) -> dict[str, Any] | None:
        rows = self._db.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        return dict(rows[0]) if rows else None

    def list_issues(
        self,
        company_id: str,
        status: str | None = None,
        assignee_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = ["company_id = ?"]
        params: list[Any] = [company_id]
        if status:
            clauses.append("status = ?")
            params.append(status)
        if assignee_id:
            clauses.append("assignee_id = ?")
            params.append(assignee_id)
        params.append(limit)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._db.execute(
            f"SELECT * FROM issues {where} ORDER BY created_at DESC LIMIT ?",
            tuple(params),
        )
        return [dict(r) for r in rows]

    def update_issue(self, issue_id: str, **kwargs: Any) -> dict[str, Any] | None:
        allowed = {"title", "description", "status", "priority", "assignee_id"}
        updates = {k: v for k, v in kwargs.items() if k in allowed}
        if not updates:
            return self.get_issue(issue_id)
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        set_clause += ", updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"
        self._db.execute(
            f"UPDATE issues SET {set_clause} WHERE id = ?",
            (*updates.values(), issue_id),
        )
        return self.get_issue(issue_id)

    def checkout_issue(self, issue_id: str, agent_id: str) -> dict[str, Any] | None:
        """Assign checkout_by + set status=in_progress. Returns updated issue or None."""
        if self.get_issue(issue_id) is None:
            return None
        self._db.execute(
            """
            UPDATE issues
            SET checkout_by = ?, checkout_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                status = 'in_progress',
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?
            """,
            (agent_id, issue_id),
        )
        return self.get_issue(issue_id)

    def list_issue_comments(self, issue_id: str) -> list[dict[str, Any]]:
        rows = self._db.execute(
            "SELECT * FROM issue_comments WHERE issue_id = ? ORDER BY created_at ASC",
            (issue_id,),
        )
        return [dict(r) for r in rows]

    def add_issue_comment(
        self,
        issue_id: str,
        body: str,
        author_id: str | None = None,
        author_kind: str = "agent",
    ) -> dict[str, Any]:
        comment_id = str(uuid.uuid4())
        self._db.execute(
            """
            INSERT INTO issue_comments (id, issue_id, author_id, author_kind, body)
            VALUES (?, ?, ?, ?, ?)
            """,
            (comment_id, issue_id, author_id, author_kind, body),
        )
        rows = self._db.execute("SELECT * FROM issue_comments WHERE id = ?", (comment_id,))
        return dict(rows[0])

    # --- Approvals ---

    def list_approvals(
        self,
        company_id: str,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = ["company_id = ?"]
        params: list[Any] = [company_id]
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._db.execute(
            f"SELECT * FROM company_approvals_queue {where} ORDER BY created_at DESC",
            tuple(params),
        )
        return [dict(r) for r in rows]

    def get_approval(self, approval_id: str) -> dict[str, Any] | None:
        rows = self._db.execute(
            "SELECT * FROM company_approvals_queue WHERE id = ?", (approval_id,)
        )
        return dict(rows[0]) if rows else None

    def resolve_approval(
        self,
        approval_id: str,
        decision: str,
        reason: str = "",
    ) -> dict[str, Any] | None:
        """Set approval status to 'approved' or 'rejected'."""
        if decision not in ("approved", "rejected"):
            return None
        self._db.execute(
            """
            UPDATE company_approvals_queue
            SET status = ?, reason = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
            WHERE id = ?
            """,
            (decision, reason, approval_id),
        )
        return self.get_approval(approval_id)

    # --- Projects ---

    def list_projects(
        self,
        company_id: str,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = ["company_id = ?"]
        params: list[Any] = [company_id]
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._db.execute(
            f"SELECT * FROM company_project_index {where} ORDER BY created_at DESC",
            tuple(params),
        )
        return [dict(r) for r in rows]

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        rows = self._db.execute(
            "SELECT * FROM company_project_index WHERE id = ?", (project_id,)
        )
        return dict(rows[0]) if rows else None

    def create_project(
        self,
        project_id: str,
        company_id: str,
        project_name: str,
        status: str = "active",
        assigned_to: str | None = None,
    ) -> dict[str, Any]:
        self._db.execute(
            "INSERT INTO company_project_index"
            " (id, company_id, project_name, status, assigned_to)"
            " VALUES (?, ?, ?, ?, ?)",
            (project_id, company_id, project_name, status, assigned_to),
        )
        return self.get_project(project_id)  # type: ignore[return-value]

    def update_project(self, project_id: str, **kwargs: Any) -> dict[str, Any] | None:
        allowed = {"project_name", "status", "assigned_to"}
        fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
        if not fields:
            return self.get_project(project_id)
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [project_id]
        self._db.execute(
            f"UPDATE company_project_index SET {set_clause},"
            " updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
            tuple(values),
        )
        return self.get_project(project_id)

    def delete_project(self, project_id: str) -> bool:
        self._db.execute("DELETE FROM company_project_index WHERE id = ?", (project_id,))
        return self.get_project(project_id) is None

    # --- Costs (derived from route_executions) ---

    def get_costs_summary(self, company_id: str) -> dict[str, Any]:
        """Return request-count-based cost proxy for a company.

        Real cost tracking (token $) not yet wired — returns execution counts
        as a cost proxy. Zero-fills gracefully when no data.
        """
        rows = self._db.execute(
            "SELECT status, COUNT(*) AS n FROM route_executions"
            " WHERE company_id = ? GROUP BY status",
            (company_id,),
        )
        by_status = {r["status"]: r["n"] for r in rows}
        total = sum(by_status.values())
        return {
            "company_id": company_id,
            "period": "all_time",
            "total_requests": total,
            "by_status": by_status,
            "estimated_cost_usd": None,
        }

    def get_costs_by_agent(self, company_id: str) -> list[dict[str, Any]]:
        """Return per-channel request counts as an agent-level cost proxy."""
        rows = self._db.execute(
            "SELECT channel, COUNT(*) AS n, "
            "SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, "
            "SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed "
            "FROM route_executions WHERE company_id = ? "
            "GROUP BY channel ORDER BY n DESC",
            (company_id,),
        )
        return [
            {
                "agent_name": r["channel"],
                "total_requests": r["n"],
                "done": r["done"],
                "failed": r["failed"],
                "estimated_cost_usd": None,
            }
            for r in rows
        ]

    # --- Goals ---

    def list_goals(
        self,
        company_id: str,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = ["company_id = ?"]
        params: list[Any] = [company_id]
        if status:
            clauses.append("status = ?")
            params.append(status)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._db.execute(
            f"SELECT * FROM goals {where} ORDER BY created_at DESC",
            tuple(params),
        )
        return [dict(r) for r in rows]

    def create_goal(
        self,
        goal_id: str,
        company_id: str,
        title: str,
        description: str = "",
        status: str = "active",
        due_date: str | None = None,
        meta: str = "{}",
    ) -> dict[str, Any]:
        self._db.execute(
            "INSERT INTO goals (id, company_id, title, description, status, due_date, meta)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (goal_id, company_id, title, description, status, due_date, meta),
        )
        return self.get_goal(goal_id)  # type: ignore[return-value]

    def get_goal(self, goal_id: str) -> dict[str, Any] | None:
        rows = self._db.execute("SELECT * FROM goals WHERE id = ?", (goal_id,))
        return dict(rows[0]) if rows else None

    def update_goal(self, goal_id: str, **kwargs: Any) -> dict[str, Any] | None:
        allowed = {"title", "description", "status", "due_date", "meta"}
        fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
        if not fields:
            return self.get_goal(goal_id)
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [goal_id]
        self._db.execute(
            f"UPDATE goals SET {set_clause},"
            " updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
            tuple(values),
        )
        return self.get_goal(goal_id)

    def delete_goal(self, goal_id: str) -> bool:
        self._db.execute("DELETE FROM goals WHERE id = ?", (goal_id,))
        return self.get_goal(goal_id) is None

    def close(self) -> None:
        self._db.close()
