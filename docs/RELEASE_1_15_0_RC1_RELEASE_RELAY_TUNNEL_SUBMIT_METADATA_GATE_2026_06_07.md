# RELEASE 1.15.0-rc.1 Release Relay Tunnel Submit Metadata Gate - 2026-06-07

## Summary

The Rust release relay tunnel submit hook now requires the same release payload
metadata as the MUSU.PRO release payload preflight before it can reach the
fail-closed runtime branch.

Required metadata:

- `source_node_id`
- `target_node_id`
- `tunnel_id`
- `payload_kind=forwarded_task_envelope`
- 64-hex `payload_sha256`

`submit_release_relay_tunnel_payload(...)` still returns
`release_relay_tunnel_runtime_not_implemented` for otherwise valid release
metadata. This is source-contract hardening, not release tunnel implementation.

## Code Changes

- `musu-rs/src/bridge/rendezvous.rs`
  - rejects missing source, target, or tunnel metadata
  - rejects payload kind other than `forwarded_task_envelope`
  - rejects missing or non-64-hex `payload_sha256`
  - adds `is_hex_sha256`
  - adds regression test `submit_release_relay_tunnel_payload_requires_release_metadata`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - adds `release relay tunnel submit requires payload metadata`
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - expands the Rust release relay tunnel source-contract needles

## Release Boundary

Markers remain closed:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`

The change aligns local runtime source hooks with the hosted release payload
preflight contract. It prevents future `quic_relay_tunnel` implementation work
from accidentally accepting underspecified payload metadata.

Because this touches Rust runtime source, current packaged local desktop
evidence will need a rebuild/reinstall/evidence refresh after this lands before
local desktop gates can be current again.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`: passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib release_relay_tunnel -- --nocapture`:
  `5` passed, `334` filtered
- P2P relay contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=true`, `case_count=104`,
  `failed_case_count=0`
- `git diff --check`: passed
- clean go/no-go after the release relay tunnel submit metadata code change:
  `manifest_git.dirty=false`, `local_artifacts_ready=true`,
  `single_machine_verified=false`, `runtime_idle_cpu_valid_machine_count=0`,
  `runtime_cpu_scenario_matrix_valid_machine_count=0`,
  `runtime_cpu_second_pc_route_attempt_verified=false`, and
  `ready_for_public_desktop_release=false`

## Indexing

- MUSU local indexer after clean go/no-go docs:
  `2861 files`, `2790 symbols`, `11722 ms`
- wiki: `wiki/944`

## Qualitative Evaluation

No high or medium issue was found.

The change improves release correctness because the runtime-side release hook
now rejects the same incomplete payload metadata that the web preflight rejects.
It does not create a new payload path and does not move local execution into
MUSU.PRO.

Residual risks:

- actual `quic_relay_tunnel` payload transit is still unimplemented
- hosted storage/login/live relay proof are still missing
- packaged local desktop evidence must be refreshed after this Rust source
  change lands
- real second-PC route/CPU/matrix, support mailbox, and Store proof remain
  open

## Next Steps

1. Rebuild/reinstall current HEAD and refresh local desktop evidence.
2. Implement real release relay tunnel payload transit only when it can emit
   route transport proof and payload delivery proof.
3. Configure hosted P2P storage/auth and capture live MUSU.PRO relay evidence.
4. Run the physical second-PC operator pack for route, idle CPU, and five-state
   runtime matrix evidence.
