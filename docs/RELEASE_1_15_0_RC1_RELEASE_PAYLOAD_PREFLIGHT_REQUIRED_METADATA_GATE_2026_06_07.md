# RELEASE 1.15.0-rc.1 Release Payload Preflight Required Metadata Gate - 2026-06-07

## Summary

`/api/v1/relay/payload` remains an authenticated, metadata-only release
payload preflight surface while release relay tunnel payload transport is not
implemented. The preflight now requires the tunnel payload metadata before
owner-scoped lease lookup:

- `tunnel_id`
- `payload_kind=forwarded_task_envelope`
- 64-hex `payload_sha256`

This closes the gap where a release payload preflight could be lease-verified
with underspecified tunnel metadata. The endpoint still does not accept payload
bytes, does not use preview queue storage, and does not emit release relay
transport or delivery proof.

## Code Changes

- `musu-bee/src/app/api/v1/relay/payload/route.ts`
  - requires `tunnel_id`
  - requires `payload_kind=forwarded_task_envelope`
  - requires 64-hex `payload_sha256`
  - echoes `release_payload_metadata` only after lease verification
- `musu-bee/src/app/api/v1/relay/payload/route.test.ts`
  - adds regression coverage for missing required metadata
  - updates valid preflight payload kind to `forwarded_task_envelope`
  - verifies lease-verified blocked responses echo metadata
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - gates the required metadata schema
  - gates `release_payload_metadata` evidence in blocked responses

## Release Boundary

The release gate remains closed:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- P2P env status is expected to remain `ok=false`

Known byte fields still fail before schema parsing with
`release_payload_bytes_not_accepted`. Unknown fields still fail strict parsing
with `invalid_relay_payload_preflight_request`. Lease-verified blocked
responses still keep:

- `release_payload_accepted=false`
- `payload_stored=false`
- `payload_transported=false`

Product boundary is unchanged: MUSU Desktop executes local work; MUSU.PRO is
remote input, project/company room, AI meeting room coordination, presence,
rendezvous, path selection, relay fallback coordination, and evidence/control
plane.

## Validation

- `git diff --check`: passed
- `npm run test:p2p -- --test-name-pattern "release payload"`: passed
  `112/112`
- `npm run typecheck`: passed
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json`: expected
  `ok=false` with release relay payload endpoint, release tunnel runtime,
  relay transport kind, hosted storage/login, live route proof, relay transport
  proof, and relay payload delivery proof blockers
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=104`, `failed_case_count=0`

## Qualitative Evaluation

No high or medium code issue was found.

The change improves correctness and security posture because a release payload
preflight can no longer reach lease lookup without the tunnel id, expected
payload kind, and digest. It is intentionally conservative: it tightens the
control-plane input boundary without flipping any release endpoint/runtime
marker and without creating a data path through MUSU.PRO.

Residual risks:

- this server-side P2P control-plane change does not replace packaged local
  desktop evidence, but clean go/no-go keeps current local desktop evidence
  accepted because server-only P2P control-plane files are freshness-classified
  separately
- real `quic_relay_tunnel` payload transit is still not implemented
- hosted KV/Upstash, production runtime login, live relay route proof, relay
  transport proof, and relay payload delivery proof are still missing
- physical second-PC route/CPU/matrix evidence, support mailbox proof, and
  Store proof are still missing

## Next Steps

1. Implement the real release tunnel payload path only when it can emit
   `quic_relay_tunnel`, `quic_tls_1_3`, route transport proof, and delivery
   proof.
2. Configure hosted P2P storage/auth and capture live MUSU.PRO relay evidence.
3. Run the physical second-PC operator pack to capture route, idle CPU, and
   five-state runtime matrix evidence.
4. Complete support mailbox and Store evidence gates.
