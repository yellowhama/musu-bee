"""LocalBackend — SQLite-backed storage for agents, tasks, comments, execution_log."""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from typing import Any

logger = logging.getLogger(__name__)

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
        "company_id": getattr(agent, "company_id", None),
        "budget_usd_monthly": getattr(agent, "budget_usd_monthly", None),
        "budget_usd_spent": getattr(agent, "budget_usd_spent", 0.0),
        "budget_reset_at": getattr(agent, "budget_reset_at", None),
        "allowed_tools": getattr(agent, "allowed_tools", None),
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


def _csv_status_values(value: str | None) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


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
        company_id: str | None = None,
    ) -> dict[str, Any]:
        agent = self.agents.create(
            name=name,
            role=role,
            adapter_type=adapter_type,
            adapter_config=adapter_config or {},
            agent_id=agent_id,
            company_id=company_id,
        )
        return _agent_to_dict(agent)

    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        agent = self.agents.get(agent_id)
        return _agent_to_dict(agent) if agent else None

    def get_agent_by_name(self, name: str, company_id: str | None = None) -> dict[str, Any] | None:
        agent = self.agents.get_by_name(name, company_id=company_id)
        return _agent_to_dict(agent) if agent else None

    def list_agents(self, company_id: str | None = None) -> list[dict[str, Any]]:
        return [_agent_to_dict(a) for a in self.agents.list(company_id=company_id)]

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
        """Insert a new route execution record with status='pending' and lease_token=1.

        Raises RuntimeError if an unexpired tombstone exists for (channel, sender_id).
        """
        # Check tombstone — block if an unexpired entry exists for this (channel, sender_id)
        tombstone_rows = self._db.execute(
            "SELECT tombstone_until FROM route_execution_tombstones"
            " WHERE channel = ? AND sender_id = ?",
            (channel, sender_id),
        )
        if tombstone_rows:
            tombstone_until = tombstone_rows[0]["tombstone_until"]
            # Compare with current UTC time (ISO8601 lexicographic comparison works for same format)
            from datetime import datetime, timezone
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
            if tombstone_until > now_iso:
                raise RuntimeError(
                    f"tombstone: (channel={channel!r}, sender_id={sender_id!r}) is blocked "
                    f"until {tombstone_until} — zombie prevention"
                )

        self._db.execute(
            """
            INSERT INTO route_executions
                (id, channel, sender_id, input, status, company_id, last_activity_at, lease_token)
            VALUES (?, ?, ?, ?, 'pending', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 1)
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
        cost_usd: float | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        duration_sec: float | None = None,
        expected_lease_token: int | None = None,
    ) -> None:
        """Update status (and optional output/error/node/cost) for a route execution.

        Fencing token semantics (when expected_lease_token is not None):
        - status='running': atomic UPDATE WHERE id=? AND lease_token=expected,
          SET lease_token=lease_token+1. rowcount=0 → WARNING (stale token).
        - status='done'/'failed': atomic UPDATE WHERE id=? AND lease_token=expected.
          rowcount=0 → WARNING (zombie rejected, tombstone NOT written).
          rowcount=1 → success, tombstone upsert (tombstone_until=now+7200s).

        If expected_lease_token is None, legacy path (no token check) is used.
        """
        from datetime import datetime, timedelta, timezone

        if status == "running" and expected_lease_token is not None:
            # Atomic increment: only update if lease_token matches
            refresh_activity = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
            with self._db.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE route_executions
                    SET status = ?, output = ?, error = ?, node = ?,
                        cost_usd = COALESCE(?, cost_usd),
                        input_tokens = COALESCE(?, input_tokens),
                        output_tokens = COALESCE(?, output_tokens),
                        duration_sec = COALESCE(?, duration_sec),
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                        last_activity_at = {refresh_activity},
                        lease_token = lease_token + 1
                    WHERE id = ? AND lease_token = ?
                    """,
                    (status, output, error, node, cost_usd, input_tokens, output_tokens,
                     duration_sec, exec_id, expected_lease_token),
                )
                if cur.rowcount == 0:
                    logger.warning(
                        "update_route_execution: lease_token fencing conflict"
                        " exec_id=%s expected_lease_token=%s status=%s — no rows updated",
                        exec_id, expected_lease_token, status,
                    )
            return

        if status in ("done", "failed") and expected_lease_token is not None:
            # Terminal update: only if lease_token matches
            with self._db.cursor() as cur:
                cur.execute(
                    """
                    UPDATE route_executions
                    SET status = ?, output = ?, error = ?, node = ?,
                        cost_usd = COALESCE(?, cost_usd),
                        input_tokens = COALESCE(?, input_tokens),
                        output_tokens = COALESCE(?, output_tokens),
                        duration_sec = COALESCE(?, duration_sec),
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE id = ? AND lease_token = ?
                    """,
                    (status, output, error, node, cost_usd, input_tokens, output_tokens,
                     duration_sec, exec_id, expected_lease_token),
                )
                if cur.rowcount == 0:
                    logger.warning(
                        "update_route_execution: zombie rejected"
                        " exec_id=%s expected_lease_token=%s status=%s — lease_token mismatch",
                        exec_id, expected_lease_token, status,
                    )
                    return
            # Success — write tombstone for the (channel, sender_id) pair
            rows = self._db.execute(
                "SELECT channel, sender_id FROM route_executions WHERE id = ?", (exec_id,)
            )
            if rows:
                channel = rows[0]["channel"]
                sender_id = rows[0]["sender_id"]
                tombstone_until = (
                    datetime.now(timezone.utc) + timedelta(seconds=7200)
                ).strftime("%Y-%m-%dT%H:%M:%S.000Z")
                self._db.execute(
                    """
                    INSERT INTO route_execution_tombstones (channel, sender_id, tombstone_until)
                    VALUES (?, ?, ?)
                    ON CONFLICT(channel, sender_id) DO UPDATE SET tombstone_until = excluded.tombstone_until
                    """,
                    (channel, sender_id, tombstone_until),
                )
            return

        # Legacy path: no expected_lease_token — update without token check (backward compat)
        refresh_activity = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" if status == "running" else "last_activity_at"
        self._db.execute(
            f"""
            UPDATE route_executions
            SET status = ?, output = ?, error = ?, node = ?,
                cost_usd = COALESCE(?, cost_usd),
                input_tokens = COALESCE(?, input_tokens),
                output_tokens = COALESCE(?, output_tokens),
                duration_sec = COALESCE(?, duration_sec),
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                last_activity_at = {refresh_activity}
            WHERE id = ?
            """,
            (status, output, error, node, cost_usd, input_tokens, output_tokens, duration_sec, exec_id),
        )

    def touch_route_execution_activity(self, exec_id: str) -> None:
        """Stamp last_activity_at = now for a running execution (activity heartbeat)."""
        self._db.execute(
            "UPDATE route_executions SET last_activity_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') "
            "WHERE id = ?",
            (exec_id,),
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

    def purge_old_executions(self, days: int = 30) -> int:
        """Delete failed/done route_executions older than `days` days.

        Only removes records with status in ('failed', 'done') — never
        touches pending/running records to avoid disrupting active tasks.
        Returns the number of rows deleted.
        """
        rows = self._db.execute(
            "DELETE FROM route_executions"
            " WHERE status IN ('failed', 'done')"
            " AND created_at < datetime('now', ? || ' days')"
            " RETURNING id",
            (f"-{days}",),
        )
        return len(rows)

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
            """
            INSERT INTO companies (id, name, template_key, workspace_id, meta)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                template_key = excluded.template_key,
                workspace_id = excluded.workspace_id,
                updated_at   = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            """,
            (company_id, name, template_key, workspace_id, meta_json),
        )
        row = self._db.execute("SELECT * FROM companies WHERE name = ?", (name,))
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
        allowed = {"name", "template_key", "workspace_id", "meta", "status", "purpose", "governance_config"}
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
            try:
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
            except sqlite3.IntegrityError:
                # Name UNIQUE constraint: a company with this name already exists locally
                # under a different id. Update its metadata if the remote is newer,
                # but keep the local id (other records may reference it by id).
                local_row = self._db.execute(
                    "SELECT id, updated_at FROM companies WHERE name = ?",
                    (c.get("name", ""),),
                )
                local_by_name = local_row[0] if local_row else None
                if local_by_name and remote_ts > (local_by_name["updated_at"] or ""):
                    self._db.execute(
                        """
                        UPDATE companies
                        SET template_key = ?, workspace_id = ?, meta = ?, updated_at = ?
                        WHERE name = ?
                        """,
                        (
                            c.get("template_key", "default"),
                            c.get("workspace_id", ""),
                            meta_json,
                            remote_ts,
                            c.get("name", ""),
                        ),
                    )
                    written += 1
                    logger.debug(
                        "bulk_upsert_companies: updated by name for id=%s name=%r (remote newer)",
                        cid, c.get("name", ""),
                    )
                else:
                    logger.debug(
                        "bulk_upsert_companies: skipping id=%s name=%r (local is same age or newer)",
                        cid, c.get("name", ""),
                    )
        return written

    def bulk_upsert_agents(self, agents: list[dict[str, Any]]) -> int:
        """Upsert agent records from a peer. Last-write-wins on updated_at.

        Syncs adapter_config, fallback_chain, status, role, etc.
        """
        if not agents:
            return 0
        written = 0
        for a in agents:
            aid = a.get("id")
            if not aid:
                continue
            remote_ts = a.get("updated_at", "")
            # Check local
            local_rows = self._db.execute("SELECT updated_at FROM agents WHERE id = ?", (aid,))
            if local_rows and local_rows[0]["updated_at"] >= remote_ts:
                continue
            adapter_config = a.get("adapter_config", {})
            ac_json = json.dumps(adapter_config) if isinstance(adapter_config, dict) else (adapter_config or "{}")
            fallback = a.get("fallback_chain", [])
            fb_json = json.dumps(fallback) if isinstance(fallback, list) else (fallback or "[]")
            try:
                self._db.execute(
                    """
                    INSERT INTO agents (id, name, role, adapter_type, adapter_config, status,
                                        fallback_chain, company_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        adapter_config = excluded.adapter_config,
                        fallback_chain = excluded.fallback_chain,
                        status         = excluded.status,
                        role           = excluded.role,
                        updated_at     = excluded.updated_at
                    """,
                    (
                        aid,
                        a.get("name", ""),
                        a.get("role", ""),
                        a.get("adapter_type", "process"),
                        ac_json,
                        a.get("status", "active"),
                        fb_json,
                        a.get("company_id"),
                        a.get("created_at", ""),
                        remote_ts,
                    ),
                )
                written += 1
            except Exception:
                logger.debug("bulk_upsert_agents: failed for id=%s", aid)
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

    @staticmethod
    def _issue_row_to_dict(row: Any) -> dict[str, Any]:
        issue = dict(row)
        issue["companyId"] = issue.get("company_id")
        issue["goalId"] = issue.get("goal_id")
        issue["projectId"] = issue.get("project_id")
        issue["assigneeAgentId"] = issue.get("assignee_id")
        return issue

    @staticmethod
    def _project_row_to_dict(row: Any) -> dict[str, Any]:
        project = dict(row)
        project["companyId"] = project.get("company_id")
        project["projectName"] = project.get("project_name")
        project["assignedTo"] = project.get("assigned_to")
        return project

    def _goal_row_to_dict(self, row: Any) -> dict[str, Any]:
        goal = dict(row)
        goal["companyId"] = goal.get("company_id")
        meta_raw = goal.get("meta")
        if isinstance(meta_raw, str):
            try:
                goal["meta"] = json.loads(meta_raw or "{}")
            except json.JSONDecodeError:
                pass

        linked_projects = self._db.execute(
            """
            SELECT DISTINCT p.id, p.project_name
            FROM issues i
            JOIN company_project_index p ON p.id = i.project_id
            WHERE i.goal_id = ?
            ORDER BY p.project_name ASC
            """,
            (goal.get("id"),),
        )
        project_links = [
            {
                "id": r["id"],
                "name": r["project_name"],
                "projectId": r["id"],
                "projectName": r["project_name"],
            }
            for r in linked_projects
        ]
        goal["projectLinks"] = project_links
        goal["projectIds"] = [item["id"] for item in project_links]
        goal["projectNames"] = [item["name"] for item in project_links]
        if len(project_links) == 1:
            goal["projectId"] = project_links[0]["id"]
            goal["projectName"] = project_links[0]["name"]
        else:
            goal["projectId"] = None
            goal["projectName"] = None
        linked_issue_count = self._db.execute(
            "SELECT COUNT(*) AS n FROM issues WHERE goal_id = ?",
            (goal.get("id"),),
        )
        goal["linkedIssueCount"] = int(linked_issue_count[0]["n"]) if linked_issue_count else 0
        return goal

    def create_issue(
        self,
        company_id: str,
        title: str,
        description: str = "",
        status: str = "open",
        priority: str = "medium",
        assignee_id: str | None = None,
        goal_id: str | None = None,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        issue_id = str(uuid.uuid4())
        self._db.execute(
            """
            INSERT INTO issues
                (id, company_id, goal_id, project_id, title, description, status, priority, assignee_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (issue_id, company_id, goal_id, project_id, title, description, status, priority, assignee_id),
        )
        rows = self._db.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        return self._issue_row_to_dict(rows[0])

    def get_issue(self, issue_id: str) -> dict[str, Any] | None:
        rows = self._db.execute("SELECT * FROM issues WHERE id = ?", (issue_id,))
        return self._issue_row_to_dict(rows[0]) if rows else None

    def list_issues(
        self,
        company_id: str,
        status: str | None = None,
        assignee_id: str | None = None,
        goal_id: str | None = None,
        project_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = ["company_id = ?"]
        params: list[Any] = [company_id]
        statuses = _csv_status_values(status)
        if statuses:
            placeholders = ", ".join("?" for _ in statuses)
            clauses.append(f"status IN ({placeholders})")
            params.extend(statuses)
        if assignee_id:
            clauses.append("assignee_id = ?")
            params.append(assignee_id)
        if goal_id:
            clauses.append("goal_id = ?")
            params.append(goal_id)
        if project_id:
            clauses.append("project_id = ?")
            params.append(project_id)
        params.append(limit)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._db.execute(
            f"SELECT * FROM issues {where} ORDER BY created_at DESC LIMIT ?",
            tuple(params),
        )
        return [self._issue_row_to_dict(r) for r in rows]

    def update_issue(self, issue_id: str, **kwargs: Any) -> dict[str, Any] | None:
        allowed = {"title", "description", "status", "priority", "assignee_id", "goal_id", "project_id"}
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
        """Atomically checkout an issue. Returns updated issue or None if not found / already checked out."""
        with self._db.cursor() as cur:
            cur.execute(
                """
                UPDATE issues
                SET checkout_by = ?, checkout_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
                    status = 'in_progress',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                WHERE id = ? AND checkout_by IS NULL
                """,
                (agent_id, issue_id),
            )
            if cur.rowcount == 0:
                return None  # not found OR already checked out
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
        statuses = _csv_status_values(status)
        if statuses:
            placeholders = ", ".join("?" for _ in statuses)
            clauses.append(f"status IN ({placeholders})")
            params.extend(statuses)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._db.execute(
            f"SELECT * FROM company_project_index {where} ORDER BY created_at DESC",
            tuple(params),
        )
        return [self._project_row_to_dict(r) for r in rows]

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        rows = self._db.execute(
            "SELECT * FROM company_project_index WHERE id = ?", (project_id,)
        )
        return self._project_row_to_dict(rows[0]) if rows else None

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
        """Return cost summary for a company including real USD when available."""
        rows = self._db.execute(
            "SELECT status, COUNT(*) AS n FROM route_executions"
            " WHERE company_id = ? GROUP BY status",
            (company_id,),
        )
        by_status = {r["status"]: r["n"] for r in rows}
        total = sum(by_status.values())
        # Real USD aggregation from v15 columns
        cost_row = self._db.execute(
            "SELECT COALESCE(SUM(cost_usd), 0) AS total_cost, "
            "COALESCE(SUM(input_tokens), 0) AS total_input, "
            "COALESCE(SUM(output_tokens), 0) AS total_output "
            "FROM route_executions WHERE company_id = ?",
            (company_id,),
        )
        cost_data = cost_row[0] if cost_row else {"total_cost": 0, "total_input": 0, "total_output": 0}
        return {
            "company_id": company_id,
            "period": "all_time",
            "total_requests": total,
            "by_status": by_status,
            "total_cost_usd": round(float(cost_data["total_cost"]), 4),
            "total_input_tokens": int(cost_data["total_input"]),
            "total_output_tokens": int(cost_data["total_output"]),
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

    # --- Global runs / costs (no company_id filter) ---

    def get_runs_recent(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return the most recent route_executions across all companies."""
        rows = self._db.execute(
            "SELECT id, channel, sender_id, company_id, status, output, error,"
            " input_tokens, output_tokens, cost_usd, duration_sec, created_at"
            " FROM route_executions ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in rows]

    def get_costs_global(self) -> dict[str, Any]:
        """Return execution-count-based cost summary across all companies."""
        rows = self._db.execute(
            "SELECT status, COUNT(*) AS n FROM route_executions GROUP BY status",
        )
        by_status = {r["status"]: r["n"] for r in rows}
        return {
            "period": "all_time",
            "total_requests": sum(by_status.values()),
            "by_status": by_status,
            "estimated_cost_usd": None,
        }

    def get_costs_by_agent_global(self) -> list[dict[str, Any]]:
        """Return per-channel execution counts across all companies."""
        rows = self._db.execute(
            "SELECT channel, COUNT(*) AS n,"
            " SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,"
            " SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed"
            " FROM route_executions GROUP BY channel ORDER BY n DESC",
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
        statuses = _csv_status_values(status)
        if statuses:
            placeholders = ", ".join("?" for _ in statuses)
            clauses.append(f"status IN ({placeholders})")
            params.extend(statuses)
        where = "WHERE " + " AND ".join(clauses)
        rows = self._db.execute(
            f"SELECT * FROM goals {where} ORDER BY created_at DESC",
            tuple(params),
        )
        return [self._goal_row_to_dict(r) for r in rows]

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
        return self._goal_row_to_dict(rows[0]) if rows else None

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

    # ── KV store ────────────────────────────────────────────────────────

    def get_kv(self, key: str) -> str | None:
        """Return value for key, or None if not set."""
        rows = self._db.execute("SELECT value FROM kvstore WHERE key = ?", (key,))
        return rows[0]["value"] if rows else None

    def set_kv(self, key: str, value: str) -> None:
        """Upsert a key-value pair."""
        with self._db.cursor() as cur:
            cur.execute(
                """INSERT INTO kvstore (key, value)
                   VALUES (?, ?)
                   ON CONFLICT(key) DO UPDATE SET
                     value = excluded.value,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
                """,
                (key, value),
            )

    def close(self) -> None:
        self._db.close()

    # ── Sprint Contract + QA Scores ─────────────────────────────────────

    def get_sprint_contract_for_task(self, task_id: str) -> dict[str, Any] | None:
        """Return the most recent sprint contract linked to a task_id, or None."""
        import json

        rows = self._db.execute(
            "SELECT * FROM sprint_contracts WHERE task_id = ? ORDER BY created_at DESC LIMIT 1",
            (task_id,),
        )
        if not rows:
            return None
        row = rows[0]

        def _parse(val: str | None) -> list:
            try:
                return json.loads(val or "[]")
            except (json.JSONDecodeError, TypeError):
                return []

        # `locked` was added in migration v25. Existing rows default to 0.
        # Use sqlite3.Row.keys() defensively in case a caller queries against
        # an older snapshot before migrations run.
        try:
            locked_val = row["locked"]
        except (KeyError, IndexError):
            locked_val = 0
        # `updated_at` was added in migration v26.
        try:
            updated_at_val = row["updated_at"]
        except (KeyError, IndexError):
            updated_at_val = row["created_at"]
        return {
            "id": row["id"],
            "task_id": row["task_id"],
            "task": row["task"],
            "scope": _parse(row["scope_json"]),
            "out_of_scope": _parse(row["out_of_scope_json"]),
            "acceptance_criteria": _parse(row["acceptance_criteria_json"]),
            "done_definition": row["done_definition"] or "",
            "locked": bool(locked_val),
            "created_at": row["created_at"],
            "updated_at": updated_at_val,
        }

    def update_sprint_contract(
        self,
        task_id: str,
        *,
        task: str,
        scope: list[str],
        out_of_scope: list[str],
        acceptance_criteria: list[str],
        done_definition: str,
    ) -> dict[str, Any]:
        """Update the contract linked to a task. Raises if locked or missing.

        - Returns the freshly-stored contract dict (same shape as get).
        - Raises LookupError when no contract exists for this task.
        - Raises PermissionError when the contract is locked (Engineer has
          already accepted it).

        v17.A — Atomic conditional UPDATE. Previous version did read-then-
        write with a Python-side lock check, which was a TOCTOU race: a
        concurrent lock_sprint_contract between the read and the write
        would happily overwrite a locked contract. Now the lock check is
        in the WHERE clause; if zero rows are affected we run one more
        SELECT to distinguish "missing" from "locked".
        """
        import json
        import time as _time

        scope_json = json.dumps(scope, ensure_ascii=False)
        out_of_scope_json = json.dumps(out_of_scope, ensure_ascii=False)
        acceptance_criteria_json = json.dumps(acceptance_criteria, ensure_ascii=False)
        now = _time.time()

        with self._db.cursor() as cur:
            cur.execute(
                """
                UPDATE sprint_contracts
                SET task = ?,
                    scope_json = ?,
                    out_of_scope_json = ?,
                    acceptance_criteria_json = ?,
                    done_definition = ?,
                    updated_at = ?
                WHERE task_id = ? AND locked = 0
                """,
                (
                    task,
                    scope_json,
                    out_of_scope_json,
                    acceptance_criteria_json,
                    done_definition,
                    now,
                    task_id,
                ),
            )
            affected = cur.rowcount
            if affected == 0:
                cur.execute(
                    "SELECT locked FROM sprint_contracts WHERE task_id = ?",
                    (task_id,),
                )
                row = cur.fetchone()
                if row is None:
                    raise LookupError(f"No sprint contract for task {task_id}")
                # Row exists but UPDATE matched nothing, so locked must be 1.
                raise PermissionError(
                    f"Sprint contract for task {task_id} is locked"
                )

        refreshed = self.get_sprint_contract_for_task(task_id)
        if refreshed is None:
            # Should not happen — UPDATE just succeeded. Guard against -O
            # stripping a plain assert.
            raise RuntimeError(
                f"Contract for task {task_id} vanished between UPDATE and SELECT"
            )
        return refreshed

    def lock_sprint_contract(self, task_id: str) -> bool:
        """Mark the contract linked to a task as locked. Returns True if a
        row was newly transitioned to locked. Used by the orchestrator
        once the Engineer accepts the contract — operator edits are
        refused after this. Idempotent: already-locked contracts return
        False without modifying state.
        """
        with self._db.cursor() as cur:
            cur.execute(
                "UPDATE sprint_contracts SET locked = 1 WHERE task_id = ? AND locked = 0",
                (task_id,),
            )
            return cur.rowcount == 1

    def get_qa_scores_for_task(self, task_id: str) -> list[dict[str, Any]]:
        """Return QA scores linked to a task_id, ordered by iteration."""
        rows = self._db.execute(
            """
            SELECT qs.* FROM qa_scores qs
            JOIN sprint_contracts sc ON qs.contract_id = sc.id
            WHERE sc.task_id = ?
            ORDER BY qs.iteration ASC
            """,
            (task_id,),
        )
        return [
            {
                "id": row["id"],
                "contract_id": row["contract_id"],
                "iteration": row["iteration"],
                "functionality": row["functionality"],
                "correctness": row["correctness"],
                "completeness": row["completeness"],
                "code_quality": row["code_quality"],
                "pass": bool(row["pass"]),
                "feedback": row["feedback"] or "",
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    # --- Node lifecycle events ---

    def record_node_event(
        self,
        node: str,
        event_type: str,
        meta: dict | None = None,
    ) -> str:
        event_id = str(uuid.uuid4())
        self._db.execute(
            "INSERT INTO node_events (id, node, event_type, meta) VALUES (?, ?, ?, ?)",
            (event_id, node, event_type, json.dumps(meta or {})),
        )
        return event_id

    def list_node_events(self, limit: int = 50) -> list[dict[str, Any]]:
        rows = self._db.execute(
            "SELECT id, node, event_type, meta, created_at FROM node_events"
            " ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
        return [
            {
                "id": row["id"],
                "node": row["node"],
                "event_type": row["event_type"],
                "meta": json.loads(row["meta"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
