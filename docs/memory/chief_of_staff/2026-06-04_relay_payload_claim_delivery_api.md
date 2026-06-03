# 2026-06-04 Relay Payload Claim/Delivery API

Added owner-scoped claim and delivery transitions for the relay payload queue
API:

- `PATCH /api/v1/p2p/relay/payload` with `musu.relay_payload_claim.v1`
- `PATCH /api/v1/p2p/relay/payload` with
  `musu.relay_payload_delivery.v1`
- responses `musu.p2p_relay_payload_claim.v1` and
  `musu.p2p_relay_payload_delivery.v1`

State flow:

- `queued -> claimed -> delivered`
- claim records `claimed_by` and `claimed_at`
- delivery records `delivered_at`
- delivery before claim returns `409 relay_payload_delivery_requires_claim`

Safety/interpretation:

- public payloads strip `owner_key`
- claim includes `payload_base64` only when `include_payload=true`
- delivery never returns payload bytes
- KV/Upstash claim/delivery fail closed with
  `relay_payload_claim_kv_not_implemented` and
  `relay_payload_delivery_kv_not_implemented` until atomic mutation is
  implemented
- this does not wire background polling, payload execution, or release-grade
  QUIC/TLS relay transport proof

Validation:

- `npm run test:p2p` passed 54/54
- `npm run typecheck` passed
