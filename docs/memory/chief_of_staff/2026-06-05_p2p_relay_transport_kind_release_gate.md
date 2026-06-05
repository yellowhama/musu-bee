# 2026-06-05 P2P relay transport kind release gate

- Tightened hosted P2P evidence verification so `relay_transport_kind` must be
  release-grade `quic_tls_1_3`; `websocket_tunnel` no longer passes as a
  release relay descriptor.
- Tightened release-grade route evidence query revalidation so stored/manual
  relay records must carry `relay_transport_proof.transport_kind =
  quic_relay_tunnel`.
- Added verifier regression `p2p rejects non-release relay transport kind` and
  route-evidence regression `stale-relay-transport-kind-mismatch-release-grade`.
- Validation passed: parser checks, `npm run test:p2p` `84/84`,
  `npm run typecheck`, P2P store-forward relay contract audit `ok=true`,
  release verifier regression `ok=true`/`case_count=42`, and `git diff --check`.
- Existing live hosted evidence still fails as intended because it reports
  `relay_transport_kind=websocket_tunnel`; public release remains No-Go on
  second-PC evidence, hosted release-grade P2P proof, support mailbox, and
  Store certification.
