"""Controller framework — K8s-shaped reconcile loops on SQLite.

See wiki/347 §4 (21.A) and wiki/350 detail plan.

Public API:
    Reconciler, ReconcileRequest, ReconcileResult,
    KindSource, ChannelSource, RateLimitedQueue,
    ControllerManager, ControllerBuilder,
    enqueue_request_for_object, enqueue_request_for_owner,
    Predicate, LabelSelector, StatusIn, GenerationChanged.

Sync-vs-async rule:
    Database.execute() is sync (threading.Lock). Reconcilers are async.
    Wrap blocking DB calls with `await asyncio.to_thread(db.execute, ...)`
    for any read returning many rows or any write inside a hot loop.
    Single-row index lookups may call db.execute directly.
"""
from musu_core.controllers.reconciler import (
    Reconciler,
    ReconcileRequest,
    ReconcileResult,
)
from musu_core.controllers.workqueue import RateLimitedQueue
from musu_core.controllers.handlers import (
    enqueue_request_for_object,
    enqueue_request_for_owner,
)
from musu_core.controllers.predicates import (
    Predicate,
    GenerationChanged,
    LabelSelector,
    StatusIn,
)
from musu_core.controllers.sources import KindSource, ChannelSource
from musu_core.controllers.manager import Controller, ControllerManager
from musu_core.controllers.builder import ControllerBuilder

__all__ = [
    "Reconciler",
    "ReconcileRequest",
    "ReconcileResult",
    "RateLimitedQueue",
    "enqueue_request_for_object",
    "enqueue_request_for_owner",
    "Predicate",
    "GenerationChanged",
    "LabelSelector",
    "StatusIn",
    "KindSource",
    "ChannelSource",
    "Controller",
    "ControllerManager",
    "ControllerBuilder",
]
