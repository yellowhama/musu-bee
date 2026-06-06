# MUSU 1.15.0-rc.1 Rust Route Evidence Relay Transport Proof Carry

**Wiki ID**: wiki/823
**Date**: 2026-06-06

## Summary

Rust bridge route evidence can now carry `relay_transport_proof` through local
route-evidence JSON and cloud submission DTOs.

This is runtime evidence plumbing for the release relay proof chain. It does
not implement the release `quic_relay_tunnel` transport and does not make
store-forward queue fallback release-grade.

## Change

Updated:

- `musu-rs/src/bridge/route_evidence.rs`
  - adds `RouteRelayTransportProof`
  - adds optional `relay_transport_proof` to `RouteAttemptEvidence`
  - adds optional `relay_transport_proof` to `RouteAttemptEvidenceInput`
  - maps bridge proof into `crate::cloud::RouteRelayTransportProof` in
    `cloud_route_evidence()`
  - preserves proof fields including session, lease, source, target,
    `transport_kind`, relay URL, tunnel ID, bytes transited, infra transit,
    encryption, verifier, and timestamps
  - extends the route evidence unit test so local JSON and cloud DTO both
    contain the proof
- `musu-rs/src/install/cli_commands.rs`
  - keeps CLI/direct route evidence explicitly free of relay transport proof
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - adds Rust-source gate
    `route evidence carries relay transport proof to cloud`

## Validation

Passed:

- `cargo fmt --check`
- `cargo test -p musu-rs route_evidence --lib`: `14 passed`
- PowerShell parser check for
  `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=59`, `failed_case_count=0`
- `git diff --check`

## Qualitative Audit

No high or medium issue was found in the changed surface.

The concrete risk removed is proof loss between local runtime and hosted
control plane. Before this change, the Rust cloud DTO could serialize
`relay_transport_proof`, but bridge route evidence converted it to `None`
during `cloud_route_evidence()`. That would have made a future real tunnel
proof invisible to hosted route-evidence submission from the local runtime.

Residual risk remains:

- real `quic_relay_tunnel` payload transport is still not implemented
- target/source runtime code still needs to produce actual release-grade tunnel
  proof
- hosted MUSU.PRO still needs live owner-scoped release-grade route evidence,
  route transport proof, and payload delivery proof
- second-PC route/CPU/matrix evidence, support mailbox proof, and Store proof
  remain open

## Product Boundary

The split remains unchanged:

- MUSU Desktop is the local executor on each device
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay fallback, and evidence/control plane
- direct P2P remains preferred after web-assisted bootstrap
- hosted relay remains fallback-only and release-grade only after real
  transport and delivery proof

