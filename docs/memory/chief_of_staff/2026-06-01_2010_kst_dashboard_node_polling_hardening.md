# 2026-06-01 20:10 KST - Dashboard/Node Panel Polling Hardening

## Decision

The frontend busy-loop hardening scope now includes the remaining dashboard and
node panel custom refresh loops, not only workflow/screen/agents/onboarding.

## What Changed

- `musu-bee/src/components/dashboard/DashboardClient.tsx` now uses
  `useLowDutyPolling` for agents/tasks/watchdog/runs refresh.
- `musu-bee/src/components/NodePanel.tsx` now uses `useLowDutyPolling` for
  nodes, cloud registry, and discovered-node refresh.
- `musu-bee/src/app/runtime-polling-contract.test.ts` now guards six polling
  surfaces.
- `.gstack/` is ignored as local QA tool state.

## Validation

- `npx tsx --test src/app/runtime-polling-contract.test.ts` passed 6/6.
- `npm run typecheck` passed.
- `npm run build` passed.
- `git diff --check` passed.
- `rg -n "setInterval\(" musu-bee\src` returned no matches.

## Release Impact

This reduces frontend busy-loop risk for the operator-reported idle CPU problem,
but it is a source change. Treat earlier CPU evidence as stale for release
readiness until fresh primary and second-PC 60s CPU samples and four-state CPU
matrices are captured from a clean commit.
