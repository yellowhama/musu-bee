# MUSU 1.15.0-rc.1 Route Evidence Strict Metadata Gate

Date: 2026-06-06

## Summary

`POST /api/v1/p2p/route-evidence` now accepts strict route/proof metadata
only. The route evidence API records control-plane evidence for P2P path
selection and relay fallback. It is not a payload transport endpoint.

Changed:

- `RelayFallbackSchema` is now `.strict()`.
- `RelayTransportProofSchema` is now `.strict()`.
- `RelayPayloadDeliveryProofSchema` is now `.strict()`.
- `RouteEvidenceSchema` is now `.strict()`.
- Top-level and nested raw payload byte fields are rejected before storage:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`,
  `body_base64`.
- `relay_payload_delivery_proof.payload_bytes` remains allowed as numeric proof
  metadata.
- raw payload attempts return `route_evidence_payload_bytes_not_accepted`.
- unknown strict-schema fields return `invalid_route_evidence` with the
  unrecognized key path expanded in the public error payload.
- P2P store-forward relay contract audit now gates route-evidence strict
  metadata and regression coverage.

## Audit

Root cause:

The relay connect, release payload preflight, and relay transport proof
surfaces were already strict metadata-only. `route-evidence` still used
`.passthrough()` on the outer evidence object and nested relay proof objects.
That was inconsistent with the newer hosted P2P evidence boundary: route
evidence should carry route, identity, transport proof, and delivery proof
metadata, but it must not become an accidental payload byte sink.

Qualitative code audit:

- No high or medium issue found after the change.
- The change does not claim release relay tunnel payload transport.
- The change does not make queued store-forward relay payloads release-grade.
- Numeric byte counts and payload hashes remain proof metadata; raw payload
  bytes are rejected.
- Existing release-grade query revalidation remains in force for stale relay
  route records.

## Validation

- route-evidence route test: `31/31`
- `npm run test:p2p`: `97/97`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=58`
- release evidence verifier regressions: `ok=true`, `case_count=54`,
  `failed_case_count=0`
- `git diff --check`: pass

## Product Boundary

The product boundary is unchanged:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains the remote input, room, rendezvous, path-selection,
  relay-fallback, and evidence control plane.
- Route evidence is metadata about route choice and proof, not a data path.
- Direct P2P remains preferred after web-assisted discovery.
- Hosted relay remains fallback-only until release tunnel payload transport and
  proof are real.

## Current Release State

Public desktop release remains No-Go. This closes an evidence input-boundary
gap, but it does not close:

- second-PC route/CPU/matrix evidence
- hosted MUSU.PRO production P2P control-plane proof
- release-grade relay tunnel payload transport
- public metadata recheck
- support mailbox proof
- Partner Center / Store proof

## Next Steps

1. Keep route evidence strict in final operator packet/source audits.
2. Implement the distinct `quic_relay_tunnel` release payload path before
   setting `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
3. Emit `musu.relay_transport_proof.v1` only from the actual tunnel path with
   `transport_verified_by=musu_quic_tls_transport`.
4. Run second-PC route/CPU/matrix evidence on a second Windows machine.
