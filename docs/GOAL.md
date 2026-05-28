# GOAL — musu autonomous /loop source of truth

**Wiki ID**: wiki/485
**Created**: 2026-05-19
**Last reshape**: 2026-05-20 (V24-Rust-big-bang → R-fast/R-cleanup phased → 2026-05-20 evening pivot: single-machine first, R9 deferred per operator "이 기계에서 무수 다른기능-멀티기기 말고 다 되는지")
**Updates**: append-only revision history at bottom
**Owner**: autonomous /loop orchestrator (Claude Opus 4.7 1M context). Per user 2026-05-20: "니가 결정, 나는 고객임, 니가 사장임" — orchestrator is 사장 (decides closure), user is customer (rejection right + AS duty owed back).
**User**: emptyermind@gmail.com

This is the single source of truth for the autonomous /loop. Future Claude sessions read this first. Goals are **explicit + dated + measurable**. Section A is current cycle goal. Sections B–D are reference state (branch / gates / deferred).

**Current operating pointer (2026-05-29)**: the historical V24/V26 planning chain remains useful context, but the live beta-readiness state is now `1.15.0-rc.1`. Future sessions should start with `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_ROADMAP_2026_05_29.md` (wiki/518), `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`, and this file's revision history before resuming roadmap work.

---

## §A — Current cycle goal: V24-Rust-cleanup (panel-reshaped 2026-05-20)

### A.0 The decision (post-panel YELLOW reshape)

**Initial draft (REJECTED by Phase -1 panel YELLOW, 4 HIGH)**: "Big-bang Rust rewrite — Python 25k 통째로 Rust로. 4-6주. 동안 musu = down."

**Panel-reshaped (user accepted all 4 HIGH 2026-05-20)**: **Two-phase Rust cleanup release**.

- **R-fast (~2 weeks → JTBD ships)**: R0 + R1 (bridge module) + R2 (core module) + R7 (musu-bee wire) + R8 (4060Ti E2E) + R9 (5070Ti cross-machine). Rust auth + bridge live on both machines; land-os + vibecode-town companies registered; one cross-machine task routes. Python still alive at port 8071 serving control/indexer/writer behind Rust auth facade.
- **R-cleanup (~2-4 weeks parallel to operator dogfood)**: R3 (control module) → R4 (indexer module) → R5 (writer module) → R6 (installer rewrite) → R10 (Python deletion + final closure). Each step removes one Python service from facade.
- **End state identical to original big-bang**: Python fully deleted, all musu Rust. But JTBD ships day ~14, not day 28-42.

**WHY** (panel HIGH-1 + HIGH-2 acceptance):
1. User instruction "백엔드로 파이썬 쓰지 말라고" still load-bearing. Python ban applies to NEW code; existing Python tolerated behind Rust facade ONLY during R-cleanup window.
2. HIGH-1 Christensen: original big-bang inverted JTBD priority. R1+R2 subset is already incremental (7 endpoints, fresh schema, 10-20 tools) — language change doesn't make it big-bang.
3. HIGH-2 Taleb: 4-6 weeks single window = fragile (4060Ti hardware, Windows reinstall, rmcp/tantivy yank, GitHub outage, operator emergency all reset clock).
4. Thesis lock from SSOT_1PAGE_2026-04-09 holds: 4-layer (CoS / machines / companies / agents) on 4060Ti + 5070Ti.

**STACK** (panel MED-1 reshape): **single binary crate `musu-rs`** with internal modules (`bridge`, `core`, `control`, `indexer`, `writer`). NOT 5 separate crates. tokio + axum + sqlx (or rusqlite) base; per-module deps audited at R0 per MED-2. Saves ~28 subagent-phase invocations.

**VERSION** (panel HIGH-3 + LOW-1): **1.14.0** at V24 close, NOT 2.0.0. V24 is engineering cleanup with no Create dimension (no user-facing capability that exists *because of* Rust). 2.0.0 would oversell engineering work as strategic milestone.

**ACCEPTANCE METRIC** (panel HIGH-4, ungameable Goodhart firewall): §9.12 in wiki/490 — operator-attested text reply OR operator git commit in land-os/vibecode-town within 7 days of R10 confirming ≥3 named real tasks completed via musu. Orchestrator MAY NOT mark V24 §9.11 (GOAL.md §A complete) until §9.12 exists in wiki/500 closure HTML. Structurally ungameable: orchestrator cannot fake operator terminal history or git authorship signature.

