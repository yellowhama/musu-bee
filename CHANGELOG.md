# Changelog

All notable changes to MUSU are documented here.

## [1.11.0] - 2026-05-17 — V23.4 Tier-1: install_attempt retention sweeper + uniform DB-write error handling + installer state-file enrichment

Branch: `v22/gap-analysis` (HEAD `199595b`). Const VII main-merge gate
OPERATOR-PENDING (rolls into V23.3 main-merge bundle, or V23.4 separate
merge — operator decides at merge time). Closure: `docs/V23_4_TIER1_FINAL_CLOSURE_2026_05_17.md`
(wiki/429); qualitative evaluation: `docs/V23_4_TIER1_QUAL_EVAL_2026_05_17.md`
(wiki/430). 3 sub-workstreams (F-B2-1 dual-audit + F-B2-3 single-audit +
F-B2-2 one-page closure), 228/228 jest green, tsc clean, pwsh AST clean.

Closes all 3 V23.3 Auditor MEDIUMs accepted as V23.4 carry (wiki/391 §4
NEW-MED-1/2/3); remaining 17 wiki/396 §5 forward-pointers deferred to
V23.4 Tier-2+ or V23.5.

### Added — F-B2-1 install_attempt 30-day retention sweeper (wiki/406)
- **30-day retention** on `install_attempt` table via dedicated
  `setInterval`-based sweeper (1-hour cadence, **per-tick LIMIT 1000** to
  bound event-loop block). Closes cross-route DoS where unbounded
  install_attempt growth on shared `/data/telemetry.db` Fly volume
  exhausts disk and breaks HMAC-authed `/install`, `/nat_pierce`,
  `/agent_spawn` writes (single-IP attacker fills 1GB in <1 day).
- New exports in `musu-relay/src/signaling/telemetry.ts`:
  `_runInstallAttemptSweeperOnce()` (manual trigger, returns rows
  deleted), `_maybeStartInstallAttemptSweeper()` (production-only
  registration, idempotent), `_stopInstallAttemptSweeper()` (test
  cleanup).
- Safety hatch: `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` short-circuits
  registration. Test-env exempt (`NODE_ENV !== "production"`) to avoid
  jest hangs on dangling intervals.
- 2-class retention documented at `telemetry.ts:9` header (90-day v40
  tables vs 30-day install_attempt v42).
- Tests: T22 (>30-day deleted), T22b (LIMIT 1000 boundary with 1001
  rows — audit-fix1 commit `99e9c92`), T23 (<30-day preserved), T24a/b/c
  (timer registration paths).
- **Dual-audit SHIP-OK**: quality-engineer (deletion-correctness seed)
  + security-engineer (data-retention semantics + concurrent-write
  isolation seed). Different findings per auditor justified the dual
  treatment.

### Added — F-B2-3 uniform DB-write try/catch on 4 telemetry routes (wiki/408)
- `POST /install`, `/install_attempt`, `/nat_pierce`, `/agent_spawn` all
  wrap `_db.prepare(...).run(...)` in `try { ... } catch (err) { ... ; return; }`
  emitting `{error: "database write failed"}` JSON 500 + structured
  `console.error('[telemetry] /<route>: db write failed: ...')` log
  (Fly log aggregation grep-able).
- Load-bearing `return;` after each 500 prevents Express
  "Cannot set headers after they are sent" on the fallthrough to the
  204 success path.
- New test file `musu-relay/tests/telemetry-db-failure.test.ts` with 4
  cases (TDF-1..TDF-4) using selective-INSERT mock
  (`jest.spyOn(_db, "prepare").mockImplementation(sql => sql.includes("INSERT") ? throw : original(sql))`)
  + shared-secret auth fallthrough for HMAC routes.
- Single quality-engineer Auditor SHIP-OK first pass; no audit-fix
  needed. Regression scan returned 0 matches (no test relied on
  Express-default-handler HTML shape).
- Installer retry verified contract-change-invisible: zero status-code
  branching at installer/Musu-Common.psm1, src/gateway/client.ts,
  src/gateway/main.ts — 500 / 502 / network-error all retried
  identically.

### Added — F-B2-2 installer state file enrichment (wiki/407)
- `installer/install-wsl2.ps1` fresh-install `Save-MusuState` hashtable
  now persists `os_version` + `bios_vt` (probed at step 2 by
  `check-prereqs.ps1`) so the resume-path can recover them after the
  WSL-feature-enable reboot.
- Resume block restores into new `$script:OsVersionResumed` /
  `$script:BiosVtResumed` script-scoped vars; `_Invoke-MusuInstallAttemptTelemetry`
  helper relaxed with `elseif` fallback when `$script:PrereqResult` is
  null (PrereqResult not re-loaded on resume).
- All 3 sites use **two-level `PSObject.Properties` guard chain** to
  avoid `PropertyNotFoundException` under `Set-StrictMode -Version 3`
  (mirrors helper precedent at `install-wsl2.ps1:109-117`).
- Back-compat verified: V23.3-shape state files (no `os_version` /
  `bios_vt` keys) resume cleanly with empty strings under StrictMode 3.
- Acceptance: AST parse clean + 6-step synthetic state-file dry-run
  (V23.3-shape back-compat + V23.4-shape restore + Site C elseif
  fallback + PrereqResult precedence).

