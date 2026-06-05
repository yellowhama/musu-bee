# 2026-06-06 Relay Transport Proof Strict Metadata Gate

`POST /api/v1/p2p/relay/transport-proof` now uses a strict metadata-only
request schema.

Key points:

- changed `RelayTransportProofRequestSchema` from `.passthrough()` to
  `.strict()`
- rejects raw payload byte fields before lease lookup with
  `relay_transport_proof_payload_bytes_not_accepted`
- still allows `payload_bytes_transited` as proof metadata
- rejects unknown fields with `invalid_relay_transport_proof`
- P2P relay contract audit now checks the proof recorder boundary and
  regression coverage

Validation:

- `npm run test:p2p -- --test-name-pattern "transport proof"`: `94/94`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release verifier regressions: `ok=true`, `case_count=54`,
  `failed_case_count=0`
- `git diff --check`: pass

Release remains No-Go. Current source still has
`RELAY_TRANSPORT_KIND=websocket_tunnel`, `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`,
and no live hosted release relay route/payload delivery proof.
