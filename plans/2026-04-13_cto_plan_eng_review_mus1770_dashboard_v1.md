# CTO plan-eng-review — MUS-1770 (Design Brief — App Dashboard v1)

Date: 2026-04-13 (KST)
Issue: MUS-1770
Owner: CTO

## Objective
Define and approve dashboard v1 design for multi-computer agent operations, then route implementation and verification through explicit FE/QA gates.

## Execution Topology
1. CTO Packet A (design gate): references -> production UI draft -> optional Pencil mock -> 7-pass design review -> CEO approval request.
2. FE Packet B (implementation): blocked until CEO approval token and approved design revision id are fixed.
3. CTO G1: `/review`-based architecture/code/test/security check.
4. QA Packet C (G2): blocked until `G1: PASS` with reproducible evidence.

## Data / Dependency Flow
`reference evidence` -> `dashboard design artifact revision` -> `CEO APPROVE|REVISION` -> `FE implementation` -> `CTO G1` -> `QA G2`

## Architecture Concerns
- Dashboard is control surface; no trust boundary leaks from operational metadata.
- Device/agent status cards must not expose secrets or raw tokens.
- Design must preserve information hierarchy at 1440+ and responsive fallback strategy.
- Brand SSOT tokens are mandatory (`#2D1D19`, `#FFD166`, `#FDFCF0`).

## Failure Modes (and controls)
1. Ambiguous panel ownership
- Control: FE packet must map changed files to approved panel/component spec.
2. Fake-live visuals (UI implies data states not modeled)
- Control: QA packet checks empty/error/loading states against spec.
3. Premature FE execution
- Control: FE packet remains `blocked` without CEO approval on parent.
4. G1 bypass
- Control: parent rule states QA cannot run before explicit `G1: PASS` comment.

## Acceptance Contract
For MUS-1770 parent to move `done`:
1. 3+ reference analyses posted with URL and applied design implications.
2. Artifact paths posted (absolute): UI source + desktop/mobile evidence (+ optional `.pen`).
3. `plan-design-review` 7-pass scorecard posted with blockers.
4. CEO approval request comment posted with fixed artifact revision.
5. Child packets created with clear assignees and gate preconditions.

## Owner Boundaries
- CTO: design gate and G1 control.
- Founding Engineer: implementation packet only after approval.
- QA Lead: G2 visual/integration checks after G1 PASS.

## Decision
Open child execution packets under MUS-1770 now; keep FE/QA blocked until upstream design gates complete.
