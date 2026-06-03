# Release 1.15.0-rc.1 relay transport proof binding gate

Date: 2026-06-03 KST

## Summary

Relay route evidence now rejects proof-shaped payload transport JSON that is not
bound to the owner-scoped relay lease and release transport contract.

New blockers:

- `relay_route_transport_proof_relay_url_mismatch`
- `relay_route_transport_proof_kind_not_release_grade`
- `relay_route_transport_proof_opened_at_invalid`
- `relay_route_transport_proof_closed_at_invalid`
- `relay_route_transport_proof_timestamp_order_invalid`

The route-evidence API already required a stored owner-scoped relay lease,
`musu.relay_transport_proof.v1`, `wss://` relay URL,
`payload_transited_musu_infra=true`, `encryption=quic_tls_1_3`, and
`transport_verified_by=musu_quic_tls_transport`. This gate adds:

- proof `relay_url` must match the stored lease `relay_url`
- proof `transport_kind` must be `quic_relay_tunnel`
- proof timestamps must parse, and `closed_at` cannot be before `opened_at`

## Validation

- `npm run test:p2p`: 40/40 passed
- `npm run typecheck`: passed
- `git diff --check`: passed

## Release Interpretation

This is evidence hardening only. It does not implement relay/tunnel payload
transport and does not make `musu.pro` a central default data path. Public
release remains No-Go until real release-grade relay payload transport can
generate matching owner-scoped proof, second-PC runtime/multi-device evidence
passes, support mailbox evidence is recorded, and Store evidence is complete.
