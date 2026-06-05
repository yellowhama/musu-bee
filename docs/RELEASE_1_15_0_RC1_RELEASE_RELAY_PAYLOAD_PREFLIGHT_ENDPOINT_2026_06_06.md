# MUSU 1.15.0-rc.1 Release Relay Payload Preflight Endpoint

Date: 2026-06-06 KST
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD before this change: `83b85cb2`

## Summary

Added a distinct release relay payload preflight endpoint at
`/api/v1/relay/payload`.

This endpoint is intentionally separate from the preview store-forward queue at
`/api/v1/p2p/relay/payload`. It validates P2P control auth and owner-scoped
relay lease metadata, but it does not accept, store, forward, or deliver payload
bytes. Current source still keeps `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.

Current source state:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=true`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `release_payload_preflight_endpoint_implemented=true`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

The release gate remains honest: this is endpoint contract preparation, not
release-grade relay payload transport.

## Source Changes

- Added `RELAY_PAYLOAD_PATH=/api/v1/relay/payload`.
- Added `musu-bee/src/app/api/v1/relay/payload/route.ts`.
  - `GET` returns `musu.relay_payload_preflight.v1` behind P2P control auth.
  - `POST` validates `lease_id`, `session_id`, `source_node_id`, and
    `target_node_id`.
  - `POST` queries owner-scoped relay leases before deciding anything about
    release payload transport.
  - A verified lease still returns `409 relay_payload_endpoint_not_wired`.
  - Store failures return `503 relay_payload_preflight_store_failed`.
  - Responses keep `release_payload_accepted=false`,
    `payload_stored=false`, and `payload_transported=false`.
- Added `musu-bee/src/app/api/v1/relay/payload/route.test.ts`.
- Added the test to `npm run test:p2p`.
- Extended `show-musu-pro-p2p-env-status.ps1` with
  `release_payload_preflight_endpoint_implemented`.
- Extended `audit-p2p-store-forward-relay-contract.ps1` so the release payload
  preflight endpoint must remain fail-closed and must not call queue storage.

## Validation

Passed:

- PowerShell parser check for updated P2P status/audit scripts.
- `npm run test:p2p`: `88/88`
- `npm run typecheck`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`
- `git diff --check`

P2P env status at `2026-06-06T00:03:19+09:00` reports:

- `relay_connect_endpoint_implemented=true`
- `release_payload_preflight_endpoint_implemented=true`
- `relay_payload_endpoint_implemented=false`
- `release_payload_endpoint_queue_only=true`
- `relay_payload_queue_fallback_implemented=true`
- `relay_transport_kind=websocket_tunnel`
- `relay_transport_kind_release_grade=false`

Remaining blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_payload_endpoint_queue_only`
- `source_relay_transport_kind_not_release_grade`
- missing KV/Upstash URL/token names
- live evidence still fails with `p2p_relay_lease_kv_not_configured`
- live relay transport not wired
- live relay route not proven
- live relay payload delivery proof missing

## Code Audit

Finding severity: no high or medium issue found.

Reviewed risks:

- Auth boundary: both `GET` and `POST` call `authorizeP2pControl(req)`.
- Owner boundary: `POST` derives owner identity from the authenticated bearer
  token and queries leases by owner, lease, session, source, and target.
- Queue separation: the new release endpoint does not import or call
  `appendRelayPayload`, `claimRelayPayloads`, or `markRelayPayloadDelivered`.
- Release honesty: the endpoint keeps `ok=false`, `release_grade=false`,
  `release_payload_accepted=false`, `payload_stored=false`, and
  `payload_transported=false` while the release payload marker is false.

Residual risks:

- This does not implement release tunnel payload transport.
- This does not emit `musu.relay_transport_proof.v1`.
- This does not prove live hosted P2P production storage or route evidence.
- Packaged current-HEAD local evidence should be refreshed after committing
  this web runtime source change if the release packet needs current-source
  artifact proof.

## Qualitative Evaluation

This moves the P2P/relay architecture in the right direction without faking
release readiness. The product now has separate surfaces for:

- release connect preflight: `/api/v1/relay/connect`
- release payload preflight: `/api/v1/relay/payload`
- preview store-forward queue: `/api/v1/p2p/relay/payload`

That separation matters because MUSU.PRO must coordinate and prove routes
without becoming an unlabelled default payload path. MUSU Desktop remains the
local executor; MUSU.PRO remains remote input, project/company room,
rendezvous, path selection, relay fallback policy, and evidence/control plane.

## Next Steps

1. Implement the actual release tunnel payload transport behind
   `/api/v1/relay/payload`.
2. Keep `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` until payload bytes move
   through that release path and produce `quic_tls_1_3` transport proof.
3. Configure hosted KV/Upstash and rerun live P2P evidence.
4. Record owner-scoped release-grade relay route and payload delivery proof.
5. Refresh packaged current-HEAD single-machine/CPU/matrix evidence if this
   source change is used for release packet readiness.
6. Continue the remaining release gates: second-PC evidence, support mailbox,
   and Store evidence.

## Index Refresh

After this report, spec, checklist, wiki, and CoS memory updates, the MUSU local
indexer was refreshed:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `2439 files`, `2717 symbols`, `15901 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.
