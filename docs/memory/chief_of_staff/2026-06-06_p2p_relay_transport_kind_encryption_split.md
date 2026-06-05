# 2026-06-06 P2P relay transport kind/encryption split

## Decision

Separate release relay tunnel kind from release encryption/proof:

- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

`quic_tls_1_3` is not the relay tunnel kind. It is the release encryption/proof
requirement the tunnel must emit.

## What changed

- `p2pRelayPolicy.ts` now compares `RELAY_TRANSPORT_KIND` against
  `RELEASE_GRADE_RELAY_TRANSPORT_KIND`.
- Relay connect/payload/transport status APIs expose both
  `release_grade_relay_transport_kind` and
  `release_grade_transport_required`.
- `verify-p2p-control-plane-evidence.ps1` checks release relay kind and
  release proof separately.
- `show-musu-pro-p2p-env-status.ps1` reports both fields and keeps current
  source blocked because `RELAY_TRANSPORT_KIND=websocket_tunnel`.
- `audit-p2p-store-forward-relay-contract.ps1` was updated after validation
  exposed that it still looked for the old `quic_tls_1_3` transport-kind
  condition.

## Validation

- `npm run test:p2p`: `88/88`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- P2P env status: `ok=false` with expected blockers
- release evidence verifier regressions: `45/45`, failed `0`

## Product status

This is gate/spec hardening, not release relay payload transport. Public
release remains No-Go on second-PC route/CPU/matrix evidence, live hosted
MUSU.PRO P2P proof, support mailbox proof, and Store evidence.

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, rendezvous, path-selection, relay-fallback policy, and
evidence control plane.
