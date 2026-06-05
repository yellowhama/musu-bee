# MUSU 1.15.0-rc.1 Relay Transport Proof Strict Metadata Gate

Date: 2026-06-06

## Summary

`POST /api/v1/p2p/relay/transport-proof` now uses a strict
metadata-only request schema for release relay transport proof recording.

This endpoint records proof that a future release relay tunnel actually moved
payload bytes through MUSU infrastructure. It is not itself a payload transport
endpoint. The accepted proof metadata still includes
`payload_bytes_transited`, but raw payload byte fields are now rejected before
lease lookup.

## Changed

- `RelayTransportProofRequestSchema` changed from `.passthrough()` to
  `.strict()`.
- The proof recorder now rejects known raw payload fields before owner-scoped
  lease lookup:
  - `payload`
  - `payload_base64`
  - `payload_b64`
  - `payload_bytes`
  - `body_base64`
- Raw payload attempts return
  `relay_transport_proof_payload_bytes_not_accepted`.
- Unknown fields return `invalid_relay_transport_proof`.
- The P2P store-forward relay contract audit now gates the strict proof
  boundary and regression coverage.

## Audit

Root cause hypothesis:

The remaining public P2P release blocker is not an env-only problem. Current
source still has `RELAY_TRANSPORT_KIND=websocket_tunnel` and
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`, while release requires a distinct
`quic_relay_tunnel` payload path with `quic_tls_1_3` proof. The proof recorder
was correctly lease-bound, but its request schema still accepted unknown fields.
That made the release evidence input boundary weaker than the newly strict
connect and payload preflight surfaces.

Qualitative code audit:

- No high or medium issue found after the change.
- `payload_bytes_transited` remains allowed as proof metadata.
- Raw payload bytes are not accepted by the proof recorder.
- The proof recorder does not call the preview store-forward payload queue.
- This does not implement or claim release relay tunnel transport.

## Validation

- `npm run test:p2p -- --test-name-pattern "transport proof"`: `94/94`
- `npm run typecheck`: pass
- PowerShell parser for
  `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- Release evidence verifier regressions: `ok=true`, `case_count=54`,
  `failed_case_count=0`
- `git diff --check`: pass

## Current Release State

`show-musu-pro-p2p-env-status.ps1 -Json` still reports `ok=false` with expected
blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_payload_endpoint_queue_only`
- `source_relay_transport_kind_not_release_grade`
- missing KV/Upstash URL/token
- live relay lease KV not configured
- live relay transport not wired
- live relay route not proven
- live relay payload delivery proof missing

This is correct. MUSU Desktop remains the local executor. MUSU.PRO remains the
remote input, room, rendezvous, path-selection, relay-fallback, and evidence
control plane. Public release still requires second-PC route/CPU/matrix
evidence, hosted P2P release proof, support mailbox proof, Store proof, and a
real release relay tunnel payload transport.

## Next Steps

1. Implement the release relay tunnel payload path as a distinct
   `quic_relay_tunnel` transport.
2. Emit `musu.relay_transport_proof.v1` only from the actual tunnel path with
   `transport_verified_by=musu_quic_tls_transport`.
3. Attach relay payload delivery proof only after bytes transit MUSU relay
   infrastructure.
4. Provision production KV/Upstash for owner-scoped relay lease/proof storage.
5. Record live owner-scoped relay route evidence with delivery proof.
6. Run second-PC CPU and multi-device route evidence on a real second Windows
   machine.
