# Runtime Relay Fallback Next Steps

**Wiki ID**: wiki/530
**Date**: 2026-06-01
**Scope**: next engineering steps after runtime forwarding began requesting fail-closed relay leases following terminal direct-route failure.

## Current State

- `musu.pro` has authenticated rendezvous, route-evidence, and relay lease policy endpoints.
- Rust bridge forwarding creates a rendezvous session, can use returned target candidates, writes local route evidence, submits evidence to `musu.pro` best-effort, and verifies HTTPS certificate fingerprints when pinned candidates are used.
- After all direct route attempts fail, bridge forwarding now requests `/api/v1/p2p/relay/lease` when a rendezvous session and account token exist.
- Failed runtime route evidence now records a `relay_fallback` addendum after that evaluation, including `direct_path_failed`, `lease_requested`, `status`, `lease_issued`, attempted route kinds, requested capability, policy/blockers, optional lease id, and relay failure class.
- `musu relay leases --json` now exposes an operator-side audit query for owner-scoped relay lease records, with optional `--session-id`, `--source-node-id`, `--target-node-id`, and `--limit` filters.
- Relay transport remains unwired. `relay_runtime_fallback_lease_request_wired=true` means the policy request exists, not that payload relay exists.
- Live production audit on `https://musu.pro` currently returns `p2p_control_auth_not_configured` for `musu relay leases --json` even when the desktop is logged in. This means the deployed P2P control endpoint is still using static control-token env auth and is not yet wired to the logged-in account/device token model the runtime CLI sends.
- mDNS remains opt-in; IPv6, Tailscale, and common VPN/virtual interfaces each require explicit opt-in.

## Code Audit Result

No new default relay data path was introduced. The direct route failure remains the returned failure unless a future relay transport is explicitly implemented behind the lease. The new `relay_fallback` evidence field is an audit record only; it does not imply `route_kind=relay` and does not set `payload_transited_musu_infra=true`.

The remaining product risks are:

1. `musu.pro` production P2P control auth is not configured for the runtime account token path; current live error is `p2p_control_auth_not_configured`.
2. No live two-machine evidence that a direct failure produces and persists a relay fallback evaluation on `musu.pro`.
3. No QUIC/TLS direct route proof accepted as release-grade; the verifier now also requires `transport_verified_by=musu_quic_tls_transport`, not just an `encryption=quic_tls_1_3` string.
4. No relay/tunnel payload transport behind the lease.
5. No second-PC `desktop-open` CPU sample for the two-machine idle budget.
6. The repeated Tailscale IPv6 mDNS `10065` logs are fixed by current defaults, but stale installed binaries or explicit opt-in env vars can still reproduce them.

## Next Implementation Order

1. Fix the production P2P control auth model: either configure a proper server-side control token for operator-only evidence lanes or, preferably, validate the same account/device token that `MusuCloud` sends from the logged-in runtime.
2. Re-run `musu relay leases --json` against `https://musu.pro` and require `ok=true` or an owner-scoped empty result before treating relay lease evidence as production-queryable.
3. Capture a live direct-route-failure lease request evidence run against a logged-in control plane. It should prove `direct_path_failed=true`, attempted direct route kinds, `relay_transport_wired=false`, and no payload relay.
4. Capture real second-PC route evidence with rendezvous candidate selection and HTTPS fingerprint pinning where possible.
5. Replace bridge HTTP evidence with QUIC/TLS route proof and update the release verifier to accept only `quic_tls_1_3` with `transport_verified_by=musu_quic_tls_transport`.
6. Implement relay/tunnel transport only after QUIC/TLS direct evidence is stable, and only behind an issued lease.
7. Capture two-machine `desktop-open` CPU evidence with owned WebView2 attribution on both PCs.
8. Refresh go/no-go, readiness audit, wiki, and indexer after each code/evidence commit.

## Validation Required Before Public Release

- `musu relay status --json` keeps `relay_default_data_path=false`.
- `musu relay leases --json` must be callable against production and must not report `p2p_control_auth_not_configured`.
- `musu relay leases --json` reports `owner_scope_verified=true` only after the production API returns a successful owner-scoped response.
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

## 2026-06-01 16:36 KST Update

Added an operator audit surface for the relay lease control plane:

- `musu-rs/src/cloud/mod.rs` can query `GET /api/v1/p2p/relay/lease` with bounded filters.
- `musu relay leases --json` prints schema `musu.relay_leases.v1`, login state, filters, count, returned leases, relay transport/default-data-path flags, `owner_scope_verified`, and a non-crashing `error` field.
- `musu relay status --json` now derives the registry URL from the same `MUSU_CLOUD_URL`/default base URL helper as the rest of the cloud client instead of hard-coding the string in the report.

Live audit result:

- `musu relay status --json` against the default `https://musu.pro` reported `logged_in=true`, `relay_control_plane_lease_wired=true`, `relay_runtime_fallback_lease_request_wired=true`, `relay_transport_wired=false`, `relay_default_data_path=false`, and `release_route_evidence_ready=false`.
- `musu relay leases --json` reached production but failed with `p2p_control_auth_not_configured`.

Interpretation:

- This is a production configuration/auth-model blocker, not a desktop payload relay success.
- The desktop runtime is sending its logged-in account token, while the deployed P2P control routes currently expect a static server env token (`MUSU_P2P_CONTROL_TOKEN`, `MUSU_ROUTE_EVIDENCE_TOKEN`, or `MUSU_TOKEN`).
- Do not claim production relay fallback evidence until the production API can validate the runtime token or issue/verify a scoped P2P control token.
