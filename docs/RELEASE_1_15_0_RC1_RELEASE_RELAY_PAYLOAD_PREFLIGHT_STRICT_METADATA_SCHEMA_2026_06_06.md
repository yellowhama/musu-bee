# MUSU 1.15.0-rc.1 Release Relay Payload Preflight Strict Metadata Schema

Date: 2026-06-06 KST
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD before this change: `7ff93757b8d49580e7c006e78f7739573b77540e`

## Summary

`/api/v1/relay/payload` is now a strict metadata-only preflight surface while
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.

The endpoint accepts only:

- optional `schema: "musu.relay_payload_preflight_request.v1"`
- `lease_id`
- `session_id`
- `source_node_id`
- `target_node_id`
- optional `tunnel_id`
- optional `payload_kind`
- optional `payload_sha256` as a 64-character hex digest

Known payload byte fields are still rejected first with
`release_payload_bytes_not_accepted`. Other unexpected fields now fail schema
validation with `invalid_relay_payload_preflight_request`; they are not passed
through to lease lookup.

## Source Changes

- `musu-bee/src/app/api/v1/relay/payload/route.ts`
  - changed the preflight request schema from passthrough to strict
  - added optional request schema literal
  - keeps the byte-field rejection path before schema parsing
- `musu-bee/src/app/api/v1/relay/payload/route.test.ts`
  - adds unknown-field rejection coverage
  - keeps metadata-only lease preflight and byte-field rejection coverage
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - now gates strict schema and unknown-field regression coverage

## Validation

Passed:

- `npm run test:p2p`: `90/90`
- `npm run typecheck`
- `powershell -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `powershell -File scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=45`, `failed_case_count=0`
- `powershell -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`:
  expected `ok=false` with release relay payload endpoint, KV/Upstash, live
  relay route, and relay payload delivery proof blockers still present

## Code Audit

Finding severity: no high or medium issue found in the changed source.

The change closes a small release-boundary gap: the endpoint no longer accepts
arbitrary client fields while it is preflight-only. This reduces accidental
payload/data-path ambiguity without claiming release tunnel readiness.

The release state is unchanged:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`
- `release_payload_accepted=false`
- `payload_stored=false`
- `payload_transported=false`

## Code And Document Indexing

MUSU local indexing was refreshed after the strict metadata schema code,
docs, wiki, spec, checklist, and CoS memory updates:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2477`
- symbols: `2719`
- elapsed: `10589 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index remains the reliable current code/document index.

## Next Steps

1. Implement actual release relay tunnel payload transport.
2. Keep accepting bytes only on the real release tunnel path after
   `quic_relay_tunnel` and `quic_tls_1_3` proof exists.
3. Keep `/api/v1/p2p/relay/payload` labeled as the non-release-grade preview
   store-forward queue.
4. Provision MUSU.PRO KV/Upstash relay lease storage and record owner-scoped
   live P2P evidence.
5. Capture current second-PC CPU/matrix/multi-device route evidence, support
   mailbox evidence, and Store evidence.

Public release remains No-Go until release relay payload transport, hosted P2P
evidence, second-PC evidence, support mailbox evidence, and Store evidence are
complete.
