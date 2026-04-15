# CTO Packet Plan — MUS-1042 Gate Hardening (2026-04-08)

## Scope
Stabilize Stripe commercialization gate chain:
`MUS-1045 -> MUS-1046 -> MUS-1047 -> MUS-1048`

## Current State (verified)
- `MUS-1045`: `done` (policy artifact posted and locked).
- `MUS-1046`: `blocked` after fresh CTO `G1: FAIL`.
- `MUS-1047`: `blocked` (normalized after MUS-1046 G1 fail; QA replay waits on corrected G1 PASS).
- `MUS-1048`: `blocked` (CTO release gate waits on A/B/C completion).

## Architecture Review Notes (plan-eng-review output)
- Trust boundary is partially sound (`stripe-signature` enforced; tier resolved from Stripe price, not client metadata).
- Critical risk to resolve before G1 PASS:
  - Unknown Stripe `priceId` is now fail-closed, but retryable unknown-price events are still marked as processed.
  - Required fix: keep fail-closed behavior while preventing retryable-failure events from being permanently deduped.
- Replay/idempotency and ordering behavior must be proven with reproducible event-sequence evidence, not narrative claims.

## Acceptance Contracts
### MUS-1046 (G1)
- Policy lock present (`price_pro_id` concrete).
- Signature negative-path proof (400 + no state mutation).
- Replay/idempotency proof for 3 event types.
- Ordering resilience proof (updated/deleted before checkout does not grant entitlement).
- Evidence bundle includes commands, outputs, commit SHA, and state snapshots.

### MUS-1047 (G2)
- Run matrix: happy path, replay, invalid signature, lifecycle updates/deletes.
- Binary verdict comment only: `G2: PASS` or `G2: FAIL` with evidence refs.

### MUS-1048 (CTO decision)
- Input requirements: MUS-1045 policy artifact + MUS-1046 G1 PASS + MUS-1047 G2 PASS.
- Output requirement: explicit `Release Decision: GO` or `NO-GO` with residual risk table and revert SLA.

## Immediate Owner Actions
1. Founding Engineer: fix MUS-1046 G1 blockers and repost full reproducible bundle.
2. CTO: rerun G1 on corrected MUS-1046 implementation.
3. QA Lead: execute MUS-1047 matrix after corrected G1 PASS and post binary verdict.
4. CTO: run final production-readiness decision in MUS-1048.

## Hygiene Follow-up
- `MUS-1050` is closed; `MUS-1040` remains `in_review` despite repeated G2 PASS comments.
- Assignee should either move MUS-1040 to `done` with final evidence index or post blocker + ETA.

## 2026-04-08 G1 Update (MUS-1046)
- Verdict: `G1: FAIL` (posted on MUS-1046 comment `48c95dc2-b847-4e4a-b5c7-035a2547da29`).
- Reproduced command results:
  - `npm run test:webhooks` -> PASS
  - `npm run typecheck` -> PASS
  - `npm run build` -> FAIL (invalid Next.js route export: `handleStripeWebhook`)
- Additional architecture blocker: retryable `unknown_price_id` path currently marks event as processed.
- Consequence: MUS-1047 re-blocked until MUS-1046 returns with corrected implementation and new reproducible bundle.
