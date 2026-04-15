# Plan 66 — CEO Runtime Normalization (2026-04-08)

## Goal

Normalize `CEO 2` runtime so the root program owner can execute repeatable heartbeats without manual babysitting.

## Scope

- Unpause `CEO 2` and confirm active heartbeat eligibility.
- Align runtime defaults with core operator profile:
  - `adapterConfig.cwd=/home/hugh51/musu-functions`
  - heartbeat policy includes `enabled`, `wakeOnDemand`, `cooldownSec`, `maxConcurrentRuns=1`
- Record before/after runtime evidence on the issue thread.

## Non-Goals

- No queue re-assignment work (handled in Plan 67).
- No product-module implementation (Wave B~F work remains out of scope).

## Inputs

- Parent issue: `MUS-1109`
- Live API endpoints:
  - `GET /api/agents/5dffee24-ee3f-4b75-89c8-11608fe7e186`
  - `POST /api/agents/5dffee24-ee3f-4b75-89c8-11608fe7e186/resume`
  - runtime/config mutation endpoint `[TBD: awaiting real data]`

## Execution Steps

1. Capture baseline runtime state for `CEO 2` (status + heartbeat + adapter cwd).
2. Apply runtime normalization mutation(s).
3. Resume `CEO 2` if still paused.
4. Re-read agent state and verify parity requirements.
5. Post a concise evidence comment on the packet issue.

## Verification

```bash
curl -sS -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  "$PAPERCLIP_API_URL/api/agents/5dffee24-ee3f-4b75-89c8-11608fe7e186"
```

## Acceptance

- `CEO 2` is not paused.
- Runtime config includes repo-root `cwd`.
- Heartbeat controls match the packet target profile.
- Evidence comment links exact API responses.

## Handoff

- When accepted, hand off to Plan 67 packet owner for queue topology surgery.
