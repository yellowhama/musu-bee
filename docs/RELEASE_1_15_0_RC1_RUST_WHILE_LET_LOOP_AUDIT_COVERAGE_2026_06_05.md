# MUSU 1.15.0-rc.1 Rust While-Let Loop Audit Coverage

Date: 2026-06-05 KST

Commit: `d1c3361b` (`Audit Rust while-let loop contracts`)

## Scope

This update strengthens source-side release verification for idle CPU and
background-loop safety. It does not change runtime behavior, relay transport
semantics, or the MUSU Desktop / MUSU.PRO product split.

The product boundary remains:

- MUSU Desktop is the local executor.
- MUSU.PRO is remote input, project/company room, rendezvous, path selection,
  relay fallback policy, and evidence control plane.
- Local MUSU programs do the work and prefer P2P mesh after web-assisted
  rendezvous.
- `localhost:3001` is optional developer/workspace UI, not the packaged local
  runtime.

## What Changed

`scripts/windows/audit-rust-background-loop-contract.ps1` now explicitly audits
the remaining Rust `while let` loop sites that were not represented by the
older `while true` / `loop {` source scanner.

The new contracts cover:

- finite audit failure-window deque pruning
- finite rate-limit window deque pruning
- workflow executor topological sort queue draining and cycle rejection
- workflow spec cycle detection and topological order queue draining
- request-scoped file API directory listing
- request-scoped forwarded-task multipart parsing
- request-scoped WebDAV PROPFIND directory listing
- WebRTC NAL splitter finite-buffer draining

The generic Rust loop scanner now also rejects new `while let` loop files unless
they are explicitly allowlisted and audited. This reduces the chance that a new
idle-loop candidate enters release source without a named contract.

## Validation

PowerShell parser:

- `audit-rust-background-loop-contract.ps1`: `parser ok`

Rust background-loop audit:

- `ok=true`
- `fail_count=0`
- `unaudited_loop_hit_count=0`
- `telemetry_flush_primitive_hit_count=0`
- `check_count=152`

Selected audited scopes:

- `audit-failure-window`: `2/2`
- `rate-limit-window`: `2/2`
- `workflow-executor`: `6/6`
- `workflow-spec`: `3/3`
- `files-api`: `2/2`
- `forward-multipart`: `2/2`
- `webdav-propfind`: `2/2`
- `webrtc-screen-share`: `8/8`
- `ws-proxy`: `6/6`

Frontend polling audit:

- `ok=true`
- `fail_count=0`
- `low_duty_polling_call_site_count=29`
- `direct_interval_hit_count=0`
- `direct_visibility_listener_hit_count=0`

Diff hygiene:

- `git diff --check`: passed

Clean go/no-go after `d1c3361b`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_idle_cpu_verified=false`
- `runtime_cpu_scenario_matrix_verified=false`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `frontend_polling_contract_verified=true`
- `p2p_store_forward_relay_contract_verified=true`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `manifest_git_dirty=false`

Remaining blockers:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

## Qualitative Audit

No high or medium issue was found in this verifier-only change. The concrete
risk reduced is release-audit blind spots around finite/request-scoped Rust
`while let` loops. New `while let` files now need explicit review before the
Rust background-loop contract passes.

One-machine local desktop evidence remains strong. Public desktop release is
still No-Go until the second Windows machine evidence, hosted P2P release
proof, support mailbox proof, and Store proof are complete.

## Indexing

Post-documentation MUSU local indexing was run after wiki/746 and GOAL v568:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `indexed 2409 files (2690 symbols) in 8270 ms`

gbrain was not rerun for this small documentation refresh because the previous
run in the same session already identified the active blocker:
`ZEROENTROPY_API_KEY` is missing and `brain-sync` exits undefined. Keep GBrain
Search Guidance out of `AGENTS.md` until semantic/symbol search is verified on
this Windows machine.

## Next Steps

1. Install the same current MUSU build on a second Windows PC.
2. Capture real second-PC multi-device evidence.
3. Capture second-PC 60-second idle CPU evidence and the runtime CPU scenario
   matrix.
4. Complete hosted MUSU.PRO release-grade P2P proof: owner-scoped KV, route
   proof, relay transport proof, relay payload proof, and delivery proof.
5. Complete support mailbox and Microsoft Store/Partner Center evidence.
