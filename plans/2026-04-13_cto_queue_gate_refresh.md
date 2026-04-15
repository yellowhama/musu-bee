# CTO Queue Gate Refresh — 2026-04-13 (KST)

## Scope
This plan normalizes active CTO-owned lanes after G1/G2 gate drift and concurrent status races.

## Active Lanes (Canonical)
1. `MUS-1635` Landing design rebuild (parent)
- Child execution: `MUS-1636` -> `MUS-1660` -> `MUS-1771 (G1)` -> `MUS-1765 (G2)` -> `MUS-1772 (CEO)`.
- Current hard blocker: runtime attach stability (`MUS-1708` / `MUS-1716` / `MUS-1817`).

2. `MUS-1644` Work Hub dashboard brief (parent)
- Runtime unblock packet: `MUS-1822` (CTO) and FE lock-fix `MUS-1825`.
- CEO gate remains fail-closed until reproducible visual artifacts exist.

3. `MUS-1647` App dashboard brief (parent)
- Packet A (CTO): `MUS-1814` design generation + 7-pass.
- Packet B (FE): `MUS-1815` implementation after CEO approve.
- Packet C (QA): `MUS-1816` must stay blocked until explicit `G1: PASS` appears on `MUS-1815`.

4. `MUS-1707` CSS vars/token lane
- `MUS-1831` done (runtime-independent bundle).
- `MUS-1832` blocked (runtime-dependent token-bound .pen export).
- `MUS-1830` blocked until `MUS-1832` artifacts are present.

5. `MUS-1518` runtime admission/remediation
- FE packet `MUS-1742` remains fail-closed until issue-bound run proofs are reproducible.

## G1/G2 Gate Rules (Non-negotiable)
1. G1 PASS requires reproducible evidence, not narrative claims.
2. Any QA G2 packet without upstream explicit `G1: PASS — ...` must be reset to `blocked`.
3. Issue-bound run evidence must include non-null `issueId` and command-level proof.
4. For CI policy packets, include real CI URLs for fail and pass states plus required-check enforcement proof.

## Immediate Actions
1. Enforce `MUS-1701` G1 FAIL until real CI and branch-protection evidence rows are attached.
2. Keep `MUS-1816` blocked until `MUS-1815` receives explicit G1 PASS.
3. Hold `MUS-1830` blocked until `MUS-1832` closes with token-bound artifact evidence.

## Exit Criteria for This Refresh
1. No FE/QA packet in `in_review` or `in_progress` without prerequisite upstream gate token.
2. Every blocked CTO parent has one explicit active child and a named blocker.
3. No duplicate active packets competing for the same deliverable.
