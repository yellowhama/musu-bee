"""Agent Registry CRUD."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from musu_core.db import Database

# ---------------------------------------------------------------------------
# fallback_chain schema validation
# ---------------------------------------------------------------------------

def validate_fallback_chain(chain: list[dict[str, Any]]) -> None:
    """Raise ValueError if *chain* is not a valid fallback chain.

    Each entry must be a dict with at least an ``adapter_type`` key (str).
    Additional keys are adapter-specific and passed through unchecked.
    """
    if not isinstance(chain, list):
        raise ValueError(f"fallback_chain must be a list, got {type(chain).__name__}")
    for i, entry in enumerate(chain):
        if not isinstance(entry, dict):
            raise ValueError(
                f"fallback_chain[{i}] must be a dict, got {type(entry).__name__}"
            )
        if "adapter_type" not in entry:
            raise ValueError(f"fallback_chain[{i}] missing required key 'adapter_type'")
        if not isinstance(entry["adapter_type"], str) or not entry["adapter_type"]:
            raise ValueError(
                f"fallback_chain[{i}]['adapter_type'] must be a non-empty string"
            )


# Sentinel distinguishing "not provided" from None (clear the chain).
class _UNSET:
    pass


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
    # NULL = global agent; set for company-scoped agents.
    company_id: str | None = None
    budget_usd_monthly: float | None = None
    budget_usd_spent: float = 0.0
    budget_reset_at: str | None = None
    # Tool access control: JSON list of allowed MCP tool names. None = all tools.
    allowed_tools: list[str] | None = None

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
            company_id=row["company_id"] if "company_id" in keys else None,
            budget_usd_monthly=row["budget_usd_monthly"] if "budget_usd_monthly" in keys else None,
            budget_usd_spent=row["budget_usd_spent"] if "budget_usd_spent" in keys else 0.0,
            budget_reset_at=row["budget_reset_at"] if "budget_reset_at" in keys else None,
            allowed_tools=json.loads(row["allowed_tools"]) if "allowed_tools" in keys and row["allowed_tools"] else None,
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
        fallback_chain: list[dict[str, Any]] | None = None,
        company_id: str | None = None,
    ) -> Agent:
        if fallback_chain is not None:
            validate_fallback_chain(fallback_chain)
        aid = agent_id or str(uuid.uuid4())
        config_json = json.dumps(adapter_config or {})
        chain_json = json.dumps(fallback_chain) if fallback_chain is not None else None
        # Upsert: check if agent already exists for this (company_id, name) pair.
        # SQLite NULLs are distinct in unique indexes, so we handle global vs scoped:
        if company_id is not None:
            existing = self._db.execute(
                "SELECT id FROM agents WHERE name = ? AND company_id = ? AND status = 'active'",
                (name, company_id),
            )
        else:
            existing = self._db.execute(
                "SELECT id FROM agents WHERE name = ? AND company_id IS NULL AND status = 'active'",
                (name,),
            )
        if existing:
            # Update existing agent
            rows = self._db.execute(
                """
                UPDATE agents
                SET role = ?, adapter_type = ?, adapter_config = ?, fallback_chain = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE id = ?
                RETURNING *
                """,
                (role, adapter_type, config_json, chain_json, existing[0]["id"]),
            )
        else:
            rows = self._db.execute(
                """
                INSERT INTO agents (id, name, role, adapter_type, adapter_config, fallback_chain, company_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING *
                """,
                (aid, name, role, adapter_type, config_json, chain_json, company_id),
            )
        return Agent.from_row(rows[0])

    def get(self, agent_id: str) -> Agent | None:
        rows = self._db.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        )
        return Agent.from_row(rows[0]) if rows else None

    def get_by_name(self, name: str, company_id: str | None = None) -> Agent | None:
        if company_id is not None:
            # Try company-scoped first, fall back to global
            rows = self._db.execute(
                "SELECT * FROM agents WHERE name = ? AND company_id = ? LIMIT 1",
                (name, company_id),
            )
            if rows:
                return Agent.from_row(rows[0])
        # Fall back to global agents only (company_id IS NULL)
        rows = self._db.execute(
            "SELECT * FROM agents WHERE name = ? AND company_id IS NULL LIMIT 1", (name,)
        )
        return Agent.from_row(rows[0]) if rows else None

    def list(self, status: str | None = None, company_id: str | None = None) -> list[Agent]:
        clauses: list[str] = []
        params: list[str] = []
        if status:
            clauses.append("status = ?")
            params.append(status)
        if company_id is not None:
            clauses.append("company_id = ?")
            params.append(company_id)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        rows = self._db.execute(
            f"SELECT * FROM agents{where} ORDER BY created_at", tuple(params)
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
        fallback_chain: list[dict[str, Any]] | None | type[_UNSET] = _UNSET,
        budget_usd_monthly: float | None | type[_UNSET] = _UNSET,
        budget_usd_spent: float | None = None,
        budget_reset_at: str | None | type[_UNSET] = _UNSET,
    ) -> Agent | None:
        if fallback_chain is not _UNSET and fallback_chain is not None:
            validate_fallback_chain(fallback_chain)  # type: ignore[arg-type]
        agent = self.get(agent_id)
        if agent is None:
            return None
        new_name = name if name is not None else agent.name
        new_role = role if role is not None else agent.role
        new_adapter_type = adapter_type if adapter_type is not None else agent.adapter_type
        new_config = json.dumps(adapter_config if adapter_config is not None else agent.adapter_config)
        new_status = status if status is not None else agent.status
        new_chain: list[dict[str, Any]] | None
        if fallback_chain is _UNSET:
            new_chain = agent.fallback_chain
        else:
            new_chain = fallback_chain  # type: ignore[assignment]
        chain_json = json.dumps(new_chain) if new_chain is not None else None
        new_budget_monthly = agent.budget_usd_monthly if budget_usd_monthly is _UNSET else budget_usd_monthly
        new_budget_spent = budget_usd_spent if budget_usd_spent is not None else agent.budget_usd_spent
        new_budget_reset = agent.budget_reset_at if budget_reset_at is _UNSET else budget_reset_at
        rows = self._db.execute(
            """
            UPDATE agents
            SET name = ?, role = ?, adapter_type = ?, adapter_config = ?,
                status = ?, fallback_chain = ?,
                budget_usd_monthly = ?, budget_usd_spent = ?, budget_reset_at = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = ?
            RETURNING *
            """,
            (new_name, new_role, new_adapter_type, new_config, new_status, chain_json,
             new_budget_monthly, new_budget_spent, new_budget_reset, agent_id),
        )
        return Agent.from_row(rows[0]) if rows else None

    def delete(self, agent_id: str) -> bool:
        rows = self._db.execute(
            "DELETE FROM agents WHERE id = ? RETURNING id", (agent_id,)
        )
        return len(rows) > 0
