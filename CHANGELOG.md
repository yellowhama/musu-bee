# Changelog

All notable changes to MUSU are documented here.

## [1.13.0] - 2026-05-19 — V23.5: HTML wiki memory + bridge hardening + CoS aggregation

Branch: `v23/phase4` (HEAD `c1a87b4`). Const VII main-merge gate
OPERATOR-PENDING (#436 — bundles V23.3 + V23.4 Tier-1 + V23.4 Phase 4 +
V23.5 → main in one operator action). Final closure: wiki/470
(`docs/V23_5_FINAL_CLOSURE_2026_05_19.html`); qualitative evaluation:
wiki/471 (`docs/V23_5_QUAL_EVAL_2026_05_19.md`). 18/18 sub-WS shipped,
~1900 LOC production code, ~217 new tests across jest / node:test /
pytest / Playwright. Master plan: wiki/459 v4
(`docs/V23_5_MASTER_PLAN_2026_05_19.md`); implementation plan: wiki/460
(`docs/V23_5_IMPL_PLAN_2026_05_19.md`).

Master plan v1 was rejected at Phase −1 strategic gate on Option Y
(LLM-default) thesis; reshape to Option Z hybrid (algorithmic CoS as
default, LLM synthesis as opt-in only) shipped per board panel SWOT
verdict 3Z+1X+0Y. 7th validation of `[[feedback-strategic-critic-gate]]`.
Plan-as-spec Auditor returned 4 NEW HIGH zero overlap with Critic's 9
HIGH on the v3 master plan body — 7th–8th validation of
`[[feedback-plan-stage-auditor]]` zero-overlap principle. Compressed
chain (Critic + Builder, no separate Auditor) used on 11 of 13
risk-bearing sub-WS; 2 inline audit-fix cycles (W-2, H-2); 16 of 18
sub-WS SHIP-OK first pass.

### Added — S (SSOT 4-layer)
- **S-1** (`21fe2b9`): SSOT_1PAGE 3-layer → 4-layer (Layer 0 = CoS above
  Layer 1 = machines) + VERSION 1.9.0 → 1.13.0-dev + CHANGELOG stub.

### Added — W (HTML wiki memory, agent-facing)
- **W-1** (`35951e9`): react-markdown + dompurify + rehype-sanitize
  dependency add + 12-vector XSS unit test. 14/14 cases green.
- **W-2** (`0c48117`): `WikiHtmlRender.tsx` — react-markdown + GFM +
  DOMPurify + `transformLinkUri` allowlist. XSS contract locked. 23/23
  cases green (+14 W-1 regression carry-forward).
- **W-3** (`3c52d50`): musu-bridge `GET /api/wiki/page/{id}/html` —
  server-side GFM render + scope-aware (`global` | `companies/{id}`) +
  503 fallback. 9/9 cases green.
- **W-4** (`46553cb`): musu-bee `/app/wiki/agent/{page_id}` page route +
  `agentWikiClient` + proxy (consumes W-2 / W-3 / W-5). 7/7 cases green.
- **W-5** (`cf4624e`): Tariq #14 reusable components — `TldrCard`,
  `SectionTabs`, `FaqDetails`, `SeverityBadge` + `wiki-explainer.css`
  shared stylesheet. 13/13 cases green.
- **W-6** (`1b617ac`): Tier-1 12-doc ingest script + filesystem
  precondition test. 5/5 cases green. Doc count expanded 4 → 12 per
  Phase −1 F2 finding ("wedge demonstration").
- **W-7** (`7452fc1`): Playwright e2e — 10 doc render + 5 XSS contract +
  404 + 503 fallback. 17 cases green.
- **W-8** (`c1a87b4`): V23.6 scope firewall (10 items) + 4 agent
  instruction tweaks (`cto.md`, `marketing_strategist.md`,
  `analytics_lead.md`, `content_creator.md`) + W-8 closure HTML
  (wiki/469).

### Added — H (musu-bridge hardening)
- **H-1** (`605395c`): handler error opacity — 4 fail-open sites add
  structured `logger.error` calls. Critic C12 fail-open invariant
  preserved. 15/15 cases green.
- **H-2** (`b0af954`): uniform DB-write try/catch (4 sites) + agent-route
  client fallback patch + kill-switch. Auditor A1 `bridge_error`
  preserve. 21/21 cases green.
- **H-3** (`7144453`): `/health/ready` PRAGMA `user_version` check +
  `apply_pending` atomic write. Critic C4 fix (no new schema column —
  PRAGMA is built-in). 19/19 cases green.
