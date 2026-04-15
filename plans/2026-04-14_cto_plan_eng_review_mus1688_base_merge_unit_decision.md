# CTO Plan-Eng Review — MUS-1688 Base Merge Unit Decision (2026-04-14 KST)

Issue
- MUS-1688 (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)

Problem observed
- Thread has conflicting routing rows (`G2 FAIL` then `G2 PASS` then fail-closed re-lock).
- Latest FE evidence (`b170ab57-7da1-4373-8fea-2cac0bb82d21`) declares `SCOPE_MODE: EXPANDED` and reports unstable `npm run build` in current base.

CTO decision (authoritative)
1) Scope freeze for this packet:
- Canonical scope is `TOKEN_ONLY` for MUS-1688.
- `EXPANDED` scope is out-of-contract for this packet and cannot be used to request G1.

2) Canonical merge unit:
- Use prior accepted token-only artifact as source of truth:
  - `/home/hugh51/musu-functions/artifacts/mus1688-g1-token-only-20260414T045134+0900/token_only_diff.patch`
- FE must not include unrelated route/content rewrites in this packet.

3) Determinism contract split (to avoid false ownership):
- Baseline system health row (clean HEAD, no packet patch):
  - `BASELINE_BUILD_HEAD: PASS|FAIL`
- If `BASELINE_BUILD_HEAD: FAIL`, treat as external/base-lane blocker; do not attribute to MUS-1688 token patch.
- Packet-level admissibility for G1 remains:
  - token-only diff proof
  - targeted token regression tests
  - typecheck replay
  - trust-boundary + rollback note

4) Re-entry tokens:
- FE must post `REENTRY_SCOPE_MUS1688: CODE_CHANGED` only if code changed from canonical token-only unit.
- FE then posts `G1_READY_MUS1688: YES` with one coherent bundle.
- CTO performs direct-code G1 and posts `G1: PASS|FAIL`.

Fail-closed rules
- Any mixed or undeclared scope (`TOKEN_ONLY` + unrelated edits) => keep `blocked`.
- No G2 routing resumes until CTO G1 is explicitly adjudicated on the canonical scope.

Owner boundaries
- FE: canonical token-only bundle for G1 intake.
- CTO: G1 adjudication.
- QA: G2 only after fresh G1 disposition on canonical scope.
- [TBD: awaiting real data] base-build owner for `BASELINE_BUILD_HEAD: FAIL` row (board/runtime lane).
