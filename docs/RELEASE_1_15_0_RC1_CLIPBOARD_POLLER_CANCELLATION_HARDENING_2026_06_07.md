# MUSU 1.15.0-rc.1 Clipboard Poller Cancellation Hardening

Date: 2026-06-07 KST

## Summary

This change removes a remaining idle busy-loop hardening gap from the opt-in
clipboard monitor. Clipboard polling was already disabled by default through
`MUSU_ENABLE_CLIPBOARD_SYNC`, but when enabled the blocking monitor loop had a
fixed sleep and no cancellation contract.

The monitor now owns a `CancellationToken`, installs a Ctrl-C watcher, exits the
blocking loop after cancellation, and returns the token to callers that need an
explicit shutdown handle later.

## Changed Files

- `musu-rs/src/io/clipboard.rs`
  - `start_clipboard_monitor(...)` now creates a `CancellationToken`.
  - The blocking poll loop uses `while !worker_token.is_cancelled()`.
  - The loop rechecks cancellation after the 2s sleep before touching the OS
    clipboard.
  - A Ctrl-C watcher cancels the token.
- `scripts/windows/audit-rust-background-loop-contract.ps1`
  - The Rust background-loop release audit now requires the clipboard monitor
    cancellation token, Ctrl-C cancellation, cancellation-scoped blocking loop,
    sleep, and exit-after-cancel checks.
- `scripts/windows/write-release-go-no-go.ps1`
  - The idle busy-loop candidate status for `clipboard polling` now requires
    the same cancellation checks instead of only opt-in plus sleep.
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - The release verifier idle busy-loop source contract now fails if go/no-go
    stops requiring clipboard cancellation.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
  - `unaudited_spawn_hit_count=0`
  - clipboard checks include cancellation token, Ctrl-C cancellation, blocking
    spawn under cancellation, sleep, and exit after cancellation
- `cargo check --manifest-path .\musu-rs\Cargo.toml --lib`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib clipboard`
  - compiled successfully
  - `0` clipboard-named tests executed, `338` filtered
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=104`
  - `failed_case_count=0`

## Qualitative Audit

No high or medium issue found in the patch.

- The feature remains opt-in, so default packaged idle behavior is unchanged.
- The loop still sleeps between polls and now has a shutdown path.
- The audit gate was strengthened, so this cannot silently regress back to a
  non-cancellable blocking poller.
- The go/no-go idle busy-loop candidate summary now requires the cancellation
  checks too.
- The returned token is backward-compatible because existing callers may ignore
  it.

Residual risk: the current local desktop evidence was captured before this
runtime source change. After this commit lands, the release gate should treat
that evidence as stale for public release purposes until packaged desktop
single-machine/process/startup/desktop-single-instance/CPU matrix evidence is
refreshed again.

## Release Status

This is CPU/hardening progress only. It does not close the public desktop
release gate by itself.

Still open:

- second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix
- targeted second-PC route-attempt CPU evidence on a clean commit
- hosted MUSU.PRO P2P relay/control-plane proof
- support mailbox proof
- Store release proof

## Next Step

Continue with the release relay/tunnel runtime implementation without flipping
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED` or `RELAY_TUNNEL_RUNTIME_IMPLEMENTED` until
real `quic_relay_tunnel` payload movement and release-grade transport proof are
present. For CPU, refresh packaged local evidence after this code lands, then
repeat the same CPU matrix on the second PC.
