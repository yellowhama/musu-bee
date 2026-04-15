# CTO plan-eng-review — MUS-1769 (Design Brief — Landing page v1)

Date: 2026-04-13 (KST)
Issue: MUS-1769
Owner: CTO

## Objective
Build an approval-grade design package for `musu.pro` landing v1, then hand off implementation to FE and verification to QA with fail-closed gates.

## Execution Topology
1. CTO Packet A (design gate): references -> production UI draft -> optional Pencil mock -> 7-pass design review -> CEO approval request.
2. FE Packet B (implementation): blocked until CEO approval token exists on MUS-1769 and approved artifact revision is fixed.
3. CTO G1 gate on FE packet: `/review` protocol + reproducible command evidence.
4. QA Packet C (G2): blocked until explicit `G1: PASS` and fixed design revision reference.

## Data / Dependency Flow
`references` -> `design artifact revision` -> `CEO APPROVE|REVISION` -> `FE implementation` -> `CTO G1` -> `QA G2` -> `done`

No edge may be skipped. Any missing proof keeps downstream packet `blocked`.

## Architecture Concerns
- Landing page must remain static-public surface: no server-side trust boundary widening.
- Design tokens must use brand SSOT:
  - `#2D1D19` Cocoa Brown
  - `#FFD166` Musu Yellow
  - `#FDFCF0` Off-White background
- Avoid AI-slop patterns (default Inter-only stack, purple gradients, generic hero template).

## Failure Modes (and controls)
1. Duplicate lane drift (multiple landing briefs in parallel)
- Control: make MUS-1769 the active gate chain; every child comment links parent issue + approved revision id.
2. FE starts before approval
- Control: FE packet precondition hard-coded; status remains `blocked` without CEO approval token.
3. Non-reproducible G1 claims
- Control: G1 requires command outputs copied in comment:
  - `npm run typecheck`
  - `npm run build`
  - route-targeted test command in repo context
4. Weak visual acceptance
- Control: QA G2 requires screenshot matrix and explicit PASS/FAIL only.

## Acceptance Contract
For MUS-1769 parent to move `done`:
1. 3+ direct reference analyses posted in issue comments with URL-backed notes.
2. Artifact paths posted (absolute):
  - production UI source path
  - desktop screenshot path
  - mobile screenshot path
  - optional `.pen` path
3. `plan-design-review` 7-pass scorecard posted with blocking deltas.
4. CEO decision request comment posted with explicit `APPROVE` or `REVISION` ask.
5. Child packets created with owners (CTO/FE/QA) and hard preconditions.

## Owner Boundaries
- CTO: design gate + G1.
- Founding Engineer: implementation only after approval.
- QA Lead: G2 only after G1 PASS.

## Decision
Open child execution packets now under MUS-1769 and keep FE/QA fail-closed until design approval.
