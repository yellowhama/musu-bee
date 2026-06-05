# MUSU 1.15.0-rc.1 Room Work-Order Command Audit

Generated: 2026-06-06 05:35 KST

## Summary

MUSU.PRO room work-order input now writes a local command audit event whenever
an authenticated room work order reaches the local bridge boundary, fails bridge
forwarding, or is rejected after P2P control auth.

This hardens the product boundary without changing the execution model:

- MUSU.PRO can accept authenticated remote room/work-order input.
- MUSU Desktop/bridge still executes the work locally.
- The audit log records owner, room, work-order, project, target node, status,
  and trace metadata.
- The audit log intentionally does not store the instruction text.

## Code Changes

- `musu-bee/src/app/api/rooms/[roomId]/work-orders/route.ts`
  - imports `appendControlAudit`, `createTraceId`, and `p2pControlPrincipal`
  - writes `rooms.work_orders` audit events for accepted bridge forwarding,
    bridge errors, invalid JSON, and missing instruction after auth
  - records `owner_key`, `room_id`, `work_order_id`, `company_id`,
    `project_id`, `target_node`, `origin=musu.pro`, result, HTTP status, and
    bridge status
  - avoids persisting `instruction` or `text` in command-center audit JSONL
- `musu-bee/src/lib/control-audit.ts`
  - extends `ControlAuditEvent` with optional P2P room/work-order context
- `musu-bee/src/app/api/rooms/[roomId]/work-orders/route.test.ts`
  - verifies accepted work orders write a privacy-preserving audit event
  - verifies bridge-unavailable failures are audit-logged without instruction
    text
- `scripts/windows/audit-operator-api-security-contract.ps1`
  - now gates room work-order P2P auth, owner principal extraction, command
    audit logging, and regression coverage

## Validation

Passed:

- `npm run test:routes`: `29/29`
- `npm run test:p2p`: `90/90`
- `npm run typecheck`
- `scripts\windows\audit-operator-api-security-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=51`, `failed_case_count=0`
- `git diff --check`

Dirty-tree go/no-go with public metadata skipped confirms the security gate is
still healthy:

- `operator_api_security_contract_verified=true`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- targeted second-PC route CPU `true`
- `p2p_control_plane_verified=false`
- `ready_for_public_desktop_release=false`

The dirty-tree run also correctly adds the `git` blocker until this change is
committed.

## Qualitative Audit

No high or medium issue was found in this change.

This closes a concrete security-hardening gap in the current MUSU.PRO remote
input model: room work orders were authenticated and owner-scoped before, but
the web-to-local bridge handoff was not covered by the same command-center
audit trail as other local control routes. That made later forensic review
weaker if a room input caused local execution.

The implementation logs structured metadata only. It deliberately avoids
logging the user's instruction body so the audit trail proves control-plane
action without turning command audit JSONL into a prompt/content store.

## Remaining Release Blockers

Public desktop release remains No-Go until:

1. Real second-PC multi-device evidence is recorded.
2. Runtime idle CPU passes on at least two machines.
3. Runtime CPU scenario matrix passes on at least two machines.
4. Production `https://musu.pro` P2P control-plane evidence proves
   owner-scoped release-grade storage, relay transport status, route evidence,
   and relay payload delivery proof.
5. `musu@musu.pro` support mailbox delivery is operator-verified.
6. Store/Partner Center release evidence is recorded.

