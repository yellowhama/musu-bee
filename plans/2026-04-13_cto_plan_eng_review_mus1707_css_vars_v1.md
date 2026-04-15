# Plan-Eng-Review — MUS-1707 (Design system CSS vars)

Date: 2026-04-13 (KST)
Issue: MUS-1707
Child implementation lane: MUS-1688 (FE)

## Objective
Create an approved design-token contract for CSS variables so FE can replace inline brand colors without semantic drift.

## Architecture Contract
1. Token source of truth (design gate output):
- Core brand tokens:
  - `--color-brand-cocoa: #2D1D19`
  - `--color-brand-yellow: #FFD166`
  - `--color-bg-offwhite: #FDFCF0`
- Semantic tokens (minimum):
  - `--surface-primary`, `--surface-elevated`
  - `--text-primary`, `--text-muted`, `--text-on-accent`
  - `--accent-primary`, `--accent-hover`, `--border-subtle`

2. Consumption boundary:
- FE lane (`MUS-1688`) may only consume approved semantic vars.
- Raw hex literals in UI files are disallowed except token-definition files.

3. Gate order:
- Design artifacts approved first (this issue) -> FE implementation (`MUS-1688`) -> QA visual/contract verification.

## Packet Decomposition
A. Reference capture (CTO)
- Analyze 3+ comparable products and post findings comment on MUS-1707.
- Must include concrete extraction: token layering, contrast strategy, state semantics.

B. Design generation (CTO)
- Produce tokenized design artifact set:
  - `.pen` file (token bindings visible)
  - token spec markdown (names, hex values, semantic usage table)

C. Design review + approval (CTO -> CEO)
- Run 7-pass design review (`/plan-design-review`).
- Request CEO sign-off comment with token:
  - `DESIGN_GATE_MUS1688: GO`

D. FE implementation enablement
- Only after C: MUS-1688 may move from blocked to in_progress.

## Acceptance Criteria (hard)
1. No parent-cycle in dependency graph (MUS-1707 parent, MUS-1688 child only).
2. MUS-1707 comment with 3+ live reference analyses.
3. Artifact bundle attached in comments:
- `.pen` path
- token spec path
- component sample screenshots (or equivalent evidence)
4. 7-pass design review result posted with pass/fail per dimension.
5. CEO approval comment posted with exact token `DESIGN_GATE_MUS1688: GO`.

## Failure Modes + Mitigations
- Token naming drift -> enforce semantic dictionary in token spec.
- Brand inconsistency in implementations -> block FE start until CEO gate token exists.
- Visual regressions in rollout -> QA compares before/after screenshots on key surfaces.

## Security/Quality Notes
- CSS vars change must not leak secrets or runtime env data.
- Keep trust boundaries unchanged: this packet is design contract only.

## Immediate Next Step
CTO executes packet A (reference capture comment) and packet B (artifact publication) before requesting CEO gate.
