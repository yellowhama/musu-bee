# MUSU 1.15.0-rc.1 Room Work-Order Outbound Pickup Inbox

Date: 2026-06-07 22:00 KST

## Purpose

This change removes the first server-side blocker in the one-machine
MUSU.PRO functional path. Hosted `https://musu.pro` cannot call a user's
`127.0.0.1` bridge directly, so room work orders now have a durable,
owner-scoped inbox and claim path for local MUSU Desktop outbound pickup.

This is not the full Desktop pickup loop yet. It is the MUSU.PRO server/API
foundation that the local Desktop runtime can claim from.

## Code

New store:

`musu-bee\src\lib\roomWorkOrderStore.ts`

Updated route:

`musu-bee\src\app\api\rooms\[roomId]\work-orders\route.ts`

Updated tests:

`musu-bee\src\app\api\rooms\[roomId]\work-orders\route.test.ts`

Updated audits/smoke:

- `scripts\windows\audit-operator-api-security-contract.ps1`
- `scripts\windows\smoke-one-machine-musu-pro-work-order.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

## Behavior

The existing bridge-forward path remains available for local/dev scenarios.

The new hosted-safe path is explicit:

1. `POST /api/rooms/[roomId]/work-orders`
2. body includes `delivery_mode: "desktop_outbound_pickup"`
3. MUSU.PRO stores a `musu.room_work_order.v1` record with:
   - authenticated `owner_key`
   - `room_id`
   - `work_order_id`
   - `target_node`
   - company/project context
   - bounded instruction
   - bounded permission envelope
   - status `queued`
4. `GET /api/rooms/[roomId]/work-orders?status=queued&target_node=<node>`
   lists only same-owner public work-order records.
5. `PATCH /api/rooms/[roomId]/work-orders` with schema
   `musu.room_work_order_claim.v1` claims queued work for the selected target
   Desktop and returns public claimed records without `owner_key`.

Security boundary:

- all work-order POST/GET/PATCH calls require P2P control auth;
- queued and claimed records are owner-scoped;
- cross-owner claim attempts return zero records;
- public API responses strip `owner_key`;
- command audit logs do not store prompt text.

## Latest Diagnostic Evidence

`docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260607-215300-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`

Current result:

- `ok=false`
- `fail_count=12`
- `musu up --json` passed
- `musu doctor --json` was not failed
- bridge URL: `http://127.0.0.1:9741`
- fixed `localhost:3001` assumption: `false`
- account logged in: `false`
- P2P control token present: `false`
- room presence publish/list still return `not_logged_in`
- work-order POST and claim are skipped because no P2P control token is present
- local bridge execution and post-run CPU evidence remain unproven

## Validation

- `npm run test:routes`: `34/34` passed
- `npx tsc --noEmit --pretty false`: passed
- `scripts\windows\smoke-one-machine-musu-pro-work-order.ps1 -AllowUnverified -Json`:
  diagnostic No-Go with expected login/token blockers
- `scripts\windows\audit-operator-api-security-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `failed_case_count=0`, `case_count=106`
- `git diff --check`: passed

## Remaining Work

Next implementation step:

- package/local runtime login must produce a valid MUSU.PRO account/control
  credential;
- local Desktop must publish fresh room presence;
- local Desktop must claim queued work orders using the new
  `musu.room_work_order_claim.v1` path;
- claimed work must be passed through local policy into the local bridge;
- status/result/evidence must be posted back to MUSU.PRO;
- post-run 60s idle CPU evidence must be captured and linked.

Two-machine testing still waits until this one-machine remote-input path is
proven end to end.
