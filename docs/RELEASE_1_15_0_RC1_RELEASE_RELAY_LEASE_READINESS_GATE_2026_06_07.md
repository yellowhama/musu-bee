# Release 1.15.0-rc.1 Release Relay Lease Readiness Gate

Date: 2026-06-07

## Summary

Release relay connect and payload preflight now share a release relay lease
readiness gate.

This hardens the next release relay tunnel step without pretending payload
transport is implemented. A relay lease must still be owner-scoped and present,
but now the release preflight path also rejects leases that are stale relative
to the current relay configuration or missing fallback context.

## Changed

- Added `musu-bee\src\lib\p2pReleaseRelayLeaseValidation.ts`.
- `/api/v1/relay/connect` rejects a lease as not connect-ready when the lease
  is stale, non-WSS, missing direct-route failure context, or no longer bound to
  the configured relay URL.
- `/api/v1/relay/payload` applies the same readiness gate before returning the
  current fail-closed payload endpoint response.
- P2P route tests now cover stale relay URL rejection on both connect and
  payload preflight.
- `audit-p2p-store-forward-relay-contract.ps1` now checks the shared release
  relay lease readiness source contract.

## Current Status

This does not flip any release marker:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- release payload bytes are still rejected
- preview store-forward queue remains non-release-grade
- live MUSU.PRO route metadata, transport proof, and payload delivery proof
  remain required

The new gate prevents stale or mismatched relay leases from becoming the
foundation for future release transport proof.

## Verification

Passed:

- `npm run test:p2p`: `114/114`
- `npm run typecheck`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json -FailOnProblem`:
  `ok=true`, `fail_count=0`
- `git diff --check`

## Qualitative Audit

No high or medium issue found.

Assessment:

- The change is fail-closed and keeps release transport disabled.
- It reduces a future proof-binding risk: a payload proof must be tied to the
  currently configured relay URL and a direct-route-failure relay lease.
- It keeps MUSU.PRO as control plane / relay coordinator and MUSU Desktop as
  local executor.
- It does not satisfy the live P2P, runtime byte path, second-PC, support, or
  Store gates.

## Next Steps

1. Implement the local release relay tunnel runtime byte path.
2. Implement the release payload endpoint beyond metadata preflight only after
   the byte path can emit proof.
3. Bind transport proof to the same lease/session/source/target/tunnel ids.
4. Record live MUSU.PRO owner-scoped relay route metadata, transport proof, and
   payload delivery proof.
5. Capture successful two-machine route/CPU/matrix evidence.
