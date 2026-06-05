# MUSU 1.15.0-rc.1 Relay Connect Preflight Strict Metadata Gate

Generated: 2026-06-06 06:48 KST

## Summary

`/api/v1/relay/connect` is now strict metadata-only preflight. It no longer
passes through unknown release-connect fields and it explicitly rejects payload
byte fields before lease lookup.

This keeps the release relay connect surface aligned with the current product
boundary:

- MUSU.PRO can coordinate relay/tunnel fallback and validate owner-scoped lease
  metadata.
- MUSU.PRO must not silently accept payload bytes on the connect preflight
  endpoint.
- Preview store-forward payloads stay on `/api/v1/p2p/relay/payload` and remain
  `release_grade=false`.
- The real release tunnel payload endpoint is still blocked until
  `quic_relay_tunnel` with `quic_tls_1_3` proof exists.

## Code Changes

Changed files:

- `musu-bee\src\app\api\v1\relay\connect\route.ts`
- `musu-bee\src\app\api\v1\relay\connect\route.test.ts`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1`

`POST /api/v1/relay/connect` now:

- accepts optional `schema=musu.relay_connect_request.v1`
- accepts only `lease_id`, `session_id`, `source_node_id`, and
  `target_node_id`
- rejects unknown fields via strict Zod parsing
- rejects `payload`, `payload_base64`, `payload_b64`, `payload_bytes`, and
  `body_base64` before relay lease lookup
- returns `relay_connect_payload_bytes_not_accepted` for payload byte attempts
- continues to return `relay_payload_endpoint_not_wired` for verified leases
  while release tunnel payload transport is unwired

The P2P store-forward relay contract audit now gates this behavior with:

- `release connect preflight fails closed and accepts metadata only`
- `release connect preflight regression coverage`

## Validation

- PowerShell parser for
  `scripts\windows\audit-p2p-store-forward-relay-contract.ps1`: pass
- `npm run test:p2p -- --test-name-pattern "relay connect"`:
  `92/92` passed
- `npm run typecheck`: pass
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`

New regression coverage:

- rejects relay connect payload bytes before lease lookup
- rejects unknown relay connect preflight fields
- release connect preflight audit now confirms no queue storage call is used by
  the release connect endpoint

## Qualitative Audit

No high or medium issue was found in this change.

This is a narrow input-contract hardening. It does not claim release-grade
relay transport and does not change the queue fallback into release transport.
The public release blockers remain:

- real second-PC route evidence
- second-PC idle CPU and runtime matrix evidence
- production KV/Upstash for hosted P2P storage
- live release-grade relay route evidence
- live relay payload delivery proof
- support mailbox proof
- Store/Partner Center proof

Because this is MUSU.PRO API source, clean release go/no-go after commit should
be treated as authoritative for whether current-source desktop/runtime evidence
needs another refresh.

## Next Step

Continue toward the actual release blocker: implement the real release tunnel
payload path, not just preflight. That path must carry payload bytes over the
release relay tunnel, emit `quic_tls_1_3` transport proof, bind the proof to the
owner-scoped relay lease/session/source/target tuple, and produce route evidence
with valid relay payload delivery proof.

