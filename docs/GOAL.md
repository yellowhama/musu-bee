# GOAL — musu autonomous /loop source of truth

**Wiki ID**: wiki/485
**Created**: 2026-05-19
**Updates**: append-only revision history at bottom
**Owner**: autonomous /loop orchestrator (Claude Opus 4.7 1M context)
**User**: emptyermind@gmail.com

This is the single source of truth for the autonomous /loop. Future Claude sessions read this first. Goals are **explicit + dated + measurable**. Section A is current cycle goal. Sections B–D are reference state (branch / gates / deferred).

---

## §A — Current cycle goal: V23.6-minimal (operator hygiene only, panel-amended 2026-05-19)

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

## §B — Branch + commit state (snapshot 2026-05-19)

- **Active branch**: `v23/phase4` HEAD `5451d5a` (158 commits ahead of `main`)
- **Pushed to**: `origin/v23/phase4`
- **Recent commits** (top 5):
  - `5451d5a` docs: wiki/450 → wiki/484 rename + Critic findings + AutoAgent #7
  - `3d72020` docs: wiki/450 reference — agentic 5-step install order (initial)
  - `ed2e974` V23.5 final closure: wiki/470 + wiki/471 + CHANGELOG 1.13.0
  - `c1a87b4` V23.5 W-8: V23.6 firewall + agent instruction tweaks + W-8 closure
  - `f63269d` V23.5 C-4: Y-path failure-mode tests + C-2 wiring + V23.7 criterion
- **Cumulative LOC**: ~1900 V23.5 production + ~5500 V23.4 Phase 4 production
- **CHANGELOG**: at 1.13.0 (V23.5 closed) + post-closure doc note (wiki/484)
- **VERSION**: 1.13.0-dev (S-1 set; will bump to 1.14.0-dev at V23.6 S start)

---

## §C — Operator gates (only points where autonomous /loop pauses)

Per [[feedback-autonomous-loop]] — these are the 4 exceptions where /loop must wait:

| Gate | Current status | Action |
|---|---|---|
| **Const VII main-merge** | **PENDING** — task #436 | Operator: 4 manual steps + "진행해" → V23.3 + V23.4 + V23.5 → main |
| Const III schema apply | not triggered V23.6 | — |
| Production deploy | not triggered V23.6 | — |
| Irreversible destructive op | not triggered V23.6 | — |

**Only #436 actively blocks.** /loop continues on v23/phase4 for V23.6 work meantime, accepting branch hygiene trade-off.

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

### Current state evaluation (2026-05-19 v2 — post panel critique)

- Step 1: **3 entry conditions in §A.0 all PENDING** — operator gate. Per panel H5+M5, autonomous bypass per `[[feedback-autonomous-loop]]` is NOT applicable here because the bypass clause covers technical gates (push, schema, deploy), not review-bandwidth gates. **Decision: HALT autonomous /loop on V23.6 work until operator confirms entry conditions.**
- Step 8: V23.6-minimal is operator-hygiene-only — Phase −1 strategic gate SKIPPED (no thesis, no new SaaS dep, no new code surface). Phase 1 Planner is a ~1-page master plan.

**Next /loop iteration goal**: WAIT for operator. When operator responds to §A.0 entry conditions: (a) start V23.6-W2 direnv if all 3 cleared, (b) re-evaluate if operator chooses different scope.

**Single-line warning embedded for operator visibility**: autonomous loop currently produces reviewable output faster than operator-merge gate clears (verifiable via `git log`). V23.6-minimal scope cut is the panel-recommended throttle. Do not auto-resume without operator decision.

---

## §F — Revision history

| Date | Change | Reason |
|---|---|---|
| 2026-05-19 v1 | Initial GOAL.md created, V23.6 cycle defined | User request "야 골설정 제대로 해서 /loop으로 만들어"; covers scope 1+2 (V23.6 master plan entry + sub-WS impl); dynamic cadence; project-root location |
| 2026-05-19 v2 | §A scope cut: 5 sub-WS → 2 (V23.6-minimal: W2+W4 only). §A.0 added with 3 entry conditions. §E decision tree current-state recalibrated. | Post-`business-panel-experts` adversarial critique of wiki/471 V23.5 qual eval v1 (4-expert unanimous AMEND verdict: 5 HIGH + 6 MED). W5 RED verdict from V23.6 Phase −1 strategic gate absorbed. Scope cut directly addresses panel H5 (parallelism vs solo-operator review bandwidth) + M5 (#436 4-cycle backlog) + H2 (V23.5 product-outcome unmeasured). User approved Option 1 ("amend + W5 결정 같이"). |
