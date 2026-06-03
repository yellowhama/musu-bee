# 1.15.0-rc.1 CLI Route Pinned Transport And Bounded SSE Visibility

Date: 2026-06-03 18:31 KST

Base commit before this change:
`e878d78b454128f8b072b7710ba569db22958df8`

## Summary

- `musu route` now selects HTTPS endpoints when resolved peer metadata advertises
  `transport_scheme=https` or an HTTPS public URL.
- CLI route evidence records `tls_cert_fingerprint_pin` identity proof only
  after the request path actually used the fingerprint-pinned HTTPS client.
- `useBoundedEventSource` no longer owns a direct `visibilitychange` listener;
  visible resume is delegated to `useLowDutyPolling`.

This is not QUIC/TLS relay payload transport implementation. Multi-device
release verification still requires `encryption=quic_tls_1_3` and
`transport_verified_by=musu_quic_tls_transport`.

## Code

- `musu-rs\src\bridge\tls_pin.rs`
- `musu-rs\src\bridge\handlers\forward.rs`
- `musu-rs\src\bridge\mod.rs`
- `musu-rs\src\bridge\route_evidence.rs`
- `musu-rs\src\install\cli_commands.rs`
- `musu-bee\src\lib\useBoundedEventSource.ts`
- `musu-bee\src\app\runtime-polling-contract.test.ts`

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `git diff --check`
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1` (`17/17`)
- `cargo test --manifest-path .\musu-rs\Cargo.toml bridge::handlers::forward --lib -- --test-threads=1` (`4/4`)
- `cargo test --manifest-path .\musu-rs\Cargo.toml bridge::route_evidence --lib -- --test-threads=1` (`7/7`)
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `npm run test:runtime-polling` (`14/14`)
- `scripts\windows\audit-frontend-polling-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`, `direct_interval_hit_count=0`,
  `direct_visibility_listener_hit_count=0`
- `npm run typecheck`
- `npm run test:p2p` (`35/35`)

## Go/No-Go

The source change is locally validated but public release remains No-Go:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `frontend_polling_contract_verified=true`
- runtime idle CPU valid machines: `1`
- runtime CPU scenario matrix valid machines: `1`
- `p2p_control_plane_verified=false`
- `p2p_relay_transport_wired=false`
- `p2p_relay_payload_transport_proven=false`

Remaining blocker areas:

- multi-device
- runtime-idle-cpu
- runtime-cpu-scenario-matrix
- support-mailbox
- store-release
- p2p-control-plane
- git

Because runtime source changed, the current clean packaged primary evidence is
historical until MSIX/smoke/CPU/matrix evidence is refreshed for this commit.
