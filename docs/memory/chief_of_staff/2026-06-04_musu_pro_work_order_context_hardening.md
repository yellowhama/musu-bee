# 2026-06-04 MUSU.PRO work-order context hardening

Updated the roadmap implementation around the operator decision that
`musu.pro` is the web input/project-room/company-meeting-room control plane
while local MUSU programs execute work.

Changes:

- Next `/api/tasks/forward` now forwards bounded `company_id`, `project_id`,
  `room_id`, `work_order_id`, and `origin` metadata to the local bridge.
- Rust `/api/tasks/delegate` now accepts the same fields and records a bounded
  audit note without prompt/cwd leakage.
- Rust `ForwardedTask` now carries the same context through remote forwarding
  and relay payload preview serialization.
- MCP `delegate_task` input schema now exposes the same fields.

Validation passed:

- `npm run test:routes` (`14/14`)
- `npx tsx --test src/app/api/tasks/forward/route.test.ts` (`2/2`)
- `npm run typecheck`
- `cargo fmt`
- `cargo check --bin musu`
- three targeted Rust unit tests for delegate audit, forwarded-task audit, and
  relay payload forwarded-task context preservation

Release note: this is runtime/web/Rust source, so packaged evidence is stale
for the new HEAD until a fresh MSIX/single-machine/CPU refresh is recorded.
