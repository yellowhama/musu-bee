# 2026-06-03 Relay Fallback Payload Gap Gate

Durable decision: relay lease issuance must not be treated as relay payload
transport proof.

Runtime `relay_fallback` evidence now records:

- `payload_transport_attempted=false`
- `payload_transport_proven=false`
- `payload_transport_failure_class=relay_payload_transport_not_implemented`

This is set when bridge forwarding receives an issued relay lease after
terminal direct-route failure, because current runtime code still does not
attempt relay payload transport.

Hosted route-evidence grading now keeps such issued fallback addenda
non-release-grade with blockers:

- `relay_fallback_payload_transport_not_attempted`
- `relay_fallback_payload_transport_not_proven`
- `relay_fallback_payload_transport_not_implemented`

Validation passed `npm run test:p2p` `38/38`, `npm run typecheck`,
`cargo check --lib`, Rust route-evidence tests `10/10`, Rust fmt check, and
`git diff --check`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_FALLBACK_PAYLOAD_GAP_GATE_2026_06_03.md`

Public release remains No-Go until actual relay/tunnel payload transport emits
release-grade `musu.relay_transport_proof.v1`, plus second-PC runtime and route
evidence, support mailbox evidence, and Store evidence.
