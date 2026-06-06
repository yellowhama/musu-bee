# MUSU 1.15.0-rc.1 P2P Proof Count Triplet Status Surface

**Wiki ID**: wiki/893
**Date**: 2026-06-06

## Summary

P2P route transport proof and payload delivery proof counts now surface as
required, valid, and invalid triplets through the release status chain.

The hosted verifier already emits these proof-count triplets. Before this
change, several handoff layers exposed only the valid count. That made a No-Go
state harder to diagnose because operators could not distinguish "no proof was
required because no release relay records exist" from "proof records existed
but failed validation."

## Change

Updated:

- `scripts/windows/record-p2p-control-plane-evidence.ps1`
  - summary and result JSON now carry:
    - `relay_route_transport_proof_required_count`
    - `relay_route_transport_proof_valid_count`
    - `relay_route_transport_proof_invalid_count`
    - `relay_payload_delivery_proof_required_count`
    - `relay_payload_delivery_proof_valid_count`
    - `relay_payload_delivery_proof_invalid_count`
- `scripts/windows/write-release-go-no-go.ps1`
  - reads the same proof count triplets from hosted P2P verification
  - exposes:
    - `p2p_relay_route_transport_proof_required_count`
    - `p2p_relay_route_transport_proof_valid_count`
    - `p2p_relay_route_transport_proof_invalid_count`
    - `p2p_relay_payload_delivery_proof_required_count`
    - `p2p_relay_payload_delivery_proof_valid_count`
    - `p2p_relay_payload_delivery_proof_invalid_count`
  - prints the triplets in text output
- `scripts/windows/record-external-release-gate-recheck.ps1`
  - flattens the route transport proof triplet and payload delivery proof
    triplet into recorded JSON, summary markdown, and final JSON
- `scripts/windows/show-final-release-handoff-status.ps1`
  - forwards the proof count triplets from go/no-go
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds source-contract case
    `P2P proof count triplets surface through release status reports`

## Validation

Passed:

- PowerShell parser checks for updated scripts
- `git diff --check`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=84`, `failed_case_count=0`
- Dirty-tree go/no-go status smoke:
  - `ready=false`
  - `manifest_git.dirty=true`
  - route transport proof required/valid/invalid: `0/0/0`
  - payload delivery proof required/valid/invalid: `0/0/0`

## Qualitative Audit

No high or medium issue was found in this scoped status propagation change.

The risk removed is diagnostic ambiguity in hosted relay proof. Operators can
now see whether release relay proof records were absent or present-but-invalid
for both route transport proof and payload delivery proof.

This does not implement the release `quic_relay_tunnel` runtime, does not
create second-PC route evidence, and does not close support mailbox or Store
proof gates.

## Product Boundary

The product boundary remains:

- MUSU Desktop executes local work on each device.
- MUSU.PRO coordinates remote input, project/company rooms, presence,
  rendezvous, path selection, relay fallback, and evidence/control-plane state.
- Hosted relay is fallback-only and release-grade only after the local runtime
  can produce real `quic_relay_tunnel` transport proof and payload delivery
  proof.

`localhost:3001` remains a local developer/operator dashboard surface, not the
packaged MUSU Desktop runtime contract.

## Release Status

Public release remains No-Go until real second-PC route/CPU/matrix evidence,
live MUSU.PRO owner-scoped release relay proof, support mailbox proof, and
Store/Partner Center proof are recorded.
