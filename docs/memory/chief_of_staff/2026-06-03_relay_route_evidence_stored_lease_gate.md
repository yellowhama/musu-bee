# 2026-06-03 Relay route evidence stored lease gate

Durable fact:

- `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts` now checks
  `route_kind=relay` evidence against `queryRelayLeases(...)`.
- Release-grade relay route evidence now requires an owner-scoped stored relay
  lease matching owner key, `session_id`, `source_node_id`, `target_node_id`,
  `lease_id`, and attempted route kind set.
- Issued-looking relay fallback JSON without a stored lease is stored as
  non-release-grade with `relay_route_lease_not_found`.
- Attempted route mismatch is stored as non-release-grade with
  `relay_route_lease_attempts_mismatch`.
- Lease store query failure is stored as non-release-grade with
  `relay_route_lease_store_unavailable:<detail>`.

Validation:

- route-evidence API test passed 13/13.
- `npm run test:p2p` passed 29/29.
- `npm run typecheck` passed.
- `git diff --check` passed.

Release interpretation:

- This hardens P2P evidence integrity.
- It does not implement relay/tunnel payload transport.
- Public release still requires live `musu.pro` relay transport proof,
  owner-scoped release-grade relay route evidence, second-PC evidence, and
  two-machine CPU/matrix evidence.
