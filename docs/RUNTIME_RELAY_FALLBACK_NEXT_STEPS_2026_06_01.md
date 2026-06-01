# Runtime Relay Fallback Next Steps

**Wiki ID**: wiki/530
**Date**: 2026-06-01
**Scope**: next engineering steps after runtime forwarding began requesting fail-closed relay leases following terminal direct-route failure.

## Current State

- `musu.pro` has authenticated rendezvous, route-evidence, and relay lease policy endpoints.
- Rust bridge forwarding creates a rendezvous session, can use returned target candidates, writes local route evidence, submits evidence to `musu.pro` best-effort, and verifies HTTPS certificate fingerprints when pinned candidates are used.
- After all direct route attempts fail, bridge forwarding now requests `/api/v1/p2p/relay/lease` when a rendezvous session and account token exist.
- Failed runtime route evidence now records a `relay_fallback` addendum after that evaluation, including `direct_path_failed`, `lease_requested`, `status`, `lease_issued`, attempted route kinds, requested capability, policy/blockers, optional lease id, and relay failure class.
- Relay transport remains unwired. `relay_runtime_fallback_lease_request_wired=true` means the policy request exists, not that payload relay exists.
- mDNS remains opt-in; IPv6, Tailscale, and common VPN/virtual interfaces each require explicit opt-in.

## Code Audit Result

No new default relay data path was introduced. The direct route failure remains the returned failure unless a future relay transport is explicitly implemented behind the lease. The new `relay_fallback` evidence field is an audit record only; it does not imply `route_kind=relay` and does not set `payload_transited_musu_infra=true`.

The remaining product risks are:

1. No live two-machine evidence that a direct failure produces and persists a relay fallback evaluation on `musu.pro`.
2. No QUIC/TLS direct route proof accepted as release-grade; the verifier now also requires `transport_verified_by=musu_quic_tls_transport`, not just an `encryption=quic_tls_1_3` string.
3. No relay/tunnel payload transport behind the lease.
4. No second-PC `desktop-open` CPU sample for the two-machine idle budget.
5. The repeated Tailscale IPv6 mDNS `10065` logs are fixed by current defaults, but stale installed binaries or explicit opt-in env vars can still reproduce them.

## Next Implementation Order

1. Capture a live direct-route-failure lease request evidence run against a logged-in control plane. It should prove `direct_path_failed=true`, attempted direct route kinds, `relay_transport_wired=false`, and no payload relay.
2. Capture real second-PC route evidence with rendezvous candidate selection and HTTPS fingerprint pinning where possible.
3. Replace bridge HTTP evidence with QUIC/TLS route proof and update the release verifier to accept only `quic_tls_1_3` with `transport_verified_by=musu_quic_tls_transport`.
4. Implement relay/tunnel transport only after QUIC/TLS direct evidence is stable, and only behind an issued lease.
5. Capture two-machine `desktop-open` CPU evidence with owned WebView2 attribution on both PCs.
6. Refresh go/no-go, readiness audit, wiki, and indexer after each code/evidence commit.

## Validation Required Before Public Release

- `musu relay status --json` keeps `relay_default_data_path=false`.
- Route evidence explicitly marks `route_kind=relay` only when relay payload transport is actually used.
- Terminal direct-route failure evidence includes `relay_fallback` when relay fallback was evaluated, and `relay_fallback.lease_requested=false` for no-session/no-token skips.
- Relay lease denial, timeout, and missing-token cases do not hide the original direct-route failure.
- Current installed desktop build produces no default Tailscale IPv6 mDNS `ff02::fb%iface` / `os error 10065` / `closed channel` spam with all mDNS opt-in variables unset.

## 2026-06-01 12:03 KST Update

Implemented the evidence-contract half of the relay fallback path:

- `musu-rs/src/bridge/route_evidence.rs` and `musu-rs/src/cloud/mod.rs` now model `relay_fallback`.
- `musu-rs/src/bridge/handlers/forward.rs` attaches that evidence after terminal direct-route failure and relay lease evaluation.
- `/api/v1/p2p/route-evidence` now validates the field explicitly and stores it owner-scoped.
- `/api/tasks/delegate`, `/api/companies/{id}/run`, and workflow remote-step failure evidence pass the addendum through.

Validation passed: Rust route-evidence tests, targeted relay lease fallback test, `cargo build --bin musu -j 1`, route-evidence API tests, `npm run typecheck`, and `musu relay status --json`. Public release remains No-Go until the two-machine CPU and route evidence gates pass from a clean committed build.
