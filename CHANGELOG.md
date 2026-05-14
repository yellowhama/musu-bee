# Changelog

All notable changes to MUSU are documented here.

## [1.9.0] - 2026-05-14 — v19.C Internal Dispatch Hardening

Spec: `llm-wiki/specs/001-internal-dispatch-hardening/` (Spec Kit cycle).

### Added — P1 streaming
- **`BaseAdapter.execute_streaming(ctx, on_delta)`**: optional override
  for adapters with native token streaming. Default falls back to
  `execute()` and emits one terminal `on_delta(summary)` so existing
  adapters keep working without changes (FR-002).
- **`Router.route_streaming`**: streaming-aware sibling to `route`. No
  fallback chain — streaming runs use a single adapter attempt.
- **`heartbeat_run_events.event_type = 'message_delta'`**: per-token
  events flowing through the existing SSE stream.
- **SSE wake-up via `asyncio.Event`**: `record_event` signals the per-
  run event; SSE loop awaits with the 1s poll as upper bound. Cuts
  observed delta latency from up-to-1s to milliseconds in-process.
- **Streaming text rendering in CeoChatClient**: deltas concatenate
  into a live-filling text block above the technical log.

### Added — P2 approval
- **`run_approvals` table** (migration v29): per-request user sign-off
  rows with `pending/approved/declined` state machine.
- **`request_approval` callable** injected into `AdapterContext.extra`:
  adapters call `await ctx.extra["request_approval"](prompt)` to pause
  mid-run and wait for a yes/no decision.
- **`POST /api/dispatch/runs/{id}/approve`**: bridge endpoint resolving
  pending approvals. Idempotent (FR-007).
- **`ApprovalPromptCard` component**: inline yes/no buttons in chat
  stream. Free-text chat ("yes"/"응") is explicitly NOT interpreted as
  an approval response — only the buttons count.

### Added — P3 home_node routing
- **`agents.home_node` column** (migration v29): names which mesh node
  the agent runs on. NULL/empty preserves current single-machine
  behavior.
- **`musu_core.dispatch.forward.forward_wake_to_peer`**: POSTs the wake
  to the peer's bridge, opens SSE, relays events into the local run's
  timeline as `forwarded_event` rows. Mesh token auth piggybacks on
  v18.A (no new auth layer).
- **CeoChatClient `forwarded_event` unwrap**: single-level normalization
  so the UI treats forwarded events identically to local ones.

### Schema
- **Migration v29**: `run_approvals` table + `agents.home_node` column.
  PRAGMA-gated, idempotent, with `_v29_down` for rollback. Approved per
  Constitution III at 2026-05-14.

### Tests
- 5 streaming + 8 approval + 7 v29 migration + 7 approve endpoint
  + 5 home_node forwarding = **32 new tests**, all green.
- Regression-adjacent: 16 router tests still pass (`route_streaming`
  added without disturbing `route`), 5 heartbeat concurrency guard.

## [1.8.0] - 2026-05-07

### Added
- **`musu status`**: System dashboard — bridge/worker/agents/nodes/recent tasks at a glance
- **`musu update`**: One-command mesh-wide code update (git pull + restart all nodes)
- **CLI Help Overhaul**: Quick start guide, examples section, 13 commands listed
- **CI Pipeline**: `.github/workflows/test.yml` — Python 3.12 + pytest on push/PR
- **19 New Tests**: seed_agents (13), system_update (3), token_exchange (3)
- **docs/MONITORING.md**: Prometheus metrics, alert rules, log patterns
- **DB Auto-Cleanup**: 30-day route_executions/tombstones deleted on bridge startup
- **Graceful Shutdown**: SIGTERM waits up to 30s for active tasks (monotonic clock)
- **Enhanced `/health`**: version, worker status, active_tasks, db_size_mb, disk_free_pct

### Fixed
- `test_phase84_agent_retry`: assert non-empty instead of hardcoded agent name
- `test_dashboard_agents`: uuid prefix to avoid UNIQUE constraint
- `route_execution_tombstones` cleanup: use `tombstone_until` column (not `created_at`)
- Graceful shutdown: `time.monotonic()` instead of `time.time()` (clock-safe)
- `system_routes.py`: subprocess import at module level (mockable)
- `pytest.ini`: `--timeout=30` + `testpaths` for faster discovery

### Changed
- Rust CLI version: 1.5.1 → 1.8.0
- CLI error messages: actionable hints (bridge not running → systemctl, musu doctor)
- Doctor: bridge failure shows specific fix commands

## [1.7.0] - 2026-05-07

### Added
- **Zero-Config Setup**: `seed_agents.py` auto-detects CLI (claude/gemini/codex), sets model tiering, budget, and complete adapter_config presets
- **Mesh Auto-Update**: `POST /api/system/update-all` — git pull + restart on every node in the mesh, no SSH needed
- **Token Exchange**: `POST /api/nodes/accept-peer` — automatic token swap when adding nodes
- **Auto-Assignment**: Agents automatically registered in nodes.toml on seed and bridge startup
- **Worker Remote Access**: Worker binds `0.0.0.0` (was `127.0.0.1`) for cross-node access
- **Install Improvements**: `install.sh` auto-detects GPU/OS/Tailscale via `node_identity.py`, seeds agents with presets

### Fixed
- `--mcp-config '{}'` → `'{"mcpServers":{}}'` (Claude CLI requires valid schema)
- `--max-tokens` removed (Claude CLI doesn't support this flag)
- Duplicate node entries (`hughsecond`/`hugh-main`) cleaned up
- 12 agents missing `command`/`cwd` in adapter_config — auto-filled

### Changed
- `seed_agents.py`: now writes agent_assignments to nodes.toml
- `server.py` startup: auto-assigns all local agents + fixes mgr missing command
- Node manager agent created with full adapter_config (was missing command/cwd)

## [1.6.1] - 2026-05-06

### Added
- **X-Ray**: `musu xray ./repo` — full codebase analysis (security, complexity, deps, docs)
- **11/11 CLI Commands**: nodes, company, agent, setup, do, doctor, xray all working
- **Multi-Machine Routing**: Forward tasks between nodes via mesh_router
- **Agent Sync**: 30s interval agent pull from peer nodes
- **Release Pipeline**: GitHub Actions CI for 4 platforms (Linux/macOS/Windows + ARM)

### Fixed
- `musu do` first successful real work (cargo test diagnosis + fix)
- Dev token skip bug in mesh_router (all tokens now valid)
- Worker auto-start with bridge via `start-bridge.sh`

## [1.6.0] - 2026-05-05

### Added
- **Writer Studio template**: AI fiction production company template (lead/PM/researcher/writer/editor, 3x adapter fallback)
- **MCP Tools**: musu-ai-detector (3 tools) + musu-writer (23 tools)
- **Multi-Project**: config.toml based project bindings (one writer instance, many projects)
- **Token Optimization**: `_default_mcp_for_role()` policy, ~70% reduction per agent

## [1.5.0] - 2026-03-05

### Added
- Desktop app audit score: 95/100
- CI/CD: 2 workflows, 40+ smoke tests
- E2E: 199 tests (24 files) + Rust unit 220+
- Bundle size: 1,474 → 404KB (-72.6%)
- CSP enabled

## [1.0.0] - 2026-02-01

### Added
- Initial release: musu-bridge, musu-core, musu-worker, musu-control
- Agent orchestration with Claude/Gemini/Codex adapters
- Fallback chain (claude → gemini → codex)
- Circuit breaker per channel
- QA loop with scoring
- Sprint contract system
