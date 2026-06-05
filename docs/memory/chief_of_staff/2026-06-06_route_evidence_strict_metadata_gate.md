# 2026-06-06 Route Evidence Strict Metadata Gate

`POST /api/v1/p2p/route-evidence` now accepts strict route/proof metadata only.

Changed:

- strict `RelayFallbackSchema`
- strict `RelayTransportProofSchema`
- strict `RelayPayloadDeliveryProofSchema`
- strict `RouteEvidenceSchema`
- rejects raw payload fields before storage:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`, `body_base64`
- allows `relay_payload_delivery_proof.payload_bytes` only as numeric proof
  metadata
- raw payload attempts return `route_evidence_payload_bytes_not_accepted`
- unknown fields return `invalid_route_evidence` with concrete key paths
- P2P store-forward relay contract audit gates the new boundary

Validation:

- route-evidence route test: `31/31`
- `npm run test:p2p`: `97/97`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=58`
- release verifier regressions: `54/54`
- `git diff --check`: pass

Product boundary:

- MUSU Desktop remains local executor.
- MUSU.PRO remains remote input/control-plane/evidence plane.
- Route evidence remains metadata only and does not transport payload bytes.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROUTE_EVIDENCE_STRICT_METADATA_GATE_2026_06_06.md`
