"""Scheduler — frame v9 §5 ("야 줄서, 너는 4060 써").

Pieces:
- ResourceRequest: declared by CEO controller when spawning agent
- MachineCapacity: declared by Machine controller via heartbeat
- filter_machines: drop ones not meeting requirements
- score_machines: rank survivors (idle > busy, free VRAM, affinity)
- try_bind: row-level conditional UPDATE — atomic
- SchedulerReconciler: KindSource(resource_requests, status=pending)
                       → filter → score → bind → notify

Usage (in ControllerManager):
    ctrl = (ControllerBuilder(db)
            .named("scheduler")
            .for_object("resource_requests",
                        predicates=[StatusIn("pending")])
            .complete(SchedulerReconciler(db, watch_dispatcher)))
"""
from musu_core.scheduler.request import ResourceRequest, Requires, Affinity
from musu_core.scheduler.capacity import MachineCapacity, load_all_capacities
from musu_core.scheduler.filter import filter_machines
from musu_core.scheduler.score import score_machines
from musu_core.scheduler.binder import try_bind
from musu_core.scheduler.loop import SchedulerReconciler

__all__ = [
    "ResourceRequest", "Requires", "Affinity",
    "MachineCapacity", "load_all_capacities",
    "filter_machines",
    "score_machines",
    "try_bind",
    "SchedulerReconciler",
]
