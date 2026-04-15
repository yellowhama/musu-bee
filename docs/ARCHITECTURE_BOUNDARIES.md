# MUSU Architecture Boundaries: Core / Worker / UI / Diagnostics

## 1. 4-Layer Responsibility Matrix

| Layer | Primary Responsibility | Key Modules | Forbidden Activity |
| :--- | :--- | :--- | :--- |
| **Core** | Orchestration, Policy, Metadata, State Management, Control Plane | `musu-core`, `musu-bridge`, `musu-port` | GPU inference, Heavy indexing, Direct LLM calls, Long-running subprocesses |
| **Worker** | Execution, Inference, Transformation, Indexing, Heavy Work | `musu-worker`, `musu-indexer`, `MUSU-AS-MCP` | Canonical state ownership, Cross-device policy enforcement |
| **UI** | Status Visualization, Read Surface, Sampled Interaction | `musu-bee`, `viewer` | Deep polling, Direct DB mutation (must use API), Heavy data processing |
| **Diagnostics** | On-demand Proof, Audit, Forensic Dumps | `scripts/`, `musu-supervisor` (monitoring part) | Always-on verbose logging, Blocking production performance |

## 2. Forbidden Runtime & Import Boundaries

### Core (musu-core / musu-port)
- **Forbidden Imports (Python/Rust)**: `torch`, `onnx`, `transformers`, `sentence_transformers`, `whisper`.
- **Forbidden Binaries**: `llama-cli`, `ffmpeg` (for conversion), `magick`.
- **Constraint**: Must remain < 100MB RAM in idle/normal state.

### UI (musu-bee)
- **Forbidden Pattern**: `setInterval` with < 1s frequency for data fetching.
- **Constraint**: No direct calls to `musu-worker` or `musu-portd` private execution endpoints. Must route through `musu-bridge` or `musu-bee`'s own API routes.

### Worker (musu-worker)
- **Forbidden Pattern**: Writing directly to Paperclip DB or root policy files.
- **Constraint**: Must communicate status via `heartbeat` or structured exit codes.

## 3. OS-Level Separation Principles

### Process Separation
- **Core services** (`musu-portd`, `musu-bridge`) must run as separate systemd units or background processes from **Worker services**.
- Workers should be able to restart or crash without taking down the Core orchestration.

### Resource Budgeting (cgroup/budget)
- **Core**: High priority, Low CPU/RAM limit.
- **Worker**: Low priority (nice), High CPU/RAM limit.

### Networking
- **Core**: Binds to management interfaces (localhost or Tailscale management IP).
- **Worker**: Binds to execution-specific ports, potentially restricted by local firewall.

## 4. Follow-up Enforcement Backlog

1. **Import Linter**: Add a CI step to fail if `musu-core` or `musu-port` imports heavy ML libraries.
2. **Runtime Metadata**: Add `is_heavy: true` flag to service registration so Core can warn if a heavy service is being collocated incorrectly.
3. **Heartbeat Hardening**: Enforce that workers must report their "workload pressure" to allow Core to shed load.
4. **Process Split**: Formally move LLM loading from `musu-port` (legacy) to dedicated `musu-worker` or `model-server` processes.

---
*Created by CTO — 2026-04-09*
