# 2026-06-07 Room Work-Order Outbound Pickup Inbox

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_WORK_ORDER_OUTBOUND_PICKUP_INBOX_2026_06_07.md`

Code:

- `musu-bee\src\lib\roomWorkOrderStore.ts`
- `musu-bee\src\app\api\rooms\[roomId]\work-orders\route.ts`
- `musu-bee\src\app\api\rooms\[roomId]\work-orders\route.test.ts`
- `musu-bee\src\lib\control-audit.ts`
- `scripts\windows\smoke-one-machine-musu-pro-work-order.ps1`
- `scripts\windows\audit-operator-api-security-contract.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Current result:

- MUSU.PRO room work-order route now supports explicit
  `delivery_mode: "desktop_outbound_pickup"`.
- Server stores a durable owner-scoped `musu.room_work_order.v1` queued record.
- `GET /api/rooms/[roomId]/work-orders` lists same-owner public records.
- `PATCH /api/rooms/[roomId]/work-orders` with schema
  `musu.room_work_order_claim.v1` claims queued records for the target Desktop.
- Public responses strip `owner_key`.
- Cross-owner claim attempts return zero records.
- Existing local/dev bridge-forward path remains available.

Latest smoke evidence:

- `docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260607-215300-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`
- `ok=false`
- `fail_count=12`
- bridge URL `http://127.0.0.1:9741`
- account login missing
- P2P control token missing
- POST/claim skipped without token

Validation:

- `npm run test:routes`: `34/34`
- `npx tsc --noEmit --pretty false`: pass
- one-machine work-order smoke diagnostic No-Go with expected login/token
  blockers
- operator API security audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=true`, `failed_case_count=0`,
  `case_count=106`
- `git diff --check`: pass

Remaining work:

- packaged runtime login/control credential
- Desktop room presence
- packaged Desktop outbound claim client
- local bridge execution handoff
- result/status/evidence return
- post-run idle CPU evidence

Search terms should include `room work-order outbound pickup inbox`,
`desktop_outbound_pickup`, `musu.room_work_order_claim.v1`,
`roomWorkOrderStore`, `20260607-215300-HUGH_SECOND`,
`P2P control token`, and `127.0.0.1:9741`.
