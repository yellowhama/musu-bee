# MUSU 1.15.0-rc.1 mDNS Cancellation Hardening

Date: 2026-06-07 KST

## Summary

This change closes the next idle busy-loop hardening gap in the opt-in mDNS
auto-discovery path. mDNS discovery was already disabled by default through
`MUSU_ENABLE_MDNS=1`, had separate IPv6/Tailscale/virtual-interface opt-ins,
and used a caller-supplied deadline plus 1s blocking receive timeout. The bridge
cloud registration loop, however, did not pass its shutdown token into the mDNS
auto-registration call.

The bridge now calls a cancellation-aware mDNS auto-registration wrapper and
passes the cloud registration `CancellationToken`. If shutdown fires during an
mDNS discovery window, the receive wait exits before the cloud loop continues to
the next network operation.

## Changed Files

- `musu-rs/src/peer/mdns.rs`
  - `discover_peers(...)` keeps the existing public API and delegates to
    `discover_peers_with_cancellation(...)`.
  - `discover_peers_with_cancellation(...)` accepts `Option<CancellationToken>`,
    exits immediately when already cancelled, and uses `tokio::select!` to
    break the receive wait when cancellation fires.
  - `auto_register_peers(...)` keeps the existing API.
  - `auto_register_peers_with_cancellation(...)` gives bridge background use a
    cancellation-aware wrapper.
- `musu-rs/src/bridge/mod.rs`
  - The low-duty MUSU.PRO cloud registration loop now calls
    `auto_register_peers_with_cancellation(...)` when `MUSU_ENABLE_MDNS=1`.
  - The loop breaks immediately if cancellation is observed after mDNS returns.
- `scripts/windows/audit-rust-background-loop-contract.ps1`
  - The Rust background-loop release audit now requires bridge mDNS
    auto-registration cancellation, mDNS browse cancellation token support, a
    cancellation select, and the auto-register cancellation wrapper.
- `scripts/windows/write-release-go-no-go.ps1`
  - The `mDNS discovery` idle busy-loop candidate now requires the new
    cancellation checks.
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - The release verifier idle busy-loop source contract now fails if go/no-go
    stops requiring the mDNS cancellation checks.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --lib`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
  - `unaudited_spawn_hit_count=0`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib mdns`
  - `3` passed
  - `0` failed
  - `335` filtered
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=104`
  - `failed_case_count=0`
- `scripts\windows\write-release-go-no-go.ps1 -Json`
  - `ready_for_public_desktop_release=false`
  - `local_artifacts_ready=true`
  - `single_machine_verified=false`
  - `rust_background_loop_contract_verified=true`
  - `idle_busy_loop_candidate_contract_verified=true`
  - `p2p_control_plane_env_ready=false`
- `git diff --check`

## Qualitative Audit

No high or medium issue was found in the patch.

- Default packaged behavior is unchanged because mDNS remains off unless
  `MUSU_ENABLE_MDNS=1`.
- The noisy adapter policy remains unchanged: IPv6, Tailscale, and common
  VPN/virtual interfaces are still separate opt-ins.
- Existing CLI discovery callers keep the same API and bounded deadline.
- The background bridge caller now has the stronger contract: bounded deadline,
  1s blocking receive timeout, disconnect break, and cancellation break.
- The release gate was strengthened, so this cannot silently regress back to a
  non-cancellable mDNS auto-registration path.

Residual risk: this is source hardening, not new packaged runtime evidence. The
current packaged local evidence predates this runtime source change, so
go/no-go correctly treats single-machine/process/startup/desktop/CPU evidence as
stale for current HEAD until the package is rebuilt/reinstalled and evidence is
refreshed.

## Product Spec Impact

The local/web split is unchanged:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, AI meeting room,
  presence, rendezvous, path selection, relay fallback, and evidence/control
  plane.
- mDNS is a local LAN discovery helper only. It is not the hosted control plane
  and it is not the default public release path.
- After web-assisted rendezvous/path selection, devices should still prefer
  direct local/P2P routes and use relay only as fallback.

## Release Status

This is CPU/runtime hardening progress only. It does not close the public
desktop release gate by itself.

Still open:

- fresh current-HEAD packaged local evidence after this runtime source change
- second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix
- targeted second-PC route-attempt CPU evidence on a clean commit
- hosted MUSU.PRO P2P relay/control-plane proof
- support mailbox proof
- Store release proof

## Next Step

Rebuild/reinstall the packaged local runtime and refresh one-machine evidence
again for current HEAD, then repeat the same CPU and route evidence on the
second PC. In parallel, keep the hosted MUSU.PRO relay proof work focused on
real `quic_relay_tunnel` payload movement and release-grade transport/delivery
proof; do not flip release markers based on preview store-forward paths.

## Index Refresh

After this report, the local MUSU indexer was refreshed:

- command: `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed files: `2833`
- indexed symbols: `2788`
- duration: `19358 ms`
- wiki: `wiki/932`
