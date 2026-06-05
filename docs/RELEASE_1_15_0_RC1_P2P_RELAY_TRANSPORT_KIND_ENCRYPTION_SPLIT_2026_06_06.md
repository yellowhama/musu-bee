# MUSU 1.15.0-rc.1 P2P Relay Transport Kind and Encryption Split

Date: 2026-06-06 KST
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD before this change: `896fd376d322b43d1749cd0ba59dfecdabfaba95`

## Summary

This change fixes a source/spec ambiguity in the MUSU.PRO relay release gate.
The relay tunnel kind and the release encryption/proof requirement are now
separate:

- release relay tunnel kind: `quic_relay_tunnel`
- release encryption/proof requirement: `quic_tls_1_3`

Before this split, some verifier/status wording treated `quic_tls_1_3` as the
relay transport kind. That made the source contract harder to reason about
because existing route evidence already used `transport_kind=quic_relay_tunnel`
and `encryption=quic_tls_1_3`.

This is gate/spec hardening only. Current source remains release-blocked:

- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- hosted KV/Upstash values and live relay payload proof are still missing

## Source Changes

- `musu-bee/src/lib/p2pRelayPolicy.ts`
  - adds `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
  - keeps `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`
  - checks `RELAY_TRANSPORT_KIND` against the relay kind, not the encryption
    requirement
- Relay preflight/status APIs now return both fields:
  - `release_grade_relay_transport_kind`
  - `release_grade_transport_required`
- `verify-p2p-control-plane-evidence.ps1`
  - requires `relay_transport_kind=quic_relay_tunnel`
  - separately requires `release_grade_transport_required=quic_tls_1_3`
- `show-musu-pro-p2p-env-status.ps1`
  - reports both source fields
  - emits a separate blocker if the release relay kind requirement regresses
- `test-release-evidence-verifiers.ps1`
  - updates the passing P2P fixture to use
    `relay_transport_kind=quic_relay_tunnel`
- `audit-p2p-store-forward-relay-contract.ps1`
  - gates the split source contract and API response field

## Qualitative Evaluation

No high or medium issue was found in the changed source after static review.

Positive findings:

- The change reduces semantic ambiguity in the release gate.
- It does not make `websocket_tunnel` release-grade.
- It does not mark `/api/v1/relay/payload` as implemented.
- It does not weaken owner-scoped relay lease or payload proof requirements.
- It keeps MUSU.PRO as remote input/rendezvous/path-selection/relay-fallback
  control plane, while MUSU Desktop remains the local executor.

Residual risk:

- Live MUSU.PRO evidence captured before this split lacks
  `release_grade_relay_transport_kind`, so it will keep failing the P2P
  control-plane verifier until the hosted endpoint and evidence recorder emit
  the new field.
- This does not implement the release relay payload tunnel. It only prevents
  the release gate from confusing tunnel kind with encryption proof.

## Validation

Passed:

- `npm run test:p2p`: `88/88`
- `npm run typecheck`
- `powershell -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `powershell -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`:
  `ok=false`, with the expected blockers for missing release payload endpoint,
  queue-only payload path, `websocket_tunnel`, missing KV/Upstash env, missing
  live relay route proof, and missing payload delivery proof
- `powershell -File scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=45`, `failed_case_count=0`

Code audit found and fixed one medium issue in the audit layer during
validation: `audit-p2p-store-forward-relay-contract.ps1` still looked for the
old verifier condition that treated `quic_tls_1_3` as the relay kind. The audit
now checks `release_grade_relay_transport_kind=quic_relay_tunnel` and
`release_grade_transport_required=quic_tls_1_3` separately.

## Index Refresh

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2471 files`
- `2717 symbols`
- `9797 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

## Next Steps

1. Wire real release relay payload transport behind `/api/v1/relay/payload`.
2. Emit `relay_transport_kind=quic_relay_tunnel` only when the real release
   tunnel exists and can prove payload transit.
3. Keep `encryption=quic_tls_1_3` and
   `transport_verified_by=musu_quic_tls_transport` as separate proof fields.
4. Configure production KV/Upstash for owner-scoped relay leases.
5. Capture live MUSU.PRO P2P evidence with relay route proof and relay payload
   delivery proof.
6. Install the current MUSU Desktop build on a second Windows PC and capture
   route, idle CPU, and runtime matrix evidence.

Public release remains No-Go until second-PC evidence, live hosted P2P proof,
support mailbox evidence, and Store evidence are all recorded.
