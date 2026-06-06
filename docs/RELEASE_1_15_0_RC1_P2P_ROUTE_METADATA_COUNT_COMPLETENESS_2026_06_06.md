# MUSU 1.15.0-rc.1 P2P Route Metadata Count Completeness

**Wiki ID**: wiki/891
**Date**: 2026-06-06

## Summary

P2P route metadata status propagation now carries required, valid, and invalid
counts through all release handoff surfaces.

The previous status surface exposed the valid count everywhere, but the P2P
evidence recorder, external gate recheck, and final handoff did not yet carry
the required and invalid counts. That left a diagnostic gap: an operator could
see that the valid count was `0`, but not whether no route metadata was present
or whether route records existed and failed metadata validation.

## Change

Updated:

- `scripts/windows/record-p2p-control-plane-evidence.ps1`
  - summary now prints `relay_route_metadata_required_count`,
    `relay_route_metadata_valid_count`, and
    `relay_route_metadata_invalid_count`
  - result JSON now includes the same three counts
- `scripts/windows/record-external-release-gate-recheck.ps1`
  - reads required/valid/invalid counts from hosted verification, with fallback
    to recorder result JSON
  - records `p2p_relay_route_metadata_required_count`,
    `p2p_relay_route_metadata_valid_count`, and
    `p2p_relay_route_metadata_invalid_count`
  - summary markdown and final JSON now include the same three counts
- `scripts/windows/show-final-release-handoff-status.ps1`
  - forwards `p2p_relay_route_metadata_required_count`,
    `p2p_relay_route_metadata_valid_count`, and
    `p2p_relay_route_metadata_invalid_count` from go/no-go
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - strengthens the P2P route metadata status source contract so recorder,
    external recheck, and final handoff must retain the full count triplet

## Validation

Passed:

- PowerShell parser checks for updated scripts
- `git diff --check`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=83`, `failed_case_count=0`

## Qualitative Audit

No high or medium issue was found in this scoped status propagation change.

The risk removed is diagnostic ambiguity. Release operators can now distinguish:

- no route metadata required because no release relay records were returned
- route metadata required and valid
- route metadata required but invalid

This still does not implement release relay runtime, second-PC proof, support
mailbox proof, or Store/Partner Center proof.

## Product Boundary

The product boundary remains unchanged:

- MUSU Desktop executes local work on each device.
- MUSU.PRO coordinates remote input, project/company rooms, presence,
  rendezvous, path selection, relay fallback, and evidence/control-plane state.
- Hosted relay remains fallback-only and release-grade only after local
  `quic_relay_tunnel` transport, route metadata, relay transport proof, and
  payload delivery proof exist.

`localhost:3001` remains a local developer/operator dashboard surface, not the
packaged MUSU Desktop runtime contract.

## Release Status

Public release remains No-Go. The current clean go/no-go state before this
change showed:

- `ready_for_public_desktop_release=false`
- `manifest_git.dirty=false`
- blockers: `multi-device`, `runtime-idle-cpu`,
  `runtime-cpu-scenario-matrix`, `runtime-cpu-second-pc-route-attempt`,
  `support-mailbox`, `store-release`, `p2p-control-plane`
- P2P route metadata required/valid/invalid counts: `0/0/0`