**Reshape lock semantics** (panel MED-3 resolved by user 2026-05-20): "reshape 금지" covers ORCHESTRATOR-initiated mid-execution reshape proposals during R1-R10 only. Phase -1 panel HIGH findings DO trigger plan reshape (standard agent-team interpretation per MODE_Agent_Team.md). This reshape (panel-driven) is explicitly allowed; future orchestrator-initiated reshapes during execution are NOT.

### A.1 Day-2 acceptance (operator-defined + panel-strengthened)

**Acceptance bar = D (cross-machine) + §9.12 (operator-attested)**:
1. ✅ Installer succeeds end-to-end on 4060Ti from clean shell (R-fast end, ~day 14)
2. ✅ Installer succeeds on 5070Ti (R-fast end)
3. ✅ `F:\Aisaak\Projects\land-os` registered as musu company "land-os 개발팀"
4. ✅ `F:\Aisaak\Projects\vibecode-town` registered as musu company
5. ✅ `/api/nodes/add` mesh: both `nodes.toml` mention each other
6. ✅ Cross-machine task: one task delegated 4060Ti↔5070Ti; audit_log on receiving machine shows arrival; result returns
7. ✅ audit_log has ≥ 5 rows where `actor_ip != 'testclient'` (gameable per HIGH-4 — backstopped by §9.12)
8. ✅ V24 final closure HTML wiki/500 + qual eval committed
9. ✅ **§9.12 ungameable closure metric**: operator-attested text reply in V24 closure thread OR operator git commit in land-os/vibecode-town within 7 days of R10 confirming ≥3 named real tasks completed via musu. Reproducible from operator's own terminal history or git log. **Orchestrator MAY NOT mark V24 GOAL.md complete until §9.12 written by operator.** Structurally ungameable.

Closure decision shape:
- Items 1-8: orchestrator (사장) declares done per acceptance evidence.
- Item 9 (§9.12): operator-authored, not orchestrator-asserted. This is the Goodhart firewall.
- Until §9.12 exists, V24 stays "code shipped, acceptance pending" — not closed.

### A.1.1 Pivot 2026-05-20 evening: single-machine completeness before R9

**Trigger**: R8 PASS on 4060Ti (wiki/498c, commit `0d58f08`). Operator follow-up: "이 기계에서 무수 다른기능-멀티기기 말고 다 되는지. 자동 업데이트 기능 깉은 편의성 기능 있는지". Probe found musu-rs surface is bridge + DB + auth + audit + dedup + company CRUD only; every other Python endpoint (`/api/system/update`, `/api/agents`, `/api/instructions`, `/api/briefing`, `/api/sse`, `/api/wiki/*`, `/api/workflows`, `/api/templates`, `/api/system/backup`, `/api/system/restart`) returns 502 because Python facade target is gone after `~/.musu` delete.

**Reorder** (sequence change, NOT scope change — same R-cleanup sub-WS set):
- **OLD**: R3 (control/MCP) → R4 (indexer) → R5 (writer) → R6 (installer) → R9 (cross-machine) → R10 (Python delete)
- **NEW**: **R5 (writer) → R6 (installer + auto-update + supervisor) → R3 (control/MCP) → R4 (indexer)** → R9 → R10

**Why R5 first**: writer-stub currently inserts `route_executions` row + tries facade POST to dead Python = `python_unreachable`. This is the load-bearing endpoint for any agent task; without native writer, every `/api/companies/{id}/run` is a stub. Highest single-machine impact.

**Why R6 second**: no supervisor + no auto-update + no service registration = operator must keep a bash window open to run musu. R6 brings systemd/Windows-service equivalent + `git pull` auto-update path. This is what the operator literally asked about ("자동 업데이트 기능 깉은 편의성 기능 있는지").

**Why R9 deferred**: cross-machine is multi-machine by definition; operator explicitly carved it out for this cycle's focus. R9 task still in §A.2 table, status moved to "deferred (post single-machine completeness)".

**R-cleanup sequencing budget**: R5 (~1500 LOC) → R6 (~600 LOC) → R3 (~1500 LOC) → R4 (~1500 LOC). Solo-operator review bottleneck per panel H5: strict sequence, no parallel. Each sub-WS = Phase 0 Researcher → Phase 1 Planner → Phase 1.5 Critic (MED risk) → Phase 3 Builder → Phase 5 Auditor → Phase 7 Scribe HTML closure → Const VII per-push.

**§9.12 unchanged**: still locked to V24 closure (wiki/500) post-R10. Single-machine reorder does not affect Goodhart firewall.

### A.2 Sub-WS (panel-reshaped, R-fast → R-cleanup phases)

Detail per-WS plans live in wiki/491..500 reservations. Phase -1 strategic gate on master plan (wiki/490) ran 2026-05-20: verdict YELLOW, 4 HIGH accepted, plan reshaped per §A.0 above. Per-sub-WS Phase 1.5 Critic still required for HIGH/MED sub-WS.

