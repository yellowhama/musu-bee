"""RuntimeStore — persistence layer for fleet runtime capabilities.

Wraps the v27 `node_runtimes` table. Upserts use SQLite's
INSERT ... ON CONFLICT DO UPDATE so the (node_name, runtime_name) PK
collapses to one row per pair without us having to do a SELECT first.

state_changed_at logic lives here (not in detectors): when an UPSERT
would change `status` or `health` relative to the existing row, the
new state_changed_at is the probe time; otherwise the prior value
sticks. This is the Kubernetes lastTransitionTime contract and the
reason operators always know "since when did this break."
"""

from __future__ import annotations

import sqlite3
from typing import Iterable

from musu_core.db import Database
from musu_core.fleet.runtimes import (
    RuntimeCapability,
    RuntimeHealth,
    RuntimeStatus,
)


class RuntimeStore:
    """Read/write access to node_runtimes.

    Methods are intentionally thin — application code talks to this class
    rather than the table to keep DB column names out of route handlers.
    """

    def __init__(self, db: Database) -> None:
        self._db = db

    # ── reads ──────────────────────────────────────────────────────────────

    def list_for_node(self, node_name: str) -> list[RuntimeCapability]:
        """All runtimes recorded for a node, ordered by runtime_name."""
        rows = self._db.execute(
            """
            SELECT node_name, runtime_name, status, health, reason, version,
                   detection_method, binary_path, notes, probe_error,
                   detected_at, last_probe_attempt_at, state_changed_at
            FROM node_runtimes
            WHERE node_name = ?
            ORDER BY runtime_name ASC
            """,
            (node_name,),
        )
        return [_row_to_capability(row) for row in rows]

    def get(
        self, node_name: str, runtime_name: str
    ) -> RuntimeCapability | None:
        rows = self._db.execute(
            """
            SELECT node_name, runtime_name, status, health, reason, version,
                   detection_method, binary_path, notes, probe_error,
                   detected_at, last_probe_attempt_at, state_changed_at
            FROM node_runtimes
            WHERE node_name = ? AND runtime_name = ?
            """,
            (node_name, runtime_name),
        )
        return _row_to_capability(rows[0]) if rows else None

    # ── writes ─────────────────────────────────────────────────────────────

    def upsert(
        self, node_name: str, capability: RuntimeCapability
    ) -> RuntimeCapability:
        """Insert or update one capability row.

        Computes state_changed_at by diffing against the existing row:
        if status or health is unchanged, the prior state_changed_at is
        preserved so dashboards keep the original "broken since" answer
        even across many subsequent probes.
        """
        prior = self.get(node_name, capability.name)
        if prior is not None and prior.status == capability.status and prior.health == capability.health:
            state_changed_at = prior.state_changed_at
        else:
            state_changed_at = capability.state_changed_at or capability.last_probe_attempt_at

        self._db.execute(
            """
            INSERT INTO node_runtimes (
                node_name, runtime_name, status, health, reason, version,
                detection_method, binary_path, notes, probe_error,
                detected_at, last_probe_attempt_at, state_changed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (node_name, runtime_name) DO UPDATE SET
                status                = excluded.status,
                health                = excluded.health,
                reason                = excluded.reason,
                version               = excluded.version,
                detection_method      = excluded.detection_method,
                binary_path           = excluded.binary_path,
                probe_error           = excluded.probe_error,
                detected_at           = excluded.detected_at,
                last_probe_attempt_at = excluded.last_probe_attempt_at,
                state_changed_at      = excluded.state_changed_at
                -- notes is operator-authored; detection never overwrites it.
            """,
            (
                node_name,
                capability.name,
                capability.status.value,
                capability.health.value,
                capability.reason,
                capability.version,
                capability.detection_method,
                capability.binary_path,
                capability.notes,
                capability.probe_error,
                capability.detected_at,
                capability.last_probe_attempt_at,
                state_changed_at,
            ),
        )

        # Re-read so the caller gets the canonical state_changed_at +
        # any preserved notes from the prior row.
        result = self.get(node_name, capability.name)
        assert result is not None  # we just upserted it
        return result

    def upsert_many(
        self,
        node_name: str,
        capabilities: Iterable[RuntimeCapability],
    ) -> list[RuntimeCapability]:
        return [self.upsert(node_name, cap) for cap in capabilities]

    def set_notes(self, node_name: str, runtime_name: str, notes: str) -> None:
        """Operator annotation. Independent of probe state."""
        self._db.execute(
            "UPDATE node_runtimes SET notes = ? WHERE node_name = ? AND runtime_name = ?",
            (notes, node_name, runtime_name),
        )

    def delete_node(self, node_name: str) -> int:
        """Remove every runtime row for a node (call on node removal).

        Returns the number of rows deleted. Phase 3's mesh remove-node path
        calls this so orphaned runtime rows don't pile up.
        """
        # SQLite's DELETE doesn't expose rowcount via this Database wrapper,
        # so we count first. Safe under the wrapper's lock.
        rows = self._db.execute(
            "SELECT COUNT(*) FROM node_runtimes WHERE node_name = ?",
            (node_name,),
        )
        count = rows[0][0] if rows else 0
        self._db.execute(
            "DELETE FROM node_runtimes WHERE node_name = ?", (node_name,)
        )
        return count


def _row_to_capability(row: sqlite3.Row) -> RuntimeCapability:
    return RuntimeCapability(
        name=row["runtime_name"],
        status=RuntimeStatus(row["status"]),
        health=RuntimeHealth(row["health"]),
        reason=row["reason"],
        version=row["version"],
        detection_method=row["detection_method"],
        binary_path=row["binary_path"],
        notes=row["notes"],
        probe_error=row["probe_error"],
        detected_at=row["detected_at"],
        last_probe_attempt_at=row["last_probe_attempt_at"],
        state_changed_at=row["state_changed_at"],
    )
