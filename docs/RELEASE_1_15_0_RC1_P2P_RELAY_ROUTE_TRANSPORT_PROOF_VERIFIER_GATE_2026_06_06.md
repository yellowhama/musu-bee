# MUSU 1.15.0-rc.1 P2P Relay Route Transport Proof Verifier Gate

**Wiki ID**: wiki/819
**Date**: 2026-06-06

## Summary

Hosted P2P control-plane evidence now requires release-grade relay route
records to carry a bound relay transport proof, not only a relay lease,
`relay_transport_proven=true`, or payload delivery proof.

This is evidence hardening. It does not implement the release relay tunnel and
does not move execution into MUSU.PRO. MUSU Desktop and the local bridge remain
the executors; MUSU.PRO remains remote input, room, rendezvous, path-selection,
relay-fallback, and evidence control plane.

## Change

Updated:

- `scripts/windows/verify-p2p-control-plane-evidence.ps1`
  - validates every returned relay success route record independently
  - requires `relay_transport_proof` with
    `schema=musu.relay_transport_proof.v1`
  - requires route `session_id`, route `source_node_id`, route
    `target_node_id`, and fallback `lease_id`
  - requires transport proof session/lease/source/target to match the route
    and fallback lease
  - requires `transport_kind=quic_relay_tunnel`, `relay_url` over `wss://`,
    positive payload bytes transited, `payload_transited_musu_infra=true`,
    `encryption=quic_tls_1_3`, and
    `transport_verified_by=musu_quic_tls_transport`
  - reports `relay_route_transport_proof_*_count` fields in verification JSON
- `musu-bee/src/lib/routeEvidenceStore.ts`
  - release-grade relay queries now require route `session_id`
  - stale/manual `release_grade=true` relay records are filtered unless
    fallback proof, transport proof, and payload delivery proof all bind to the
    same lease/session/source/target/tunnel chain
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`
  - adds stale-record coverage for payload-only relay proof and missing route
    session
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds release verifier fixture proof for `relay_transport_proof`
  - adds negative case
    `p2p rejects relay route evidence without route transport proof`
- `scripts/windows/record-p2p-control-plane-evidence.ps1`
  - surfaces valid relay route transport proof count in the operator summary
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - updates the source contract for required lease/session binding

## Validation

Passed:

- PowerShell parser check for updated scripts
- `npm run test:p2p -- --test-name-pattern "route evidence|P2P route evidence"`:
  `105/105`
- `npm run typecheck`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=59`, `failed_case_count=0`
- `git diff --check`

## Qualitative Audit

No high or medium issue was found in the changed surface.

The important risk removed here is evidence over-claiming: a hosted P2P
response can no longer pass the release verifier merely because a relay lease
exists, a payload delivery proof exists, or the route evidence list contains a
`release_grade=true` record. The verifier and server-side release-grade query
now require a coherent relay route proof chain:

- direct path failed before relay fallback
- owner-scoped relay lease was issued
- route record has a session/source/target
- relay transport proof matches the same session/lease/source/target
- relay payload delivery proof matches the same session/lease/source/target
  and transport tunnel

Residual risk remains external and runtime-facing: the actual production
release relay tunnel and live MUSU.PRO owner-scoped proof still must be
recorded, and second-PC route/CPU/matrix evidence is still missing.

## Release Status

Public release remains No-Go.

Still required:

- real second-PC multi-device route evidence
- second-PC idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted MUSU.PRO login/control-plane/relay proof with nonzero release-grade
  relay route evidence
- support mailbox proof
- Store/Partner Center proof