**Workspace** (panel MED-1): single binary crate `musu-rs/` with internal modules. NOT 5 separate crates.

```
musu-rs/Cargo.toml      (single workspace)
musu-rs/src/main.rs     (subcommand dispatch)
musu-rs/src/bridge/     (R1)
musu-rs/src/core/       (R2)
musu-rs/src/control/    (R3)
musu-rs/src/indexer/    (R4)
musu-rs/src/writer/     (R5)
```

**R-fast (~2 weeks → JTBD ships at R9 end)** — strict sequence, no parallel:

| Sub-WS | Wiki | Module | Scope | Risk |
|---|---|---|---|---|
| V24-R0 | wiki/490 | — | This reshape commit + workspace bootstrap + Phase 0 audit of musu-supervisor/ + musu-port/ (MED-2) + dependency-audit doc | — |
| V24-R1 | wiki/491 | `bridge` | tokio+axum, 7 endpoints, bearer auth, **+ Python-facade reverse-proxy** for control/indexer/writer/wiki paths → localhost:8071 | HIGH |
| V24-R2 | wiki/492 | `core` | SQLite schema v1 (fresh, no migration) + companies.yaml loader | HIGH |
| V24-R7 | wiki/497 | — | musu-bee TS wire-up (BRIDGE_URL + endpoint paths) | LOW |
| V24-R8 | wiki/498 | — | 4060Ti E2E: install + register land-os + vibecode-town; Python still on port 8071 behind facade | MED |
| V24-R9 | wiki/499 | — | 5070Ti install + cross-machine task. **JTBD ships at end of R9** (~day 14). Operator starts dogfooding. | MED |

**R-cleanup (~2-4 weeks parallel to operator dogfood)** — strict sequence, each removes one Python service from facade. **Sequence reordered 2026-05-20 evening per §A.1.1 pivot**: R5 first (writer = highest single-machine impact), then R6 (installer + auto-update = operator-asked ergonomic gap), then R3/R4. R9 deferred until single-machine complete.

