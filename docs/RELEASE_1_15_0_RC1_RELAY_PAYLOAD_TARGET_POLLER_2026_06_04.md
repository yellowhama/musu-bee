# Release 1.15.0-rc.1 - Relay Payload Target Poller - 2026-06-04

## Summary

The Rust bridge now has an opt-in target-side relay payload poller for the
lease-bound relay payload queue.

This is the next relay fallback slice after the request-driven local drain. The
default desktop profile remains quiet: the poller only starts when
`MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1`.

## Runtime contract

- `POST /api/relay/payloads/drain` still exposes the manual/request-driven
  drain response schema `musu.relay_payload_drain.v1`.
- The drain body was refactored into
  `drain_relay_payloads_for_local_target(...)` so HTTP drain and the poller
  share one claim, decode, local accept, and delivery acknowledgement path.
- `MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1` starts the target-side poller.
- `MUSU_RELAY_PAYLOAD_POLLER_INTERVAL_SEC` defaults to `60` and is floored at
  `30`.
- `MUSU_RELAY_PAYLOAD_POLLER_EMPTY_BACKOFF_MAX_SEC` defaults to `300`, never
  shrinks below the active interval, and is capped at `3600`.
- `MUSU_RELAY_PAYLOAD_POLLER_LIMIT` defaults to `1` and shares the manual drain
  clamp of `1..5`.
- The poller sleeps before the first cycle and sleeps under
  `tokio::select!` with a `CancellationToken`.
- Empty cycles and failures use capped exponential backoff; delivered payloads
  reset the backoff counter.

## Doctor and audit visibility

`musu doctor` now reports relay payload poller state in the background profile:

- enabled flag: `MUSU_ENABLE_RELAY_PAYLOAD_POLLER`
- normalized interval
- empty/failure backoff cap
- per-cycle claim limit

The Rust background-loop contract audit now checks the poller opt-in gate,
default interval, interval floor, backoff cap, hard ceiling, drain limit clamp,
cancellation-aware sleep, and shared drain primitive.

## Validation

Passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo test --manifest-path .\musu-rs\Cargo.toml relay_payload --lib -- --test-threads=1`
  - result: `19/19`
- `cargo test --manifest-path .\musu-rs\Cargo.toml doctor_background --lib -- --test-threads=1`
  - result: `5/5`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-rust-background-loop-contract.ps1 -Json`
  - result: `ok=true`, `fail_count=0`, `unaudited_loop_hit_count=0`
- `git diff --check`

## Release interpretation

This adds bounded opt-in target polling evidence. It does not complete public
release relay transport.

Remaining blockers include:

- production atomic/concurrent relay payload claim hardening
- actual release-grade QUIC/TLS relay tunnel proof
- hosted `musu.pro` relay payload proof with owner-scoped storage
- fresh packaged MSIX/smoke/CPU/matrix evidence after this source change
- second-PC runtime and multi-device evidence
- support mailbox and Store certification evidence
