# P0 — Source Alignment and Runtime Contract

Date: 2026-05-12  
Parent: `MASTER_PLAN_2026_05_12.md`  
Status: active

## Problem
The live `musu.pro` deployment and the accessible local `musu-bee` source do not currently line up.

Live:
- `/login`
- `/dashboard`
- `/workspace`
- `/api/account/relay-token`
- `/api/bridge/*`

Accessible local source:
- `/auth/login`
- `/dashboard`
- `/app`
- no local `/workspace`
- no local `/api/account/relay-token`

This means implementation can easily land in the wrong tree or fix a route that live traffic does not use.

## Files/Areas Owned
- `src/app/dashboard/page.tsx`
- `src/app/auth/login/page.tsx`
- `src/middleware.ts`
- `src/app/api/bridge/[...path]/route.ts`
- `src/app/api/account/relay-token/route.ts` if added locally
- `src/app/workspace/page.tsx` if added locally
- `docs/command-center/*`

## Work Plan

1. Record current live route behavior.
2. Record current local route tree.
3. Locate canonical live source.
4. If live source is unavailable locally, keep a source-alignment blocker in the plan and implement only local correctness fixes that do not pretend to be live.
5. Fix local low-risk defects:
   - CSS typo.
   - login redirect honoring `next`.
6. Prepare API alignment plan for relay/watchdog/node freshness.

## Acceptance Criteria
- Master plan names live/local mismatch explicitly.
- Current local branch and dirty state are preserved in documentation.
- Low-risk local fixes pass `npm run typecheck` and `npm run build`.
- Any remaining live-only uncertainty is not hidden.

## Implementation TODO
- [ ] CC-002 Identify live source path/repo.
- [ ] CC-003 Preserve current dashboard prototype patch.
- [x] CC-004 Fix local login return path.
- [x] CC-005 Fix `n@keyframes` typo.
- [x] CC-006 Decide relay-token local implementation vs canonical live sync.
- [x] CC-007 Decide watchdog adapter route vs client URL change.
- [x] CC-008 Decide node freshness source.

## 2026-05-12 Update
- Local source remains different from live deployment, so CC-002 is still open.
- Local correctness fixes were applied without claiming live readiness:
  - `/auth/login` now honors `next`/`redirect`.
  - `/api/account/relay-token` exists locally and fails closed.
  - `/api/bridge/watchdog` adapts dashboard query shape to bridge path shape.
  - `nodes-server.ts` no longer fabricates `last_seen` for every configured node.
- `last_seen` now means "last successful dashboard health probe"; unavailable nodes receive `last_seen: null` and `health_status: offline`.

## Tests
- `npm run typecheck`
- `npm run build`
- `curl -I https://musu.pro/dashboard`
- `curl -I https://musu.pro/workspace`
- `curl -I https://musu.pro/api/account/relay-token`
- `curl -I https://musu.pro/api/bridge/watchdog`

## Rollback
Docs can be reverted independently. Code changes in P0 should be limited to CSS and auth redirect behavior so rollback remains simple.
