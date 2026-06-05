# 2026-06-06 Rendezvous Strict Metadata Gate

Core P2P rendezvous control-plane surfaces now accept strict metadata only:

- `POST /api/v1/p2p/rendezvous`
- `POST /api/v1/p2p/rendezvous/[id]/candidates`

Changed:

- strict `CreateRendezvousSchema`
- strict `CandidateEndpointSchema`
- strict `CandidatesSchema`
- raw payload fields rejected before session/candidate-cache storage:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`, `body_base64`
- rendezvous creation returns `rendezvous_payload_bytes_not_accepted`
- candidate exchange returns `rendezvous_candidates_payload_bytes_not_accepted`
- unknown fields return invalid request errors with concrete paths
- P2P store-forward relay contract audit gates this boundary

Validation:

- rendezvous route test: `14/14`
- `npm run test:p2p`: `101/101`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=61`
- release verifier regressions: `54/54`
- `git diff --check`: pass

Product boundary:

- MUSU Desktop remains local executor.
- MUSU.PRO remains rendezvous/path-selection control plane.
- Rendezvous and candidate exchange do not transport payload bytes.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RENDEZVOUS_STRICT_METADATA_GATE_2026_06_06.md`
