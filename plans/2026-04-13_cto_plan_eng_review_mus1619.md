# MUS-1619 Plan-Eng-Review (CTO)

Date: 2026-04-13
Packet: MUS-1619 (FE heartbeat/run-proof evidence bundle)
Parent gate: MUS-1620

## Scope
Validate that FE provided admissible recovery evidence for heartbeat progression and queue visibility.

## Architecture Path

```
POST /api/agents/{FE}/heartbeat/invoke
  -> heartbeat_run created (queued|running|finished)
  -> GET /api/heartbeat-runs/{runId} progression checks
  -> GET /api/companies/{companyId}/agents FE row check
  -> GET /api/companies/{companyId}/live-runs queue-hygiene snapshot
```

## Failure Modes Reviewed
1. Run remains queued indefinitely (scheduler admission saturation).
2. Evidence uses mismatched run IDs between invoke and progression.
3. Agent status appears healthy while queue backlog keeps growing.
4. Narrative-only proof without endpoint/timestamp anchors.

## Evidence Contract
Required rows:
- invoke (endpoint, runId, immediate status, UTC timestamp)
- progression (same runId follow-up status + transition)
- agent_row (status + lastHeartbeatAt)
- queue_hygiene (before/after queued counts + endpoint)
- errors (endpoint + HTTP code + body)

## Repro Checks Executed
- GET /api/heartbeat-runs/e9eaad8f-5d34-4428-be34-433e063cbb9b
- GET /api/heartbeat-runs/cc8fa261-268c-498e-93fe-ffdd78480a52
- GET /api/heartbeat-runs/9294b798-145a-4a1f-abb2-e3227c4a4e4d
- GET /api/companies/{companyId}/agents (FE row)
- GET /api/companies/{companyId}/live-runs (FE queued count)

## Gate Position
- Admissibility: PASS for MUS-1619 evidence bundle.
- Residual risk: scheduler queue pressure remains high and is not resolved by this packet.
- Action: issue G1 decision on MUS-1620 and handoff to QA (MUS-1621) for G2 replay.
