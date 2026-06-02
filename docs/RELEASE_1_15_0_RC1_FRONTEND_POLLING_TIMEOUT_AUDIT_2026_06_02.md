# MUSU 1.15.0-rc.1 Frontend Polling Timeout Audit

Date: 2026-06-02 08:17 KST
Wiki ID: wiki/539

## Scope

This audit addresses the operator-reported idle busy-loop risk from frontend
health/refetch loops. The goal is to reduce the chance that a hidden dashboard,
offline bridge, or slow local proxy request keeps a browser/WebView2 task alive
indefinitely.

## Change

`musu-bee/src/lib/useLowDutyPolling.ts` now supports
`taskTimeoutMs`. When configured, each poll run receives an `AbortSignal`
combined from the hook's cancellation controller and `AbortSignal.timeout`.

Timeouts were applied to these frontend background surfaces:

- dashboard aggregate refresh: `10s`
- dashboard relay-token lookup: `5s`; as of the 2026-06-02 11:14 KST relay
  idle hardening, this lookup is on-demand instead of running on dashboard
  mount
- service health polling: `5s`
- device discovery polling: `5s`
- node mesh polling: `8s`
- process polling: `5s`
- agents surface polling: `8s`
- task SSE fallback polling: `8s`

The existing low-duty behavior remains:

- no `setInterval`
- non-overlapping poll runs
- hidden tab delay/backoff through the shared hook
- cleanup aborts the active poll controller on unmount

## Validation

From `F:\workspace\musu-bee\musu-bee`:

```powershell
npx tsx --test src/app/runtime-polling-contract.test.ts
npm run typecheck
npm run build
npm run lint -- --quiet
```

Results:

- runtime-polling contract: `7/7` passed
- typecheck: passed
- production build: passed
- eslint quiet: passed

## 2026-06-02 11:14 KST Follow-up

Dashboard relay connection is now on-demand instead of mount-time background
work. `DashboardClient.tsx` no longer fetches `/api/account/relay-token` on
mount and no longer auto-connects the relay WebSocket when `relayInfo` and
`selectedNode` exist. The relay token fetch remains bounded to `5s` when the
operator explicitly clicks `Connect`; selected-node changes and unmount abort
the pending token fetch, clear retry timers, and close relay WebSocket state.

Validation passed:

- `npx tsx --test src/app/runtime-polling-contract.test.ts`: `8/8`
- `npm run typecheck`
- `npm run lint -- --quiet`
- `npm run build`
- `git diff --check`

This supersedes the older mount-time relay-token note above. Because it is a
runtime source change, the 08:40 KST primary evidence below is no longer
current-HEAD evidence after this commit; fresh MSIX smoke/process/CPU/matrix
evidence is required again.

## Code Audit Interpretation

This is a runtime source change. It is aligned with the idle CPU/resource
hardening roadmap, but it does not by itself prove release-grade idle CPU.

Before public release readiness can rely on this frontend change, rebuild and
install the MSIX and rerun:

- single-machine smoke
- packaged desktop repeated activation
- process ownership
- desktop-open idle CPU evidence
- four-state runtime CPU scenario matrix

## Follow-up Evidence

2026-06-02 08:40 KST follow-up: the required primary-machine refresh was
completed after this source change.

- Fresh `local-sideload-manual` MSIX build/install passed for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
- Desktop single-instance evidence passed:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-0832-HUGH_SECOND.desktop-single-instance.json`
- Process ownership evidence passed:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-0832-HUGH_SECOND.process-ownership.json`
- Single-machine smoke passed:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-083131-HUGH_SECOND.evidence.json`
- Desktop-open idle CPU passed:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-0833-HUGH_SECOND.desktop-open.evidence.json`
- Four-state runtime CPU matrix passed:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-083314-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The primary busy-loop report remains un-reproduced in current packaged
evidence. Public release still requires second-PC CPU/matrix/route evidence,
live `musu.pro` P2P evidence, `musu@musu.pro` evidence, and Store evidence.

The public release remains No-Go until the second Windows PC, live `musu.pro`
P2P control-plane, `musu@musu.pro`, and Store gates also pass.
