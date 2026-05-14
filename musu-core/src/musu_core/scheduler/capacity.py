"""MachineCapacity — what the Machine controller (bridge) declares."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class MachineCapacity:
    machine_id: str
    gpu_models: list[str] = field(default_factory=list)
    gpu_vram_total_gb: float = 0.0
    gpu_vram_free_gb: float = 0.0
    cpu_cores: int = 0
    cpu_idle_pct: float = 0.0
    mem_total_gb: float = 0.0
    mem_free_gb: float = 0.0
    runtime_classes: list[str] = field(default_factory=list)
    status: str = "online"  # joined from machines.status

    @classmethod
    def from_db_row(cls, row: Any, machine_status: str = "online") -> "MachineCapacity":
        return cls(
            machine_id=row["machine_id"],
            gpu_models=json.loads(row["gpu_models_json"] or "[]"),
            gpu_vram_total_gb=float(row["gpu_vram_total_gb"]),
            gpu_vram_free_gb=float(row["gpu_vram_free_gb"]),
            cpu_cores=int(row["cpu_cores"]),
            cpu_idle_pct=float(row["cpu_idle_pct"]),
            mem_total_gb=float(row["mem_total_gb"]),
            mem_free_gb=float(row["mem_free_gb"]),
            runtime_classes=json.loads(row["runtime_classes_json"] or "[]"),
            status=machine_status,
        )

    def upsert(self, db) -> None:
        """INSERT or REPLACE — bridges call from heartbeat."""
        db.execute(
            "INSERT OR REPLACE INTO machine_capacity"
            "(machine_id, gpu_models_json, gpu_vram_total_gb, gpu_vram_free_gb, "
            " cpu_cores, cpu_idle_pct, mem_total_gb, mem_free_gb, "
            " runtime_classes_json, last_heartbeat_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "
            "        strftime('%Y-%m-%dT%H:%M:%fZ','now'),"
            "        strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
            (
                self.machine_id,
                json.dumps(self.gpu_models),
                self.gpu_vram_total_gb,
                self.gpu_vram_free_gb,
                self.cpu_cores,
                self.cpu_idle_pct,
                self.mem_total_gb,
                self.mem_free_gb,
                json.dumps(self.runtime_classes),
            ),
        )


def load_all_capacities(db) -> list[MachineCapacity]:
    """Read all machine_capacity rows joined with machines.status."""
    rows = db.execute(
        "SELECT mc.*, m.status AS machine_status "
        "FROM machine_capacity mc "
        "JOIN machines m ON m.id = mc.machine_id"
    )
    return [
        MachineCapacity.from_db_row(r, machine_status=r["machine_status"])
        for r in rows
    ]
