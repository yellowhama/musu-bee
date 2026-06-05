# RELEASE 1.15.0-rc.1 - Next Steps After Degraded Mode Gate

Date: 2026-06-06 KST

## Current State

The degraded-mode contract gate is implemented and validated on the current
working tree. It strengthens the desktop/web split:

- MUSU Desktop/local runtime executes work.
- MUSU.PRO/web accepts remote input and coordinates connection/evidence.
- Web/API surfaces must show unavailable, stale, or fallback local state as
  degraded/offline/fallback, not as healthy fabricated state.

## Immediate Next Steps

1. Commit and push this degraded-mode gate.
2. Run clean HEAD go/no-go.
3. If clean go/no-go invalidates any current packaged evidence because of the
   Next route source changes, refresh the relevant primary-machine evidence.
4. Prepare the next second-PC run with the stricter current scripts.

## External Release Gates Still Open

- second-PC multi-device route evidence
- second-PC 60s desktop-open idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO owner-scoped P2P/relay evidence with release-grade transport
  and payload delivery proof
- `musu@musu.pro` support mailbox proof
- Partner Center product name, submission, certification, and restricted
  capability approval evidence

## Recommended Next Engineering Slice

The highest-leverage next slice is still the second-PC evidence path:

- install the current MUSU build on the second PC
- run the operator action pack / second-PC kit
- return/import the evidence zip
- verify multi-device, idle CPU, runtime matrix, and targeted post-route CPU
  evidence against the current commit

Hosted MUSU.PRO relay work should proceed in parallel only after KV/Upstash and
release relay payload transport are available, because the current hosted proof
is intentionally blocked without release-grade relay delivery evidence.

