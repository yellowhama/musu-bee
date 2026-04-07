"""Agent Registry CRUD."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

from musu_core.db import Database


@dataclass
class Agent:
    id: str
    name: str
    role: str
    adapter_type: str
    adapter_config: dict[str, Any]
    status: str
    created_at: str
    updated_at: str
    # Optional ordered list of fallback adapter configs tried on retriable failure.
    # Each entry: {"adapter_type": "hermes", "model": "...", ...}
    fallback_chain: list[dict[str, Any]] | None = None

    @staticmethod
    def from_row(row: Any) -> "Agent":
        keys = row.keys()
        raw_chain = row["fallback_chain"] if "fallback_chain" in keys else None
        return Agent(
            id=row["id"],
            name=row["name"],
            role=row["role"],
            adapter_type=row["adapter_type"],
            adapter_config=json.loads(row["adapter_config"] or "{}"),
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            fallback_chain=json.loads(raw_chain) if raw_chain else None,
        )


class AgentRegistry:
    def __init__(self, db: Database) -> None:
        self._db = db

    def create(
        self,
        name: str,
        role: str = "",
        adapter_type: str = "process",
        adapter_config: dict[str, Any] | None = None,
        agent_id: str | None = None,
    ) -> Agent:
        aid = agent_id or str(uuid.uuid4())
        config_json = json.dumps(adapter_config or {})
        rows = self._db.execute(
            """
            INSERT INTO agents (id, name, role, adapter_type, adapter_config)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
            """,
            (aid, name, role, adapter_type, config_json),
        )
        return Agent.from_row(rows[0])

    def get(self, agent_id: str) -> Agent | None:
        rows = self._db.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        )
        return Agent.from_row(rows[0]) if rows else None

    def get_by_name(self, name: str) -> Agent | None:
        rows = self._db.execute(
            "SELECT * FROM agents WHERE name = ? LIMIT 1", (name,)
        )
        return Agent.from_row(rows[0]) if rows else None

    def list(self, status: str | None = None) -> list[Agent]:
        if status:
            rows = self._db.execute(
                "SELECT * FROM agents WHERE status = ? ORDER BY created_at", (status,)
            )
        else:
            rows = self._db.execute(
                "SELECT * FROM agents ORDER BY created_at"
            )
        return [Agent.from_row(r) for r in rows]

    def update(
        self,
        agent_id: str,
        *,
        name: str | None = None,
        role: str | None = None,
        adapter_type: str | None = None,
        adapter_config: dict[str, Any] | None = None,
        status: str | None = None,
    ) -> Agent | None:
        agent = self.get(agent_id)
        if agent is None:
            return None
        new_name = name if name is not None else agent.name
        new_role = role if role is not None else agent.role
        new_adapter_type = adapter_type if adapter_type is not None else agent.adapter_type
        new_config = json.dumps(adapter_config if adapter_config is not None else agent.adapter_config)
        new_status = status if status is not None else agent.status
        rows = self._db.execute(
            """
            UPDATE agents
            SET name = ?, role = ?, adapter_type = ?, adapter_config = ?,
                status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
            RETURNING *
            """,
            (new_name, new_role, new_adapter_type, new_config, new_status, agent_id),
        )
        return Agent.from_row(rows[0]) if rows else None

    def delete(self, agent_id: str) -> bool:
        rows = self._db.execute(
            "DELETE FROM agents WHERE id = ? RETURNING id", (agent_id,)
        )
        return len(rows) > 0
