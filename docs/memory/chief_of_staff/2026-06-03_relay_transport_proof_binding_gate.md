# 2026-06-03 relay transport proof binding gate

`POST /api/v1/p2p/route-evidence` now keeps relay route evidence
non-release-grade when a proof-shaped `musu.relay_transport_proof.v1` payload is
not bound to the stored owner-scoped relay lease or release transport contract.

Added blockers:

- `relay_route_transport_proof_relay_url_mismatch`
- `relay_route_transport_proof_kind_not_release_grade`
- `relay_route_transport_proof_opened_at_invalid`
- `relay_route_transport_proof_closed_at_invalid`
- `relay_route_transport_proof_timestamp_order_invalid`

Validation passed:

- `npm run test:p2p` 40/40
- `npm run typecheck`
- `git diff --check`

This is release evidence hardening, not relay payload transport implementation.
Public release remains blocked by actual relay payload proof, second-PC
runtime/multi-device evidence, support mailbox evidence, and Store evidence.
