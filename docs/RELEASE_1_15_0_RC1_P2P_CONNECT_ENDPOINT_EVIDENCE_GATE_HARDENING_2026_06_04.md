# Release 1.15.0-rc.1 P2P Connect Endpoint Evidence Gate Hardening - 2026-06-04

## Summary

The P2P control-plane release verifier now requires the hosted relay connect
endpoint to be explicitly wired before relay transport evidence can pass.

Root cause:

- `/api/v1/relay/connect` exists as a fail-closed endpoint, but the release
  verifier did not independently require `relay_connect_endpoint_wired=true`.
- A payload endpoint or transport flag alone must never be enough to claim
  relay transport readiness; the connect endpoint is the tunnel entrypoint.

## Changes

Updated scripts:

- `scripts\windows\verify-p2p-control-plane-evidence.ps1`
- `scripts\windows\record-p2p-control-plane-evidence.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Gate behavior:

- `relay_status.relay_connect_endpoint_wired` is now a required check.
- `relay_transport.relay_connect_endpoint_wired` is now a required check.
- aggregate `relay_transport_descriptor_ok` now includes the connect endpoint.
- aggregate `relay_transport_wired` now includes both status-side and
  transport-side connect endpoint proof.
- recorder `ok` calculation now requires the connect endpoint in both relay
  status and relay transport preflight.

Regression coverage:

- valid release-grade P2P fixture now includes `relay_connect_endpoint_wired`.
- new negative fixture `p2p-bad-relay-connect-endpoint` proves the verifier
  rejects relay transport evidence when the connect endpoint is missing.

## Validation

Passed:

- PowerShell parser checks for all three edited scripts
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=29`
  - `failed_case_count=0`

Current hosted evidence remains blocked, as expected:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.evidence.json`
- verifier summary after this hardening:
  - `ok=false`
  - `fail_count=29`
  - `relay_status_connect_endpoint_wired=false`
  - `relay_transport_connect_endpoint_wired=false`
  - `relay_transport_payload_endpoint_wired=false`
  - `relay_lease_store_configured=false`
  - `relay_route_evidence_count=0`
  - `relay_payload_transport_proven=false`

## Release Interpretation

This does not implement the release-grade relay tunnel. It tightens the release
gate so MUSU cannot accidentally pass hosted P2P evidence without proving the
actual relay connect endpoint is wired.

Public release remains No-Go on:

- second-PC multi-device route evidence
- second-PC runtime idle CPU evidence
- second-PC runtime CPU matrix evidence
- operator-verified `musu@musu.pro` support mailbox delivery
- Partner Center / Store release evidence
- hosted `musu.pro` P2P control-plane proof, now explicitly including relay
  connect endpoint proof, release-grade relay lease storage, release-grade
  relay payload transport, relay route evidence, and relay payload delivery
  proof

## Roadmap Alignment

This keeps the intended product split intact: `musu.pro` is the web
input/project room/company meeting room/rendezvous/path-selection/relay
fallback/evidence plane, while local MUSU programs execute work on each device
and prefer P2P mesh after web-assisted rendezvous.
