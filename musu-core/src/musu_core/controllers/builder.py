"""ControllerBuilder — fluent API for assembling a Controller.

Mirror of K8s `ctrl.NewControllerManagedBy(mgr).For(...).Owns(...).Complete(...)`.

Usage:
    ctrl = (
        ControllerBuilder(db)
        .named("agent-reconciler")
        .for_object("agents")
        .owns("execution_log", parent_key_column="agent_id")
        .complete(MyAgentReconciler())
    )
    mgr.add(ctrl)
"""
from __future__ import annotations

from typing import Any, Iterable

from musu_core.controllers.handlers import (
    enqueue_request_for_object,
    enqueue_request_for_owner,
)
from musu_core.controllers.manager import Controller
from musu_core.controllers.reconciler import Reconciler
from musu_core.controllers.sources import KindSource
from musu_core.controllers.workqueue import RateLimitedQueue


class ControllerBuilder:
    """Build a Controller with a fluent chain.

    .for_object(table) and .owns(child) are syntactic sugar for
    .watches(KindSource(...)). For non-SQLite event sources (ChannelSource,
    webhook bridges in 21.B), pass them via .watches(source).
    """

    def __init__(
        self, db: Any, queue: RateLimitedQueue | None = None
    ) -> None:
        self.db = db
        self.queue = queue or RateLimitedQueue()
        self._name: str | None = None
        self._sources: list = []

    def named(self, name: str) -> "ControllerBuilder":
        self._name = name
        return self

    def for_object(
        self,
        table: str,
        predicates: Iterable = (),
        poll_interval_ms: int = 2000,
    ) -> "ControllerBuilder":
        """Watch table; reconcile by row PK."""
        self._sources.append(
            KindSource(
                self.db,
                table,
                enqueue_request_for_object(table),
                predicates,
                poll_interval_ms,
            )
        )
        return self

    def owns(
        self,
        child_table: str,
        parent_table: str | None = None,
        parent_key_column: str = "parent_id",
        predicates: Iterable = (),
        poll_interval_ms: int = 2000,
    ) -> "ControllerBuilder":
        """Watch child_table; reconcile parent (resolved via parent_key_column).

        If parent_table is None, defaults to whatever table was passed
        to .for_object() (matches controller-runtime's Owns() semantic).
        """
        if parent_table is None:
            primary = self._primary_table_or_raise()
            parent_table = primary
        self._sources.append(
            KindSource(
                self.db,
                child_table,
                enqueue_request_for_owner(parent_table, parent_key_column),
                predicates,
                poll_interval_ms,
            )
        )
        return self

    def watches(self, source: Any) -> "ControllerBuilder":
        """Attach an arbitrary source (KindSource, ChannelSource, ...)."""
        self._sources.append(source)
        return self

    def complete(self, reconciler: Reconciler) -> Controller:
        if reconciler is None:
            raise ValueError("ControllerBuilder.complete requires a Reconciler")
        name = self._name or reconciler.name
        return Controller(name, reconciler, self._sources, self.queue)

    # ----- internals -----

    def _primary_table_or_raise(self) -> str:
        for s in self._sources:
            if isinstance(s, KindSource):
                return s.table
        raise ValueError(
            "ControllerBuilder.owns(parent_table=None) requires a prior "
            ".for_object(table) call"
        )
