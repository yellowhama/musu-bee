# CTO Plan-Eng Review — MUS-1769 / MUS-1770 (2026-04-13 KST)

## Scope
- Parent A: `MUS-1769` (Landing page v1 design brief)
- Parent B: `MUS-1770` (App dashboard v1 design brief)
- Goal: convert both briefs into executable packets with hard gates and owner boundaries.

## Architecture Boundary
- Design lane (CTO): references, visual system, interaction model, CEO approval.
- Implementation lane (Founding Engineer): code only after CEO design approval token.
- Verification lane (QA Lead): G2 only after explicit CTO `G1: PASS`.

## Data Flow (Gate Graph)
```text
CTO design packet (refs + artifacts + review)
  -> CEO approval token on parent (APPROVE | REVISION)
    -> FE implementation packet (code/tests/evidence)
      -> CTO G1 decision (PASS | FAIL)
        -> QA G2 packet (visual + replay + verdict)
```

## Packet Decomposition

### MUS-1769 (Landing)
1. `CTO packet` (in_progress):
- Produce WebFetch-backed reference analysis (3+ real sites).
- Produce `/frontend-design` implementation-quality code artifact.
- Optional `.pen` mockup via `/pencil-dev-design-workflow`.
- Run `/plan-design-review` 7-pass scorecard.
- Post CEO decision request.

2. `FE packet` (blocked):
- Implement only approved sections/components.
- Required evidence:
  - `npm run typecheck`
  - `npm run build`
  - one route-level e2e/smoke command scoped to landing surface
- Must include changed-file list + mapping to approved artifact revision.

3. `QA packet` (blocked):
- Preconditions:
  - FE packet has explicit CTO `G1: PASS`.
  - Approved design revision is fixed in comment.
- Checks:
  - desktop/mobile screenshot matrix
  - contrast/readability/accessibility spot checks
  - replay FE proof commands
- Verdict only: `G2: PASS` or `G2: FAIL`.

### MUS-1770 (Dashboard)
1. `CTO packet` (todo -> in_progress when picked):
- WebFetch analysis for dashboard references (3+).
- `/frontend-design` artifact for dashboard layout and states.
- Optional `.pen` mockup for desktop baseline and responsive rule.
- `/plan-design-review` 7-pass scorecard.
- CEO approval request on parent.

2. `FE packet` (blocked):
- Implement approved dashboard components only.
- Hard checks:
  - no trust-boundary regression in agent/status surfaces
  - no race-prone polling updates without deterministic state handling
  - tests for empty/error/loading states
- Required evidence:
  - `npm run typecheck`
  - `npm run build`
  - target tests covering dashboard states

3. `QA packet` (blocked):
- Preconditions identical to landing lane.
- Add parity check for dashboard counters where relevant APIs exist.
- Verdict only: `G2: PASS` or `G2: FAIL`.

## Failure Modes and Guardrails
- Duplicate parent lanes:
  - Guardrail: one active canonical parent per surface. Others must be `blocked` with supersession comment.
- Weak acceptance text:
  - Guardrail: every packet comment includes exact command list, owner, and unblock condition.
- Premature FE execution:
  - Guardrail: FE packets remain `blocked` until CEO approval token exists.
- Premature QA execution:
  - Guardrail: QA packets remain `blocked` until CTO `G1: PASS`.

## G1 Protocol (CTO)
- Do not grant PASS on narrative-only updates.
- Reproduce engineer evidence where feasible.
- PASS comment format:
  - `G1: PASS — [architecture/code/tests/security summary]`
- FAIL comment format:
  - `G1: FAIL — [blocking issues + exact remediation]`

## Exit Criteria for This Planning Packet
- Both parents (`MUS-1769`, `MUS-1770`) have:
  - plan document attached,
  - child packets created and assigned (`CTO`, `Founding Engineer`, `QA Lead`),
  - parent comment with strict resume order and fail-closed gate language.
