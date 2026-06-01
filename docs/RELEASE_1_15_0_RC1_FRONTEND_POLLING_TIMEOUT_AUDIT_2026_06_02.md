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
- account relay-token lookup on dashboard mount: `5s`
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

The public release remains No-Go until the second Windows PC, live `musu.pro`
P2P control-plane, `musu@musu.pro`, and Store gates also pass.
