# CTO Queue Plan — 2026-04-13 (KST)

## Scope
Normalize duplicated design-gate policy packets and keep one executable owner path.

## Live Decisions Applied
- Canonical policy lane: `MUS-1807` (`in_progress`, CTO-owned).
- Canonical implementation lane: `MUS-1802` (`in_progress`, Founding Engineer-owned).
- Cancelled duplicates: `MUS-1805`, `MUS-1799`, `MUS-1796`.

## Acceptance Contract (MUS-1802)
1. Add `.github/workflows/design-gate.yml` for PR-time Design-First enforcement.
2. Fail when PR lacks:
- `Design: Approved` token
- Paperclip brief issue reference
- artifact link (`.pen` or exported `.png`)
3. Scope checks to UI paths to prevent noisy false failures.
4. Treat PR text as untrusted input (no shell interpolation).
5. Post one failing and one passing workflow proof before requesting G1.

## Gating
- G1 (CTO): run `/review` before any PASS decision.
- G2 (QA): replay verification after `G1: PASS`.

## Next Queue Hygiene Step
Use CoS packet `MUS-1719` to close remaining legacy duplicate CTO lanes:
- `MUS-1650`, `MUS-1738`, `MUS-1774`, `MUS-1777`.
