# 2026-06-05 WebSocket proxy loop audit coverage

Commit `918ac7a6` extends the Rust background-loop release audit with explicit
`ws-proxy` checks for `musu-rs/src/bridge/handlers/ws_proxy.rs`.

What changed:

- `audit-rust-background-loop-contract.ps1` now verifies WebSocket proxy loops
  are bound to `ws.on_upgrade(...)`.
- It verifies both proxy directions await inbound websocket frames:
  `client_rx.next().await` and `upstream_rx.next().await`.
- It verifies both sides exit on send failure.
- It verifies `tokio::select!` closes the proxy when either direction ends.

Product/spec notes:

- No runtime behavior changed.
- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, rendezvous, path
  selection, relay fallback policy, and evidence control plane.
- `localhost:3001` remains optional developer/workspace UI, not the packaged
  local runtime.

Validation:

- PowerShell parser: pass.
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`,
  `ws-proxy` checks `6/6`.
- Frontend polling audit: `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`.
- `git diff --check`: pass.
- Clean go/no-go after `918ac7a6`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `runtime_cpu_second_pc_route_attempt_verified=true`,
  `rust_background_loop_contract_verified=true`,
  `idle_busy_loop_candidate_contract_verified=true`,
  `manifest_git_dirty=false`, `ready_for_public_desktop_release=false`.

Qualitative audit:

- No high or medium issue found in the verifier-only change.
- The reduced risk is future drift in request-scoped WebSocket proxy loops.
- Public release remains blocked on real second-PC multi-device/CPU/matrix
  evidence, hosted P2P release proof, support mailbox proof, and Store proof.

Canonical report:

- `docs/RELEASE_1_15_0_RC1_WS_PROXY_LOOP_AUDIT_COVERAGE_2026_06_05.md`
