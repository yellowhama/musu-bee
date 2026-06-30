# Relay Lease Transport Intent Fail-Closed Audit (2026-06-30)

## Verdict

MUSU remains **NO-GO** for release-grade relay transport, but the relay lease
API contract is now sharper.

`POST /api/v1/p2p/relay/lease` now accepts an optional `transport_intent`:

- `store_forward_queue` is the default and preserves the existing preview
  store-forward lease behavior.
- `release_tunnel` is explicit and fail-closed until the real release tunnel
  runtime exists.
- unknown values are rejected by request validation.

This prevents a caller from silently treating the preview store-forward queue as
the future release tunnel. It does **not** implement `quic_relay_tunnel`, wire
release storage, or prove delegated work over relay.

## Evidence

Changed source:

- `musu-bee/src/app/api/v1/p2p/relay/lease/route.ts`
- `musu-bee/src/app/api/v1/p2p/relay/lease/route.test.ts`
- `musu-rs/src/cloud/mod.rs`
- `musu-rs/src/bridge/rendezvous.rs`
- `musu-rs/src/bridge/handlers/forward.rs`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`

Verification:

- `npm run test:p2p`: passed, `133/133`
- `npm run typecheck`: passed
- `rustfmt --check --edition 2021` on touched Rust files: passed
- `cargo test --manifest-path musu-rs\Cargo.toml relay_lease_request_serializes --lib -j 1`:
  `2 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml relay_lease_request_records_failed_direct_paths_without_using_relay_as_default --lib -j 1`:
  `1 passed`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `generated_at=2026-06-30T18:17:50.2333327+09:00`, `ok=true`,
  `fail_count=0`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `generated_at=2026-06-30T18:21:38.4387320+09:00`, `ok=true`,
  `case_count=219`, `failed_case_count=0`

## Findings

| Severity | Issue | Evidence | Impact | Next |
|---|---|---|---|---|
| NO-GO | Release relay tunnel runtime is still missing. | `release_tunnel` lease intent returns release-runtime blockers including `relay_transport_not_wired` and `relay_tunnel_runtime_not_implemented`. | Relay cannot be claimed as delegated-work transport. | Implement the real `quic_relay_tunnel` runtime and direct-blocked two-PC proof. |
| HIGH | Store-forward queue remains preview fallback, not release transport. | Default intent is `store_forward_queue`; release intent uses separate blockers and does not fall through to queue-only readiness. | Prevents false release relay claims. | Keep queue evidence separate from release tunnel proof. |
| HIGH | Rust runtime lease DTOs now carry the same intent contract. | `P2pRelayLeaseRequest.transport_intent` serializes `store_forward_queue` and `release_tunnel`; direct-failure and callback fallback builders explicitly send `StoreForwardQueue`. | The future runtime no longer needs an untyped JSON escape hatch to request release tunnel leases. | Use `ReleaseTunnel` only when real tunnel byte transit and proof generation land. |
| MED | API contract now rejects unknown transport intent. | Test `rejects unknown relay transport intent` expects 400 with issue path `transport_intent`. | Future clients get explicit contract failure instead of ambiguous behavior. | Keep enum versioning conservative if more transport kinds are added. |
| INFO | The source audit now guards the intent split. | P2P relay contract audit checks web lease intent, Rust `RelayTransportIntent`, and both direct-failure/callback store-forward callers. | Regression back to queue-as-release is more visible. | Keep this audit in release verifier regressions. |

## Product Spec Delta

The product spec now has a clearer relay lease contract:

1. A lease request without `transport_intent` means preview store-forward queue.
2. A lease request with `transport_intent=release_tunnel` means release-grade
   tunnel intent and must stay red until real tunnel runtime, storage, transport
   proof, route evidence, and payload delivery proof exist.
3. Rust runtime callers that are still preview store-forward paths explicitly
   send `transport_intent=store_forward_queue`.
4. The P2P/relay lane remains blocked by real runtime, live hosted storage/env,
   live P2P control-plane evidence, route proof, transport proof, delivery
   proof, and two-PC direct-blocked physical proof.

## Next Steps

1. Implement the release tunnel byte path rather than expanding the preview
   queue path.
2. Bind release leases to source node, target node, session, tunnel ID, relay
   URL, peer public-key fingerprint, and payload SHA256.
3. Configure owner-scoped release storage/env in GitHub/Vercel.
4. Record direct-blocked two-PC relay route evidence with attached
   `musu.relay_transport_proof.v1` and
   `musu.relay_payload_delivery_proof.v1`.
5. Rerun go/no-go only after the live path and physical proof exist.

## Qualitative Assessment

This is a good safety hardening, not product completion. The code now has a
cleaner API boundary between preview fallback and future release transport
across both the web route and Rust client DTO. The largest remaining risk is
still implementation and live proof of the release relay runtime, not a missing
source audit around the lease endpoint.
