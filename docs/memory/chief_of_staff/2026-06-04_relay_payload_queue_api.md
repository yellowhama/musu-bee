# 2026-06-04 Relay Payload Queue API

Added lease-bound hosted relay payload queue API:

- `POST /api/v1/p2p/relay/payload`
- `GET /api/v1/p2p/relay/payload`

New source:

- `musu-bee/src/lib/p2pRelayPayloadStore.ts`
- `musu-bee/src/app/api/v1/p2p/relay/payload/route.ts`
- `musu-bee/src/app/api/v1/p2p/relay/payload/route.test.ts`

Changed source:

- `musu-bee/src/lib/p2pRelayPolicy.ts`
- `musu-bee/src/app/api/v1/p2p/relay/transport/route.ts`
- `musu-bee/src/app/api/v1/relay/connect/route.ts`
- `musu-bee/package.json`
- `musu-rs/src/cloud/mod.rs`

The payload API requires bearer auth and a stored owner-scoped relay lease
before accepting `musu.relay_payload_envelope.v1`. It stores payload bytes as a
non-release-grade `http_store_forward_preview` queue record, validates optional
SHA-256, strips `owner_key`, and only returns `payload_base64` when
`include_payload=1`.

Rust cloud client now has `P2pRelayPayloadRequest`,
`P2pRelayPayloadResponse`, `P2pRelayPayloadStoredRecord`, and
`MusuCloud::submit_relay_payload`.

Validation:

- relay payload route test passed 5/5
- `npm run test:p2p` passed 50/50
- `npm run typecheck` passed
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`
  passed 5/5
- `git diff --check` passed

Interpretation: this is the first real relay data-path slice, not the public
release relay transport. `relay_payload_endpoint_wired` and
`relay_transport_wired` remain false until target-side polling/execution and
release-grade QUIC/TLS tunnel proof land.