- **H-4a** (`edc7b61`): X-Request-ID HTTP mesh propagation (feature flag
  default OFF; ~95% of mesh traffic). QUIC propagation split to H-4b
  deferred V23.6 (wiki/483 reserved). 6/6 cases green.
- **H-5** (`16d869a`): error classification structured logs (5 sites).
  H-1 fail-open invariant preserved. 27/27 cases green.

### Added — C (CoS briefing aggregation)
- **C-1** (`9d32bc5`): `api_company_briefing` `recent_wiki_pages` field
  — filesystem scan (24h window, 5-entry cap, mtime-sorted). No new DB
  table per `[[feedback-no-yagni-architecture]]`. 11/11 cases green.
- **C-2** (`2a9b578`): `ProjectBriefing` UI section + "📝 Get AI
  synthesis" stub button (disabled unless `MUSU_USER_LLM_API_KEY`
  configured). 8/8 cases green.
- **C-3** (`822b236`): LLM CoS synthesis opt-in path Y — 4 hard
  constraints enforced in code: (a) graceful degrade to algorithmic
  default on LLM failure, (b) explicit `MUSU_USER_LLM_API_KEY` env var
  required, (c) per-session cost-preview confirmation hook, (d) no
  phone-home telemetry (local `cos_synthesis_ok` / `cos_synthesis_failed`
  structured logs only). Phase −1 mini-gate PASS. 12/12 cases green.
- **C-4** (`f63269d`): Y-path failure-mode tests (10 cases) + C-2 wiring
  + V23.7 promotion criterion doc (wiki/479; ≥40% click rate over 60-day
  rolling window). 10/10 cases green.

### Changed
- `VERSION`: 1.9.0 → 1.13.0
- `SSOT_1PAGE.md`: 3-layer → 4-layer (Layer 0 = CoS briefing aggregation
  layer above Layer 1 = machines).
- Four agent instruction files (`cto.md`, `marketing_strategist.md`,
  `analytics_lead.md`, `content_creator.md`) now point to
  `/app/wiki/agent/{page_id}` as cross-machine memory channel.

### Constitution gates
- **Const III** (schema apply): **NOT triggered** — H-3 uses SQLite
  built-in `PRAGMA user_version`; no new column, no migration.
- **Const VI** (experiment / SLA): **NOT triggered** — no new performance
  SLA; C-1 filesystem scan bounded; C-3 LLM latency owned by user's API
  provider.
- **Const VII** (push): **per-push satisfied** — 18 commits pushed under
  autonomous `/loop` per `[[feedback-autonomous-loop]]`. Main-merge
  bundle gate (#436) operator-pending (bundles V23.3 + V23.4 Tier-1 +
  V23.4 Phase 4 + V23.5).

### Deferred to V23.6+
- 10 V23.6 firewall items pinned at wiki/469 §2: HTML wiki page editing
  UI, RAG auto-retrieval, agent session memory persistence, multi-tenant
  scope expansion, H-4b QUIC propagation, T2-D-visual React Flow editor,
  C-3 Y-path default-on promotion, Paperclip / OpenClaw observer
  integration, wiki page editing API, server-side render mode promotion.
- V23.7 LLM-default promotion gate: wiki/479 (≥40% click rate over 60d
  rolling window from local structured logs).

---

## [1.12.0] - 2026-05-19 — V23.4 Phase 4: asyncio+SQLite workflow runner + Fleet view + fly.io retirement + form-based workflow builder + residual cleanup

Branch: `v23/phase4` (HEAD `b6a1548`). Const VII main-merge gate
OPERATOR-PENDING (#436 — bundles V23.3 + V23.4 Tier-1 + V23.4 Phase 4 →
`main` in one operator action). Final closure: `docs/V23_4_PHASE4_FINAL_CLOSURE_2026_05_19.html`
(wiki/447); qualitative evaluation: `docs/V23_4_PHASE4_QUAL_EVAL_2026_05_19.md`
(wiki/448). 5 sub-workstreams shipped (T2-A' + T2-F + T2-C + T2-D-mini +
T2-Z) + 3 audit-fix iterations; 751 pytest green (+29 from 722 baseline),
tsc clean, Playwright e2e green, vocabulary-audit lint clean, pwsh AST
clean.

