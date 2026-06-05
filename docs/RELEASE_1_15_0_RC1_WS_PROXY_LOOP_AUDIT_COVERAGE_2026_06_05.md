# MUSU 1.15.0-rc.1 WebSocket Proxy Loop Audit Coverage

Date: 2026-06-05 KST

Commit: `918ac7a6` (`Audit websocket proxy loop contract`)

## Scope

This update strengthens the release CPU/idleness audit only. It does not change
runtime behavior, relay transport semantics, or the MUSU Desktop / MUSU.PRO
product split.

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
`musu-rs/src/bridge/handlers/ws_proxy.rs`.

The new `ws-proxy` release contract verifies:

- WebSocket proxy loops are tied to explicit request upgrades.
- client-to-upstream waits on `client_rx.next().await`.
- upstream-to-client waits on `upstream_rx.next().await`.
- the client side exits when upstream send fails.
- the upstream side exits when client send fails.
- `tokio::select!` closes the proxy when either direction ends.

This closes a release-audit coverage gap where the code was request-scoped and
await-based, but the Rust background-loop audit did not name that contract.

## Validation

PowerShell parser:

- `audit-rust-background-loop-contract.ps1`: `parser ok`

Rust background-loop audit:

- `ok=true`
- `fail_count=0`
- `unaudited_loop_hit_count=0`
- `telemetry_flush_primitive_hit_count=0`
- `ws-proxy` checks: `6/6` passed

Frontend polling audit:

- `ok=true`
- `fail_count=0`
- `low_duty_polling_call_site_count=29`
- `direct_interval_hit_count=0`
- `direct_visibility_listener_hit_count=0`

Diff hygiene:

- `git diff --check`: passed

Clean go/no-go after `918ac7a6`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_idle_cpu_verified=false`
- `runtime_cpu_scenario_matrix_verified=false`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
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

No high or medium issue was found in this change. The code change is
release-verifier coverage only and does not add a runtime loop, network path,
or user-facing behavior. The concrete risk it reduces is silent drift in
request-scoped WebSocket proxy loops: future edits that remove the await-based
read behavior or close-on-failure behavior will now fail the Rust
background-loop contract.

The broader release posture is unchanged. One-machine local desktop evidence is
strong, and the idle-loop source contracts are stronger after this update.
Public desktop release is still No-Go until the second Windows machine,
hosted P2P release proof, support mailbox, and Store gates are complete.

## Indexing

Post-documentation indexing was run after wiki/745 and GOAL v566.

MUSU local indexer:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- result: `indexed 2407 files (2690 symbols) in 16395 ms`

gbrain:

- command:
  `bun run C:\Users\empty\.agents\skills\gstack\bin\gstack-gbrain-sync.ts`
- mode: `incremental`
- engine: `pglite`
- code stage: `OK`, source `gstack-code-musu-bee-8815b622`,
  `page_count=356`
- memory stage: `OK`, `0 imported`, `1 unchanged`, `0 failed`
- final state: `2 ok, 1 error`
- failing stage: `brain-sync`, `gstack-brain-sync exited undefined`
- notable blocker: ZeroEntropy embeddings require `ZEROENTROPY_API_KEY`; import
  also reported generated/evidence file failures and did not advance
  `sync.last_commit`

Do not add GBrain Search Guidance to `AGENTS.md` until semantic/symbol search
returns verified hits on this Windows machine.

## Next Steps

1. Install the same current MUSU build on a second Windows PC.
2. Capture real second-PC multi-device evidence.
3. Capture second-PC 60-second idle CPU evidence and the runtime CPU scenario
   matrix.
4. Complete hosted MUSU.PRO release-grade P2P proof: owner-scoped KV, route
   proof, relay transport proof, relay payload proof, and delivery proof.
5. Complete support mailbox and Microsoft Store/Partner Center evidence.
