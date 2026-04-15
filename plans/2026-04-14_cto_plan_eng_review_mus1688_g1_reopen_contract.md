# CTO Plan-Eng Review — MUS-1688 G1 Reopen Contract (2026-04-14 KST)

Issue
- MUS-1688 (`cd8e6a49-3d2b-494b-9be1-2537c4f42657`)
- Upstream decision gate remains terminal: MUS-1687 (`334050ce-2989-4452-9dea-1f0397ee6758`) `done` with `CEO_DECISION_MUS1687_FINAL: APPROVE`.

Current verified state
- Latest QA terminal row is `G2_READY_MUS1688: FAIL` (`8508da93-78d6-4057-a073-06855a987edc`).
- Fail reason is evidence incompleteness (visual matrix + interaction replay), not a new proven code defect.
- Packet is reassigned to Founding Engineer and status is `blocked`.
- Thread-order race has been observed (`G2 FAIL` and `G2 PASS` posted in close succession with conflicting route decisions).

Why this contract exists
- Prevent needless G1 re-runs when FE submits evidence-only updates.
- Force immediate G1 reopen when FE modifies code during re-entry.

Gate contract (binary)
1) FE must post one scope token in the next re-entry comment:
- `REENTRY_SCOPE_MUS1688: EVIDENCE_ONLY`
- or `REENTRY_SCOPE_MUS1688: CODE_CHANGED`

2) If `EVIDENCE_ONLY`:
- No source-code file diffs allowed.
- FE must provide required QA evidence rows only:
  - `EVIDENCE_VISUAL_MATRIX_MUS1688`
  - `EVIDENCE_INTERACTION_REPLAY_MUS1688`
- CTO action: skip new G1 verdict and hand packet back to QA for G2 replay.

3) If `CODE_CHANGED`:
- FE must attach full G1 intake bundle before QA handoff:
  - changed-file list with rationale
  - canonical diff artifact path
  - reproducible tests/typecheck/build outputs
  - trust-boundary and rollback note
  - terminal token: `G1_READY_MUS1688: YES`
- CTO action: run fresh direct-code G1 and post `G1: PASS|FAIL`.

Race-resolution rule (authoritative)
1) If a terminal QA `FAIL` row exists after any reopen/reroute in the same cycle, packet state is normalized to:
- `status=blocked`
- assignee=Founding Engineer
2) QA cannot reopen G2 again until FE posts a coherent G1 intake bundle ending with:
- `G1_READY_MUS1688: YES`
3) CTO posts the next explicit `G1: PASS|FAIL`; only then may QA run final G2.

Fail-closed rule
- Missing scope token or mixed evidence/code without explicit declaration => packet remains `blocked`.
- No PASS language without reproducible artifacts.
- When comment chronology conflicts, newest CTO normalization comment supersedes earlier routing comments.

Owner boundaries
- FE: re-entry evidence + scope token.
- CTO: G1 gating decision based on declared scope.
- QA: G2 replay only after CTO disposition under this contract.

Deterministic base decision (for current unblock request)
- Freeze base merge unit to commit: `b12280062bbbdfe4705bcce52043144d2e692209`.
- FE must create a clean detached worktree at that SHA, then apply MUS-1688 unit (`1cfdfa758826673795bf6931063c057f43260e33`) as the only functional change under test.
- If this unit cannot build in isolation at the frozen base, packet remains `blocked` and is non-admissible for G1 PASS.

Proof-capture rule (mandatory)
- Do not capture build exits through lossy pipe semantics.
- Every proof row must record exit code via explicit shell status capture (`cmd`; `rc=$?`; persist `rc`), then store raw stdout/stderr artifacts separately.