Plan v1 was RED at the Phase −1 strategic gate (business-panel-experts
debate mode: Christensen + Taleb + Kim&Mauborgne + Drucker). All 4
frameworks convergent on RED. Reshape eliminated K3s+Argo+CRD+Go-operator
(~2500 LOC of platform-engineering infra inside personal-productivity-tool
positioning), retired fly.io entirely, introduced T2-A' (asyncio+SQLite)
and T2-F (self-hosted signaling). 6th validation of
`[[feedback-strategic-critic-gate]]` — tech-only Critics structurally
cannot ask "should this exist".

### Added — T2-A' asyncio + SQLite workflow runner (wiki/436)
- **SQLite schema v37** adds `workflows` + `workflow_steps` tables to
  musu-core migrations (`migrations.py:1446` `_v37_up` / `:1509` `_v37_down`).
  Reversible via standard musu-core migrator. Const III gate triggered;
  operator runs wiki/432 §4.1 5-step checklist at first production deploy.
- **`musu-bridge/workflow_routes.py`** (NEW, 359 LOC): 13 Pydantic models
  + 7 FastAPI routes — POST/GET/PATCH/DELETE `/api/workflows`, GET
  `/api/workflows/[id]/status`, POST `/api/workflows/[id]/retry`. JSON
  workflow-spec shape (not CRD), validated by Pydantic with named
  `@model_validator` methods per concern (`_check_edges_reference_existing_agents`,
  `_check_no_cycles`, `_check_inputs_reference_declared_outputs`).
- **`musu-bridge/workflow_executor.py`** (NEW, 458 LOC): asyncio loop +
  crash recovery + peer-crash sweeper (60s cadence, 7200s timeout) +
  TOCTOU-safe step claim via `UPDATE ... WHERE status='pending' AND
  assigned_pc=? RETURNING id`. Cross-PC dispatch over existing WebRTC
  channel (post-T2-F).
- **`musu-bridge/handlers.py`** (+453 LOC): 9 new handler functions
  with inline Critic-ID docstrings, terminal-transition aggregation
  atomicity (`with db.cursor() as cur:` block prevents non-atomic
  step+workflow status update race).
- **`musu-bridge/server.py`** (+28 LOC): lifespan spawn of `workflow_task`
  + `peer_sweeper_task`; router mount.
- Tests: T1-T27 + T7-split + T22b (29 cases) cover Pydantic validation,
  HTTP status mapping, executor TOCTOU, crash recovery, peer sweeper,
  env-var binding, terminal PATCH error handling. 722 baseline → 751
  final.

### Added — T2-F fly.io retirement + self-hosted signaling (wiki/437)
- **musu-relay signaling refactored** into 3 files: `shared.ts` (412 LOC
  signaling logic) + `user-server.ts` (82 LOC user-PC rendezvous entry)
  + `server.ts` (existing cloud entry, slimmed 475 → ~150 LOC).
- **First-installed PC plays signaling rendezvous role** (static
  assignment in v1; dynamic election deferred V23.5).
  `installer/install-wsl2.ps1` sets `$script:IsRendezvous` and starts
  `musu-signaling` service inside WSL2 distro.
- **STUN-only public-server fallback** (`stun:stun.l.google.com:19302`)
  for direct-WebRTC-fails cases. Self-hosted TURN deferred V23.5 if
  needed.
- **`installer/scripts/start-rendezvous.sh`** (NEW, 33 LOC): rendezvous
  startup wrapper.
- **`installer/musu-init.sh`** diagnostic enhancements (audit-fix `c59499e`):
  build-pipeline OQ3 + musu-init diagnostic + F12 fix.

### Added — T2-C Fleet view UI (wiki/438)
- **musu-bee `/fleet` route** (`src/app/fleet/page.tsx`, 709 LOC):
  multi-company multi-agent capacity heat-map. Lists user's PCs with
  status + agent count.
- **`/dashboard` → `/fleet` 301-redirect** via `src/middleware.ts`
  rule. `/dashboard/page.tsx` retained as 301-stub for 1 release cycle.
- **10-reference audit** updates sidebar / CommandPalette /
  ConsoleMobileTabBar / CeoChatClient to point at `/fleet` instead of
  `/dashboard`.
- **K8s-vocabulary lint**: `src/lib/vocabulary-audit.ts` (108 LOC) +
  `vocabulary-audit.test.ts` (87 LOC) — Jest unit catches K8s leakage
  (Pod / Deployment / Service / CRD / kubectl) into user-facing copy.
  Defense-in-depth; load-bearing dropped post-Phase −1 since K3s vocab
  surface shrunk dramatically.

