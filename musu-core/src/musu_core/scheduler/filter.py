"""filter_machines — drop ones that don't meet hard requirements.

Pure function. No DB I/O. Tested in isolation.
"""
from __future__ import annotations

from musu_core.scheduler.capacity import MachineCapacity
from musu_core.scheduler.request import ResourceRequest


def filter_machines(
    capacities: list[MachineCapacity], request: ResourceRequest,
) -> list[MachineCapacity]:
    """Return capacities that meet ALL hard requirements of `request`."""
    req = request.requires
    avoid = request.affinity.avoid_machine
    out: list[MachineCapacity] = []
    for cap in capacities:
        if cap.status != "online":
            continue
        if avoid is not None and cap.machine_id == avoid:
            continue
        if cap.gpu_vram_total_gb < req.gpu_vram_gb:
            continue
        if cap.cpu_cores < req.cpu_cores:
            continue
        if cap.mem_total_gb < req.mem_gb:
            continue
        if req.runtime_class and req.runtime_class not in cap.runtime_classes:
            continue
        out.append(cap)
    return out
