# 2026-06-03 Relay Transport Proof Store Gate

Route evidence now requires `route_kind=relay` inline
`relay_transport_proof` to be backed by an owner-scoped stored relay transport
proof record.

New file:

- `musu-bee/src/lib/p2pRelayTransportProofStore.ts`

Changed files:

- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts`
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`

New blockers:

- `relay_route_transport_proof_not_stored`
- `relay_route_transport_proof_store_backend_not_release_grade`
- `relay_route_transport_proof_store_not_release_grade`
- `relay_route_transport_proof_store_unavailable:<detail>`

Validation:

- `npm run test:p2p` passed 41/41
- `npm run typecheck` passed
- `git diff --check` passed

Interpretation: this does not implement relay payload transport. It prevents a
stored relay lease plus proof-shaped JSON from becoming release-grade until a
real QUIC relay/tunnel runtime writes a matching stored proof from actual MUSU
infrastructure payload transit.
