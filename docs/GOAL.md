# GOAL — musu autonomous /loop source of truth

**Wiki ID**: wiki/485
**Created**: 2026-05-19
**Updates**: append-only revision history at bottom
**Owner**: autonomous /loop orchestrator (Claude Opus 4.7 1M context)
**User**: emptyermind@gmail.com

This is the single source of truth for the autonomous /loop. Future Claude sessions read this first. Goals are **explicit + dated + measurable**. Section A is current cycle goal. Sections B–D are reference state (branch / gates / deferred).

---

## §A — Current cycle goal: V23.6 (HTML wiki hardening + bridge resilience + operator hygiene)

### A.1 In-scope

Two phases, sequential within /loop:

**Phase 1: V23.6 master plan entry (gated on operator)**
1. Wait for operator to clear main-merge gate (task #436): V23.3 + V23.4 Tier-1 + V23.4 Phase 4 + V23.5 → `main` in one operator action. 4 manual steps + "진행해". **Only operator action that gates V23.6 start.**
2. Cut `v23/phase5` branch off `main` (or continue on `v23/phase4` if main-merge stays pending — `[[feedback-autonomous-loop]]` allows branch hygiene trade-off).
3. Phase −1 strategic gate: `business-panel-experts` debate (Christensen + Taleb + Kim&Mauborgne + Drucker) stress-tests wiki/484 7 candidates. Output: GREEN/YELLOW/RED verdict per candidate, prioritization, kills.
4. Phase 1 Planner: write **wiki/485 V23.6 master plan** (template = wiki/431 V23.4 Phase 4 master plan). Reference wiki/484 §3.7 AutoAgent stress points.
5. Phase 1.5 Critic (system-architect): adversarial review wiki/485. Resolve all HIGH before sub-WS detail plans.
6. Plan-as-spec Auditor if total V23.6 LOC ≥500 (current estimate: ~330 LOC across 5 candidates → likely SKIP; trigger only if scope expands).

**Phase 2: V23.6 sub-WS implementation (5 candidates from wiki/484 §3)**
Order is **provisional** — Phase −1 panel may reshape. Default sequencing by leverage proxy:

| Wave | Sub-WS | Source | LOC | Risk | Why this wave |
|---|---|---|---|---|---|
| 1 | **V23.6-S** SSOT bump + master plan write | (this doc + wiki/485) | ~50 | — | unblocks wave 2 |
| 2 (parallel) | **V23.6-W1** mitmproxy wiretap dev mode | wiki/484 #1 (5-step #4) | ~80 + doc | LOW | C-3 visibility unlock; first LLM call site has prompt injection surface (`cos_briefing_agent.py:119-129`) |
| 2 (parallel) | **V23.6-W2** direnv pattern + `.envrc.example` | wiki/484 #2 (5-step #1) | ~40 + doc | LOW | operator hygiene; no musu code change; `.env.example` is starting point |
| 2 (parallel) | **V23.6-W3** uv migration musu-bridge | wiki/484 #4 (5-step #3) | ~60 + lockfile | LOW | install speed + dep reproducibility; CI ripple small |
| 2 (parallel) | **V23.6-W4** LESSONS_LEARNED.md seed | wiki/484 #5 ("lessons.md") | ~30 + 5 seeds | LOW | 2AM-debugging running journal; distinct from MEMORY.md (per-type) + qual eval (post-mortem) |
| 3 | **V23.6-W5** litellm in front of `cos_briefing_agent` | wiki/484 #3 (5-step #2) | ~120 | MED | **unlocks 2/4 firewall #7 preconditions** for V23.7 Y-path promotion. Critic gate required (external lib dep). |
| 4 | **V23.6 final closure (HTML wiki/486) + qual eval (wiki/487)** | per [[feedback-scribe-html-only]] | — | — | Const VII per-push automated; main-merge stays operator-pending. |

**Total**: ~330 LOC across 5 sub-WS + closure. Estimated 5–6 /loop iterations.

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

### Current state evaluation (2026-05-19, this turn)

- Step 1: task #436 main-merge PENDING — operator gate. Choice: HALT /loop OR proceed on v23/phase4 per [[feedback-autonomous-loop]]. **Decision: proceed on v23/phase4**, queue main-merge as eventual op cleanup.
- Step 8: V23.6 is a NEW master plan thesis (not within wiki/431 V23.4 cleared scope) → **Phase −1 strategic gate fires FIRST** before any Builder.

**Next /loop iteration goal**: Phase −1 strategic gate on V23.6 thesis (wiki/484 7 candidates).

---

## §F — Revision history

| Date | Change | Reason |
|---|---|---|
| 2026-05-19 v1 | Initial GOAL.md created, V23.6 cycle defined | User request "야 골설정 제대로 해서 /loop으로 만들어"; covers scope 1+2 (V23.6 master plan entry + sub-WS impl); dynamic cadence; project-root location |
