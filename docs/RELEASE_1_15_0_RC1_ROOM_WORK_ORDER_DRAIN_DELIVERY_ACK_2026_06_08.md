# MUSU 1.15.0-rc.1 Room Work-Order Drain Delivery Ack

Date: 2026-06-08 00:50 KST

## Purpose

This change advances the one-machine MUSU.PRO functional path without changing
the product boundary:

- MUSU.PRO receives authenticated remote work-order input and owns the
  owner-scoped room inbox.
- The installed MUSU Desktop/CLI claims work outbound and hands it to the local
  bridge.
- MUSU.PRO records whether the local bridge handoff was accepted, requeued, or
  failed.
- MUSU.PRO still does not execute the local task.

The immediate problem fixed here is the stuck claimed-work state. Before this
change, the Desktop drain path could claim work and pass it to the bridge, but
there was no server-side delivery acknowledgement or requeue path after local
bridge handoff.

## Code

Server/API:

- `musu-bee\src\lib\roomWorkOrderStore.ts`
  - added `last_error`
  - added `RoomWorkOrderDeliveryInput`
  - added `markRoomWorkOrderDelivery(...)`
  - supports `accepted`, `queued`, and `failed` delivery state transitions
- `musu-bee\src\app\api\rooms\[roomId]\work-orders\route.ts`
  - `PATCH` now dispatches `musu.room_work_order_claim.v1`
  - `PATCH` now dispatches `musu.room_work_order_delivery.v1`
  - delivery ack returns `accepted`, `requeued`, or `failed`
  - delivery audit writes `room.work_order.delivery`

Rust local program:

- `musu-rs\src\cloud\mod.rs`
  - added `RoomWorkOrderDeliveryRequest`
  - added `RoomWorkOrderDeliveryResponse`
  - added `MusuCloud::submit_room_work_order_delivery(...)`
- `musu-rs\src\install\room_work_orders.rs`
  - new module owning room work-order claim/drain orchestration
  - moved drain helper state out of the 6000-line CLI file
  - preserves `permission_envelope` in bridge delegate body
  - resolves control token from `MUSU_P2P_CONTROL_TOKEN`,
    `MUSU_ROUTE_EVIDENCE_TOKEN`, `MUSU_TOKEN`, then `~/.musu/token`
  - submits server delivery ack after each bridge handoff
  - treats server ack as valid only when the response outcome matches the
    requested delivery status
- `musu-rs\src\install\cli_commands.rs`
  - keeps clap option types and dispatches room work-order execution to the new
    module
- `musu-rs\src\bridge\handlers\tasks.rs`
  - accepts advisory `permission_envelope` on local bridge delegate requests

Smoke/verifier:

- `scripts\windows\smoke-one-machine-musu-pro-work-order.ps1`
  - token fallback now checks `~/.musu\token`
  - verifies `server_ack_count` in drain JSON
- `scripts\windows\test-release-evidence-verifiers.ps1`
  - source contract now matches the `$musuHomeCandidate` token fallback and
    passes again

## Current Diagnostic Evidence

Latest one-machine MUSU.PRO smoke:

`docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260608-002507-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`

Result:

- `ok=false`
- `fail_count=11`
- `musu_exe_source=windowsapps_alias`
- bridge URL: `http://127.0.0.1:9741`
- `account_logged_in=false`
- `p2p_control_token_present=false`
- fixed `localhost:3001` assumption: `false`
- `musu up --json`: `ok=true`
- `musu doctor --json`: `overall=warn`
- room presence publish/list: `not_logged_in`
- work-order POST/drain skipped because no owner-scoped P2P control token is
  available
- linked post-run idle CPU diagnostic:
  `.local-build\runtime-idle-cpu\20260608-002305-HUGH_SECOND.runtime-started-after-work-order-drain-fix.evidence.json`
  with `ok=true`

This evidence proves the local packaged bridge is available and the smoke no
longer depends on `localhost:3001`. It does not prove one-machine MUSU.PRO
remote-input execution yet because this Windows account is not logged in and no
owner-scoped P2P control token exists.

## Code Audit Status

Thermo-nuclear review result after this pass:

- fixed immediate release verifier failure
- reduced `musu-rs\src\install\cli_commands.rs` from 6153 lines to 5556 lines
  by extracting room work-order claim/drain execution
- strengthened server ack validation so `ack.ok` alone is not enough
- remaining structural debt:
  - `cli_commands.rs` is still over 1000 lines
  - `musu-rs\src\cloud\mod.rs` is still over 1000 lines
  - `scripts\windows\test-release-evidence-verifiers.ps1` is still over 1000
    lines
  - KV room work-order claim/delivery is still read-modify-write and not a
    production atomic queue
  - `permission_envelope` is preserved but still advisory, not enforced

## Validation

Passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo check --bin musu`
- `npx tsx --test "src/app/api/rooms/[[]roomId[]]/work-orders/route.test.ts"`
  with `13/13` passing
- `npx tsc --noEmit --pretty false`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-release-evidence-verifiers.ps1 -Json`
  with `ok=true`, `case_count=106`, `failed_case_count=0`
- `git diff --check`

Not completed:

- `cargo test --bin musu room_work_order -- --nocapture` was stopped during the
  test-profile Rust compile after the previously observed long compile
  behavior. Treat Rust unit-test proof as missing for this pass; `cargo check`
  is the Rust compile gate that passed.

## Remaining Release Work

One-machine MUSU.PRO E2E remains open:

1. log the packaged MUSU runtime into MUSU.PRO or provide an owner-scoped P2P
   control token;
2. rebuild/package the current CLI changes so the installed alias includes the
   delivery ack/requeue drain path;
3. rerun the one-machine smoke without `-AllowUnverified`;
4. prove work-order POST, local Desktop claim, local bridge task creation,
   server delivery ack, and result/status return;
5. capture post-run 60s idle CPU evidence after the remote-input flow.

Public release remains No-Go until one-machine MUSU.PRO E2E, second-PC
route/CPU/matrix evidence, hosted MUSU.PRO P2P/relay proof, support mailbox
proof, and Store/Partner Center evidence are complete.
