# 2026-06-04 Relay Payload KV Claim/Delivery Store

Implemented KV/Upstash claim/delivery support for the relay payload queue.

Code:

- `p2pRelayPayloadStore` now shares state transition logic between file and KV.
- KV path loads records with `lrange`, applies claim/delivery, then rewrites the
  retained list with `del` and `rpush`.
- Removed the runtime blocker behavior that threw
  `relay_payload_claim_kv_not_implemented` and
  `relay_payload_delivery_kv_not_implemented`.

Interpretation:

- This is not release-grade atomic claim yet.
- `relay_payload_store_release_grade` remains false.
- No background polling or payload execution was added.
- `musu.pro` remains a control plane/fallback coordinator, not the default data
  path.

Validation:

- focused relay payload route tests passed 10/10
- `npm run test:p2p` passed 56/56
- `npm run typecheck` passed
