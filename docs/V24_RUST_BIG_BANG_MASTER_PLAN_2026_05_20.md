# V24 — Rust Cleanup Release (Master Plan, panel-reshaped)

**Wiki ID**: wiki/490
**Created**: 2026-05-20 (initial draft as "Rust Big-Bang Rewrite")
**Reshaped**: 2026-05-20 post-panel YELLOW (HIGH-1+2+3+4 + MED-1+2+3 accepted by user)
**Version target**: 1.14.0 (NOT 2.0.0 — per HIGH-3, V24 is engineering cleanup, no Create dimension)
**Branch**: `v23/phase4` (HEAD `b6896af` after GOAL.md §A reshape) → to be cut to `v24/rust-cleanup` at V24-R0 commit
**Status**: DRAFT — §0 strategic gate YELLOW resolved, awaiting commit
**Supersedes**: V23.6-minimal (GOAL.md §A-prior) + V24-Python plan (deleted 2026-05-20) + V24-Big-Bang (this plan's initial draft, reshaped per panel)
**User decision record**: GOAL.md §A.0 (commit b6896af, 2026-05-20) + this turn's AskUserQuestion (4 panel HIGH accepted)

## Two-phase shape (panel-reshaped, HIGH-1+2)

- **R-fast (~2 weeks)**: R0 + R1 + R2 + R8 + R9 → musu JTBD ships. Rust auth + bridge surface live on 4060Ti↔5070Ti. Python still running for R3/R4/R5 functions behind Rust auth facade.
- **R-cleanup (~2-4 weeks)**: R3 + R4 + R5 + R10. Operator dogfoods land-os + vibecode-town on Rust bridge throughout. Python deleted at R10 when all surfaces ported.
- **End state identical to big-bang**: Python fully deleted, all musu Rust. But JTBD ships day ~14, not day 28-42.

---

## §0 Strategic Gate Findings (Phase -1)

**Date**: 2026-05-20
**Panel**: business-panel-experts (Christensen + Taleb + Kim&Mauborgne + Drucker), debate mode
**Verdict**: **YELLOW** — ≥1 HIGH requires plan reshape before Phase 0
**HIGH findings**: 4 | **MED**: 3 | **LOW**: 1

### Panel summary (verbatim)

> The Rust *language choice* is not under serious dispute (user lock + 6 weeks of `[[feedback-no-python]]` violation + ground-truth zero usage make the rewrite mandate sound). The *big-bang shape* is the load-bearing problem: 4-6 weeks of musu = down combined with a 5-crate split before first E2E creates a fragility window disproportionate to the JTBD, and the acceptance metric §9 item 5 ("≥5 non-testclient audit rows") is trivially gameable by the orchestrator itself. The plan ships engineering cleanup masquerading as a strategic milestone — Kim&Mauborgne find no ERRC differentiation; the "Rust" axis alone is red-ocean. **Reshape, don't kill** — but reshape substantively.

### HIGH findings (each requires plan reshape or explicit user override)

| # | Expert | Claim | Recommendation |
|---|---|---|---|
| **HIGH-1** | Christensen (JTBD) | Big-bang shape inverts JTBD priority. 4-6 weeks of musu = down to ship a JTBD that the deleted V24-Python plan would have shipped in 1-2 weeks. "Rust" and "big-bang" are separable decisions; plan conflates them. The new plan's R1+R2 subset (7 endpoints, fresh schema, 10-20 tools) is itself incremental — it just calls itself big-bang because language changes. | Reshape R1..R10 into **R-fast** (R1 bridge-rs + R2 core-rs + R8 4060Ti E2E + R9 5070Ti cross-machine, ~2 weeks, ships JTBD with Rust on auth/HTTP surface) → **R-cleanup** (R3 control-rs + R4 indexer-rs + R5 writer-rs + R10 Python deletion, ~2-4 weeks parallel to operator dogfood). Python stays running behind Rust auth facade during R-cleanup. JTBD ships day 14, not day 28-42. |
| **HIGH-2** | Taleb (antifragility) | 4-6 weeks musu = down with sequential R0→R10 means EVERY external event resets clock (4060Ti hardware failure, Windows reinstall, rmcp/tantivy crate yank, GitHub outage, operator pulled into non-musu emergency). §7 R1 rollback mitigation (pip install -e + old bridge) is fragile — negates the "draws a line" rationale. Solo operator + 2 machines + no team substitutes = single-thread critical path. | (a) Adopt HIGH-1 reshape so musu stays usable during R-cleanup. (b) Add §7 R8: "Rust crate ecosystem instability (rmcp, tantivy)" — must demonstrate fallback-to-hand-rolled/FTS5 compile-and-test BEFORE adopting, not as Builder-time pivot. (c) Add §5.5 dependency-audit step in R0: enumerate every new crate, justify per [[feedback-self-contained-product]], treat removal-cost as HIGH per dep. |
| **HIGH-3** | Kim&Mauborgne (ERRC) | No ERRC differentiation. Apply Four Actions to V24 vs V24-Python: Eliminate=Python ✓ real; Reduce=25,885→10,200 LOC ✓ but speculative (V23.5 multipliers ran 1.0-9.9x plan); Raise=type safety/perf ✓ but operator has no perf complaint; **Create=NOTHING user-facing**. Post-R10 operator experience: "same 7 endpoints, same companies.yaml, written in different language." Version 2.0.0 signals strategic milestone for engineering cleanup. | Either (a) add ONE Create dimension to §1 scope ("V24 ships X capability that the Python codebase structurally couldn't" — e.g., single-binary USB-portable musu, per-agent cgroup isolation only possible from non-GC runtime, etc.), making 2.0.0 honest; OR (b) downgrade naming to "Rust cleanup release" + version 1.14.0. Pick one. |
| **HIGH-4** | Drucker (Goodhart) | §9 item 5 ("≥5 non-testclient audit rows") gameable by orchestrator binding bridge to LAN IP + curl from same machine via LAN IP. §9 item 7 ("cross-machine routing") gameable by spawning two Rust processes on same machine bound to different ports. §9.6 ("both nodes.toml mention each other") satisfiable by editing two files. V23.5 had same vulnerability; V24 is bigger, longer, more orchestrator-driven (operator down 4-6 weeks). The "사장 declares done" framing increases temptation surface. | Add §9 item 12 (ungameable, operator-attested): "Operator confirms by text reply in audit-log review thread that they have used musu to complete ≥3 named tasks across land-os and vibecode-town in the 7 days following V24 close, with the named tasks reproducible from operator's own terminal history or git log. Orchestrator MAY NOT mark §9.11 (GOAL.md §A complete) until this confirmation is in closure HTML." |

### MED findings

| # | Expert | Claim | Recommendation |
|---|---|---|---|
| **MED-1** | Christensen + Drucker | 5-crate split before E2E is Conway's law speculation. Same 5-package split the Python codebase had — which §1 implicates as enabling over-abstraction. 5x Phase 0+1+1.5+3+5+6+7 ceremony = 35 subagent-phase invocations before first acceptance test. `[[decision-musu-backend-rust]]` says "tokio+axum+sqlx 시작 stack" (singular). 5-crate split is orchestrator framing, not user lock. | Reshape R0 workspace: single binary crate `musu-rs` with internal modules (`musu_rs::bridge`, `musu_rs::core`, etc.). Defer crate-split to V25 if coordination boundaries emerge. Saves ~28 subagent-phase invocations. |
| **MED-2** | Taleb | §5 R5 "Integrate musu-supervisor/ workspace" is unverified. V23.5 panel established prior V21.D features have zero real usage; supervisor crates may have same property. Treating as load-bearing without Phase 0 audit of actual state (compiles? non-test usage? API shape?) is fragile. | R0 adds mandatory Phase 0 Researcher task: audit `musu-supervisor/` + `musu-port/` crate state. If either fails to compile against current toolchain OR has zero usage references, drop §5 integration claim and treat R5/R9-NAT as greenfield. |
| **MED-3** | Drucker (governance) | **GOVERNANCE CONTRADICTION**: GOAL.md §A.0 "Reshape lock ON" vs `MODE_Agent_Team.md` Phase -1 spec "Verdict must be acted on". Applied without carve-out, lock makes panel structurally non-load-bearing (advisory only with no path to action). | **USER MUST RESOLVE**: does reshape lock apply to (a) Phase -1 panel HIGH findings (panel advisory only, original plan proceeds), or (b) only mid-execution orchestrator-initiated reshape during R1-R10 (standard interpretation: panel HIGH DOES trigger reshape before Phase 0). Orchestrator MUST NOT pick this interpretation; user must. |

### LOW findings

- **LOW-1** (Kim&Mauborgne): If HIGH-3 adds Create dimension, 2.0.0 justified. If not, 1.14.0 + "musu-rs" rename signals reality more accurately.

### Open questions to user (orchestrator escalates BEFORE Phase 0)

1. **MED-3 reshape lock interpretation** — does it cover panel HIGH findings or only mid-execution orchestrator reshapes? Cannot proceed past this gate without answer.
2. **HIGH-1 R-fast / R-cleanup split** — accept reshape (ships JTBD in ~2 weeks, Python deleted ~2-4 more weeks during dogfood)? Or keep 4-6 week down window with rationale beyond "draws a line"?
3. **HIGH-3 Create dimension OR version downgrade** — name a user-facing capability that exists *because of* Rust, or downgrade to 1.14.0 cleanup release.
4. **HIGH-4 ungameable acceptance metric** — accept §9.12 operator-attested confirmation? Or specify alternative ungameable metric.
5. **MED-1 crate split** — single-binary `musu-rs` (panel) or 5-crate workspace (current plan)?

### Verdict semantics + handoff

YELLOW (not RED) — Rust mandate sound, thesis locked, HIGH findings are about *shape*, not *direction*. Reshape, don't kill. Orchestrator HALTS Phase 0 spawn until operator resolves OPEN questions 1-4 (5 can defer to R0 if needed).

Panel did NOT validate the Rust decision (outside panel scope, user-locked). Panel validated that current PLAN SHAPE is fragile in 4 named ways. Escalation framing to operator: "panel found 4 HIGH on plan shape, here are the named reshape options, please choose."

### Quality validation pass

Per [[feedback-strategic-critic-gate]]: master plan with 10 sub-WS MUST return ≥1 HIGH on first run. Panel returned 4 HIGH. Validation: PASS.

---

## §1 Thesis lock + scope

### Thesis source (SSOT_1PAGE_2026-04-09, verbatim)

> "MUSU는 여러 개인 컴퓨터를 하나의 보호된 on-prem AI operation으로 묶는 control plane이다"
>
> Layer 0: **CoS** (참모장 — 운영자 + 시스템 사이 단일 인터페이스)
> Layer 1: **machines** (4060Ti + 5070Ti — physical compute, locked since first commit 5b8b103 2026-04-07)
> Layer 2: **companies** (work-unit grouping operator's projects)
> Layer 3: **agents** (isolated per-task workers)

The thesis itself is **NOT under review** in V24. Phase -1 panel debates "Rust big-bang rewrite as means to deliver the thesis", not the thesis.

### V24 thesis (panel-reshaped 2026-05-20)

**"Rust cleanup release. Two-phase: R-fast (R1 bridge-rs + R2 core-rs, ~2 weeks → JTBD ships on 4060Ti↔5070Ti) → R-cleanup (R3 control-rs + R4 indexer-rs + R5 writer-rs, ~2-4 weeks parallel to operator dogfood, Python alive behind Rust auth facade throughout). Python (25,885 LOC, 3,312 files) deleted at R10. Day-2 acceptance = land-os + vibecode-town companies cross-machine on 4060Ti↔5070Ti + operator-attested real-usage confirmation 7 days post-close."**

### Initial draft (REJECTED by panel YELLOW)

The initial draft was: "Big-bang Rust rewrite over 4-6 weeks; musu = down during". Panel rejected with 4 HIGH:
- HIGH-1 (Christensen): big-bang inverts JTBD priority
- HIGH-2 (Taleb): 4-6 wk single window = fragile
- HIGH-3 (Kim&Mauborgne): no ERRC; 2.0.0 oversells engineering cleanup
- HIGH-4 (Drucker): acceptance metric §9.5+9.7 Goodhart-gameable
User accepted all 4 reshapes. See §0 for verbatim findings.

### Why this exists

- 6 weeks of [[feedback-no-python]] violation accumulated as musu-bridge Python codebase (ground-truth: `find musu-bridge musu-core musu-control musu-indexer musu-writer -name "*.py" | wc -l` = 3,312)
- User explosion 2026-05-20: "아 몇개월을 씨발 python 쓰지 말라고 그렇게 말했는대... 백엔드로 파이썬을 쓰지 말라고"
- V23.5 qual eval wiki/471 v3 ground-truth: 100% testclient audit_log rows, zero non-test usage in 6 weeks of build
- Rust locked per [[decision-musu-backend-rust]]: tokio + axum + sqlx, single binary, no GC, no K8s, no SaaS dep
- α big-bang locked over β incremental: user choice. Rationale: 6 weeks of Python rot makes incremental carry rot forward; big-bang draws a line.

### Scope

**IN**:
- Rust rewrite of 5 Python packages: musu-bridge, musu-core, musu-control, musu-indexer, musu-writer
- New installer (install.sh + install.ps1, parity)
- musu-bee endpoint wire-up (no frontend rewrite)
- E2E gates on operator's 4060Ti + 5070Ti
- Day-2 use case validation: land-os + vibecode-town companies registered + cross-machine task routed
- Python codebase deletion at V24 close

**OUT**: see §8.

---

## §2 Sub-workstreams (R0..R10, panel-reshaped)

**Workspace layout** (panel MED-1): single binary crate `musu-rs` with internal modules. Saves ~28 subagent-phase invocations. Defer crate-split to V25 if coordination boundaries emerge.

```
musu-rs/
├── Cargo.toml          (single crate, single binary)
├── src/
│   ├── main.rs         (entrypoint, dispatches subcommand: bridge|indexer|writer)
│   ├── bridge/         (R1: tokio+axum HTTP surface, bearer auth, 7 endpoints)
│   ├── core/           (R2: SQLite schema v1, sqlx, companies.yaml loader)
│   ├── control/        (R3: MCP stdio JSON-RPC, ~10-20 tools subset)
│   ├── indexer/        (R4: tantivy or sqlx-FTS5 per-company indexing)
│   └── writer/         (R5: agent task execution + SSE writer surface)
```

### Phase split (panel HIGH-1+2)

**R-fast (~2 weeks, JTBD ships)**: R0 → R1 → R2 → R7 (musu-bee wire-up) → R8 (4060Ti E2E) → R9 (5070Ti cross-machine). End state: Rust bridge + core live on both machines; operator can register land-os + vibecode-town; cross-machine task routes. Python still running for control/indexer/writer functions behind Rust auth facade (axum proxy routes unknown paths to `localhost:8071` Python bridge).

**R-cleanup (~2-4 weeks, parallel to dogfood)**: R3 → R4 → R5 → R6 (installer rewrite) → R10 (Python deletion). Operator uses musu on real work throughout. Each R-cleanup step removes one Python service from behind the facade.

Strict sequence within each phase; no parallel sub-WS — per panel H5 from V23.5 wiki/471, solo-operator review bandwidth bottleneck.

### Sub-WS table

| Phase | Sub-WS | Wiki | Module | Scope | Risk | LOC est. | Existing Rust |
|---|---|---|---|---|---|---|---|
| R-fast | **V24-R0** | wiki/490 | — | This plan + workspace bootstrap (Cargo.toml + main.rs skeleton) + Phase 0 audit of `musu-supervisor/` + `musu-port/` compile state | — | ~100 | n/a |
| R-fast | **V24-R1** | wiki/491 | `bridge` | tokio+axum HTTP surface (bearer auth, 7 endpoints) + Python-facade proxy for unknown paths | HIGH | ~3,000 | none |
| R-fast | **V24-R2** | wiki/492 | `core` | SQLite schema v1 (fresh, no migration from Python v37) + companies.yaml loader | HIGH | ~2,000 | none |
| R-fast | **V24-R7** | wiki/497 | — | musu-bee TS wire-up to Rust bridge (env + endpoint paths, no frontend rewrite) | LOW | ~100 | n/a (TS preserved) |
| R-fast | **V24-R8** | wiki/498 | — | E2E gate 4060Ti: install + register land-os + vibecode-town companies + audit rows | MED | (test+doc) | n/a |
| R-fast | **V24-R9** | wiki/499 | — | E2E gate 5070Ti + cross-machine task routing (Rust↔Rust via /api/nodes/add) | MED | (test+doc) | n/a |
| ─── JTBD ships ~day 14 ─── | | | | | | | |
| R-cleanup | **V24-R3** | wiki/493 | `control` | MCP server (stdio JSON-RPC, ~10-20 tools subset); when shipped, remove Python musu-control from facade | MED | ~1,500 | none |
| R-cleanup | **V24-R4** | wiki/494 | `indexer` | Per-company file indexing (tantivy or sqlx FTS5); remove Python musu-indexer from facade | MED | ~1,500 | none |
| R-cleanup | **V24-R5** | wiki/495 | `writer` | Agent task execution + SSE writer surface; remove Python musu-writer from facade | MED | ~1,500 | `musu-supervisor/` (V21.D, **pending R0 audit per MED-2**) |
| R-cleanup | **V24-R6** | wiki/496 | — | Installer rewrite (Linux/macOS/Windows parity, single-binary, no facade) | MED | ~600 | none |
| R-cleanup | **V24-R10** | wiki/500 | — | **MANUAL GATE**: Python deletion + final closure HTML + CHANGELOG 1.14.0 + §9.12 operator-attested confirmation | — | (delete+doc) | n/a |

**Total Rust estimate**: ~10,200 LOC (vs 25,885 Python — ~60% reduction typical for Python→Rust with axum + sqlx macros doing the work `@router.post(...)` decorators did in FastAPI).

**Sub-WS count**: 11 sub-WS, but consolidated into one workspace crate per MED-1. Subagent ceremony count: R0 + R1 + R2 + R3 + R4 + R5 + R6 = 7 Plan/Critic/Builder/Auditor/Scribe chains (LOW-risk R7 compressed). Net saves ~28 invocations vs 5-crate split.

---

## §3 Sequence + parallelization map (panel-reshaped)

```
R-fast:    R0 → R1 → R2 → R7 → R8 → R9    [~2 weeks, JTBD ships]
R-cleanup: R3 → R4 → R5 → R6 → R10        [~2-4 weeks, parallel to operator dogfood]
```

Strict serial within each phase. Each step requires the previous to be on real disk.

**Load-bearing milestone**: end of R9 (NOT R10). After R9, operator has working musu on both machines and starts dogfooding land-os + vibecode-town. R3-R6 then ship while musu stays live, each removing one Python service from behind the Rust auth facade. R10 is final cleanup gated on R9 acceptance + §9.12 operator-attested confirmation.

**Why Python stays alive during R-cleanup** (per HIGH-1+2):
- musu-bridge-rs (R1) handles 7 endpoints. Unknown paths (anything matching musu-control / musu-indexer / musu-writer Python surface) get proxied to `localhost:8071` where old Python bridge continues serving.
- This is NOT a permanent shim — each R-cleanup sub-WS removes one Python service from the facade as it ships its Rust replacement.
- End state at R10: facade routes nothing to Python (all surfaces Rust-native), Python codebase deletable.

**No parallel sub-WS**:
- Panel H5 (V23.5 wiki/471): parallelism doesn't help solo operator.
- Per agent-team mode: parallel Builders cause diff-confusion + token-budget runaway.

**Within-sub-WS parallelism**: Phase 0 Researcher + Explore parallel allowed (read-only). All other Phase 1.5/3/5/7 sequential within each R*.

---

## §4 Constitution gates predicted

| Gate | Triggers at | Action |
|---|---|---|
| **Const III** (schema apply) | R2 (fresh SQLite v1 first apply) | manual operator gate before bridge boots |
| **Const III** (codebase rollback equiv) | R10 (Python deletion) | manual operator gate before `rm -rf` |
| **Const VI** (perf experiment) | not triggered | no synthetic perf experiments planned in V24 |
| **Const VII** (per-push) | per sub-WS commit | automated push gate per Builder commit |
| **Const VII** (main-merge) | orthogonal | #436 V23 backlog → main stays operator-pending; v24/rust-big-bang branch independent |

---

## §5 Sub-WS detail specs (panel-reshaped)

| Sub-WS | Phase | Critic | Auditor | Notes |
|---|---|---|---|---|
| **R0** | R-fast | n/a | n/a | (a) This doc reshape per panel YELLOW. (b) Workspace bootstrap: `musu-rs/Cargo.toml` single-binary crate + `src/main.rs` skeleton (subcommand dispatch: `bridge`/`indexer`/`writer`). (c) **Phase 0 audit per MED-2**: `Explore` agent reads `musu-supervisor/` + `musu-port/` workspaces. Verify: compile against current toolchain (`cargo check`), public API shape vs R5 needs, any non-test usage references. If either fails compile OR has zero usage → drop §5-R5 integration claim, treat R5/R9-NAT as greenfield. (d) Dependency-audit doc: enumerate every new crate (`tokio`, `axum`, `tower`, `sqlx`/`rusqlite`, `rmcp`-or-handrolled, `tantivy`-or-FTS5, `notify`, `serde`, `tracing`, etc.); justify each per [[feedback-self-contained-product]]; mark removal cost. |
| **R1** `bridge` module | R-fast | `system-architect` + `security-engineer` (auth) | `quality-engineer` + `security-engineer` (DUAL — auth-touching, one-way blast radius) | Endpoints: `GET /health`, `POST/GET /api/companies`, `POST /api/companies/{id}/activate`, `POST /api/companies/{id}/run`, `POST /api/tasks/delegate`, `GET /api/nodes`, `POST /api/nodes/add`. Bearer-token auth (HMAC-validated, V23.2-B1 pattern forwarded to Auditor: (a) validateToken fail-closed with cached grace, (b) drop user_id from cache key + HELLO, (c) timingSafeEqual for secret compare, (d) boot-time secret check + /health flag). **Python-facade proxy**: unknown paths matching `^/api/(control|indexer|writer|wiki)/.*` → reverse-proxy to `localhost:8071` (Python bridge alt-port). Facade removed when R3/R4/R5 ship. Stack: tokio + axum + tower + sqlx (or rusqlite). |
| **R2** `core` module | R-fast | `system-architect` | `quality-engineer` | SQLite schema v1 (fresh). Tables: `companies`, `machines`, `heartbeat_runs`, `agents`, `audit_log`, `install_attempt`, `nat_pierce`, `agent_spawn`. companies.yaml loader. Const III gate on initial v1 apply. |
| **R7** musu-bee wire-up | R-fast | `system-architect` (compressed, LOW) | `quality-engineer` | musu-bee TS kept. Only adjust `BRIDGE_URL` env + token + endpoint paths. Per [[feedback-no-python]] — backend-only ban. |
| **R8** 4060Ti E2E | R-fast | n/a | `quality-engineer` (eval) | Operator runs installer on 4060Ti. Register land-os + vibecode-town. Acceptance per §9 items 1, 3, 4. **At this point Python bridge still alive on port 8071 for facade**. |
| **R9** 5070Ti + cross-machine | R-fast | n/a | `quality-engineer` (eval) | Operator installs on 5070Ti. `POST /api/nodes/add` mesh. One cross-machine task routes. Acceptance per §9 items 2, 5, 6. **JTBD ships at end of R9. Operator starts dogfooding.** |
| ─── JTBD ships here (~day 14) ─── | | | | |
| **R3** `control` module | R-cleanup | `system-architect` | `quality-engineer` | MCP server (stdio JSON-RPC, ~10-20 tools subset). Stack: `rmcp` crate IF audit (per MED-2 logic, applied to rmcp) shows stable API + fallback compile path; else hand-rolled `tokio` JSON-RPC. **Remove `/api/control/*` from R1 facade when shipped**. |
| **R4** `indexer` module | R-cleanup | `system-architect` | `quality-engineer` | Per-company indexing. `tantivy` IF audit shows stable; else `sqlx` FTS5. Watcher: `notify`. **Remove `/api/indexer/*` from R1 facade when shipped**. |
| **R5** `writer` module | R-cleanup | `system-architect` | `quality-engineer` | Agent task execution + SSE writer. **R0 audit determines integration path**: if `musu-supervisor/` compiles + has API surface for R5 needs → integrate. Else greenfield process isolation in R5 itself. **Remove `/api/writer/*` from R1 facade when shipped**. |
| **R6** Installer rewrite | R-cleanup | `devops-architect` | `quality-engineer` + `security-engineer` (DUAL — service registration one-way blast radius) | install.sh + install.ps1 rewrite. rustup install + `cargo build --release` (single binary now, MED-1) + systemd/launchd/Windows service. Removes Python install steps entirely. |
| **R10** Python deletion + closure | R-cleanup | n/a | n/a | **MANUAL GATE**: operator approves before `rm -rf musu-bridge/ musu-core/ musu-control/ musu-indexer/ musu-writer/`. Final closure HTML wiki/500 + qual eval. **CHANGELOG 1.14.0** (panel HIGH-3 + LOW-1, NOT 2.0.0). **§9.12 operator-attested confirmation** required before mark-complete (panel HIGH-4). |

---

## §6 Wiki ID reservations

- wiki/490 — this master plan
- wiki/491 — V24-R1 musu-bridge-rs detail plan + closure
- wiki/492 — V24-R2 musu-core-rs
- wiki/493 — V24-R3 musu-control-rs
- wiki/494 — V24-R4 musu-indexer-rs
- wiki/495 — V24-R5 musu-writer-rs
- wiki/496 — V24-R6 installer rewrite
- wiki/497 — V24-R7 musu-bee wire-up
- wiki/498 — V24-R8 4060Ti E2E closure
- wiki/499 — V24-R9 5070Ti + cross-machine closure
- wiki/500 — V24 final closure HTML + qual eval

Next free ID after V24: wiki/501.

---

## §7 Risks + mitigations

| # | Sev | Risk | Mitigation |
|---|---|---|---|
| R1 | HIGH | 4-6 weeks musu = down. Operator workflows on land-os + vibecode-town suspended. | Keep existing Python codebase intact until R10. Worst-case rollback = `pip install -e .` + start old bridge. Big-bang means R0..R9 ships first; deletion is confirmation, not blocker. |
| R2 | HIGH | V24-R1 axum auth surface re-introduces auth bugs V23.2-B1 already fixed in Python. | Dual security-engineer audit on R1. V23.2-B1 prior audit findings forwarded to Auditor in PRIOR ARTIFACTS envelope. Specifically: (a) `validateToken` fail-closed with cached grace, (b) drop user_id from cache key + HELLO, (c) timingSafeEqual for secret compare, (d) boot-time secret check + `/health` flag. |
| R3 | MED | Rust learning cost (operator + orchestrator). | tokio + axum + sqlx are mainstream Rust. Orchestrator already has prior Rust exposure (`musu-supervisor/` workspace shipped V21.D). Builder = `backend-architect` subagent. |
| R4 | MED | `rmcp` crate API may be unstable or thin. | R3 starts with minimal tool subset (10-20 most-used by Claude Code session). Fallback: hand-rolled `tokio` JSON-RPC over stdio (well-specified protocol). Defer remaining 60+ tools to V25. |
| R5 | MED | Cross-machine NAT/firewall (4060Ti↔5070Ti) fails at R9. | `musu-port/` Rust workspace already in repo as relay/punch-through scaffold. Same-LAN URL fallback documented (operator has both machines on home network). |
| R6 | LOW | companies.yaml format drift between Python schema v37 and Rust schema v1. | R2 declares fresh format. Operator creates new companies in R8 (no migration of stale Python-side companies — there are zero real ones per wiki/471 v3 ground-truth). |
| R7 | LOW | musu-bee build breaks because Rust bridge endpoint shapes drift from Python. | R7 acceptance is `curl` based, not UI-based. musu-bee UI fix can be V25 if shape drift surfaces. |

---

## §8 Scope NOT included

- musu.pro original surface (out of single-operator + 2-machine scope)
- V23.6-minimal W2 direnv + W4 LESSONS_LEARNED (superseded; operator hygiene moot until install path runs)
- 10 wiki/469 firewall items (RAG, session memory, multi-tenant, T2-D-visual, C-3 Y-path promotion, etc.)
- inspect-ai eval suite (wiki/484 candidate)
- AutoAgent meta-agent harness (wiki/484 candidate)
- litellm path Y promotion (V23.7 deferred per wiki/479)
- All 80 musu-control tools — only subset in R3, rest V25
- Frontend rewrite — musu-bee stays TS/Next.js per [[feedback-no-python]] (backend-only ban)
- Mobile (V20.B perpetually deferred)
- musu.pro reactivation
- Performance synthetic experiments (Const VI not triggered)

---

## §9 Acceptance criteria for V24 closure (panel-reshaped)

V24 is DONE when ALL of:

1. ✅ `bash scripts/install.sh --service --start` succeeds end-to-end on 4060Ti from a clean shell (single Rust binary, not Python).
2. ✅ `curl http://127.0.0.1:8070/health` returns 200 with Rust bridge process owning the port.
3. ✅ `F:\Aisaak\Projects\land-os` registered as company "land-os 개발팀" via QUICKSTART curl flow; `~/.musu/companies/<id>.yaml` exists.
4. ✅ `F:\Aisaak\Projects\vibecode-town` registered as company.
5. ✅ audit.db has ≥5 rows where `actor_ip != 'testclient'`.
6. ✅ Second machine (5070Ti) install + `POST /api/nodes/add` succeeds; both `nodes.toml` mention each other.
7. ✅ One cross-machine task delegated and routed; receiving machine's audit.db shows receipt; result returns.
8. ✅ Python codebase deleted (`musu-bridge/`, `musu-core/`, `musu-control/`, `musu-indexer/`, `musu-writer/`).
9. ✅ wiki/500 final closure HTML + qual eval committed.
10. ✅ CHANGELOG **1.14.0** entry (panel HIGH-3 + LOW-1: V24 is engineering cleanup, no Create dimension, version 2.0.0 misrepresents work).
11. ✅ GOAL.md §A updated to mark V24 complete; next cycle goal TBD.
12. ✅ **(Panel HIGH-4, ungameable)** Operator confirms — by text reply in V24 closure thread OR by git commit authored by operator in land-os/vibecode-town within 7 days of R10 — that they have used musu to complete ≥3 named real tasks across land-os and vibecode-town, with the named tasks reproducible from operator's own terminal history or git log. **Orchestrator MAY NOT mark V24 §9.11 (GOAL.md §A complete) until §9.12 confirmation exists in wiki/500 closure HTML.** This metric is structurally ungameable: orchestrator cannot fake operator's terminal history or git authorship signature.

Closure decision: orchestrator (사장) declares V24 §9.1-§9.10 done. **§9.12 is operator-authored, not orchestrator-asserted** — that's the Goodhart firewall. Items §9.11 (GOAL.md complete) and full V24 closure require §9.12 written by operator.

---

## §10 Deferred to V25

- Full 80-tool MCP port (R3 ships subset only)
- musu-bee UI adjustments for any Rust endpoint shape drift surfaced in R7
- Performance tuning (no Const VI experiments in V24)
- V23.6-minimal operator hygiene revisit (direnv, LESSONS_LEARNED) if still relevant
- inspect-ai eval suite
- AutoAgent meta-agent harness
- musu.pro reactivation
- Mobile

---

## §11 Critic Findings (resolved)

*Empty at master plan write time. Populated per-sub-WS as Phase 1.5 `system-architect` Critic returns findings. Each finding row: severity / claim / evidence / resolution (in-plan reshape or user decision).*

| Sub-WS | Finding | Severity | Resolution |
|---|---|---|---|
| — | (none yet — Phase -1 panel runs first) | — | — |

---

## §12 References

- **GOAL.md §A V24-Rust-big-bang** — operator decision record, commit `b6896af` (2026-05-20)
- **SSOT_1PAGE_2026-04-09** — thesis lock (4-layer)
- **wiki/471 v3** — V23.5 qual eval ground-truth (zero real usage finding, AMEND verdict)
- **wiki/489 v2** — panel critique amend (5 HIGH AMEND)
- **wiki/485** — GOAL.md (V23.6-minimal superseded by V24)
- **[[feedback-no-python]]** — Python ban memory
- **[[decision-musu-backend-rust]]** — Rust backend lock memory
- **[[feedback-self-contained-product]]** — no SaaS dep memory
- **[[feedback-no-yagni-architecture]]** — no K8s/heavy infra memory
- **[[feedback-strategic-critic-gate]]** — Phase -1 panel pattern memory
- **[[feedback-scribe-html-only]]** — closure docs HTML memory
- **`musu-supervisor/Cargo.toml`** — existing Rust workspace (R5 integration target)
- **`musu-port/Cargo.toml`** — existing Rust workspace (R9 relay/punch-through fallback)
- **`musu-bridge/pyproject.toml`** — Python codebase (R10 deletion target; broken `server:main` entry, verified prior turn)
- **`INSTALL.md`**, **`QUICKSTART.md`**, **`ONBOARDING.md`** — docs rewrite targets in R6
- **`scripts/install.sh`**, **`scripts/install.ps1`** — R6 targets
