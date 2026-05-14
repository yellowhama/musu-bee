"""score_machines — rank filtered survivors. Higher = better.

Pure function. No DB I/O. Pure ranking by capacity + affinity.
"""
from __future__ import annotations

from musu_core.scheduler.capacity import MachineCapacity
from musu_core.scheduler.request import ResourceRequest


def score_machines(
    capacities: list[MachineCapacity],
    request: ResourceRequest,
    pending_per_machine: dict[str, int] | None = None,
) -> list[tuple[MachineCapacity, float]]:
    """Score each capacity for `request`. Returns sorted desc by score.

    Args:
        capacities: pre-filtered list (call filter_machines first).
        request: the request to score for.
        pending_per_machine: optional {machine_id: pending_count}
            for queue-depth penalty. Empty/None disables that term.

    Score formula (higher better):
        base 100
        +50 if affinity.prefer_machine == machine.id
        +min(gpu_vram_free_gb, 10) * 2  -- up to +20
        + cpu_idle_pct / 2              -- up to +50
        - pending_count_on_this_machine * 5
    """
    prefer = request.affinity.prefer_machine
    pending = pending_per_machine or {}
    scored: list[tuple[MachineCapacity, float]] = []
    for cap in capacities:
        s = 100.0
        if prefer is not None and cap.machine_id == prefer:
            s += 50.0
        s += min(cap.gpu_vram_free_gb, 10.0) * 2.0
        s += cap.cpu_idle_pct / 2.0
        s -= pending.get(cap.machine_id, 0) * 5.0
        scored.append((cap, s))
    # Primary: score descending. Secondary: machine_id ascending for
    # deterministic tiebreaks across runs / processes / restarts.
    scored.sort(key=lambda x: (-x[1], x[0].machine_id))
    return scored
