# 2026-06-04 Relay Payload Claim/Delivery Client CLI

Added Rust client and manual CLI support for the relay payload claim/delivery
API:

- `P2pRelayPayloadClaimRequest`
- `P2pRelayPayloadClaimResponse`
- `P2pRelayPayloadDeliveryRequest`
- `P2pRelayPayloadDeliveryResponse`
- `MusuCloud::claim_relay_payloads(...)`
- `MusuCloud::mark_relay_payload_delivered(...)`
- `musu relay payload-claim`
- `musu relay payload-deliver`

Interpretation:

- This is on-demand target-side diagnostics.
- This is not background polling.
- This is not payload execution.
- Text output omits payload bytes.
- Claim JSON includes payload bytes only with `--include-payload`.
- Both claim and deliver require `--target-node-id` or `--local-target`.
- No live production mutation smoke was run, because claim/deliver changes
  queue state.

Validation:

- cloud tests passed 10/10
- install CLI relay payload tests passed 4/4
- `cargo check --bin musu` passed
- Rust fmt check passed
- `musu relay payload-claim --help` showed the new claim surface
- `musu relay payload-deliver --help` showed the delivery surface
