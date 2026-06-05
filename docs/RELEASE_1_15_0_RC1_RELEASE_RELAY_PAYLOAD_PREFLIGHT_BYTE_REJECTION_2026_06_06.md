# MUSU 1.15.0-rc.1 Release Relay Payload Preflight Byte Rejection

Date: 2026-06-06 KST
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD before this change: `3c889a4cdb6beb683c4e56804a5da85cabdced27`

## Summary

`/api/v1/relay/payload` remains a release payload preflight endpoint, not a
payload data path. This change makes that boundary explicit in code: known
payload byte fields are rejected before lease lookup while
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.

Rejected fields:

- `payload`
- `payload_base64`
- `payload_b64`
- `payload_bytes`
- `body_base64`

When any of those fields are present, the endpoint returns
`400 release_payload_bytes_not_accepted` with
`release_payload_accepted=false`, `payload_stored=false`, and
`payload_transported=false`.

Metadata-only preflight still works as before: with a verified owner-scoped
relay lease it returns `409 relay_payload_endpoint_not_wired`, because the
release tunnel payload transport is still not implemented.

## Source Changes

- `musu-bee/src/app/api/v1/relay/payload/route.ts`
  - bounds lease/session/node/tunnel metadata lengths
  - requires `payload_sha256` to be a 64-character hex digest when supplied
  - rejects known payload byte fields before querying relay leases
  - keeps the release endpoint separate from `/api/v1/p2p/relay/payload`
- `musu-bee/src/app/api/v1/relay/payload/route.test.ts`
  - adds regression coverage for `release_payload_bytes_not_accepted`
  - keeps metadata-only lease preflight coverage
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - now gates the payload-byte rejection contract

## Validation

Passed:

- `npm run test:p2p`: `89/89`
- `npm run typecheck`
- `powershell -File scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `powershell -File scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`:
  `ok=false` with expected blockers for the missing release payload endpoint,
  queue-only payload path, `websocket_tunnel`, missing KV/Upstash env, missing
  live relay route proof, and missing payload delivery proof
- `powershell -File scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=45`, `failed_case_count=0`

## Code Audit

Finding severity: no high or medium issue found in the changed source.

The change reduces two risks:

- Accidental payload transit through the release preflight endpoint before the
  release tunnel exists.
- Resource/semantic confusion where a client sends bytes to
  `/api/v1/relay/payload` and interprets a lease-level response as payload
  acceptance.

The release gate remains honest:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `release_payload_accepted=false`
- `payload_stored=false`
- `payload_transported=false`

## Index Refresh

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2474 files`
- `2719 symbols`
- `11548 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

## Next Steps

1. Implement the real release relay tunnel behind `/api/v1/relay/payload`.
2. Accept payload bytes only after the release tunnel can emit
   `relay_transport_kind=quic_relay_tunnel` and `quic_tls_1_3` proof.
3. Keep `/api/v1/p2p/relay/payload` labeled as the non-release-grade preview
   queue.
4. Configure production KV/Upstash and capture live owner-scoped MUSU.PRO
   relay route/payload delivery proof.
5. Capture current second-PC route, idle CPU, and runtime matrix evidence.

Public release remains No-Go until second-PC evidence, hosted P2P proof,
support mailbox evidence, and Store evidence are recorded.
