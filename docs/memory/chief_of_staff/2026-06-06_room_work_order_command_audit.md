# 2026-06-06 room work-order command audit

MUSU.PRO room work-order input now writes privacy-preserving command-center
audit events at the web-to-local bridge boundary.

Code changes:

- `POST /api/rooms/[roomId]/work-orders` now records `rooms.work_orders`
  events through `appendControlAudit`.
- The event includes authenticated P2P `owner_key`, `room_id`,
  `work_order_id`, `company_id`, `project_id`, `target_node`,
  `origin=musu.pro`, result, HTTP status, bridge status, and trace id.
- The event intentionally excludes `instruction` and `text`.
- `ControlAuditEvent` now supports optional P2P room/work-order context.
- `audit-operator-api-security-contract.ps1` gates the new audit contract.

Validation:

- `npm run test:routes`: `29/29`
- `npm run test:p2p`: `90/90`
- `npm run typecheck`: pass
- operator API security audit: `ok=true`, `fail_count=0`
- release verifier regressions: `ok=true`, `case_count=51`,
  `failed_case_count=0`
- `git diff --check`: pass

Dirty-tree go/no-go with public metadata skipped kept
`operator_api_security_contract_verified=true`, local artifacts and
single-machine true, runtime idle CPU/matrix `1/2`, targeted second-PC route
CPU true, and public release No-Go. The dirty git blocker is expected until
commit.

