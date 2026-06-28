# Release Relay Payload Proof Endpoint (2026-06-28)

## Summary

MUSU is still **NO-GO** for the full product spec, but one P2P source blocker
was narrowed.

The release `/api/v1/relay/payload` route is no longer a marker-only or
preflight-only placeholder. It now accepts a proof-bound release payload request
that contains lease metadata, a release-grade relay transport proof, and a relay
payload delivery proof. It still rejects raw payload bytes and does not reuse the
preview store-forward payload queue as release-grade transport.

## Product Spec Change

Current source contract:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=true`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- release payload endpoint path: `/api/v1/relay/payload`
- release proof request schema: `musu.relay_payload_release_request.v1`
- transport proof schema: `musu.relay_transport_proof.v1`
- delivery proof schema: `musu.relay_payload_delivery_proof.v1`
- proof endpoint status marker: `release_payload_endpoint_proof_bound=true`
- preflight-only marker: `release_payload_preflight_only=false`

The endpoint can now record proof metadata through `appendRelayTransportProof`.
It returns `release_payload_accepted=true` and `payload_transported=true` only
for proof-bound requests. Local file stores keep `release_grade=false`; hosted
release proof still requires KV/Upstash-backed release-grade storage.

## What Did Not Change

This does **not** implement the release tunnel runtime.

The product remains blocked by:

- `source_release_relay_tunnel_runtime_not_implemented`
- missing KV/Upstash REST URL/token names
- missing live MUSU.PRO relay transport evidence
- missing live relay route evidence
- missing live relay route metadata
- missing live relay route transport proof
- missing live relay payload delivery proof

The preview store-forward payload queue remains non-release-grade by design. It
is allowed to exist beside the release endpoint, but it cannot satisfy the
release relay transport gate.

## Verification

Commands run:

- `npm run test:p2p -- --test-name-pattern "relay payload|relay connect|relay transport|relay lease"`
  - result: `125` tests passed
- `npm run typecheck`
  - result: passed
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1 -Json`
  - result: `ok=true`, `fail_count=0`
- `scripts/windows/audit-operator-api-security-contract.ps1 -Json`
  - result: `ok=true`, `fail_count=0`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`
  - result: `ok=true`, `case_count=211`, `failed_case_count=0`
- `scripts/windows/show-musu-pro-p2p-env-status.ps1 -Json`
  - result: `ok=false`, with release payload endpoint implemented and
    proof-bound, but runtime/storage/live evidence still blocked

## Code Audit

No high or medium risk issue was found in this change.

Important guardrails still hold:

- no raw payload bytes are accepted by `/api/v1/relay/payload`
- no release endpoint writes to the preview store-forward queue
- transport proof is owner-scoped and lease-bound
- proof metadata must use `quic_relay_tunnel`, `quic_tls_1_3`,
  `quic_tls_cert_fingerprint`, and `musu_quic_tls_transport`
- `relayTransportWired()` still requires the release tunnel runtime marker, so
  source flags cannot claim release-grade delegated work prematurely

## Next Steps

1. Implement the local release relay tunnel runtime that moves bytes through the
   actual `quic_relay_tunnel` path.
2. Configure release-grade KV/Upstash storage for MUSU.PRO without printing
   secret values.
3. Deploy MUSU.PRO and record fresh P2P control-plane evidence.
4. Prove owner-scoped relay route evidence with valid route metadata, transport
   proof, and payload delivery proof.
5. Rerun `write-release-go-no-go.ps1 -Json`; the product can only be called
   complete after all blockers are zero.
