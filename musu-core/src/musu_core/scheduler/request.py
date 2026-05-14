"""ResourceRequest dataclass — what the CEO controller declares."""
from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Requires:
    """Hard requirements — machine must meet ALL to be eligible."""
    gpu_vram_gb: float = 0.0
    cpu_cores: int = 0
    mem_gb: float = 0.0
    runtime_class: str = ""  # e.g. "claude_local", "codex_local", or "" for any

    def to_dict(self) -> dict:
        return {
            "gpu_vram_gb": self.gpu_vram_gb,
            "cpu_cores": self.cpu_cores,
            "mem_gb": self.mem_gb,
            "runtime_class": self.runtime_class,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Requires":
        return cls(
            gpu_vram_gb=float(d.get("gpu_vram_gb", 0.0)),
            cpu_cores=int(d.get("cpu_cores", 0)),
            mem_gb=float(d.get("mem_gb", 0.0)),
            runtime_class=str(d.get("runtime_class", "")),
        )


@dataclass
class Affinity:
    """Soft preferences — bias scoring, not filtering (except avoid)."""
    prefer_machine: Optional[str] = None
    avoid_machine: Optional[str] = None  # this is a hard filter

    def to_dict(self) -> dict:
        return {
            "prefer_machine": self.prefer_machine,
            "avoid_machine": self.avoid_machine,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Affinity":
        return cls(
            prefer_machine=d.get("prefer_machine"),
            avoid_machine=d.get("avoid_machine"),
        )


@dataclass
class ResourceRequest:
    id: str
    agent_id: str
    company_id: Optional[str]
    priority: int  # higher = more urgent
    requires: Requires
    affinity: Affinity
    status: str = "pending"
    bound_machine_id: Optional[str] = None

    @classmethod
    def new(
        cls,
        agent_id: str,
        requires: Requires,
        affinity: Optional[Affinity] = None,
        company_id: Optional[str] = None,
        priority: int = 0,
    ) -> "ResourceRequest":
        return cls(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            company_id=company_id,
            priority=priority,
            requires=requires,
            affinity=affinity or Affinity(),
        )

    @classmethod
    def from_db_row(cls, row: Any) -> "ResourceRequest":
        return cls(
            id=row["id"],
            agent_id=row["agent_id"],
            company_id=row["company_id"],
            priority=int(row["priority"]),
            requires=Requires.from_dict(json.loads(row["requires_json"] or "{}")),
            affinity=Affinity.from_dict(json.loads(row["affinity_json"] or "{}")),
            status=row["status"],
            bound_machine_id=row["bound_machine_id"],
        )

    def to_db_params(self) -> tuple:
        """Tuple for INSERT INTO resource_requests."""
        return (
            self.id,
            self.company_id,
            self.agent_id,
            self.priority,
            json.dumps(self.requires.to_dict()),
            json.dumps(self.affinity.to_dict()),
            self.status,
        )

    def insert(self, db) -> None:
        """Persist as a pending request."""
        db.execute(
            "INSERT INTO resource_requests"
            "(id, company_id, agent_id, priority, requires_json, affinity_json, status) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            self.to_db_params(),
        )
