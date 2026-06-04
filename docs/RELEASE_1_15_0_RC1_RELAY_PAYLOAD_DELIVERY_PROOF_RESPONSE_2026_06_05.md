# MUSU 1.15.0-rc.1 Relay Payload Delivery Proof Response

**Wiki ID**: wiki/715
**Date**: 2026-06-05 KST

## Scope

Relay payload delivery acknowledgement now returns a canonical
`musu.relay_payload_delivery_proof.v1` object.

This moves the hosted P2P relay fallback evidence chain forward:

- source runtime queues a lease-bound relay payload after direct route failure,
- target runtime claims the payload,
- target runtime accepts it through the local forwarded-task path,
- target runtime marks it delivered, and
- the delivery response now contains the proof shape required by route evidence.

This does not implement release-grade QUIC/TLS relay transport. The source
relay markers intentionally remain:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`

## Change

Web runtime:

- `p2pRelayPayloadStore.ts` now exports
  `RelayPayloadDeliveryProof`.
- `relayPayloadDeliveryProofFromDeliveredPayload(payload)` builds the canonical
  proof only when the stored payload is `delivered` and has `delivered_at`.
- `PATCH /api/v1/p2p/relay/payload` with
  `musu.relay_payload_delivery.v1` now returns `delivery_proof` alongside the
  sanitized delivered payload.

Rust runtime:

- `P2pRelayPayloadDeliveryResponse` now accepts optional `delivery_proof`.
- The target-side relay payload drain prefers the API-provided delivery proof
  and falls back to constructing one from the delivered payload for older
  servers.
- `musu relay payload-deliver --json` includes `delivery_proof` in its report,
  and human output prints the proof summary.

## Validation

Passed:

- `npm run test:p2p`: `79/79`
- `npm run typecheck`
- `npm run build`
- `cargo test --lib relay_payload`: `24/24`
- `cargo check --bin musu`
- `cargo fmt --check`
- `audit-rust-background-loop-contract.ps1 -Json`: `ok=true`,
  `fail_count=0`, `unaudited_loop_hit_count=0`
- `git diff --check`
- `show-musu-pro-p2p-env-status.ps1 -Json`

The P2P env status still reports:

- `ok=false`
- source relay connect implemented: `false`
- source relay payload implemented: `false`
- source relay payload queue implemented: `true`
- missing KV/Upstash URL/token
- live evidence relay transport not wired
- live evidence relay route not proven
- live evidence relay payload delivery proof missing

Direct go/no-go on this commit completed at `2026-06-05T02:33:47+09:00`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=false`
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `manifest_git.dirty=false`

## Release State

This is web/Rust runtime source, so current packaged MSIX/single-machine/CPU
evidence is stale until rebuilt and refreshed from this commit.

Public release remains No-Go until:

- second-PC install/runtime/multi-device evidence is recorded,
- hosted `musu.pro` KV/Upstash storage is provisioned,
- real relay connect/payload transport emits release-grade `quic_tls_1_3`
  proof,
- relay route evidence includes valid stored transport and delivery proof,
- support mailbox evidence is recorded, and
- Store evidence is complete.
