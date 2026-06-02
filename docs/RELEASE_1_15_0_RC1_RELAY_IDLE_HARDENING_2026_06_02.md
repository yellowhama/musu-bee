# MUSU 1.15.0-rc.1 Relay Idle Hardening Audit

Date: 2026-06-02 11:14 KST
Wiki ID: wiki/546

## Scope

This audit addresses one remaining frontend idle/background candidate: the
dashboard previously requested `/api/account/relay-token` on mount and opened
the cloud relay WebSocket automatically once a node was selected.

That behavior was too eager for the Store desktop idle path. Relay should be a
fallback path for an intentional connection or route attempt, not a background
connection created by merely opening the dashboard.

## Change

`musu-bee/src/components/dashboard/DashboardClient.tsx` now treats the cloud
relay as an on-demand fallback:

- no dashboard-mount relay token fetch
- no automatic relay WebSocket connection when `relayInfo` and `selectedNode`
  are present
- `Connect` lazily fetches the relay token with the existing `5s` timeout
- selected-node changes and unmount abort pending relay-token fetches, clear
  retry timers, and close any relay WebSocket
- relay reconnect remains bounded to `5` attempts after a user-initiated
  connection

`musu-bee/src/app/runtime-polling-contract.test.ts` now asserts the dashboard
relay path stays on-demand and does not regress to mount-time polling.

## Validation

From `F:\workspace\musu-bee\musu-bee`:

```powershell
npx tsx --test src/app/runtime-polling-contract.test.ts
npm run typecheck
npm run lint -- --quiet
npm run build
```

From `F:\workspace\musu-bee`:

```powershell
git diff --check
```

Results:

- runtime-polling contract: `8/8` passed
- typecheck: passed
- eslint quiet: passed
- production build: passed
- `git diff --check`: passed

## Code Audit Interpretation

This is aligned with the requested `musu.pro` control-plane model:

- `musu.pro` should help select/establish/fallback routes.
- Relay is no longer the default dashboard idle path.
- Relay remains available as a bounded fallback instead of a background
  connection created by page load.

This is a runtime source change. It reduces a frontend idle busy-loop/network
candidate, but it invalidates the previously current primary MSIX/runtime
evidence for current-HEAD release claims.

## Required Follow-up Evidence

Before this change can be counted in public release readiness, rebuild and
install the MSIX and rerun:

- desktop single-instance evidence
- process ownership evidence
- single-machine smoke evidence
- desktop-open idle CPU evidence
- four-state runtime CPU scenario matrix

Public release still remains No-Go until second-PC CPU/matrix/route evidence,
live `musu.pro` owner-scoped relay/control-plane evidence, `musu@musu.pro`
mailbox evidence, and Store evidence also pass.

## Follow-up Evidence

2026-06-02 12:05 KST update: fresh primary evidence was recorded after this
runtime source change.

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-113614-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-113702-HUGH_SECOND.process-ownership.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-113759-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-114149-HUGH_SECOND.desktop-open.evidence.json`
- four-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-115359-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

The clean post-evidence go/no-go still reports No-Go because runtime CPU and
matrix gates are `1/2` machines, and multi-device, live P2P control-plane,
`musu@musu.pro`, and Store evidence remain open.
