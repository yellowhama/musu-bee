"""ControllerManager + Controller — the reconcile loop host.

ControllerManager is the single-asyncio-loop runtime for all
controllers in a process. Sources poll/listen; controllers pull from
the workqueue; reconcilers do the work. Mirrors k3s's pattern of
collapsing the K8s control plane (apiserver + scheduler + controller-
manager) into one process — except in musu, ControllerManager hosts
*all* reconcile loops (CEO, Machine, Scheduler, etc.) without the
apiserver layer (SQLite is the cache; see wiki/350 §1).

Lifecycle:
    mgr = ControllerManager(db)
    mgr.add(controller_a)
    mgr.add(controller_b)
    await mgr.start()
    ...
    await mgr.stop()
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Iterable

from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)
from musu_core.controllers.workqueue import RateLimitedQueue

logger = logging.getLogger(__name__)


class Controller:
    """One reconcile loop for one entity type.

    Composed by ControllerBuilder.complete(); usually you don't
    construct it directly. Has its own RateLimitedQueue so backoff is
    per-controller, not global across the manager.
    """

    def __init__(
        self,
        name: str,
        reconciler: Reconciler,
        sources: Iterable,
        queue: RateLimitedQueue,
    ) -> None:
        self.name = name
        self.reconciler = reconciler
        self.sources = list(sources)
        self.queue = queue
        # Tracks _delayed_requeue tasks so they get cancelled on stop()
        # instead of warning "Task was destroyed but it is pending".
        self._pending_requeues: set[asyncio.Task] = set()

    async def run(self) -> None:
        """Start all sources + the reconcile loop. Returns on cancel."""
        source_tasks = [
            asyncio.create_task(
                src.start(self.queue.add),
                name=f"src-{self.name}-{i}",
            )
            for i, src in enumerate(self.sources)
        ]
        try:
            await self._reconcile_loop()
        except asyncio.CancelledError:
            logger.info("Controller[%s] cancelled", self.name)
            raise
        finally:
            for t in source_tasks:
                t.cancel()
            # Drain cancellation noise
            if source_tasks:
                await asyncio.gather(*source_tasks, return_exceptions=True)
            # Cancel any pending delayed-requeue tasks so they don't
            # outlive the controller and trigger "Task was destroyed
            # but it is pending" warnings.
            for t in list(self._pending_requeues):
                t.cancel()
            if self._pending_requeues:
                await asyncio.gather(
                    *self._pending_requeues, return_exceptions=True
                )
            self._pending_requeues.clear()
            self.queue.shutdown()

    async def _reconcile_loop(self) -> None:
        while True:
            req = await self.queue.get()
            if req is None:
                # shutdown signal
                return
            result = await self._safe_reconcile(req)
            self.queue.done(req)
            await self._apply_result(req, result)

    async def _safe_reconcile(self, req: ReconcileRequest) -> ReconcileResult:
        try:
            result = await self.reconciler.reconcile(req)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 — controllers must not crash the loop
            logger.exception(
                "Controller[%s] reconciler raised on %s",
                self.name, req,
            )
            return ReconcileResult(error=exc)
        if not isinstance(result, ReconcileResult):
            logger.error(
                "Controller[%s] reconciler returned non-ReconcileResult: %r",
                self.name, result,
            )
            return ReconcileResult(
                error=TypeError(
                    f"reconciler returned {type(result).__name__}"
                )
            )
        return result

    async def _apply_result(
        self, req: ReconcileRequest, result: ReconcileResult
    ) -> None:
        if result.failed:
            self.queue.add_rate_limited(req)
            return
        if result.requeue_after_ms > 0:
            t = asyncio.create_task(
                self._delayed_requeue(req, result.requeue_after_ms)
            )
            self._pending_requeues.add(t)
            t.add_done_callback(self._pending_requeues.discard)
            return
        if result.requeue:
            self.queue.add(req, priority=0)
            return
        self.queue.forget(req)

    async def _delayed_requeue(
        self, req: ReconcileRequest, delay_ms: int
    ) -> None:
        try:
            await asyncio.sleep(delay_ms / 1000.0)
            self.queue.add(req, priority=0)
        except asyncio.CancelledError:
            pass


class ControllerManager:
    """Host for multiple controllers in one asyncio event loop."""

    def __init__(self, db: Any) -> None:
        self.db = db
        self._controllers: dict[str, Controller] = {}
        self._tasks: list[asyncio.Task] = []
        self._running = False

    def add(self, controller: Controller) -> None:
        if controller.name in self._controllers:
            raise ValueError(f"duplicate controller name: {controller.name!r}")
        self._controllers[controller.name] = controller

    def controllers(self) -> list[Controller]:
        return list(self._controllers.values())

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        for c in self._controllers.values():
            t = asyncio.create_task(c.run(), name=f"ctrl-{c.name}")
            self._tasks.append(t)
        logger.info(
            "ControllerManager started %d controllers", len(self._controllers)
        )

    async def stop(self, timeout: float = 5.0) -> None:
        if not self._running:
            return
        self._running = False
        for c in self._controllers.values():
            c.queue.shutdown()
        for t in self._tasks:
            t.cancel()
        if self._tasks:
            await asyncio.wait(self._tasks, timeout=timeout)
        self._tasks.clear()
        logger.info("ControllerManager stopped")
