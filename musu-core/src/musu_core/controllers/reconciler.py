"""Reconciler ABC + request/result dataclasses.

Shape mirrors kubernetes-sigs/controller-runtime Reconciler:

    Reconcile(ctx, req) -> (Result, error)

In musu:

    async reconcile(req: ReconcileRequest) -> ReconcileResult

Errors are returned alongside the Result via `error` field; the workqueue
inspects it to decide rate-limited retry vs Forget. Reconcilers do NOT
raise to the workqueue under normal failure — return a ReconcileResult
with .error set. Truly unexpected exceptions still propagate; the
Controller wrapper catches and converts them into result.error.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class ReconcileRequest:
    """Identifies what to reconcile.

    Attributes:
        table: SQLite table name (e.g. "heartbeat_runs", "agents").
        key: primary identifier within the table (typically the PK value).
        company_id: optional Company-axis tag from frame v9.
        machine_id: optional Machine-axis tag from frame v9.
    """

    table: str
    key: str
    company_id: Optional[str] = None
    machine_id: Optional[str] = None

    def __str__(self) -> str:
        tag = f"[{self.company_id or '-'}/{self.machine_id or '-'}]"
        return f"{self.table}:{self.key}{tag}"


@dataclass
class ReconcileResult:
    """Outcome of one reconcile pass.

    Attributes:
        requeue: if True, immediately re-enqueue at same priority.
        requeue_after_ms: if >0, sleep then re-enqueue. If both `requeue`
            and `requeue_after_ms>0` are set, `requeue_after_ms` wins.
        error: if set, workqueue applies rate-limited retry. Pure
            ReconcileResult(error=...) is the normal failure path.
        metadata: caller-defined extra info (e.g. last_change_observed).
    """

    requeue: bool = False
    requeue_after_ms: int = 0
    error: Optional[BaseException] = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def failed(self) -> bool:
        return self.error is not None


class Reconciler(ABC):
    """Subclass and implement `reconcile`."""

    @property
    def name(self) -> str:
        """Unique name used in metrics, logs, lease keys."""
        return self.__class__.__name__

    @abstractmethod
    async def reconcile(self, req: ReconcileRequest) -> ReconcileResult:
        """Compare desired vs actual; converge; return result.

        Should not raise under normal failure. Set
        ReconcileResult(error=exc) instead so the workqueue can apply
        rate-limited retry.
        """
        raise NotImplementedError
