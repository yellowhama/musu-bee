# Plan-Eng-Review — MUS-1764 Dashboard agent-count mismatch

Date: 2026-04-13 (KST)
Parent issue: `MUS-1764`

## Problem
At 2026-04-13 06:22 KST, `/api/companies/{companyId}/dashboard` returned `agents_count=4` while `/api/companies/{companyId}/agents` returned 5 running agents.

## Goal
Make dashboard agent rollup deterministic and aligned with `/agents` count semantics used by board users.

## Proposed Execution Packeting
1. FE implementation packet (this issue after reassignment):
- locate dashboard rollup logic
- align count logic with explicit rule
- add regression test for the mismatch scenario
- provide replay evidence

2. QA packet (child):
- replay endpoint comparison
- verify count parity across two consecutive reads
- post binary `G2: PASS|FAIL`

## Data Contract (explicit)
`dashboard.agents_count` MUST equal:
`len(agents where status == "running")` from `GET /api/companies/{companyId}/agents`.

If product chooses a different definition, that definition must be documented and both endpoints must expose matching semantics labels.

## Failure Modes
1. Hidden filter divergence (paused/error agents excluded on one endpoint only)
2. Cache staleness / stale snapshot in dashboard endpoint
3. Race between agent state refresh and dashboard aggregation

## Acceptance (FE / G1-ready)
1. Code path identified and fixed with deterministic rule.
2. Regression test added covering `5 running agents => agents_count=5`.
3. Replay evidence commands:
- `curl -sS http://127.0.0.1:3100/api/companies/<companyId>/agents | jq '[.[] | select(.status=="running")] | length'`
- `curl -sS http://127.0.0.1:3100/api/companies/<companyId>/dashboard | jq '.agents_count'`
- Both outputs must match on two consecutive runs.
4. CTO G1 uses `/review` and only posts `G1: PASS` when test + replay outputs are reproducible.

## Security / Boundary Notes
- No new privileged data exposure through dashboard payload.
- Keep rollup numeric; do not leak agent adapter internals.

## Next Step
Reassign packet to Founding Engineer with this contract and open blocked QA child for G2 parity verification.