| Sub-WS | Wiki | Module | Scope | Risk | Order |
|---|---|---|---|---|---|
| V24-R5 | wiki/495 | `writer` | Agent task execution + SSE; replace writer-stub Python forward in `/api/companies/{id}/run` with native execution. Integrate `musu-supervisor-isolation-{linux,windows,macos}` crates. | MED | 1st |
| V24-R6 | wiki/496 | — | Installer rewrite (single-binary, no facade, no Python) + **auto-update path** (`git pull` + rebuild + service restart) + **service supervisor** (systemd unit + Windows Service + auto-restart) | MED | 2nd |
| V24-R3 | wiki/493 | `control` | MCP server stdio JSON-RPC (~10-20 tools subset); remove /api/control/* from facade | MED | 3rd |
| V24-R4 | wiki/494 | `indexer` | Per-company indexing (tantivy or FTS5); remove /api/indexer/* from facade | MED | 4th |
| V24-R9 | wiki/499 | — | 5070Ti install + cross-machine task. **Deferred** post single-machine completeness (R5+R6+R3+R4 done) per operator carve-out 2026-05-20 evening. | MED | 5th (deferred) |
| V24-R10 | wiki/500 | — | MANUAL GATE: Python `rm -rf` + closure HTML + **CHANGELOG 1.14.0** + §9.12 wait | — | 6th |

**Total Rust LOC estimate**: ~10,200 (vs 25,885 Python). Subagent-phase count: 7 chains (R7 compressed), saving ~28 invocations vs 5-crate split.

### A.3 Hard constraints (cycle-level invariants)

1. **No new SaaS dep** — [[feedback-self-contained-product]]. Rust crates from crates.io only; no fly/AWS/Vercel/etc.
2. **No Python** — [[feedback-no-python]]. New code Rust only. Shell scripts (install.sh) OK. Existing 25k Python = deprecate target, no new endpoints/handlers/migrations added to it.
3. **No K8s/Argo/CRD/Operator pattern** — [[feedback-no-yagni-architecture]]. Single binary + tokio async. No Kubernetes runtime at musu scale (4060Ti + 5070Ti, 4 companies max).
4. **No new schema migrations on existing Python codebase** — schema v37 is the last Python-side schema. Rust port designs fresh schema (semver reset for SQLite migrations to v1).
5. **Reshape lock ON** — orchestrator does not propose scope reshapes during V24 execution without explicit user request.
6. **Scribe HTML closure** — [[feedback-scribe-html-only]]. Per-sub-WS closure markdown; final wiki/500 HTML.
7. **Critic per sub-WS** — V24-R1 + V24-R2 + V24-R3 + V24-R5 + V24-R8 + V24-R9 (≥MED risk) require `system-architect` Critic per [[feedback-plan-stage-auditor]]. LOW-risk skips.
8. **Dual audit for V24-R1 + V24-R6** — auth-touching endpoints + installer (one-way blast radius via service registration).

### A.4 Operator gates (where /loop pauses)

Per [[feedback-autonomous-loop]]:

| Gate | Status | Action |
|---|---|---|
| **Phase -1 RED verdict** | not yet evaluated | If RED, HALT V24 until user decision |
| **Const VII main-merge** | PENDING (#436) | Orthogonal to V24; /loop continues on v23/phase4-rust or new v24/main-rust branch |
| **Const III schema apply** | will fire on R2 | New SQLite schema apply on operator machine = manual gate |
| **Production deploy** | N/A (single-operator) | — |
| **Irreversible destructive op** | wiki/500 Python deletion | Manual gate before `rm -rf musu-bridge/ musu-core/ musu-control/ musu-indexer/ musu-writer/` |

### A.5 What does NOT change

- musu thesis (SSOT_1PAGE 2026-04-09, 4-layer CoS/machines/companies/agents) — locked, not under review
- musu-bee (TS/React frontend) — keep, only adjust endpoints
- musu-relay-gateway Rust crate (V23.1 T1.8) — keep, integrate
- musu-supervisor-isolation-{linux,windows,macos} Rust crates (V21.D) — keep, integrate
- Operator hardware: 4060Ti + 5070Ti (multi-machine reality, locked since 5b8b103 2026-04-07)
- `INSTALL.md` / `QUICKSTART.md` / `ONBOARDING.md` — keep as templates, rewrite content for Rust bridge in V24-R6

### A.6 Supersedes

- **V23.6-minimal (prior §A)** — superseded. W2 direnv + W4 LESSONS_LEARNED were operator hygiene tasks; V24 makes operator hygiene moot until the install path actually runs. Re-evaluate post-V24 if still relevant.
- **V24-Python plan (deleted 2026-05-20)** — was extending Python violation. Replaced with V24-Rust-big-bang.

---

## §A-prior (ARCHIVED) — V23.6-minimal (superseded 2026-05-20 by V24-Rust-big-bang)

### A.0 v2 amend (2026-05-19): scope cut from 5 sub-WS to 2

Per `business-panel-experts` adversarial critique of wiki/471 v1 + W5 RED verdict from V23.6 Phase −1 strategic gate, V23.6 scope is cut to **operator hygiene only**:

**Ship**: W2 direnv pattern + `.envrc.example` (~40 LOC, doc + operator hygiene) + W4 LESSONS_LEARNED.md seed (~30 LOC, doc). Total ~70 LOC.

**Paused** (all V23.7+ pending entry conditions): W1 mitmproxy wiretap, W3 uv migration, W5 litellm (RED verdict).

**Entry conditions for V23.6 master plan Phase −1 spawn** (ALL three required):
1. Operator clears #436 (V23.3 + V23.4 + V23.5 → main) OR explicitly confirms #436 batching policy (deliberate vs accidental)
2. **~~≥1 V23.5 product-outcome telemetry signal exists~~ → DATA RETURNED 2026-05-19 v3: ZERO.** Ground-truth: `audit.db` 601 rows = 100% pytest `testclient`, `/api/wiki/*` + briefing paths = 0 hits ever; `telemetry.db` install_attempt + nat_pierce + agent_spawn = 0 rows ever. **Revised condition: operator decides what to do with the zero-usage finding** — either (a) accept "V23.5 was a capability investment, no runtime expected yet, V23.6 proceeds anyway", (b) "stop adding surface until V23.5 features are actually exercised once" (panel-aligned default), or (c) "build the runtime that would consume V23.5 surface first, before V23.6 hygiene work" (deepest change).
3. Operator reviews ≥3 V23.5 sub-WS Builder diffs end-to-end (still pending — no signal exists that this has happened)

Rationale: panel H5 (parallelism doesn't help solo operator) + M5 (#436 4-cycle backlog) + H2 (V23.5 product outcome) — H2 now confirmed empirically zero, not unknown. The remaining question is not "is V23.5 used" (answer: no) but "given that V23.5 is not used, what does V23.6 do."

### A.1 In-scope (v2)

**V23.6-minimal**: 2 sub-WS only (W2 + W4). All other candidates from wiki/484 deferred to V23.7+ pending entry conditions in §A.0.

| Wave | Sub-WS | Source | LOC | Risk | Why this wave |
|---|---|---|---|---|---|
| 1 | **V23.6-W2** direnv pattern + `.envrc.example` | wiki/484 #2 (5-step #1) | ~40 + doc | LOW | operator hygiene; no musu code change; `.env.example` is starting point |
| 1 | **V23.6-W4** LESSONS_LEARNED.md seed | wiki/484 #5 ("lessons.md") | ~30 + 5 seeds | LOW | 2AM-debugging running journal; distinct from MEMORY.md (per-type) + qual eval (post-mortem) |
| 2 | **V23.6 final closure (HTML wiki/486) + qual eval (wiki/487)** | per [[feedback-scribe-html-only]] | — | — | Const VII per-push automated; main-merge stays operator-pending. |

**Total**: ~70 LOC + closure. Estimated 1-2 /loop iterations.

**Phase chain for V23.6-minimal (compressed)**:
1. Operator clears 3 entry conditions in §A.0 (this is the only gate; no autonomous bypass)
2. Cut `v23/phase5` branch off `main` (or continue on `v23/phase4`)
3. Phase −1 strategic gate: SKIP — scope is operator hygiene only, no thesis extension, no new SaaS dep, no new code surface
4. Phase 1 Planner: minimal wiki/485 (V23.6-minimal master plan, ~1 page)
5. Phase 1.5 Critic: SKIP per `[[feedback-plan-stage-auditor]]` (LOC <500, no thesis extension)
6. Phase 3 Builder × 2 (W2 + W4 sequential — solo operator review-friendly per panel H5)
7. Phase 7 Scribe: wiki/486 HTML closure + wiki/487 qual eval
8. Const VII push gate per commit

**Paused** (V23.7+ pending entry conditions in §A.0):
- V23.6-W1 mitmproxy wiretap (wiki/484 #1) — was MED risk, deferred
- V23.6-W3 uv migration musu-bridge (wiki/484 #4) — was LOW risk, deferred
- V23.6-W5 litellm in front of `cos_briefing_agent` (wiki/484 #3) — Phase −1 RED verdict locked 2026-05-19

### A.2 Out-of-scope (firewalled to V23.7+)

| Item | Source | Why deferred |
|---|---|---|
| **inspect-ai eval suite** (wiki/484 #6) | 5-step #5 EVALS | HIGH risk; needs Phase −1 mini-gate validating [[feedback-no-yagni-architecture]] ("pytest + Playwright 부족 입증 필수") |
| **AutoAgent meta-agent harness** (wiki/484 #7) | Karpathy auto-research + Kevin Goo AutoAgent | HIGH+ research-tier. Prerequisites: inspect-ai shipped + 60d behavior metric + invariant lock + LLM budget cap. Stress points in wiki/484 §3.7. |
| 10 V23.6 scope firewall items (wiki/469) | V23.5 W-8 closure | Wiki page editing UI, RAG auto-retrieval, agent session memory persistence, multi-tenant scope expansion, H-4b QUIC, T2-D-visual React Flow, C-3 Y-path promotion, Paperclip/OpenClaw observer, wiki page editing API, server-side render mode. All require new Phase −1 gate. |
| C-3 LLM synthesis promotion to default | wiki/479 + wiki/488 reserved | V23.7 gate: ≥40% click rate / 60d. V23.6-W5 litellm satisfies 2/4 preconditions; V23.7 picks up other 2 (caching policy + budget UI). |

### A.3 Success criteria

V23.6 cycle is DONE when:
1. ✅ wiki/485 V23.6 master plan exists with Phase −1 verdict + Critic findings resolved
2. ✅ 5 sub-WS shipped on branch (v23/phase5 or v23/phase4 continuation), each commit reference closure doc
3. ✅ All tests green per sub-WS: tsc + pytest + Playwright + jest baseline maintained (~217 V23.5 baseline + V23.6 additions)
4. ✅ wiki/486 final closure (HTML) + wiki/487 qual eval (MD) committed
5. ✅ CHANGELOG 1.14.0 entry finalized
6. ✅ Const VII per-push gate satisfied (each commit pushed)
7. ✅ This GOAL.md §A updated with V23.6 completion + V23.7 cycle goal set (or paused for operator decision)

### A.4 Hard constraints (cycle-level invariants)

1. **No new SaaS dependency** — [[feedback-self-contained-product]]. litellm (in-process), uv (in-process), direnv (operator hygiene), mitmproxy (dev mode only), LESSONS_LEARNED (doc) — all compliant.
2. **No YAGNI** — [[feedback-no-yagni-architecture]]. Each candidate's leverage proxy in wiki/484 §3 must hold or stop.
3. **Schema stable** — no new migrations (Const III not triggered). schema v37 is V23.6 baseline.
4. **Performance** — no Const VI experiment. LLM costs are opt-in user-paid (V23.5 C-3 hard constraints inherited).
5. **Branch hygiene** — operator main-merge optional acceleration. autonomous /loop continues on v23/phase4 if main-merge stays pending past 1 V23.6 wave.
6. **Scribe HTML** — [[feedback-scribe-html-only]]. Closure docs HTML; other phase docs Markdown.
7. **Plan-as-spec Auditor calibration** — [[feedback-plan-stage-auditor]]. Only fire if V23.6 master plan ≥500 LOC (current estimate ~330 → likely skip).
8. **Critic gate per non-trivial sub-WS** — V23.6-W5 litellm (MED risk) requires Critic. W1-W4 LOW risk → compressed Critic+Builder.

---

## §B — Branch + commit state (snapshot 2026-05-20, V24-Rust-cleanup start, panel-reshaped)

- **Active branch**: `v23/phase4` HEAD `b6896af` (GOAL.md V24-Rust-big-bang reshape commit) — to be branched into `v24/rust-cleanup` at V24-R0 start (renamed from `v24/rust-big-bang` per panel reshape)
- **Pushed to**: `origin/v23/phase4`
- **Cumulative LOC (Python, to be deleted at R10)**: 25,885 LOC across musu-bridge + musu-core + musu-control + musu-indexer + musu-writer (3,312 .py files verified)
- **Existing Rust workspaces (audit pending R0 per panel MED-2)**:
  - `musu-supervisor/` workspace (V21.D crates `musu-supervisor-core`, `musu-supervisor-isolation-{linux,windows,macos}`) — R5 integration target IF audit passes
  - `musu-port/` workspace — R9 NAT/punch-through fallback IF audit passes
- **CHANGELOG**: at 1.13.0 (V23.5 closed). V24-R0 will set **1.14.0-dev** (NOT 2.0.0 — panel HIGH-3 + LOW-1: V24 is engineering cleanup, no Create dimension).
- **VERSION**: 1.13.0-dev → 1.14.0-dev on V24-R0 commit

---

## §C — Operator gates (V24-Rust-big-bang scope)

Per [[feedback-autonomous-loop]]:

| Gate | Current status | Action |
|---|---|---|
| **Phase -1 strategic gate** | not yet evaluated | Next /loop iteration must spawn `business-panel-experts` debate on Rust big-bang thesis before V24-R0 plan body writes |
| **Const VII main-merge** | orthogonal to V24 | #436 still pending V23 backlog → main; /loop continues on `v24/rust-big-bang` branch independently |
| **Const III schema apply** | will fire on V24-R2 | New SQLite schema on operator machine = manual gate |
| **Const III Python schema rollback** | will fire on V24-R10 closure | Final Python deletion = manual gate (irreversible) |
| Production deploy | N/A (single-operator) | — |
| Irreversible destructive op | wiki/500 Python deletion | Manual gate before `rm -rf musu-bridge/ musu-core/ musu-control/ musu-indexer/ musu-writer/` |

**Phase -1 gate is next action.** /loop continues to plan + Phase -1 panel; only blocks if RED verdict.

---

## §D — Reference state (key wiki IDs)

| Wiki | Title | Status |
|---|---|---|
| wiki/431 | V23.4 Phase 4 master plan | shipped (Phase 4 closed) |
| wiki/447 | V23.4 Phase 4 final closure (HTML) | complete |
| wiki/448 | V23.4 Phase 4 qual eval | complete |
| wiki/459 v4 | V23.5 master plan | shipped (V23.5 closed) |
| wiki/460 | V23.5 implementation plan | shipped + extended with wiki/484 §9 candidates |
| wiki/469 | V23.5 W-8 closure (V23.6 firewall 10 items) | complete |
| wiki/470 | V23.5 final closure (HTML) | complete |
| wiki/471 | V23.5 qual eval | complete |
| wiki/479 | V23.7 promotion criterion (≥40% click rate / 60d) | doc-only, awaits 60d data |
| wiki/483 | H-4b QUIC mesh propagation | reserved (deferred V23.6/V23.7) |
| **wiki/484** | **V23.6 planning input — agentic 5-step + AutoAgent (7 candidates)** | complete; PRIMARY V23.6 input |
| **wiki/485** | **V23.6 master plan** | **TO BE WRITTEN** |
| wiki/486 | V23.6 final closure (HTML) | reserved |
| wiki/487 | V23.6 qual eval | reserved |
| wiki/488 | V23.7 Y-path promotion gate | reserved (V23.7 strategic gate) |

---

## §E — Loop heartbeat decision tree

Per `~/.claude/MODE_Agent_Team.md` /loop decision tree, evaluate in order:

1. **block-on-user?** → operator gate active (e.g., #436) OR Phase −1 RED verdict awaiting decision → emit gate prompt, halt
2. **regression?** → prior deploy invariants broken (V23.5 tests fail, /health degraded) → spawn `root-cause-analyst`, drop other work
3. **audit-fix open?** → HIGH finding from last audit unresolved → Builder
4. **post-build, no audit?** → commits since last audit → Auditor
5. **post-plan, critic done, no build?** → Builder (sub-WS V23.6-W1..W5)
6. **plan drafted, critic unrun?** → Critic (system-architect)
7. **new sub-task in cleared master?** → Researcher + Explore parallel, then Plan
8. **NEW master plan / thesis extension?** → Phase −1 strategic gate FIRST

### Current state evaluation (2026-05-20 — V24-Rust-big-bang start)

- Step 1: NO operator gate active (Phase -1 not yet run; not RED). #436 orthogonal.
- Step 8: **NEW master plan** → Phase -1 strategic gate FIRES. Next action: `EnterPlanMode` for V24 master plan (wiki/490) body draft + `business-panel-experts` debate on Rust big-bang thesis.

**Next /loop iteration goal**: enter plan mode → draft wiki/490 body (sub-WS table, sequence, acceptance, Const gates predicted) → spawn Phase -1 panel (Christensen + Taleb + Kim&Mauborgne + Drucker, debate mode) → record verdict in wiki/490 §0 → if GREEN/YELLOW proceed to V24-R0 commit, if RED HALT.

---

## §F — Revision history

| Date | Change | Reason |
|---|---|---|
| 2026-05-19 v1 | Initial GOAL.md created, V23.6 cycle defined | User request "야 골설정 제대로 해서 /loop으로 만들어"; covers scope 1+2 (V23.6 master plan entry + sub-WS impl); dynamic cadence; project-root location |
| 2026-05-19 v2 | §A scope cut: 5 sub-WS → 2 (V23.6-minimal: W2+W4 only). §A.0 added with 3 entry conditions. §E decision tree current-state recalibrated. | Post-`business-panel-experts` adversarial critique of wiki/471 V23.5 qual eval v1 (4-expert unanimous AMEND verdict: 5 HIGH + 6 MED). W5 RED verdict from V23.6 Phase −1 strategic gate absorbed. Scope cut directly addresses panel H5 (parallelism vs solo-operator review bandwidth) + M5 (#436 4-cycle backlog) + H2 (V23.5 product-outcome unmeasured). User approved Option 1 ("amend + W5 결정 같이"). |
| 2026-05-20 v3 | §A FULL RESHAPE: V23.6-minimal → V24-Rust-big-bang. §A archived as §A-prior. §B branch state pivoted to v24/rust-big-bang. §C operator gates rescoped to Rust install + Python deletion. §E next action = Phase -1 panel. | User explosion 2026-05-20 on discovering musu-bridge 25,885 LOC Python = 6 weeks of [[feedback-no-python]] violation. User locked Rust backend + α big-bang approach (4-6 weeks down time). Day-2 acceptance defined: land-os + vibecode-town companies cross-machine on 4060Ti↔5070Ti. Reshape lock ON per user "reshape 금지". |
| 2026-05-20 v4 | §A PANEL-RESHAPE: V24-Rust-big-bang → V24-Rust-cleanup (R-fast + R-cleanup phasing). Version 2.0.0 → 1.14.0. Added §9.12 ungameable operator-attested closure metric. Single-binary `musu-rs` workspace (not 5 crates). Reshape lock semantics resolved (panel HIGH OK; orchestrator drift not OK). Branch renamed v24/rust-big-bang → v24/rust-cleanup. | Phase -1 `business-panel-experts` debate returned YELLOW with 4 HIGH + 3 MED + 1 LOW. User accepted all 4 HIGH reshapes via AskUserQuestion 2026-05-20. HIGH-1 Christensen (JTBD priority inversion), HIGH-2 Taleb (4-6wk fragility window), HIGH-3 Kim&Mauborgne (no ERRC, 2.0.0 oversells), HIGH-4 Drucker (acceptance metric Goodhart-gameable by orchestrator). MED-3 governance contradiction resolved: reshape lock covers orchestrator drift, not panel HIGH. |
| 2026-05-27 v5 | Windows distribution pivot recorded: direct-download bootstrap remains the current operator path, but the intended Windows product direction is now Store/MSIX-ready packaged runtime. R6 output must not assume Task Scheduler + self-copy + self-update are the only Windows model. | Store/MSIX audit found the current Windows path is coherent for operator bootstrap but not for long-term product distribution. Product spec now records a dual-mode Windows runtime split (`direct-download` vs `store-msix`) and future Windows packaging work must honor package-managed install/update constraints. |
| 2026-05-27 v6 | Windows packaged path clarified into **three contracts**: direct-download bootstrap, local sideload / manual bridge, and Store-reviewed restricted-capability auto-start. Repo-local proof now closes the local/manual path; the Store auto-start path remains blocked only on Partner Center verification and Microsoft review. | Post-install and packaged-startup investigation showed local sideload cannot be truthfully sold as auto-start-ready. Product/docs/scripts were reshaped so local sideload is explicit manual bridge, while Store auto-start is a separate reviewed artifact and submission bundle. |
| 2026-05-29 v7 | `1.15.0-rc.1` beta-readiness state recorded. Single-machine Windows local loop is beta-ready via `musu up` + dashboard doctor + Claude task smoke; Store auto-start and full multi-machine remain separate tracks. | Live smoke verified dashboard `3001`, bridge `11041`, task output `MUSU_SMOKE_OK`. Current qualitative evaluation, code audit, and roadmap live in wiki/518. |
| 2026-05-29 v8 | Partner Center enrollment approval cleared by operator report; Store path moved from account-verification blocker to product-name/package-submission blocker. Existing 2026-05-27 `1.13.0.0` submission bundle must be regenerated for `1.15.0-rc.1` before upload. | User reported approval and supplied a cross-product launch note. Relevant Store/channel/promotion guidance was filtered into `STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md`; unrelated product names were not adopted. |
| 2026-05-29 v9 | `yellowhama/musu-system` assessed for future MUSU integration. Decision: high value, but integrate as adjacent MCP/CLI/tooling layer, not Rust-core merge or first Store bundle. | Local clone + `go test ./...` passed for `core`, `crawl-ai`, `marketer`, and `nurikun`. Report: `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`. |
| 2026-05-29 v10 | Single-machine smoke was converted into `scripts\windows\smoke-single-machine-beta.ps1` and passed live; multi-device runbook/script prepared as wiki/519. Release-grade desktop assessment clarified: runtime beta is credible, but Tauri GUI shell and Store package approval remain open gates. | Script smoke passed on dashboard `3000`, bridge `11041`, task `2d9e93b1-fb2f-4cd4-ab40-1147fea89a6d`, output `MUSU_SCRIPT_SMOKE_OK`, CLI route `MUSU_SCRIPT_CLI_OK`. Multi-device script: `scripts\windows\smoke-multidevice-beta.ps1`. |
| 2026-05-29 v11 | Current-version MSIX artifacts regenerated and verified for `1.15.0.0`; Store-reviewed submission bundle prepared. | local-sideload workflow passed packaged startup smoke with release `musu-startup.exe`; Store-reviewed manifest verified `ImmediateRegistration=true` + restricted startup capability. Bundle: `.local-build\msix\submission-bundles\store-reviewed-20260529-033609`. |
| 2026-05-29 v12 | Desktop release readiness audit added. Tauri metadata upgraded from scaffold values to `1.15.0-rc.1`, but public desktop release readiness remains false. | `scripts\windows\audit-desktop-release-readiness.ps1` reports runtime package ready=true, desktop shell ready=false, multi-device verified=false. Blocking: missing `frontendDist=../out`, build command does not emit static export, second-PC test pending. Report: `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md` (wiki/520). |
| 2026-05-29 v13 | Desktop shell and Store metadata basics are now locally ready; the repo-local desktop release audit still fails on real second-PC multi-device evidence. | `audit-desktop-release-readiness.ps1` reports runtime package ready=true, desktop shell ready=true, Store metadata checks pass, multi-device verified=false. `/privacy` and `/support` build and verify locally; live `musu.pro` still lacks expected new content. `write-release-go-no-go.ps1` now aggregates local/external blockers. |
| 2026-05-29 v14 | Release infrastructure CI/deploy workflows repaired for the current Rust/Next repo shape. | `test.yml` no longer references deleted Python dirs; `e2e-musu-bee.yml` no longer references deleted `musu-port`; deploy and web checks use Node 22+ for `node:sqlite`; GitHub JavaScript actions are forced onto Node 24 runtime; Linux Rust CI installs Wayland/PipeWire/GBM native dependencies; legacy likely-required check names are preserved; `npm run test:e2e:ci` verifies `/privacy` and `/support` Store metadata content. Public release still waits on green remote Actions, live `musu.pro` deployment, support mailbox, second-PC evidence, and Microsoft review. |
