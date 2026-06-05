# 2026-06-06 release relay payload preflight byte rejection

## Decision

`/api/v1/relay/payload` is metadata-only until real release tunnel payload
transport exists. It must not accept payload bytes while
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.

## What changed

- Reject these fields before lease lookup:
  - `payload`
  - `payload_base64`
  - `payload_b64`
  - `payload_bytes`
  - `body_base64`
- Return `400 release_payload_bytes_not_accepted`.
- Keep `release_payload_accepted=false`, `payload_stored=false`, and
  `payload_transported=false`.
- Keep metadata-only lease verification path returning
  `409 relay_payload_endpoint_not_wired`.

## Validation

- `npm run test:p2p`: `89/89`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`

## Product status

This is release boundary hardening, not release relay payload implementation.
Public release remains No-Go on real release relay payload transport, live
hosted MUSU.PRO P2P proof, second-PC route/CPU/matrix evidence, support mailbox
proof, and Store evidence.
