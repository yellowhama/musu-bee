# MUSU 1.15.0-rc.1 Relay Transport Proof Store Gate

Date: 2026-06-03

## Summary

Relay route evidence no longer trusts inline `relay_transport_proof` JSON by
itself.

The hosted route-evidence API now requires the inline proof to be backed by an
owner-scoped relay transport proof record in a separate proof store. This keeps
a stored relay lease plus proof-shaped JSON from being mistaken for actual
payload transit through MUSU infrastructure.

## Code Changes

- Added `musu-bee/src/lib/p2pRelayTransportProofStore.ts`.
  - Supports KV/Upstash as release-grade storage.
  - Supports explicit file/development-file storage for local diagnostics and
    tests.
  - Stores short-lived owner-scoped proof records keyed by session, lease,
    source/target node, tunnel, relay URL, transport kind, payload bytes,
    encryption, verifier, and timestamps.
- Updated `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`.
  - `route_kind=relay` with `relay_transport_proof` now queries the proof store.
  - Inline proof is non-release-grade unless a matching owner-scoped stored proof
    exists.
  - File/development proof stores are not accepted as release-grade backends.
- Updated `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`.
  - Added coverage for inline proof rejected without a stored proof.
  - Added coverage for stored local proof removing the `not_stored` blocker while
    still leaving endpoint/backend blockers in place.

## New Blockers

- `relay_route_transport_proof_not_stored`
- `relay_route_transport_proof_store_backend_not_release_grade`
- `relay_route_transport_proof_store_not_release_grade`
- `relay_route_transport_proof_store_unavailable:<detail>`

## Validation

- `npm run test:p2p`: pass, 41/41
- `npm run typecheck`: pass
- `git diff --check`: pass

## Release Interpretation

This is evidence-chain hardening, not relay/tunnel payload transport
completion.

The current `/api/v1/relay/connect` endpoint still remains fail-closed and does
not produce release-grade QUIC relay proof. Public release still requires a real
relay/tunnel runtime path that writes release-grade owner-scoped transport proof
records from actual payload transit, then records matching live relay route
evidence on `https://musu.pro`.

Because runtime/web source changed, the existing packaged primary smoke/CPU
evidence becomes historical until a fresh clean MSIX build/install,
single-machine smoke, desktop-open CPU sample, and runtime CPU matrix are
recorded after this commit.