### Operator-pending (gates Const VII main-merge)
- (Inherited from V23.3) A1.c bench EXECUTION on Windows host.
- (Inherited from V23.3) B2 `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1`
  BEFORE `fly deploy`.
- (Inherited from V23.3) Fly deploy + curl smoke 204/400/429.
- Const VII main-merge gate (operator "진행해") — bundle scope
  (V23.3-only or V23.3+V23.4-Tier-1) is operator's call. F-B2-3
  contract change (HTML 500 → JSON 500) flagged in wiki/425 §4 C13;
  operator may opt to surface explicitly at merge time.

### V23.4 Tier-2+ deferred (forward-pointers)
- F-B2-4 conditional per-IP rate-limit (if Tier-1 retention isn't
  enough alone).
- F-A1c-1..10 bench tooling extensions.
- FO-A1a-1/4/5 image labels + airgap trim.
- F-B2-1-FOLLOW-1 (NEW-LOW): hatch observability for
  `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` — no log line / metric on
  short-circuit.
- 14 other wiki/396 §5 forward-pointers, all LOW or V23.5-horizon.

## [1.10.0] - 2026-05-17 — V23.3 K3s-pod bridge + reproducibility + cross-host telemetry

Branch: `v22/gap-analysis` (HEAD `8fb9e70`). Const VII main-merge gate
OPERATOR-PENDING. Closure: `docs/V23_3_FINAL_CLOSURE_2026_05_17.md`
(wiki/396); qualitative evaluation: `docs/V23_3_QUAL_EVAL_2026_05_17.md`
(wiki/397). 9 sub-workstreams, dual-audit SHIP-OK across all, 218/218
jest green, tsc clean.

### Added — Tier-A1 (K3s migration of musu-bridge)
- **A1.a (wiki/381)**: `musu-bridge` baked into musu-backend.tar as OCI
  image, loaded into K3s containerd cache at install time. Const VI
  reproducibility: outer-tar sha256 stable intra-hour on Alpine WSL2
  build host.
- **A1.b (wiki/383)**: K3s `Deployment`/`Service`/`Secret` manifest for
  musu-bridge with Pod-level SecurityContext, `account_key` mounted via
  `secretKeyRef` (key `MUSU_BRIDGE_TOKEN`), `automountServiceAccountToken:false`.
- **A1.c (wiki/385)**: `hostPort: 8070` added on K3s Pod for WSL2 distro
  eth0 surface; in-cluster benchmark harness (`installer/bridge-bench.sh`
  + `installer/bench-pod.yaml`) ready, bench EXECUTION operator-pending.

### Added — Tier-A2/A3 (signaling refactor)
- **A2 (wiki/387)**: `pcFactory` throw-stub replaced with `makeWrtcFactory()`
  in `musu-relay/src/gateway/main.ts`. Eager-load + fail-fast wired.
- **A3 (wiki/389)**: HMAC body-identity refactor — `src/gateway/telemetry-hmac.ts`
  helper landed; `client.ts:531-553` + `main.ts:97-114` call sites swapped
  to shared helper.

### Added — Tier-B (cross-cutting)
- **B2 (wiki/391)**: `POST /v1/telemetry/install_attempt` UNAUTH endpoint
  on musu-relay; schema v42 `install_attempt` table (env-gated by
  `MUSU_TELEMETRY_V42_AUTHORIZED=1` per Const III); in-memory token-bucket
  rate-limit per `(install_id, source_ip)`, LRU eviction at cap; `app.set("trust proxy", 1)`
  in `server.ts` so `req.ip` is real client IP; PowerShell `Send-MusuInstallAttempt`
  helper wired to 10 installer trigger sites with `-NoTelemetry` opt-out
  and `MUSU_INSTALL_ATTEMPT_DISABLED=1` env-var hatch.
- **B6 (wiki/393)**: `SOURCE_DATE_EPOCH`-based reproducible build of
  musu-backend.tar (`scripts/build-musu-backend.sh` + manifest pins).
  Const VI intra-hour byte-identity PASS.
- **B7 (wiki/394)**: `openrc-musu-gateway.conf` convergence — b4b drop-in
  conf deleted, canonical conf points at main.js.
- **B8 (wiki/395)**: `.gitattributes` LF enforcement repo-wide.

### Security
- **Auditor A NEW-MED-1 (audit-fix1 `ebf3445`)**: `OS_VERSION_RE` tightened
  from `/^[a-zA-Z0-9._\s()-]{1,128}$/` to `/^[a-zA-Z0-9. ()_-]{1,128}$/` —
  `\s` admitted `\n`/`\r`/`\t`, materially undermining stored-XSS/log-injection
  prevention intent on the attacker-controllable `os_version` field.

### Operator-pending (gates Const VII main-merge)
- A1.c bench EXECUTION on Windows host (`bridge-bench.sh 3`).
- B2 Const III: `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` BEFORE
  `fly deploy` (per wiki/391 §5.1 6-step workflow).
- Fly deploy + curl smoke (wiki/391 §6.2 204/400/429 cycle).
- Const VII main-merge gate (operator "진행해").

### V23.4 day-0 must-do
- **F-B2-1 (wiki/406 reserved)**: 30-day retention sweeper on `install_attempt`
  table — closes cross-route DoS vector (unbounded install_attempt growth
  exhausts `/data/telemetry.db` shared volume, breaking HMAC-authed
  `/install` writes). Single-IP attacker fills 1GB volume in <1 day.
  ~5 LOC fix.

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
