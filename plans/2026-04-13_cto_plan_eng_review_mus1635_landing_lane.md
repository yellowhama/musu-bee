# MUS-1635 Plan-Eng Review — Landing Design Canonical Lane

Date: 2026-04-13 (KST)
Parent: MUS-1635
Owner: CTO

## Objective
Close the landing-page design lane with reproducible evidence and strict gate order.

## Canonical Packet Graph
1) `MUS-1708` (FE, blocked): runtime attach stabilization (desktop MCP attach or approved authenticated headless path).
2) `MUS-1660` (CTO, blocked): design generation in Pencil after runtime gate pass.
3) `MUS-1771` (CTO, blocked): G1 design readiness gate.
4) `MUS-1765` (QA, blocked): G2 visual acceptance gate.
5) `MUS-1772` (CEO, blocked): G3 business/brand approval gate.

`MUS-1726` (references analysis) is already done and admissible as upstream input evidence.

## Architecture / Data Flow
- Input: reference analysis + brand token contract.
- Transform: runtime attach proven -> .pen authoring -> screenshot export matrix.
- Verification: CTO G1 checks artifact integrity and gate contract completeness.
- Release decision: QA G2 + CEO G3 tokens in order.

Flow: `MUS-1708 -> MUS-1660 -> MUS-1771 -> MUS-1765 -> MUS-1772`

## Failure Modes and Controls
- FM1: Runtime appears healthy but `pencil/get_editor_state` fails.
  - Control: fail gate until same-window `get_editor_state` success is in artifact bundle.
- FM2: Design completion claimed without hash-bound artifacts.
  - Control: reject; require paths + checksums + transcript exit codes.
- FM3: G1/G2/G3 advanced out of order.
  - Control: downstream stays blocked without upstream terminal token.
- FM4: Approvals based on narrative only.
  - Control: no PASS without reproducible commands and artifacts.

## Hard Acceptance Contracts
### A) Runtime Gate (`MUS-1708`)
Required rows:
- command transcript with exit codes
- `pencil/get_editor_state` success row in same evidence window
- target `.pen` path confirmation
- terminal token: `MUS1708_RUNTIME_GATE: PASS|FAIL`

### B) Design Generation (`MUS-1660`)
Required artifacts:
- canonical `.pen` path
- desktop/tablet/mobile screenshots
- 2-3 hero variants
- explicit token usage for Cocoa Brown `#2D1D19`, Musu Yellow `#FFD166`, Off-White `#FDFCF0`/`#F8F6F1`
- artifact checksums
- terminal token: `MUS1660_DESIGN_BUNDLE: PASS|FAIL`

### C) G1 (`MUS-1771`, CTO)
Required checks:
- section map completeness
- interaction/state contract completeness
- trust-boundary review for user-input/HTML injection surfaces
- reproducibility replay of artifact bundle
- terminal token: `G1: PASS` or `G1: FAIL`

### D) G2 (`MUS-1765`, QA)
Required checks:
- responsive matrix bound to same artifact revision
- contrast/readability checks on all critical CTA/copy rows
- clipping/overflow checks
- terminal token: `G2: PASS` or `G2: FAIL`

### E) G3 (`MUS-1772`, CEO)
Required output:
- binary scope token:
  - `MUS1635_SCOPE_LOCK: APPROVED`
  - `MUS1635_SCOPE_LOCK: REVISION_REQUIRED`
  - `MUS1635_SCOPE_LOCK: REJECTED`

## Parent Close Conditions (`MUS-1635`)
Close only if all true:
1) `MUS1708_RUNTIME_GATE: PASS`
2) `MUS1660_DESIGN_BUNDLE: PASS`
3) `G1: PASS`
4) `G2: PASS`
5) `MUS1635_SCOPE_LOCK: APPROVED`
6) No open `[TBD: awaiting real data]` rows.

## Non-Acceptance
- queued-only run references
- screenshots without source `.pen` binding
- PASS claims without command transcript
- approval comments without required terminal tokens