### Added — T2-D-mini form-based workflow builder (wiki/439)
- **`/c/[id]/workflows` list page** + **`/c/[id]/workflows/[wfId]/edit`
  editor page** (musu-bee, ~870 LOC across page.tsx +
  WorkflowFormClient + StepRow + RunPanel).
- **Form-based step editor** (no graph canvas): steps list with
  `depends_on` multi-select. React Flow visual editor deferred V23.6,
  gated on closed-beta dogfood feedback.
- **`musu-bee/src/lib/workflow-spec.ts`** (126 LOC): encode form state
  → JSON workflow-spec, decode JSON → form state. T2-A' API contract
  compliance via Pydantic round-trip test.
- **API proxies**: `src/app/api/workflows/route.ts` +
  `src/app/api/workflows/[id]/status/route.ts` (gateway → bridge).
- **Audit-fix `e4ff17a`**: A1 missing GET endpoint + A2 Playwright
  mock URL pattern.
- Tests: 13/13 workflow-spec unit + 22/22 backend pytest + 1/1
  Playwright e2e + 5/5 vocabulary-lint patterns.

### Added — T2-Z Z4b bench-windows.ps1 (wiki/443)
- **`musu-relay/installer/bench-windows.ps1`** (NEW, 172 LOC):
  Windows-host-side peer to in-cluster `bridge-bench.sh`. Measures
  WSL2 vEthernet latency + netsh portproxy DNAT overhead + rendezvous-role
  detection timing. Schema `musu-bench-windows-v1` mirrors
  `musu-bridge-bench-v2` field naming. Top-level `payload_sha256` over
  rendered JSON.

### Changed

- **Default `MUSU_BACKEND_TAR` build trims K3s airgap-images** to
  required core (T2-Z Z6a, wiki/445). Allowlist regex
  `(mirrored-pause|mirrored-coredns-coredns|mirrored-library-traefik|local-path-provisioner)`
  (case-insensitive). Drops `metrics-server`, `helm-controller`,
  `klipper-helm`, `klipper-lb`, `coreos-etcd`, `flannelcni-flannel`
  (~40-60 MB savings). **Opt-out**: `MUSU_KEEP_FULL_AIRGAP=1`.
- **`install_attempt` sweeper exposes
  `install_attempt_sweeper_disabled` flag on `/health`** (T2-Z Z1a,
  wiki/440). When `MUSU_INSTALL_ATTEMPT_SWEEPER_DISABLED=1` short-circuits
  the sweeper, emit `console.warn` once + surface state in `/health` JSON
  so probes can detect the hatch externally.
- **`bridge-bench.sh` emits full §5.6 schema** (T2-Z Z4a, wiki/443):
  schema `musu-bridge-bench-v2` adds `aggregate.rss_kb`,
  `aggregate.cold_start_ms[]`, `metadata` (K3s/kernel/cgroup-driver),
  top-level `payload_sha256`. v1 fields preserved at same paths;
  `schema_v1_compat: true` flag asserts compatibility.
- **`musu-bridge/Dockerfile` apt cleanup** (T2-Z Z2a, wiki/441): added
  `rm -rf /var/cache/apt/archives /var/cache/apt/*.bin` to apt cleanup
  RUN. Digest pin deferred V23.5 (plumbing belongs in `manifest.yaml`
  alongside K3s + airgap digests).
- **`install-wsl2.ps1` Step 11.5 WSL2 portproxy fallback** (T2-Z Z2b,
  wiki/441): rendezvous role only; `netsh interface portproxy add v4tov4
  listenport=9900` to DNAT `:9900` to the WSL2 distro IP.

### Deprecated

- **fly.io self-hosted relay deployment**. T2-F retired in favor of
  WebRTC self-hosted signaling on user's first installed PC. Files
  removed: `musu-relay/Dockerfile`, `musu-relay/fly.toml`,
  `musu-relay/railway.json`, `musu-relay/tsconfig.docker.json`.

### Removed

- N/A (deletions tracked under Deprecated above)

### Fixed

- **GIT_SHA / BUILD_TS OCI label derivation timing** (T2-Z Z1b, wiki/440):
  `build-musu-backend.sh` step 3.d invoked `buildah build --build-arg
  GIT_SHA="${GIT_SHA:-unknown}"` BEFORE step 6.c derived the variables;
  every musu-bridge OCI image had `org.opencontainers.image.revision=unknown`.
  Derivation moved to new step 3.c.1.
