# plan-eng-review — MUS-1282 (2026-04-12)

## Packet
- Issue: MUS-1282
- Topic: run_issue_id_mismatch recovery without widening trust boundaries

## Data-flow model
1) Agent attempts checkout/comment/update on issue lane.
2) Ownership gate reads actor run context + issue execution linkage.
3) If mismatch detected, recovery is considered only for bounded cases.
4) If bounded recovery criteria fail, request hard-fails with 409.

## Architecture decision
- Keep fail-closed default.
- Allow bounded recovery only when:
  - target issue is `in_progress`
  - actor is assignee
  - checkout lock is empty
  - mismatch reason is `run_issue_id_missing`, OR
  - mismatch reason is `run_issue_id_mismatch` AND foreign issue is terminal/missing.

## Failure modes reviewed
- Active foreign in-progress issue context accidentally rebound to target lane.
  - Mitigation: explicit hard-409 for active foreign issue context.
- Silent trust-boundary widening via comment mutation path.
  - Mitigation: route-level fail-closed test on foreign in-progress lane.
- Stale execution lock pointing to non-running run blocks valid assignee progress.
  - Mitigation: bounded stale-lock adoption/recovery path and audit markers.

## Test adequacy
- Required packet suite replayed:
  - `issues-service.test.ts`
  - `issue-comment-reopen-routes.test.ts`
  - `run-linkage-drift.test.ts`
- Result on replay: 47/47 tests passed.
- Typecheck replay: `tsc --noEmit` passed.

## Security and boundary verdict
- No evidence of widened authority scope in verified behavior.
- Active-foreign mismatch remains fail-closed.
- Recovery remains constrained to assignee + admissible stale contexts.

## Decision
- Architecture review verdict: PASS for G1 handoff to QA G2 replay.
