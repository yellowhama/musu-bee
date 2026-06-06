# MUSU 1.15.0-rc.1 P2P Route Metadata Status Surface

**Wiki ID**: wiki/889
**Date**: 2026-06-06

## Summary

Hosted P2P route-record metadata counts now surface through the release status
chain, not only through the hosted evidence verifier.

The previous verifier change made `relay_route_metadata_required_count`,
`relay_route_metadata_valid_count`, and `relay_route_metadata_invalid_count`
release-gate data. This update makes the same data visible in the evidence
recorder, go/no-go, MUSU.PRO P2P env status, external gate recheck, and final
handoff status.

This is status and evidence hardening only. It does not implement the release
relay tunnel, does not create second-PC proof, and does not move execution into
MUSU.PRO. MUSU Desktop remains the local executor; MUSU.PRO remains remote
input, rooms, presence, rendezvous, path-selection, relay fallback, and
evidence/control-plane infrastructure.

## Change

Updated:

- `scripts/windows/record-p2p-control-plane-evidence.ps1`
  - includes `relay_route_metadata_valid_count` in summary markdown
  - includes `relay_route_metadata_valid_count` in the result JSON
- `scripts/windows/write-release-go-no-go.ps1`
  - reads `relay_route_metadata_required_count`,
    `relay_route_metadata_valid_count`, and
    `relay_route_metadata_invalid_count` from hosted P2P verification
  - exposes `p2p_relay_route_metadata_required_count`,
    `p2p_relay_route_metadata_valid_count`, and
    `p2p_relay_route_metadata_invalid_count`
  - prints `p2p_relay_route_metadata_valid_count` in text output
  - updates the `p2p-control-plane` blocker message to require
    `relay_route_metadata_valid_count > 0`
- `scripts/windows/show-musu-pro-p2p-env-status.ps1`
  - exposes metadata valid/required/invalid counts in `evidence`
  - adds blocker `live_evidence_relay_route_metadata_missing`
  - adds next steps that require route record metadata and a rerun until
    `relay_route_metadata_valid_count > 0`
- `scripts/windows/record-external-release-gate-recheck.ps1`
  - flattens `p2p_relay_route_metadata_valid_count`
  - adds blocker `p2p_relay_route_metadata_missing`
  - includes the count in recorded JSON, summary markdown, and final JSON
- `scripts/windows/show-final-release-handoff-status.ps1`
  - forwards `p2p_relay_route_metadata_valid_count` from go/no-go
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds source-contract coverage so metadata counts cannot disappear from the
    release status surfaces silently

## Validation

Passed:

- PowerShell parser checks for all updated scripts
- `git diff --check`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=83`, `failed_case_count=0`
- Dirty-tree `scripts/windows/write-release-go-no-go.ps1 -Json` status smoke:
  `ready=false`, `manifest_git.dirty=true`, blocker count `8`, and:
  - `p2p_relay_route_evidence_count=0`
  - `p2p_relay_route_metadata_required_count=0`
  - `p2p_relay_route_metadata_valid_count=0`
  - `p2p_relay_route_metadata_invalid_count=0`
  - `p2p_relay_route_transport_proof_valid_count=0`
  - `p2p_relay_payload_delivery_proof_valid_count=0`
- `scripts/windows/show-musu-pro-p2p-env-status.ps1 -BaseUrl https://musu.pro -Json`
  status smoke:
  - `ok=false`
  - `live_evidence_relay_route_metadata_missing`
  - metadata valid/required/invalid counts `0/0/0`
  - route transport proof valid count `0`
  - payload delivery proof valid count `0`

## Qualitative Audit

No high or medium issue was found in the changed surface.

The main risk removed is an operator blind spot. The verifier already rejected
relay route evidence without release-grade route metadata, but higher-level
release reports could still show only route count, route transport proof
count, or payload delivery proof count. That made hosted P2P No-Go harder to
diagnose. The release reports now carry the route metadata count explicitly.

Residual risks remain external and runtime-facing:

- no real second-PC route evidence is recorded for the current release gate
- second-PC idle CPU and runtime CPU matrix proof remain open
- production MUSU.PRO runtime login/storage proof remains open
- the local release `quic_relay_tunnel` runtime is not implemented
- hosted route metadata, route transport proof, and payload delivery proof
  counts remain `0`
- support mailbox and Store/Partner Center proof remain open

## Product Boundary

The product split remains:

- MUSU Desktop programs work locally on each device.
- MUSU.PRO accepts remote user input and coordinates project/company rooms.
- MUSU.PRO can bootstrap P2P by exchanging presence, candidates, rendezvous,
  leases, relay fallback data, and evidence.
- After bootstrap, local programs should prefer direct P2P mesh routes.
- Hosted relay remains fallback-only and release-grade only after real
  `quic_relay_tunnel` transport, route metadata, route transport proof, and
  payload delivery proof exist.

`localhost:3001` is not the packaged desktop runtime contract. A refused
connection there is a local dashboard availability issue, not proof that MUSU
Desktop is missing or that execution should move to MUSU.PRO.

## Release Status

Public release remains No-Go.

Still required:

- real second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- live MUSU.PRO packaged-runtime login/storage evidence
- release `quic_relay_tunnel` runtime proof
- hosted relay route metadata count greater than `0`
- hosted relay route transport proof count greater than `0`
- hosted relay payload delivery proof count greater than `0`
- support mailbox proof
- Store/Partner Center proof
