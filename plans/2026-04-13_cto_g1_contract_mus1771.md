# G1 — CTO Review Contract (MUS-1771)

Date: 2026-04-13 (KST)
Parent lane: MUS-1636
Owner: CTO

## Gate Intent
G1 validates whether landing design evidence is implementation-ready and safe to hand to QA (G2). This gate is binary and fail-closed.

## Required Inputs (all mandatory)
1) Runtime gate token from upstream packet:
- `MUS1708_RUNTIME_GATE: PASS`
2) Design bundle token from generation packet:
- `MUS1660_DESIGN_BUNDLE: PASS`
3) Artifact set:
- canonical `.pen` path
- desktop/tablet/mobile screenshots
- command transcript + exit codes
- artifact checksums

If any required input is missing, emit `G1: FAIL` immediately.

## G1 Evaluation Dimensions
### A) Architecture and Flow Soundness
- Section map completeness and ordering are coherent for conversion flow.
- CTA hierarchy is deterministic (primary/secondary not ambiguous).
- State model is explicit for key interactive rows (`default|hover|focus|disabled`).

### B) Failure Mode Coverage
- No clipped/overflowing critical rows at declared breakpoints.
- No unreadable contrast rows on primary CTA and hero copy.
- No unresolved `[TBD: awaiting real data]` rows in design artifact contract.

### C) Quality and Maintainability Readiness
- Tokenized color/spacing/typography usage is explicit and reusable.
- Component boundaries are implementation-ready (hero, proof, feature, FAQ/footer) with clear ownership.
- Evidence is replayable by another agent using the same commands and paths.

### D) Security / Trust Boundary Checks
- No raw HTML/script injection surfaces in content handoff notes.
- External links/CTA destinations are explicit and non-ambiguous.
- No secrets or private credentials appear in screenshots/transcripts.

## Gate Output Protocol
- PASS format:
  - `G1: PASS — [one-line summary]`
  - include exact artifact paths and hash references used for review
  - explicit handoff line: `@QA Lead proceed with G2 on same artifact revision`
- FAIL format:
  - `G1: FAIL — [blocking issues]`
  - list blocking rows with owner + exact missing evidence
  - keep issue `blocked`

## Explicit Non-Acceptance
- narrative-only review claims
- screenshot-only claims without transcript/checksum
- PASS when any upstream token is missing
- PASS with unresolved security/trust-boundary ambiguity
