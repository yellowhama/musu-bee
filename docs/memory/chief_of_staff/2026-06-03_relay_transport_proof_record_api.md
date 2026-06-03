# 2026-06-03 Relay Transport Proof Record API

Added hosted owner-scoped relay transport proof recording/query API:

- `POST /api/v1/p2p/relay/transport-proof`
- `GET /api/v1/p2p/relay/transport-proof`

New files:

- `musu-bee/src/app/api/v1/p2p/relay/transport-proof/route.ts`
- `musu-bee/src/app/api/v1/p2p/relay/transport-proof/route.test.ts`

Changed files:

- `musu-bee/package.json`
- `musu-rs/src/cloud/mod.rs`

The POST route requires a stored owner-scoped relay lease before it stores a
proof. It returns 409 and stores nothing for
`relay_transport_proof_lease_not_found`. Local file proof stores remain
non-release-grade and produce
`relay_transport_proof_store_backend_not_release_grade`.

Rust cloud client now has `P2pRelayTransportProofRequest`,
`P2pRelayTransportProofResponse`, `P2pRelayTransportProofStoredRecord`, and
`MusuCloud::submit_relay_transport_proof`.

Validation:

- `npm run test:p2p` passed 45/45
- `npm run typecheck` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`
  passed 4/4
- `git diff --check` passed

Interpretation: this creates the API/runtime contract for future relay/tunnel
payload proof. It does not implement relay payload transport; `/api/v1/relay/connect`
still remains fail-closed.