- **`bench-windows.ps1` `$Host` parameter shadow** (T2-Z audit-fix
  `b6a1548`): PowerShell automatic variable conflict — every invocation
  failed. Renamed parameter. AST parse alone could not catch (runtime
  smoke required).
- **K3s airgap-images trim regex** (T2-Z audit-fix `b6a1548`): the
  prior regex `(^|/)(pause|coredns|traefik|local-path-provisioner)(:|@|$)`
  did NOT match K3s upstream `rancher/mirrored-*` prefixes for
  pause/coredns/traefik; only `local-path-provisioner` matched, leaving
  K3s unbootable. Corrected to
  `(mirrored-pause|mirrored-coredns-coredns|mirrored-library-traefik|local-path-provisioner)`
  (case-insensitive). 4 kept / 7 dropped verified against representative
  K3s 1.30.x manifest refs.
- **install-attempt sweeper test signal preservation** (T2-Z audit-fix
  `b6a1548`): adding the `/health` flag changed the signal shape jest
  tests asserted; signal preserved post-flag-addition.

### Security

- N/A

### Process

- **Phase −1 strategic gate** (`MODE_Agent_Team.md`) first production
  use: 1 RED verdict on wiki/431 v1 → reshape → GREEN. 6th validation
  of `[[feedback-strategic-critic-gate]]`. Permanent adoption confirmed
  for all master plans + thesis-extension sub-WSs.
- **Plan-as-spec Auditor zero-overlap with Critic** validated 6th-7th
  times across Phase 4 (T2-A' A-H1 + A-H2 zero overlap with Critic's 5
  HIGH; T2-D-mini skip at ~500 LOC subsequently verified by real-code
  Auditor catching only real-code bugs). `[[feedback-plan-stage-auditor]]`
  memory stands; 500 LOC threshold confirmed via T2-D-mini calibration.
- **HTML closure docs** (`[[feedback-scribe-html-only]]`): wiki/439
  (T2-D-mini) + wiki/447 (final closure) both HTML. Single self-contained
  file with light+dark theming via `prefers-color-scheme`, expandable
  sections, inline SVG diagrams. All other agent-team phases stay
  Markdown to preserve LLM↔LLM handoff diff/line-citation.
- **`docs/PLAN_TEMPLATE_HEALTH_VERIFICATION_2026_05_19.md`** (NEW,
  T2-Z Z6c / wiki/445): process doc for Planner pre-freeze checklist —
  identify every observability surface the new code exposes/modifies
  (`/health`, `/metrics`, structured log events, install-attempt
  telemetry shape) and verify emit matches Auditor probe target.
  Project-scoped (not user-scoped).

### Deferred to V23.5/V23.6

- **T2-D-visual** React Flow editor (~1100 LOC) → V23.6, gated on
  closed-beta dogfood feedback. Closed-beta acceptance gate §9 #9
  (DAG creation + run + status view) satisfied by T2-D-mini form-based
  surface; visual editor optional.
- **FO-A1a-3 distroless chainguard pivot** → not committed.
  Reactivation gated on >10x replica scale OR concrete bookworm-slim
  CVE. Single-user / 4-companies / few-PCs operational scale doesn't
  justify multi-stage build complexity. See wiki/444.
- **4 bench/CLI items** (F-A1c-5/6/7/8): worker-sidecar bench scenario,
  `musu-health` CLI status command, in-toto attestation harness,
  installer-telemetry signal-loss audit → V23.5 (all require runtime
  artefacts that don't yet exist on disk). See wiki/442.
- **V23.5 master plan** (wiki/459 v4): Option Z hybrid (full-wedge ship
  per board panel) drafted on `v23/phase4`. Critic round-3 + plan-as-spec
  Auditor cleared. Blocked only by V23.4 main-merge.

### Operator-pending (gates Const VII main-merge)

- `fly secrets set MUSU_TELEMETRY_V42_AUTHORIZED=1` (last fly action
  before T2-F retirement deploys; inherited from V23.4 Tier-1).
- `fly deploy` + smoke 204/400/429 (last fly deploy before T2-F retires
  it).
- A1.c bench EXECUTION on Windows host (V23.3 baseline capture;
  inherited).
- Const VII main-merge gate "진행해" — bundle scope is
  V23.3 + V23.4-Tier-1 + V23.4-Phase4 → `main` in one operator
  action (#436).

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
