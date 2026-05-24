# Changelog

All notable changes to `musu-rs` will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.15.0] — 2026-05-23

V26 Distributed Actor Mesh — wiki/515

### Added

- **W1 OpenAI-compat adapter** (`adapter/openai_compat.rs`, `adapter/claude.rs`,
  `adapter/registry.rs`): Unified Ollama/vLLM/LmStudio + Claude adapter dispatch.
  Axum route auto-switches by model name prefix.
- **W7 `musu peer register` CLI** (`peer/register.rs`, `peer/capability.rs`,
  `peer/manifest.rs`, `peer/service.rs`): Worker registration with capability
  autodetect (Ollama HTTP probe, ComfyUI port, Script passthrough).
  Cross-platform service templates (systemd, LaunchAgent, Scheduled Task).
  Self-node manifest at `~/.musu/node.toml` with advisory file lock.
- **W12 Deadline middleware** (`bridge/middleware/deadline.rs`):
  `X-Musu-Deadline-Unix-Ms` header parsing + tokio `CancellationToken` propagation.
  50ms buffer for graceful shutdown. Schema v3: `cross_machine` column in `audit_log`.
- **W9 LLM DAG builder** (`workflow/workflow_spec.rs`,
  `workflow/llm_dag_builder.rs`, `bridge/handlers/workflow.rs`):
  Natural-language → workflow DAG JSON (single-pass, no human loop).
  §9.12 Goodhart firewall: `attestation_required = true` at type level.
  8 CRUD API handlers. Schema v4: `workflows` + `workflow_steps` tables.
- **W13 MCP HTTP+SSE server** (`control/http_server.rs`):
  JSON-RPC 2.0 dispatch over HTTP POST (`/mcp/v1/messages`).
  Same 14 tools as `musu control` stdio MCP. SSE heartbeat stream
  (`/mcp/v1/sse`). Health endpoint (`/mcp/v1/health`).
  Single-port 8070 merge via axum router. Bearer auth inherited.
- **W10 Registry hardening** (`peer/discovery.rs`):
  `CachedRegistry` (`~/.musu/nodes.cache.json`, TTL 7-day).
  `ManualPeerList` (`~/.musu/manual_peers.toml`).
  `resolve_all_peers()` — 3-source dedup peer resolver (cache > manual > nodes.toml).
  3-state mesh invariant: healthy / degraded (cached) / absent (manual only).
  `musu peer add <addr> [--name <name>]`, `musu peer remove <addr>`,
  `musu peer list` CLI commands.
- **Integration test suites**: `r7_peer_register.rs` (6),
  `r9_workflow_dag.rs` (14), `r10_registry.rs` (12),
  `r13_mcp_http.rs` (14). Total 46 integration + 190 lib = 236 tests.
- **Documentation**: `V26_MASTER_PLAN_2026_05_22.md`,
  `V26_W10_REGISTRY_INVARIANT.md`, `V26_CLOSURE_2026_05_23.html` (wiki/515).

### Changed

- `bridge/handlers/mod.rs`: Merged workflow and MCP routers into `native_router()`.
- `control/mod.rs`: Added `http_server` module declaration.
- `core/schema.rs`: Schema version 3→4 (added `cross_machine`, `workflows`,
  `workflow_steps`).
- `main.rs`: Added `Peer` CLI subcommand routing.
- `lib.rs`: Exported `peer`, `workflow` modules for integration test access.

### Security

- MCP HTTP endpoints inherit bridge Bearer token auth middleware.
- Loopback-only binding by default; `--mcp-bind-external` opt-in required for
  remote access.
- §9.12 Goodhart firewall enforced at type level — DAG execution requires
  operator attestation.

## [1.14.0] — 2026-05-20

V24 Rust Big-Bang — wiki/490

### Added

- Complete Rust rewrite: bridge, core, control, indexer, writer, installer.
- Python deprecation banners on all legacy endpoints.

## [1.13.0] — 2026-05-19

V23.5 — wiki/480

### Added

- Template engine SSOT enforcement.
- C4 promotion criterion automation.

---

_Older entries exist in the Python-era `musu-bee` repo history._
