# 2026-06-07 mDNS Cancellation Hardening

The opt-in mDNS auto-discovery path now has a cancellation contract when it is
called from the low-duty MUSU.PRO cloud registration loop.

Changed:

- `musu-rs/src/peer/mdns.rs`
  - kept `discover_peers(...)` API
  - added `discover_peers_with_cancellation(...)`
  - added `auto_register_peers_with_cancellation(...)`
  - mDNS receive wait now selects between the bounded receive future and a
    `CancellationToken`
- `musu-rs/src/bridge/mod.rs`
  - bridge cloud registration passes `cloud_registration_cancel.clone()` into
    mDNS auto-registration
  - bridge loop breaks after mDNS returns if cancellation has fired
- release gates:
  - Rust background-loop audit now requires mDNS cancellation checks
  - go/no-go `mDNS discovery` idle busy-loop candidate requires those checks
  - release verifier source contract fails if that mapping regresses

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --lib`
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `unaudited_spawn_hit_count=0`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib mdns`
  - `3` passed
  - `335` filtered
- release verifier regression: `ok=true`, `case_count=104`,
  `failed_case_count=0`
- go/no-go source gates:
  - `rust_background_loop_contract_verified=true`
  - `idle_busy_loop_candidate_contract_verified=true`
  - `ready_for_public_desktop_release=false`

Product status:

- mDNS remains default-off behind `MUSU_ENABLE_MDNS=1`
- IPv6/Tailscale/virtual mDNS adapters remain separate opt-ins
- MUSU Desktop remains the local executor
- MUSU.PRO remains remote input/control-plane only
- current packaged local evidence is stale again because runtime source changed

Search terms: `GOAL v756`, `wiki/931`, `mDNS cancellation hardening`,
`discover_peers_with_cancellation`, `auto_register_peers_with_cancellation`,
`MUSU_ENABLE_MDNS`, `cloud_registration_cancel`, `browse cancellation select`,
`idle busy-loop candidate`, and `case_count=104`.
