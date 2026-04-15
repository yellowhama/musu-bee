# Plan-Eng-Review — MUS-1744 Workspace Chat MVP

Date: 2026-04-13 (KST)
Owner: CTO (`7b6d37f7-91fd-4342-8e3f-9dfa422f999c`)
Parent issue: `MUS-1744`

## Objective
Ship a design-first Workspace Chat surface with strict gate order:
Design artifact -> CEO approval -> Engineering implementation -> CTO G1 -> QA G2.

## Canonical Packet Tree
1. `MUS-1744` (CTO, parent): design brief + gate coordination.
2. `MUS-1745` (CTO): create approved design artifacts (`.pen` + PNG set).
3. `MUS-1746` (FE): implement approved design only after CEO approval token.
4. `MUS-1747` (QA): visual/regression verification only after CTO G1 PASS.

Duplicate tree `MUS-1748` + `MUS-1749..1757` is cancelled and out-of-scope.

## Data Flow / Gate Flow

```text
Reference Evidence (WebFetch 3+) [done]
        |
        v
MUS-1745 Design Artifact
(.pen + desktop/mobile PNG + token map)
        |
        v
CEO approval comment on MUS-1744 (required token)
        |
        v
MUS-1746 FE implementation
(only approved scope)
        |
        v
CTO G1 (/review + reproducible commands)
PASS -> QA G2
FAIL -> back to in_progress with blockers
        |
        v
MUS-1747 QA G2 (visual fidelity + responsive + no regressions)
```

## Failure Modes + Controls
1. Duplicate packet fan-out
- Control: keep only canonical packet tree; cancel duplicates immediately.

2. Implementation starts before approved design
- Control: keep `MUS-1746` blocked until CEO approval token exists on `MUS-1744`.

3. Weak evidence claims (non-reproducible)
- Control: every gate must include exact commands + raw output + artifact paths.

4. Design drift / AI-slop
- Control: enforce brand tokens and explicit typography/motion rationale in MUS-1745 deliverables.

5. QA runs on unresolved upstream gate
- Control: `MUS-1747` stays blocked until explicit `G1: PASS` from CTO on MUS-1746.

## Packet Contracts

### MUS-1745 (CTO design packet) acceptance
1. Artifacts posted with absolute paths:
- one `.pen` source
- desktop PNG
- mobile PNG
- optional variant PNGs
2. `/plan-design-review` style 7-pass scorecard posted (with per-pass score + blockers).
3. CEO approval request comment posted with:
- references summary link/evidence
- artifact list
- explicit ask: `APPROVE` or `REVISION`.

### MUS-1746 (FE implementation packet) acceptance
Precondition:
- CEO approval token exists on `MUS-1744` for the selected design revision.

Delivery:
1. Implementation matches approved artifact sections/components only.
2. No trust-boundary regressions in agent/chat/status surfaces.
3. Evidence commands (run in `musu-bee`):
- `npm run typecheck`
- `npm run build`
- `npm run test:e2e -- e2e/history.spec.ts`
4. Include changed-file list and mapping to approved design components.

### MUS-1747 (QA packet) acceptance
Preconditions:
- MUS-1746 has explicit CTO `G1: PASS`.

Checks:
1. Desktop/mobile screenshot matrix against approved design artifact.
2. Responsive and readability checks (contrast + hierarchy + interaction affordance).
3. Replay of FE proof commands and result parity.
4. Binary verdict comment only: `G2: PASS` or `G2: FAIL` with blockers.

## Current Next Step
- Execute `MUS-1745` Step 2 (design creation) and attach artifact set for CEO approval.
- Keep `MUS-1746` and `MUS-1747` blocked until upstream gates are satisfied.
