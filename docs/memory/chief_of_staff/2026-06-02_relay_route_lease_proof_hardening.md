# 2026-06-02 Relay Route Lease-Proof Hardening

- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts` now requires relay
  route evidence to include issued relay lease proof before it can be
  `release_grade=true`.
- Required proof: direct path failed, lease requested, status `issued`,
  `lease_issued=true`, non-empty lease id, at least one non-relay attempted
  route kind, and no relay policy blockers.
- Missing or denied relay proof keeps evidence stored/auditable but adds
  blockers such as `relay_route_missing_lease_proof`,
  `relay_route_lease_not_issued`, and `relay_route_lease_blocked`.
- Validation passed: `npm run test:p2p -- src/app/api/v1/p2p/route-evidence/route.test.ts`
  23/23 and `npm run typecheck`.
- This is a `musu.pro` verifier hardening step only. Relay/tunnel payload
  transport and live KV-backed owner-scoped relay evidence remain open release
  blockers.
