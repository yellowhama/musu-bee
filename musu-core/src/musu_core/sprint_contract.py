"""Sprint Contract — defines scope and acceptance criteria before Engineer starts.

The CTO writes a Sprint Contract at the start of each task.
The Engineer reads it before implementing.
The QA Lead uses it to judge completeness.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SprintContract:
    """Scope + acceptance criteria negotiated before implementation begins."""

    task: str
    scope: list[str] = field(default_factory=list)
    out_of_scope: list[str] = field(default_factory=list)
    acceptance_criteria: list[str] = field(default_factory=list)
    done_definition: str = ""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task_id: str | None = None
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "task_id": self.task_id,
            "task": self.task,
            "scope": self.scope,
            "out_of_scope": self.out_of_scope,
            "acceptance_criteria": self.acceptance_criteria,
            "done_definition": self.done_definition,
            "created_at": self.created_at,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SprintContract":
        return cls(
            id=data.get("id", str(uuid.uuid4())),
            task_id=data.get("task_id"),
            task=data["task"],
            scope=data.get("scope", []),
            out_of_scope=data.get("out_of_scope", []),
            acceptance_criteria=data.get("acceptance_criteria", []),
            done_definition=data.get("done_definition", ""),
            created_at=float(data.get("created_at", time.time())),
        )

    def engineer_prompt_header(self) -> str:
        """Return a formatted header to prepend to Engineer prompts."""
        lines = [
            "## Sprint Contract",
            f"**Task**: {self.task}",
            "",
            "**Scope** (implement these):",
        ]
        for item in self.scope:
            lines.append(f"  - {item}")
        if self.out_of_scope:
            lines.append("")
            lines.append("**Out of scope** (do NOT implement):")
            for item in self.out_of_scope:
                lines.append(f"  - {item}")
        lines.append("")
        lines.append("**Acceptance criteria** (QA will check each):")
        for i, crit in enumerate(self.acceptance_criteria, 1):
            lines.append(f"  {i}. {crit}")
        lines.append("")
        lines.append(f"**Done when**: {self.done_definition}")
        lines.append("")
        return "\n".join(lines)

    def qa_prompt_header(self) -> str:
        """Return criteria list formatted for QA scoring prompt."""
        lines = [
            "## Sprint Contract — Acceptance Criteria to Evaluate",
            f"**Task**: {self.task}",
            "",
        ]
        for i, crit in enumerate(self.acceptance_criteria, 1):
            lines.append(f"  {i}. {crit}")
        lines.append("")
        lines.append(
            "Score each of the four QA dimensions (1–10). "
            "Return JSON only:\n"
            '{"functionality": N, "correctness": N, "completeness": N, "code_quality": N, "feedback": "..."}'
        )
        lines.append("")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# DB helpers (optional — stores contracts in SQLite when available)
# ---------------------------------------------------------------------------

def save_contract(conn: sqlite3.Connection, contract: SprintContract) -> None:
    """Persist a SprintContract to the sprint_contracts table."""
    conn.execute(
        """
        INSERT OR REPLACE INTO sprint_contracts
            (id, task_id, task, scope_json, out_of_scope_json,
             acceptance_criteria_json, done_definition, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            contract.id,
            contract.task_id,
            contract.task,
            json.dumps(contract.scope, ensure_ascii=False),
            json.dumps(contract.out_of_scope, ensure_ascii=False),
            json.dumps(contract.acceptance_criteria, ensure_ascii=False),
            contract.done_definition,
            contract.created_at,
        ),
    )
    conn.commit()


def load_contract(conn: sqlite3.Connection, contract_id: str) -> SprintContract | None:
    """Load a SprintContract by ID."""
    row = conn.execute(
        "SELECT * FROM sprint_contracts WHERE id = ?", (contract_id,)
    ).fetchone()
    if row is None:
        return None

    def _parse(val: str | None, fallback: list) -> list:
        try:
            return json.loads(val or "[]")
        except json.JSONDecodeError:
            return fallback

    return SprintContract(
        id=row["id"],
        task_id=row["task_id"],
        task=row["task"],
        scope=_parse(row["scope_json"], []),
        out_of_scope=_parse(row["out_of_scope_json"], []),
        acceptance_criteria=_parse(row["acceptance_criteria_json"], []),
        done_definition=row["done_definition"] or "",
        created_at=float(row["created_at"]),
    )


def save_qa_score(
    conn: sqlite3.Connection,
    contract_id: str,
    task_id: str | None,
    score: "Any",  # QAScore, avoid circular if in same package
) -> None:
    """Persist a QAScore linked to a contract."""
    from musu_core.qa_score import QAScore

    assert isinstance(score, QAScore)
    conn.execute(
        """
        INSERT INTO qa_scores
            (id, contract_id, task_id, iteration,
             functionality, correctness, completeness, code_quality,
             pass, feedback, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            contract_id,
            task_id,
            score.iteration,
            score.functionality,
            score.correctness,
            score.completeness,
            score.code_quality,
            1 if score.pass_ else 0,
            score.feedback,
            time.time(),
        ),
    )
    conn.commit()
