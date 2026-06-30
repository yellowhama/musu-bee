# Relay Release Tunnel Intent Opt-In Audit (2026-07-01)

## Verdict

MUSU remains **NO-GO** for release-grade relay transport.

This change only tightens the Rust lease-request boundary:

- Direct-failure relay lease requests still default to
  `transport_intent=store_forward_queue`.
- If the local runtime is explicitly configured with
  `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`, the direct-failure lease request now sends
  `transport_intent=release_tunnel`.
- Callback relay leases remain `store_forward_queue`.
- The hosted release policy still fails closed because
  `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` and the Rust source still contains
  the `release_relay_tunnel_runtime_not_implemented` branch.

This is source-level contract hardening, not a relay runtime implementation.

## Changed Source

- `musu-rs/src/bridge/rendezvous.rs`
  - added `relay_transport_intent_for_direct_failure`
  - preserved default preview store-forward intent
  - added opt-in release-tunnel intent when
    `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`
  - added regression tests for both cases
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - updated the Rust intent audit so it verifies default store-forward plus
    opt-in release-tunnel behavior

## Verification

- `rustfmt --edition 2021 --check musu-rs\src\bridge\rendezvous.rs`: passed
- `cargo test --manifest-path musu-rs\Cargo.toml relay_lease_request --lib -j 1 -- --nocapture`:
  passed, `4 passed`, `551 filtered out`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`,
  `generated_at=2026-07-01T04:15:46.9315977+09:00`
- `scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json`:
  `ok=false`, `checked_at=2026-07-01T04:23:32.2946904+09:00`,
  `release_relay_tunnel_runtime_implemented=false`,
  `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `git diff --check`: passed
- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`:
  indexed `3579 files` and `3917 symbols`
- Index search for
  `relay_transport_intent_for_direct_failure MUSU_P2P_RELAY_TRANSPORT_WIRED`
  returns this report.
- Product brain source ingest under `tenant_id=local`, `workspace_id=musu`
  created 3 sources, `/v1/process` reported `processed=3`, `recovered=0`,
  and `/v1/query` returned 4 results with top title
  `wiki/1201 relay release tunnel intent opt-in wiki entry`.

Pre-commit go/no-go recheck:

- `scripts/windows/write-release-go-no-go.ps1 -Json`
- `generated_at=2026-07-01T04:26:16.562248+09:00`
- `ready_for_public_desktop_release=false`
- `full_product_spec_ready=false`
- `blockers=11`
- `manifest_git.dirty=true`
- Dirty files at that moment:
  `musu-rs/src/bridge/rendezvous.rs`,
  `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`

## System Design Audit

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Release relay tunnel runtime is still absent. | P2P status reports `release_relay_tunnel_runtime_implemented=false` and the not-implemented branch active. | Relay cannot be claimed as delegated-work transport. | Implement the real `quic_relay_tunnel` byte path and proof emission. |
| HIGH | The new selector must not be treated as release readiness. | `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` only changes the requested lease intent; hosted policy still requires runtime markers and proofs. | Prevents env-only release claims. | Keep `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` until live transport exists. |
| HIGH | Existing package evidence is stale after this source change. | go/no-go sees source dirty before commit; after commit, package-bound evidence must be recaptured against the new commit. | Current local package proofs no longer cover the exact source revision. | Rebuild/reinstall and refresh local package evidence before using these lanes as current. |
| INFO | Store-forward fallback remains the default. | New Rust test `relay_lease_request_records_failed_direct_paths_without_using_relay_as_default` removes the flag and expects `StoreForwardQueue`. | The preview queue path is not accidentally promoted. | Keep callback relay leases on store-forward until release runtime lands. |
| INFO | Release-tunnel intent is now explicit from Rust. | New Rust test `relay_lease_request_uses_release_tunnel_intent_when_transport_flag_is_set` expects `ReleaseTunnel`. | Future runtime work can request release leases without untyped JSON escape hatches. | Next implementation must move bytes and emit `musu_quic_tls_transport` proof. |

## Product Spec Delta

The relay lease contract is now:

1. Missing local transport flag: direct-failure runtime requests
   `store_forward_queue`.
2. `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`: direct-failure runtime requests
   `release_tunnel`.
3. Release-tunnel intent is necessary but insufficient. The product remains
   blocked until the local runtime implements real byte transit, hosted KV/env
   is configured, route evidence proves `quic_tls_1_3`, delivery proof is
   attached, and a direct-blocked two-PC physical proof passes.

## Next Steps

1. Implement the local `quic_relay_tunnel` runtime instead of expanding the
   preview store-forward queue.
2. Emit relay transport proof from the real byte path:
   `transport_kind=quic_relay_tunnel`,
   `encryption=quic_tls_1_3`,
   `transport_verified_by=musu_quic_tls_transport`.
3. Provision hosted KV/Upstash env and rerun
   `record-p2p-control-plane-evidence.ps1`.
4. After this commit, rebuild/reinstall the package and refresh the local
   package evidence lanes because the Rust source changed.
