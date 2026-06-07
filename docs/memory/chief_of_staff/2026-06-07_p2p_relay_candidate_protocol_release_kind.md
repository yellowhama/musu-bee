# 2026-06-07 P2P Relay Candidate Protocol Release Kind

The P2P candidate-exchange metadata is now aligned with the release relay
transport kind.

Changed:

- Web rendezvous candidate and room presence schemas accept
  `relay_protocol=quic_relay_tunnel`.
- `p2pRendezvousStore` preserves `quic_relay_tunnel`.
- Rust `RelayProtocol` includes `QuicRelayTunnel`.
- `musu room presence publish --relay-url ...` defaults to
  `RelayProtocol::QuicRelayTunnel`.
- Rust route candidate metadata tests now preserve `quic_relay_tunnel`.
- P2P relay contract audit and release evidence verifier regressions include
  source-contract coverage for this metadata path.

Validation:

- P2P tests: 112/112
- typecheck passed
- Rust route candidate tests: 2/2
- Rust room presence tests: 5/5
- P2P relay contract audit: `ok=true`, `fail_count=0`
- release verifier regression: `ok=true`, `case_count=105`,
  `failed_case_count=0`
- P2P env status remains expected `ok=false`

Boundary:

This is not release relay runtime completion. The release payload endpoint and
local `quic_relay_tunnel` runtime are still not implemented, and live MUSU.PRO
evidence still lacks production runtime login/storage, route metadata,
transport proof, and payload delivery proof.
