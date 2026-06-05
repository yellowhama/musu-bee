# 2026-06-06 relay connect preflight strict metadata gate

`/api/v1/relay/connect` now accepts only release connect preflight metadata.

Changed:

- `RelayConnectRequestSchema` now has optional
  `schema=musu.relay_connect_request.v1`.
- The schema is strict and rejects unknown fields.
- Payload byte field attempts are rejected before lease lookup with
  `relay_connect_payload_bytes_not_accepted`.
- Forbidden byte fields are `payload`, `payload_base64`, `payload_b64`,
  `payload_bytes`, and `body_base64`.
- P2P store-forward relay contract audit now gates connect preflight strict
  metadata and regression coverage.

Validation:

- parser check for `audit-p2p-store-forward-relay-contract.ps1`: pass
- `npm run test:p2p -- --test-name-pattern "relay connect"`: `92/92`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`

Product/spec interpretation:

- MUSU.PRO relay connect remains metadata/control-plane preflight.
- The preview store-forward queue remains separate and non-release-grade.
- This does not implement release tunnel payload transport.
- Public release remains blocked on real second-PC route/CPU/matrix evidence,
  hosted P2P release proof, support mailbox proof, and Store proof.

