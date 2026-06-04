# MUSU 1.15.0-rc.1 MUSU.PRO Work-Order Context Hardening

**Wiki ID**: wiki/686
**Date**: 2026-06-04
**Scope**: web input / local execution boundary after operator product decision
that `musu.pro` should collect work orders and coordinate projects while local
MUSU programs execute the work.

## Decision

The product model is now enforced at the task-forwarding boundary:

- `musu.pro` is the web input, project room, company meeting room,
  rendezvous/path-selection, relay-fallback coordination, and evidence plane.
- local MUSU runtimes receive authenticated work orders and execute them on
  the device.
- P2P mesh remains the preferred machine-to-machine data path after
  web-assisted rendezvous.
- relay remains fallback-only and is not the default payload path.

## Code Changes

`musu-bee/src/app/api/tasks/forward/route.ts` now accepts bounded work-order
context fields and forwards them to the local bridge:

- `company_id`
- `project_id`
- `room_id`
- `work_order_id`
- `origin`

If `origin` is omitted, the route derives `musu.pro` for `musu.pro` hosts and
`local_dashboard` for local dashboard calls.

`musu-rs/src/bridge/handlers/tasks.rs` now accepts the same fields in
`DelegateRequest`, keeps prompt text out of audit notes, and writes a bounded
audit note with only task/work-order identifiers.

`musu-rs/src/bridge/handlers/forward.rs` now carries the same context through
`ForwardedTask`, so remote direct routing and relay payload preview queue
serialization do not drop the project-room/work-order identity.

`musu-rs/src/control/tools/params.rs` now exposes the same fields in the MCP
`delegate_task` input schema, keeping web/API/MCP task delegation aligned.

## Validation

Passed:

- `npm run test:routes` (`14/14`)
- `npx tsx --test src/app/api/tasks/forward/route.test.ts` (`2/2`)
- `npm run typecheck`
- `cargo fmt`
- `cargo check --bin musu`
- `cargo test --bin musu delegate_task_audit_note_keeps_work_order_context_without_prompt`
- `cargo test --bin musu forwarded_task_audit_note_is_bounded_and_excludes_prompt`
- `cargo test --bin musu relay_payload_request_for_forwarded_task_hashes_and_encodes_task`

## Release Impact

This is source code, not documentation-only work. The current packaged
single-machine/MSIX/CPU evidence is stale for this HEAD until a fresh build,
install, and primary evidence refresh are recorded.

This does not implement release-grade hosted relay/tunnel transport. It
hardens the web-input/local-executor contract and preserves context through
the existing local bridge, P2P direct forwarding, and relay payload preview
serialization path.

Public release remains No-Go on the existing blockers: second-PC
multi-device/CPU/matrix evidence, live `musu.pro` P2P owner-scoped
release-grade route proof, support mailbox delivery, and Store evidence.
