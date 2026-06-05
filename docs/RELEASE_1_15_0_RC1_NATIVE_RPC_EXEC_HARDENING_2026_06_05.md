# MUSU 1.15.0-rc.1 Native RPC Exec Hardening

Date: 2026-06-05  
Commit: `fe25c5d8126dd1c8b9a57f9835b14eee4d41e96a`

## Summary

The native bridge endpoint `/api/v1/rpc/exec` is no longer an open remote
command surface. It now fails closed unless `MUSU_RPC_EXEC_ALLOWLIST` contains
the requested bare command name.

This keeps the product boundary intact:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO can be the remote input, room, rendezvous, path-selection,
  relay-fallback policy, and evidence control plane.
- Web or peer input must not become an unrestricted remote shell into the
  local runtime.

## What Changed

- Added fail-closed native RPC exec allowlist:
  `MUSU_RPC_EXEC_ALLOWLIST`.
- Added bounded native RPC exec timeout:
  `MUSU_RPC_EXEC_TIMEOUT_SECS`, default `10`, clamped to `1..60` seconds.
- Rejected command paths even when the basename is allowlisted.
- Rejected user-supplied `cwd` to avoid platform-specific executable path
  resolution ambiguity.
- Rejected control characters and excessive command/argument sizes.
- Bounded returned stdout/stderr to `64 KiB` each.
- Spawned children with `kill_on_drop(true)` and wrapped execution in
  `tokio::time::timeout`.
- Wrote bridge audit entries for rejected, spawn-failed, timed-out, and
  completed command attempts.
- Extended `audit-operator-api-security-contract.ps1` so this native endpoint
  is part of the operator/P2P control security gate.
- Documented the new environment variables in `docs/CONFIG.md`.

## Validation

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`: pass
- `cargo test --manifest-path .\musu-rs\Cargo.toml rpc_exec_ --lib`: pass,
  `6 passed`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu`: pass
- `scripts\windows\audit-operator-api-security-contract.ps1 -Json -FailOnProblem`:
  `ok=true`, `fail_count=0`, `check_count=44`
- `scripts\windows\audit-local-api-auth-contract.ps1 -Json -FailOnProblem`:
  `ok=true`, `fail_count=0`, `check_count=39`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json -FailOnProblem`:
  `ok=true`, `fail_count=0`, `unaudited_loop_hit_count=0`,
  `unaudited_spawn_hit_count=0`,
  `telemetry_flush_primitive_hit_count=0`, `check_count=200`
- `git diff --check`: pass

## Code Audit

No high or medium issue remains in the patched diff.

One issue was found during audit and fixed before commit: the first version
bounded `cwd`, but still accepted user-controlled `cwd`. That could make
allowlisted bare command execution depend on platform-specific path resolution
rules. The final patch rejects `cwd` entirely for this endpoint.

Residual low-risk note: audit entries currently record `actor_ip` as
`0.0.0.0` because the handler does not receive request connection metadata.
This is acceptable for the current gate because each attempt is still recorded
with method, path, status code, cross-machine flag, and bounded command note.
A future improvement can pass the peer address into the handler state.

## Clean Go/No-Go After Commit

`write-release-go-no-go.ps1 -Json` after commit `fe25c5d8` reports:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=false`
- `msix_install_verified=true`
- `runtime_idle_cpu_verified=false`
- `runtime_cpu_scenario_matrix_verified=false`
- `runtime_cpu_second_pc_route_attempt_verified=false`
- `rust_background_loop_contract_verified=true`
- `local_api_auth_contract_verified=true`
- `operator_api_security_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `frontend_polling_contract_verified=true`
- `p2p_store_forward_relay_contract_verified=true`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git.dirty=false`

Blockers:

- `single-machine`
- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `runtime-cpu-second-pc-route-attempt`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

The single-machine and runtime CPU drops are expected source-freshness
behavior. This commit changes native runtime source, so previous packaged
desktop evidence cannot be used for a current-source public release claim.

## Next Steps

1. Rebuild and reinstall the packaged desktop after `fe25c5d8`.
2. Refresh primary single-machine smoke evidence.
3. Refresh primary desktop-open idle CPU evidence.
4. Refresh primary runtime CPU scenario matrix evidence.
5. Re-record targeted second-PC post-route CPU attempt evidence.
6. Install the same current MUSU build on the second PC and import
   second-PC multi-device, idle CPU, and runtime matrix evidence.
7. Configure hosted MUSU.PRO P2P control-plane release storage/auth and
   record passing owner-scoped relay route/payload evidence.
8. Record support mailbox and Store/Partner Center evidence.

