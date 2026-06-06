# MUSU 1.15.0-rc.1 P2P Relay Route Transport Proof Status Surface

**Wiki ID**: wiki/821
**Date**: 2026-06-06

## Summary

The release status surface now carries the relay route transport proof count
all the way from hosted P2P evidence verification into go/no-go, external gate
recheck, P2P environment status, and final handoff status.

This is status and evidence reporting hardening. It does not implement the
release relay tunnel and does not move execution into MUSU.PRO. MUSU Desktop
and the local bridge remain the executors. MUSU.PRO remains remote user input,
project/company rooms, presence, rendezvous, path-selection, relay fallback,
and evidence/control-plane infrastructure.

## Change

Updated:

- `scripts/windows/write-release-go-no-go.ps1`
  - reads `relay_route_transport_proof_valid_count` from hosted P2P evidence
  - exposes `p2p_relay_route_transport_proof_valid_count` in JSON and text
  - updates the P2P blocker message so route transport proof is explicitly
    required alongside route evidence and payload delivery proof
- `scripts/windows/record-external-release-gate-recheck.ps1`
  - flattens `p2p_relay_route_transport_proof_valid_count`
  - adds blocker `p2p_relay_route_transport_proof_missing`
  - includes the count in recorded JSON, summary markdown, and final JSON
- `scripts/windows/show-musu-pro-p2p-env-status.ps1`
  - exposes route transport proof valid/required/invalid counts
  - adds blocker `live_evidence_relay_route_transport_proof_missing`
  - adds next steps requiring bound `relay_transport_proof` and a rerun until
    `relay_route_transport_proof_valid_count > 0`
- `scripts/windows/show-final-release-handoff-status.ps1`
  - forwards `p2p_relay_route_transport_proof_valid_count` from go/no-go
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - extends the external gate and P2P env status source contracts so these
    fields and blockers cannot disappear silently

## Validation

Passed:

- PowerShell parser check for updated scripts
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=59`, `failed_case_count=0`
- `npm run test:p2p -- --test-name-pattern "route evidence|P2P route evidence"`
  from `musu-bee`: `105/105`
- `npm run typecheck` from `musu-bee`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- `scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json`:
  `ok=false`, route transport proof valid/required/invalid counts `0/0/0`,
  payload delivery proof valid count `0`, and blocker
  `live_evidence_relay_route_transport_proof_missing`
- `scripts/windows/write-release-go-no-go.ps1 -Json`:
  `ready=false`, `p2p_control_plane_verified=false`,
  `p2p_relay_route_evidence_count=0`,
  `p2p_relay_route_transport_proof_valid_count=0`,
  and `p2p_relay_payload_delivery_proof_valid_count=0`
- `git diff --check`

## Qualitative Audit

No high or medium issue was found in the changed surface.

The risk removed here is an operational blind spot: after the verifier started
requiring route-level relay transport proof, upper release reports still mostly
showed route count and payload delivery proof. Operators could see that hosted
P2P was blocked but not the exact missing proof count. The new status surface
keeps the same release-grade requirement visible in every handoff layer.

Residual risk remains external and runtime-facing:

- the release `quic_relay_tunnel` path still needs real payload transport
  proof
- hosted MUSU.PRO evidence still needs owner-scoped production runtime login,
  release-grade lease storage, route evidence, route transport proof, and
  payload delivery proof
- second-PC install, route, idle CPU, and runtime matrix evidence remain open
- support mailbox and Store/Partner Center proof remain open

## Product Boundary

The product split remains:

- local MUSU Desktop programs do the work on each device
- MUSU.PRO accepts remote user input and coordinates project/company rooms
- MUSU.PRO can make bootstrap easier by exchanging presence, candidate,
  rendezvous, lease, relay, and proof metadata
- after bootstrap, local programs should prefer direct P2P mesh routes
- hosted relay is fallback-only and release-grade only after real tunnel
  transport proof exists

`localhost:3001` is only a local developer/dashboard surface. A browser
connection refusal there does not define whether MUSU Desktop is installed or
working. Release evidence must come from the packaged local runtime and the
hosted MUSU.PRO control-plane gates, not from treating the local dashboard as
the product.

## Release Status

Public release remains No-Go.

Still required:

- real second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO login/control-plane/release relay proof with nonzero
  `relay_route_transport_proof_valid_count`
- hosted relay payload delivery proof
- support mailbox proof
- Store/Partner Center proof

