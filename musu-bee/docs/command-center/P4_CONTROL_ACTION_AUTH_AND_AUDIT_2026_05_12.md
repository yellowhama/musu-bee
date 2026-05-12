# P4 — Control Action Auth and Audit

Date: 2026-05-12  
Parent: `MASTER_PLAN_2026_05_12.md`  
Status: active

## Problem
Control-plane APIs must not execute or proxy operator actions before authentication is established. The live site already returns 401 for unauthenticated protected APIs, but the local watchdog adapter initially validated request shape before auth.

Dashboard control actions also need a basic audit trail.

## Files Owned
- `src/app/api/bridge/watchdog/route.ts`
- `src/app/api/bridge/watchdog/route.test.ts`
- `src/lib/control-audit.ts`
- `docs/command-center/*`

## Work Plan
1. Require an authenticated user before watchdog status or command proxying.
2. Keep the command allowlist at the web boundary.
3. Append one audit event for every watchdog command attempt after auth.
4. Record actor, node, command, result status, bridge status, and timestamp.
5. Keep the log local and JSONL-based for now.

## Acceptance Criteria
- Unauthenticated `GET /api/bridge/watchdog` returns 401 before node validation.
- Unauthenticated `POST /api/bridge/watchdog?...` returns 401 before command validation.
- Authenticated invalid command returns 400 before bridge proxy.
- Authenticated valid command proxies to the bridge and writes an audit event.
- Audit write failure does not block the control action response.

## Implementation TODO
- [x] Add local audit append helper.
- [x] Add auth gate to watchdog route.
- [x] Add audit event for watchdog POST.
- [x] Update route tests.
- [x] Run typecheck/build/smoke.

## Tests
- `npx tsx --test src/app/api/bridge/watchdog/route.test.ts` -> pass
- `npm run typecheck` -> pass
- `npm run build` -> pass
- `npx next start -p 3002`
- `curl -i http://localhost:3002/api/bridge/watchdog` -> 401 unauthenticated
- `curl -i -X POST "http://localhost:3002/api/bridge/watchdog?node=local&cmd=shell:exec"` -> 401 unauthenticated
- `curl -I http://localhost:3002/workspace` -> 307 `/login?redirect=%2Fworkspace`

## Implementation Notes
- `src/lib/control-audit.ts` appends JSONL events to `~/.musu/audit/command-center.jsonl`.
- `src/lib/auth-server.ts` now exposes `getUserFromRequest(req)` for route handlers that need request-scoped auth in tests and runtime.
- Watchdog GET/POST now check authentication before parameter or command validation.
- Authenticated POST writes audit events for both rejected commands and bridge-proxied commands.
- Audit write failure is logged but does not block the control response.

## Rollback
Remove `src/lib/control-audit.ts` and revert `watchdog/route.ts` to request validation before proxying.
