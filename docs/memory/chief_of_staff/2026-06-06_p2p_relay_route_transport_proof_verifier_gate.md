# CoS Memory: P2P Relay Route Transport Proof Verifier Gate

Date: 2026-06-06

Decision: hosted P2P release evidence must prove the relay route transport
chain from the route record itself.

Change:

- `verify-p2p-control-plane-evidence.ps1` now requires valid
  `relay_transport_proof` in returned release-grade relay route records.
- `routeEvidenceStore.ts` filters stale/manual release-grade relay records
  unless session, fallback lease, transport proof, and payload delivery proof
  are all bound.
- Release verifier regressions increased to `59/59`.

Product boundary:

- MUSU.PRO remains remote input, room, rendezvous, path-selection,
  relay-fallback, and evidence control plane.
- MUSU Desktop/local bridge remain the executors.
- This is evidence hardening, not release relay tunnel completion.

Remaining blockers:

- second-PC route/CPU/matrix evidence
- hosted MUSU.PRO login/control-plane/relay proof
- support mailbox evidence
- Store/Partner Center evidence

