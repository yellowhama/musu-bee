# 2026-06-04 Relay Drain Preview Evidence Gate Hardening

Added a hosted route-evidence regression test proving that target-side relay
payload drain preview evidence cannot become release-grade relay transport
evidence.

The test seeds an owner-scoped relay lease, delivered relay payload, matching
delivery proof, and a relay route record using
`transport_verified_by=musu_relay_payload_drain_preview` plus
`encryption=relay_payload_queue_preview`.

Expected result:

- delivery proof is accepted as stored
- record remains `release_grade=false`
- blockers include `transport_not_release_grade_quic_tls`,
  `relay_route_missing_transport_proof`, `relay_route_transport_not_wired`, and
  `relay_route_payload_endpoint_not_wired`

Validation passed `npm run test:p2p` `62/62`, `npm run typecheck`, and
`git diff --check`.

This is evidence-gate hardening only; public release still needs real QUIC/TLS
relay transport proof, hosted KV/Upstash, second-PC route/CPU/matrix, support
mailbox, and Store evidence.
