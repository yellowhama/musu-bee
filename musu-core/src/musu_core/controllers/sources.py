"""Event sources for the controller framework.

Two source types mirror controller-runtime's Source split:

- KindSource: polls a SQLite table on a monotonic timestamp column.
  This is the SQLite-shaped analogue of K8s's Watch — it picks up
  inserts and updates within `poll_interval_ms` latency.

- ChannelSource: in-process asyncio.Queue. Used for imperative
  dispatch (CEO commands, webhook callbacks, manual reconcile
  requests). Latency is microseconds; cost is per-process scope.

Safety: KindSource validates the `table` argument against
_ALLOWED_TABLES to prevent SQL injection via mis-configured callers.
Update the allowlist when adding new tables in future migrations.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Awaitable, Callable, Iterable, Optional

from musu_core.controllers.reconciler import ReconcileRequest

logger = logging.getLogger(__name__)


# Allowlist of musu tables that may be polled. Update when adding new
# tables in migrations. Includes both production tables and test-only
# tables used by Const VI experiments.
_ALLOWED_TABLES: frozenset[str] = frozenset({
    # primary
    "agents", "tasks", "comments", "execution_log", "messages",
    "companies", "company_role_templates", "company_project_index",
    "company_approvals_queue",
    "issues", "issue_comments", "goals",
    "route_executions", "route_execution_tombstones",
    "fallback_metrics", "budget_transactions",
    "sprint_contracts", "qa_scores",
    "node_events", "node_runtimes",
    "heartbeat_runs", "heartbeat_run_events",
    "agent_sessions", "run_approvals",
    "kvstore", "dispatch_counters",
    # v33 (21.B)
    "machines",
    # test-only
    "contention_test", "controllers_test_rows",
})


EnqueueFn = Callable[[ReconcileRequest, int], Any]
Handler = Callable[[dict], list[ReconcileRequest]]


class KindSource:
    """Polls a SQLite table for changes and dispatches via handler.

    Cursor: `updated_at` column (configurable). Initial cursor is the
    MAX(updated_at) at start so the source only fires on rows that
    change AFTER it begins polling — startup processing should be done
    by the reconciler when it first sees a row, not by replaying every
    historical row at boot.

    Lateness handling: cursor uses `>` (strict). Rows with identical
    timestamps would be missed; we add `OR (updated_at = ? AND id > ?)`
    to mitigate but only if a key_column is provided AND comparable.
    For now, single-cursor model — acceptable since SQLite timestamps
    via strftime('%fZ') include milliseconds. Production may need
    revisit; tracked in 21.B if observed.
    """

    def __init__(
        self,
        db: Any,
        table: str,
        handler: Handler,
        predicates: Iterable = (),
        poll_interval_ms: int = 2000,
        timestamp_column: str = "updated_at",
        key_column: str = "id",
    ) -> None:
        if table not in _ALLOWED_TABLES:
            raise ValueError(
                f"KindSource: table {table!r} not in allowlist. "
                f"Add it to controllers.sources._ALLOWED_TABLES."
            )
        # Safety: timestamp_column and key_column are interpolated into
        # SQL. Restrict to ascii identifier shape.
        for col in (timestamp_column, key_column):
            if not col.replace("_", "").isalnum() or not col[0].isalpha():
                raise ValueError(f"KindSource: column {col!r} not a safe identifier")
        self.db = db
        self.table = table
        self.handler = handler
        self.predicates = list(predicates)
        self.poll_interval_ms = poll_interval_ms
        self.ts_col = timestamp_column
        self.key_col = key_column
        self._cursor: Optional[str] = None

    async def start(self, enqueue: EnqueueFn) -> None:
        """Run poll loop. Cancel via asyncio.CancelledError."""
        # Initial cursor = current max so we don't re-process history.
        self._cursor = await asyncio.to_thread(self._initial_cursor)
        try:
            while True:
                await asyncio.sleep(self.poll_interval_ms / 1000.0)
                rows = await asyncio.to_thread(self._fetch_changed)
                for row in rows:
                    row_dict = dict(row)
                    if not all(p.matches(row_dict) for p in self.predicates):
                        continue
                    for req in self.handler(row_dict):
                        enqueue(req, 0)
                if rows:
                    last_ts = rows[-1][self.ts_col]
                    if last_ts and (self._cursor is None or last_ts > self._cursor):
                        self._cursor = last_ts
        except asyncio.CancelledError:
            logger.debug("KindSource[%s] cancelled", self.table)
            raise

    def _initial_cursor(self) -> Optional[str]:
        rows = self.db.execute(
            f"SELECT MAX({self.ts_col}) AS max_ts FROM {self.table}"
        )
        if not rows:
            return None
        return rows[0]["max_ts"]

    def _fetch_changed(self) -> list:
        if self._cursor is None:
            return self.db.execute(
                f"SELECT * FROM {self.table} ORDER BY {self.ts_col} ASC"
            )
        return self.db.execute(
            f"SELECT * FROM {self.table} WHERE {self.ts_col} > ? "
            f"ORDER BY {self.ts_col} ASC",
            (self._cursor,),
        )


class ChannelSource:
    """In-process asyncio.Queue-backed source.

    Used for events that aren't SQLite-backed: CEO commands, webhook
    callbacks, manual reconcile requests. The handler converts each
    raw event into zero or more ReconcileRequests.
    """

    def __init__(self, handler: Callable[[Any], list[ReconcileRequest]]) -> None:
        self._queue: asyncio.Queue = asyncio.Queue()
        self._handler = handler

    def emit(self, event: Any) -> None:
        """Synchronously push an event. Safe from non-async callers."""
        self._queue.put_nowait(event)

    async def start(self, enqueue: EnqueueFn) -> None:
        try:
            while True:
                event = await self._queue.get()
                for req in self._handler(event):
                    enqueue(req, 0)
        except asyncio.CancelledError:
            logger.debug("ChannelSource cancelled")
            raise
