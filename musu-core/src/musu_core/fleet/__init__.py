"""Fleet layer — runtime capabilities and per-node state.

v18.A Phase 1 introduces the runtime capability model: each node reports
which agent/CLI runtimes (claude_cli, ollama, paperclip, ...) are installed,
their version, and health. The data model is inspired by Kubernetes
NodeCondition + Nomad fingerprints — status (presence) is kept separate
from health (works?) so dashboards can distinguish "missing" from "broken."

Phase 2 will persist these into SQLite (migration v27, table node_runtimes).
Phase 3 wires the bridge API + mesh peer fetch.
"""

from musu_core.fleet.runtimes import (
    KNOWN_RUNTIMES,
    RuntimeCapability,
    RuntimeHealth,
    RuntimeStatus,
    detect_all_runtimes,
)
from musu_core.fleet.store import RuntimeStore

__all__ = [
    "KNOWN_RUNTIMES",
    "RuntimeCapability",
    "RuntimeHealth",
    "RuntimeStatus",
    "RuntimeStore",
    "detect_all_runtimes",
]
