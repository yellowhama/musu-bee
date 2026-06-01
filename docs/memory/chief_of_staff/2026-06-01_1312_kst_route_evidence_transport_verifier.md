# 2026-06-01 13:12 KST: route evidence transport verifier hardening

Route evidence now distinguishes a claimed encryption string from actual
transport proof.

- Added `transport_verified_by` to Rust local route evidence and cloud DTOs.
- `musu.pro` route evidence API now requires
  `transport_verified_by=musu_quic_tls_transport` for release-grade
  `encryption=quic_tls_1_3` records.
- `verify-multidevice-evidence.ps1` now fails release evidence without the same
  transport proof.
- `verify-final-operator-gate-packet.ps1` rejects stale packets whose bundled
  verifier does not check `transport_verified_by`.
- HTTPS fingerprint-pinned bridge forwarding now passes explicit local
  `RouteTransportProof` with
  `transport_verified_by=musu_bridge_forward_fingerprint_pinned_client`, which
  is real interim proof but remains non-release-grade.
- `bridge::route_evidence` treats registry/rendezvous metadata as advertised
  material only. Even metadata that claims `peer_identity_verified=true`,
  `encryption=quic_tls_1_3`, and
  `transport_verified_by=musu_quic_tls_transport` is downgraded unless runtime
  transport code passes local proof.

Validation passed:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib route_evidence -- --nocapture`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib forward -- --nocapture`
- `npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`
- `npm run typecheck`
- `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- refined mDNS regression check on the rebuilt binary:
  `RUST_LOG=debug musu discover --timeout 2` matched no
  `Failed to send|ff02::fb|10065|closed channel`, disabled 9 virtual/VPN
  interfaces, and sent only on physical `이더넷 2`
- PowerShell parser checks for the updated packet/multi-device scripts
- synthetic multi-device verifier fixture: with
  `transport_verified_by=musu_quic_tls_transport` exits `0`, without it exits
  `1` and reports `route transport proof`

Public release remains No-Go because no real second-PC `quic_tls_1_3` route
transport exists yet; this change prevents false positives while that transport
is being built.
