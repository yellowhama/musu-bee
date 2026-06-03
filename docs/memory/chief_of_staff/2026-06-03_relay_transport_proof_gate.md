# 2026-06-03 Relay Transport Proof Gate

Hosted P2P route evidence now requires explicit relay payload transport proof
before `route_kind=relay` can become release-grade.

Changed:

- `POST /api/v1/p2p/route-evidence` accepts optional
  `relay_transport_proof` with schema `musu.relay_transport_proof.v1`.
- Relay release grading now requires proof lease/session match, `wss://` relay
  URL, positive payload byte transit, `payload_transited_musu_infra=true`,
  `encryption=quic_tls_1_3`, and
  `transport_verified_by=musu_quic_tls_transport`.
- Stored route-evidence queries with `release_grade=true` exclude older relay
  records lacking the current proof contract.
- Rust cloud DTOs now include `RouteRelayTransportProof`; current bridge route
  evidence submits `None` because relay payload transport is still not wired.

Validation:

- `npm run test:p2p` passed 35/35.
- `npm run typecheck` passed.
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- `cargo test --manifest-path .\musu-rs\Cargo.toml cloud::tests::route_evidence_serializes_required_contract_fields --lib -j 1` passed.
- release evidence verifier regressions passed 20/20.
- `git diff --check` passed.

Release interpretation:

- This is evidence-chain hardening, not relay/tunnel payload transport.
- Public release still needs real relay transport code that generates
  `musu.relay_transport_proof.v1`, live owner-scoped KV/Upstash relay storage,
  second-PC runtime/multi-device evidence, support mailbox evidence, and Store
  evidence.
- Because web and Rust source changed, packaged primary evidence is stale until
  the MSIX is rebuilt/reinstalled and primary smoke/CPU/matrix evidence is
  refreshed.
