# P2 — Dashboard API Contract

Date: 2026-05-12  
Parent: `MASTER_PLAN_2026_05_12.md`  
Status: active

## Problem
`DashboardClient` already renders, but several client calls do not match the accessible local API surface.

Known mismatches:
- Client calls `/api/account/relay-token`; local source has no route.
- Client calls `/api/bridge/watchdog?node=...`; bridge expects `/api/watchdog/{node}/status`.
- Client posts `/api/bridge/watchdog?node=...&cmd=...`; bridge expects `/api/watchdog/{node}/{command}`.
- Node freshness is currently synthetic and must not be trusted as real liveness.

## Files Owned
- `src/app/api/account/relay-token/route.ts`
- `src/app/api/bridge/watchdog/route.ts`
- `src/components/dashboard/DashboardClient.tsx`
- `src/lib/nodes-server.ts`
- `docs/command-center/*`

## Work Plan
1. Add a local `/api/account/relay-token` route that mirrors live existence and fails closed when unauthenticated or unconfigured.
2. Add a local `/api/bridge/watchdog` adapter route that translates dashboard query shape to bridge path shape.
3. Keep command allowlist at the web boundary.
4. Run typecheck/build.
5. Defer node freshness until the source-of-truth for live nodes is settled.

## Acceptance Criteria
- `GET /api/account/relay-token` exists locally.
- Unauthenticated relay-token request returns 401.
- Authenticated but unconfigured relay-token request returns 503, not fake credentials.
- `GET /api/bridge/watchdog?node=X` proxies to `BRIDGE_URL/api/watchdog/X/status`.
- `POST /api/bridge/watchdog?node=X&cmd=bridge:restart` proxies to `BRIDGE_URL/api/watchdog/X/bridge:restart`.
- Unknown commands return 400 before hitting the bridge.

## Implementation TODO
- [x] Add relay token route.
- [x] Add watchdog adapter route.
- [x] Replace fake node freshness.
- [x] Add route unit tests or integration smoke tests.

## Tests
- `npx tsx --test src/app/api/bridge/watchdog/route.test.ts`
- `npm run typecheck`
- `npm run build`
- `npx next start -p 3002`
- `curl -i http://localhost:3002/api/account/relay-token` -> 401 unauthenticated
- `curl -i http://localhost:3002/api/bridge/watchdog` -> 401 unauthenticated
- `curl -i -X POST "http://localhost:3002/api/bridge/watchdog?node=local&cmd=shell:exec"` -> 401 unauthenticated
- `curl -I http://localhost:3002/dashboard` -> 307 `/login?redirect=%2Fdashboard`

## Implementation Notes
- `src/lib/nodes-server.ts` now probes each configured node's `/health` endpoint with a 3 second timeout.
- A node is marked `online` only when that probe succeeds.
- Failed probes set `last_seen: null`, `health_status: offline`, and preserve the probe source/error in `meta`.
- This is still a local runtime observation, not a durable fleet registry. A persistent `last_seen` should come from bridge/registry once the live source-of-truth is aligned.

## Rollback
Delete the two new route files. The catch-all `/api/bridge/[...path]` remains unchanged.
