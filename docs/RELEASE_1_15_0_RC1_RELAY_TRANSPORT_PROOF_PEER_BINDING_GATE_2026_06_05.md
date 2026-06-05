# MUSU 1.15.0-rc.1 Relay Transport Proof Peer Binding Gate

**Wiki ID**: wiki/743

Date: 2026-06-05
Scope: `musu.pro` P2P route evidence and relay transport proof release gate

## Context

MUSU Desktop remains the local runtime. `musu.pro` is the remote input, room, rendezvous, route-evidence, and relay-fallback control plane. It must help devices find each other and prove routing behavior, but it must not turn weak relay evidence into a release-grade data-path claim.

The hosted relay transport proof endpoint already requires `source_node_id` and `target_node_id`, but inline relay transport proof inside route evidence was looser. It checked the lease, session, URL, tunnel, transport kind, payload bytes, infra transit, encryption, verifier, and timestamps, but it did not require the inline proof peer pair to match the route evidence peer pair.

## Change

Route evidence now requires relay transport proof to be peer-bound:

- `relay_transport_proof.source_node_id` is required.
- `relay_transport_proof.target_node_id` is required.
- `POST /api/v1/p2p/route-evidence` adds blockers when inline proof source or target does not match the route evidence record.
- `release_grade=true` route evidence queries now reject relay records whose current inline transport proof is not bound to the same source and target node ids.
- Rust `RouteRelayTransportProof` now serializes the same source/target peer fields as the hosted proof API.

## Verification

Commands run on 2026-06-05:

```powershell
npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts
npm run typecheck
cargo fmt --manifest-path .\musu-rs\Cargo.toml
cargo test --manifest-path .\musu-rs\Cargo.toml --lib route_evidence_serializes_relay_transport_proof_peer_binding_fields
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json
git diff --check
```

Results:

- Route evidence regression tests passed: `28/28`.
- TypeScript typecheck passed.
- Rust peer-binding serialization test passed under `--lib`: `1/1`.
- P2P store-forward relay contract audit passed: `ok=true`, `fail_count=0`.
- Whitespace check passed.
- P2P env status remains `ok=false` as expected because release relay endpoints, production KV/Upstash, live relay route evidence, and delivery proof are still missing.

Note: an unscoped cargo test filter compiled successfully and the targeted lib/main tests passed, but overall cargo exited `1` because a filtered integration-test binary (`r6_auto_update`) requires Windows elevation (`os error 740`). The `--lib` rerun is the clean targeted Rust result for this DTO contract.

## Current Blockers

Public release remains No-Go on:

- real second-PC multi-device evidence
- second-PC runtime idle CPU evidence
- second-PC runtime CPU scenario matrix evidence
- hosted `musu.pro` release-grade P2P control-plane proof
- production KV/Upstash storage for hosted P2P proof stores
- release-grade relay connect/payload tunnel transport
- owner-scoped relay route evidence with transport and payload delivery proof
- `musu@musu.pro` support mailbox proof
- Microsoft Store/Partner Center release proof

This is evidence-integrity hardening only. It does not implement the release relay tunnel and does not change MUSU Desktop's local-executor product model.
