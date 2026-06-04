# 2026-06-05 Relay Payload Delivery Proof Response

Implemented:

- Hosted `PATCH /api/v1/p2p/relay/payload` delivery acknowledgement now returns
  `delivery_proof` with schema `musu.relay_payload_delivery_proof.v1`.
- `p2pRelayPayloadStore.ts` exports the canonical proof type and helper.
- Rust cloud DTO accepts optional `delivery_proof`.
- Target-side relay payload drain prefers the API proof, falling back to the
  delivered-payload-derived proof for older servers.
- `musu relay payload-deliver --json` includes the delivery proof.

Validation:

- `npm run test:p2p` passed `79/79`.
- `npm run typecheck` passed.
- `npm run build` passed.
- `cargo test --lib relay_payload` passed `24/24`.
- `cargo check --bin musu` passed.
- `cargo fmt --check` passed.
- Rust background-loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`.
- `git diff --check` passed.
- P2P env status still correctly reports source relay connect/payload markers
  false and hosted evidence No-Go.
- Direct go/no-go on the committed source reports
  `ready_for_public_desktop_release=false`, `single_machine_verified=false`,
  `multi_device_verified=false`, and `manifest_git.dirty=false`.

Release state:

- This is runtime source, so packaged primary evidence is stale until refreshed.
- It does not implement release-grade QUIC/TLS relay transport.
- Public release remains No-Go on second-PC, hosted P2P, support mailbox, and
  Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_DELIVERY_PROOF_RESPONSE_2026_06_05.md`
