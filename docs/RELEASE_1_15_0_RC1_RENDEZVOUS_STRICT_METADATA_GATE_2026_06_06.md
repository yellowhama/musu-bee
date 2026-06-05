# MUSU 1.15.0-rc.1 Rendezvous Strict Metadata Gate

Date: 2026-06-06

## Summary

The core P2P rendezvous control-plane surfaces now accept strict metadata only:

- `POST /api/v1/p2p/rendezvous`
- `POST /api/v1/p2p/rendezvous/[id]/candidates`

These endpoints exchange source/target node IDs, route candidates, NAT
metadata, relay descriptors, and capabilities. They are not payload transport
endpoints.

## Changed

- `CreateRendezvousSchema` changed from `.passthrough()` to `.strict()`.
- `CandidateEndpointSchema` changed to `.strict()`.
- `CandidatesSchema` changed from `.passthrough()` to `.strict()`.
- rendezvous creation rejects raw payload byte fields before session storage:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`,
  `body_base64`.
- candidate exchange rejects the same raw payload byte fields before session or
  candidate-cache storage.
- raw byte attempts return `rendezvous_payload_bytes_not_accepted` or
  `rendezvous_candidates_payload_bytes_not_accepted`.
- unknown strict-schema fields return the existing invalid request errors with
  concrete unknown-key paths.
- P2P store-forward relay contract audit now gates rendezvous creation and
  candidate exchange as strict metadata-only control-plane surfaces.

## Audit

Root cause:

The route evidence, relay connect preflight, release payload preflight, and
relay transport proof endpoints had already been tightened to strict
metadata-only contracts. The core rendezvous/candidate exchange path still used
passthrough parsing. That left the P2P bootstrap surface less strict than the
evidence surfaces, even though rendezvous should only exchange route metadata.

Qualitative code audit:

- No high or medium issue found after the change.
- Existing candidate metadata preservation is intact.
- Direct QUIC candidates still require public endpoint and NAT metadata.
- Relay-capable candidate sets still require relay endpoint details.
- Owner-scoped session/candidate isolation is unchanged.
- This does not implement release relay tunnel payload transport.

## Validation

- rendezvous route test: `14/14`
- `npm run test:p2p`: `101/101`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=61`
- release evidence verifier regressions: `ok=true`, `case_count=54`,
  `failed_case_count=0`
- `git diff --check`: pass

## Product Boundary

The product boundary is unchanged:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains the remote input, project/company room, presence,
  rendezvous, path-selection, relay-fallback, and evidence control plane.
- Rendezvous and candidate exchange are metadata surfaces for P2P bootstrap.
- Payload bytes must not be sent through rendezvous or candidate exchange.
- Hosted relay remains fallback-only until release tunnel payload transport and
  proof are real.

## Current Release State

Public desktop release remains No-Go. This closes another P2P control-plane
input-boundary gap, but it does not close:

- second-PC route/CPU/matrix evidence
- hosted MUSU.PRO production P2P control-plane proof
- release-grade relay tunnel payload transport
- public metadata recheck
- support mailbox proof
- Partner Center / Store proof

## Next Steps

1. Extend the same strict metadata boundary to room-scoped rendezvous/presence
   surfaces where it does not conflict with intentionally bounded room event
   payloads.
2. Keep candidate exchange strict in final operator packet/source audits.
3. Implement the distinct `quic_relay_tunnel` release payload path before
   setting `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`.
4. Run second-PC route/CPU/matrix evidence on a second Windows machine.
