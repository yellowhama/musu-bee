# 2026-06-07 Release Relay Lease Readiness Gate

Release relay connect and payload preflight now share a release relay lease
readiness gate.

Changed:

- added `musu-bee\src\lib\p2pReleaseRelayLeaseValidation.ts`;
- `/api/v1/relay/connect` rejects stale or mismatched relay leases with
  `release_relay_lease_not_connect_ready`;
- `/api/v1/relay/payload` rejects stale or mismatched relay leases with
  `release_relay_lease_not_payload_ready`;
- both paths expose `release_relay_lease_relay_url_mismatch` when a lease is no
  longer bound to the configured relay URL.

Validation:

- `npm run test:p2p`: `114/114`
- `npm run typecheck`
- P2P relay contract audit `ok=true`, `fail_count=0`
- `git diff --check`

Release status remains No-Go. The change hardens future proof binding only; it
does not implement release payload transport or the local release relay tunnel
runtime.
