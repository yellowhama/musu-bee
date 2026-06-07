# MUSU 1.15.0-rc.1 Release Relay Payload Route Evidence Recorder

**Wiki ID**: wiki/1009
**Date**: 2026-06-07

## Summary

Rust route evidence now has an explicit release-grade relay payload delivery
recorder for the future `quic_relay_tunnel` byte path.

This closes a source-contract gap in the release proof chain: once the local
runtime actually moves bytes through the release relay tunnel, it now has a
strict writer that can bind route metadata, relay transport proof, and payload
delivery proof into one owner-scoped route-evidence record.

This is not release relay runtime completion. No release marker was flipped.
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` and
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false` remain correct.

## Change

Updated `musu-rs/src/bridge/route_evidence.rs`:

- added `RELEASE_RELAY_PAYLOAD_DELIVERY_ROUTE_EVIDENCE_NOTE`;
- added release relay constants for `quic_relay_tunnel`, `quic_tls_1_3`, and
  `quic_tls_cert_fingerprint`;
- added `record_release_relay_payload_delivery_route_evidence(...)`;
- requires delivered payload status, release-grade payload and delivery proof,
  WSS relay URL, non-default data path, non-empty payload bytes, and a valid
  delivery proof schema;
- binds payload, transport proof, and delivery proof across `session_id`,
  `lease_id`, source node, target node, relay URL, `tunnel_id`,
  `payload_sha256`, and payload byte count;
- requires transport proof with `payload_transited_musu_infra=true`,
  `peer_identity_verified=true`, `peer_identity_method=quic_tls_cert_fingerprint`,
  `peer_public_key=sha256:*`, `encryption=quic_tls_1_3`, and
  `transport_verified_by=musu_quic_tls_transport`;
- writes `route_kind=relay`, `result=success`,
  `payload_transited_musu_infra=true`,
  `relay_fallback.payload_transport_proven=true`, and
  `policy=connect_pro_fallback_only`;
- preserves both `relay_transport_proof` and
  `relay_payload_delivery_proof` through local evidence and cloud DTO mapping.

Updated release contract audits:

- `scripts/windows/show-musu-pro-p2p-env-status.ps1` now includes the Rust
  route-evidence recorder in the release relay tunnel source-hook check.
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1` now requires the
  release recorder, note, transport proof attachment, and fallback policy.

## Validation

Passed:

- `cargo fmt --check --manifest-path musu-rs\Cargo.toml`
- `cargo test --manifest-path musu-rs\Cargo.toml route_evidence --lib`:
  `16 passed`, `0 failed`
- `cargo check --manifest-path musu-rs\Cargo.toml --bin musu -j 1`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1 -SkipGithub -Json`:
  expected `ok=false`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=105`, `failed_case_count=0`
- `git diff --check`

The `cargo check` warning surface is unchanged in meaning: existing release
relay tunnel source-contract hooks in `rendezvous.rs` and `relay_payload.rs`
remain unused until the real runtime byte path is implemented. The newly added
route evidence recorder is explicitly marked as source-contract code until that
runtime connection exists.

## Qualitative Audit

No high or medium issue was found in the changed surface.

The concrete risk reduced is false or partial release relay evidence. Before
this change, the verifier could require release-grade route evidence, transport
proof, and payload delivery proof, but the Rust runtime did not have a strict
single writer that bound those proofs into one route-evidence record. Future
tunnel work could have accidentally submitted proof fragments that did not
match the same lease/session/tunnel/payload.

Residual risk remains material:

- the release relay payload endpoint is still not implemented;
- the local `quic_relay_tunnel` byte path is still not implemented;
- live `https://musu.pro` evidence still has no logged-in runtime token, no
  release relay transport, no relay route evidence, no route metadata proof,
  no relay transport proof, and no payload delivery proof;
- current second-PC route evidence is still failed-route diagnostic proof, not
  successful multi-device proof;
- support mailbox and Store/Partner Center evidence are still open.

## Product Boundary

The product split remains unchanged:

- MUSU Desktop is the executor on each device.
- MUSU.PRO is remote input, room/meeting coordination, rendezvous,
  path-selection, relay-fallback lease coordination, evidence, notification,
  and owner/org policy control plane.
- MUSU.PRO does not become the default executor and does not satisfy payload
  transport proof by issuing a relay lease.
- The AG UI must show relay route evidence as incomplete until route metadata,
  transport proof, and payload delivery proof are all attached to a successful
  release-grade relay record.

## Next Steps

1. Implement the real local `quic_relay_tunnel` byte path.
2. Add the distinct release relay payload endpoint that can emit tunnel
   transport proof before setting `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
3. Wire the runtime tunnel completion path to
   `record_release_relay_payload_delivery_route_evidence(...)`.
4. Capture live owner-scoped `musu.pro` route evidence with relay route
   metadata, relay transport proof, and payload delivery proof.
5. Rebuild/reinstall and refresh local packaged CPU/evidence gates after any
   runtime source change.
