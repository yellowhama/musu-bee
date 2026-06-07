# RELEASE 1.15.0-rc.1 P2P Relay Transport Descriptor Target Kind

Date: 2026-06-07

## Summary

`p2pRelayPolicy.ts` now reports the active relay transport descriptor as the
release tunnel kind:

- `RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

This removes the source-level
`source_relay_transport_kind_not_release_grade` blocker without opening relay
payload transport.

## Boundary

The release relay path remains fail-closed:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `/api/v1/relay/payload` is still metadata-only preflight
- preview `/api/v1/p2p/relay/payload` remains non-release-grade
- `relayTransportWired()` still requires the env flag, release transport kind,
  release payload endpoint, and release tunnel runtime

This is not a release relay tunnel implementation. It only aligns the source
transport descriptor with the release target kind so the remaining blockers are
the actual missing implementation and proof.

## Current P2P Env Status

`show-musu-pro-p2p-env-status.ps1 -Json` now reports:

- `source.relay_transport_kind=quic_relay_tunnel`
- `source.relay_transport_kind_release_grade=true`
- `source.release_relay_tunnel_runtime_source_contract_ready=true`
- `source.relay_payload_endpoint_implemented=false`
- `source.release_relay_tunnel_runtime_implemented=false`
- `source.preview_store_forward_payload_queue_non_release_grade=true`

Remaining blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_route_metadata_missing`
- `live_evidence_relay_route_transport_proof_missing`
- `live_evidence_relay_payload_delivery_proof_missing`

## Validation

Passed:

- `npm run test:p2p`: `112/112`
- `npm run typecheck`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json`: expected
  `ok=false` with the remaining blockers above
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=104`, `failed_case_count=0`
- `git diff --check`

## Code Audit

No high or medium issue found.

Residual risk is semantic: `relay_transport_kind=quic_relay_tunnel` can be
misread as runtime readiness. The source still prevents that by keeping
`relayTransportWired()` dependent on the release payload endpoint and local
release relay tunnel runtime markers, both of which remain false. The P2P env
status and release notes now call this out explicitly.

## Next Step

Implement the real local release relay tunnel runtime and distinct release
payload endpoint, then record live MUSU.PRO route metadata, transport proof, and
payload delivery proof. Public release remains No-Go until those live proofs and
second-PC evidence exist.
