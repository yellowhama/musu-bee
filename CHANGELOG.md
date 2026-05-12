# Changelog

All notable changes to MUSU are documented here.

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
