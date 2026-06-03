# MUSU 1.15.0-rc.1 P2P Relay Status Descriptor Gate

Date: 2026-06-03 21:10 KST

## Summary

`musu relay status --json` now reports the live relay transport descriptor
state instead of hiding hosted relay readiness behind a hardcoded transport
flag. The hosted P2P release gate now fails on explicit missing pieces and
surfaces those pieces in evidence and go/no-go output:

- `relay_transport_preflight_ok`
- `relay_transport_descriptor_wired`
- `relay_payload_endpoint_wired`
- `relay_lease_store_configured`
- `relay_lease_store_backend`
- `relay_lease_store_release_grade`
- `relay_transport_blockers`

This does not implement relay payload transport. It prevents status output from
masking the real blockers and keeps `musu.pro` as the control plane/relay
fallback boundary, not the default payload path.

## Changes

- `musu-rs/src/cloud/mod.rs` maps `relay_payload_endpoint_wired` from hosted
  relay transport responses.
- `musu-rs/src/install/cli_commands.rs` queries the live relay transport
  descriptor during `musu relay status`, copies successful descriptor fields
  into status JSON, parses JSON error bodies when transport preflight fails,
  and exposes the same payload endpoint field in `musu relay transport`.
- `scripts/windows/verify-p2p-control-plane-evidence.ps1` now requires relay
  status preflight, descriptor, payload endpoint, empty transport blockers,
  configured release-grade lease storage, transport payload endpoint, and
  release-grade route evidence before `relay_transport_wired` can be true.
- `scripts/windows/record-p2p-control-plane-evidence.ps1` summarizes and
  returns the new status/transport payload endpoint fields.
- `scripts/windows/write-release-go-no-go.ps1` emits the new P2P relay status
  and transport fields so the public No-Go explains the hosted relay blocker.
- `scripts/windows/test-release-evidence-verifiers.ps1` fixture coverage now
  models the stricter status/transport split.

## Validation

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-release-evidence-verifiers.ps1 -Json`: `ok=true`, `22/22`
- `cargo check --lib`
- `cargo test --lib install::cli_commands::tests::relay_status_reflects_live_transport_descriptor`: `1/1`
- `npm run test:p2p`: `37/37`
- `git diff --check`

Dirty-tree go/no-go after the change:

- `ready=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU valid machines: `1/2`
- runtime CPU scenario matrix valid machines: `1/2`
- `rust_background_loop_contract_verified=true`
- `p2p_control_plane_verified=false`
- `p2p_relay_transport_wired=false`
- `p2p_relay_status_transport_preflight_ok=false`
- `p2p_relay_status_transport_descriptor_wired=false`
- `p2p_relay_status_payload_endpoint_wired=false`
- `p2p_relay_transport_payload_endpoint_wired=false`
- `p2p_relay_payload_transport_proven=false`

## Release Interpretation

Public desktop release remains No-Go. The remaining local/external blockers are
unchanged:

- second-PC multi-device route evidence
- runtime idle CPU on two machines
- runtime CPU scenario matrix on two machines
- live hosted P2P relay payload endpoint and release-grade route proof
- `musu@musu.pro` support mailbox evidence
- Partner Center/Store evidence

Because this commit changes Rust CLI/source and release scripts, fresh clean
post-commit evidence is required before treating the current source as packaged
primary evidence.
