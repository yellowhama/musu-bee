# 2026-06-08 room work-order drain delivery ack

The one-machine MUSU.PRO remote-input path moved forward but is not complete.

Implemented:

- `musu.room_work_order_delivery.v1` server PATCH path for claimed room work
  orders.
- Claimed work can become `accepted`, return to `queued` after local bridge
  handoff failure, or become terminal `failed`.
- Rust local drain orchestration moved into
  `musu-rs\src\install\room_work_orders.rs`.
- Local drain now submits server delivery ack and requires server response
  outcome to match the requested delivery status.
- Smoke/verifier token fallback now uses the real `$musuHomeCandidate` path.

Current evidence:

- latest smoke:
  `docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260608-002507-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`
- result: `ok=false`, `fail_count=11`
- local packaged bridge is reachable at `127.0.0.1:9741`
- `localhost:3001` is not the packaged runtime success criterion
- blocker remains login/token, not local bridge startup

Do not claim complete one-machine MUSU.PRO E2E until packaged runtime login or
owner-scoped P2P token exists, current CLI changes are packaged, work-order
POST/drain/bridge task/server ack/result return pass, and post-run 60s CPU
evidence is captured.

Validation this pass:

- `cargo check --bin musu` passed
- route test `13/13` passed
- `npx tsc --noEmit --pretty false` passed
- release verifier `106/106` passed
- `git diff --check` passed
- filtered Rust test was stopped during long test-profile compile; do not count
  it as passed
