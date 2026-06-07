# 2026-06-07 Room Work-Order Outbound Pickup Inbox Index Refresh

MUSU local indexer was refreshed after the room work-order outbound pickup
inbox implementation.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- `3098 files`
- `2843 symbols`
- `11321 ms`

Indexed context includes:

- `musu-bee\src\lib\roomWorkOrderStore.ts`
- `musu-bee\src\app\api\rooms\[roomId]\work-orders\route.ts`
- `musu-bee\src\app\api\rooms\[roomId]\work-orders\route.test.ts`
- `scripts\windows\smoke-one-machine-musu-pro-work-order.ps1`
- `scripts\windows\audit-operator-api-security-contract.ps1`
- `docs\RELEASE_1_15_0_RC1_ROOM_WORK_ORDER_OUTBOUND_PICKUP_INBOX_2026_06_07.md`
- latest diagnostic smoke evidence `20260607-215300-HUGH_SECOND`
- WIKI/WIKI_INDEX/GOAL
- CoS memory

Search terms should include `GOAL v851`, `wiki/1026`, `3098 files`,
`2843 symbols`, `11321 ms`, `desktop_outbound_pickup`,
`musu.room_work_order_claim.v1`, `roomWorkOrderStore`, and
`20260607-215300-HUGH_SECOND`.
