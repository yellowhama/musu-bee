# Release 1.15.0-rc.1 Rust Spawn Contract Audit Coverage

Date: 2026-06-05 KST

## Summary

The Rust background-loop release verifier now audits Rust background execution
entry points, not only explicit loop syntax.

`scripts\windows\audit-rust-background-loop-contract.ps1` now checks current
`tokio::spawn`, `tokio::task::spawn_blocking`, `std::thread::spawn`, and
`thread::spawn` sites and fails future spawn use in new Rust files unless the
file is explicitly allowlisted and contract-audited.

This is verifier/source-contract hardening only. It does not change runtime
behavior, packaging, or the product boundary: MUSU Desktop remains the local
executor, while MUSU.PRO remains remote input, project/company room,
rendezvous, path-selection, relay-fallback policy, and evidence control plane.

## New Audited Contracts

The audit now covers these spawn/background-task categories:

- planner and cloud heartbeat Ctrl-C watcher tasks are paired with explicit
  cancellation tokens
- planner and cloud heartbeat loops remain gated, low-duty, and
  cancellation-aware
- file sync loop is spawned only when file serve roots are configured
- control MCP Ctrl-C watcher only cancels the rmcp service token, and the
  service is run with `serve_with_ct`
- default `MusuCloud` client keeps a 10s timeout for fire-and-forget cloud
  submissions unless a narrower timeout wrapper is used
- clipboard monitor is the known opt-in blocking poller and still sleeps for 2s
  between reads
- relay payload poller spawn targets the cancellation-aware low-duty poller
- mDNS blocking receive is wrapped by the browse deadline and by a 1s
  `recv_timeout`
- indexer scan uses `spawn_blocking` but awaits the scan result, and empty or
  missing workspaces return immediately
- PTY websocket writes use request-scoped `spawn_blocking` without polling
  loops
- WebRTC data-channel pong is a one-shot spawn, RTCP reads are request-scoped,
  and ffmpeg capture is tied to the explicit screen-share request
- writer task spawns are immediately registered for cancellation/reconciliation,
  and registry guards remove task handles on exit
- writer callbacks have bounded retry count, 10s per-request timeout, and
  retry sleep
- Semantic SSOT `musu-crawl` indexing thread is one-shot after markdown write
- Claude stdin writer writes once, shuts stdin down, and exits
- company post-create index sync, node health checks, workflow execution,
  route-evidence submit, and rendezvous publish/close tasks are one-shot,
  bounded, awaited, timeout-wrapped, or no-token skipped as appropriate

The generic scanner now emits:

- `unaudited_spawn_hit_count`
- `unaudited_spawn_hits`
- source check `new rust spawns must be audited`

## Validation

Validation after commit `94a89614`:

- PowerShell parser: pass
- Rust background-loop audit:
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
  - `unaudited_spawn_hit_count=0`
  - `telemetry_flush_primitive_hit_count=0`
  - `check_count=200`
- frontend polling audit:
  - `ok=true`
  - `fail_count=0`
  - `low_duty_polling_call_site_count=29`
  - direct interval hits `0`
- `git diff --check`: pass
- clean go/no-go after commit:
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `msix_install_verified=true`
  - `runtime_cpu_second_pc_route_attempt_verified=true`
  - `rust_background_loop_contract_verified=true`
  - `idle_busy_loop_candidate_contract_verified=true`
  - `frontend_polling_contract_verified=true`
  - `p2p_store_forward_relay_contract_verified=true`
  - `manifest_git_dirty=false`
  - `ready_for_public_desktop_release=false`

Remaining release blockers are unchanged:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

## Qualitative Code Audit

No high or medium issue was found in this verifier-only change.

The change improves the source-side idle CPU defense because future Rust spawn
sites now need a named contract before the release audit can pass. The audit is
especially useful for MUSU Desktop because background work can be legitimate
local execution, but unbounded task creation or hidden polling would undermine
the local desktop idle CPU budget.

Residual risk:

- This is static/source-contract evidence, not runtime performance evidence.
  It does not replace two-machine idle CPU and runtime scenario matrix samples.
- One-shot fire-and-forget tasks are acceptable for idle CPU only when they do
  not contain polling loops and are timeout-bound or naturally request-scoped.
  Future changes should keep adding targeted checks rather than relying only on
  the file allowlist.
- The audit intentionally does not claim release-grade P2P relay/tunnel
  transport. Hosted `musu.pro` P2P control-plane evidence remains blocked until
  owner-scoped, release-grade relay/tunnel proof exists.

## Next Steps

1. Install the same current MUSU Desktop build on the second Windows PC and
   collect real second-PC multi-device evidence.
2. Collect second-PC `desktop-open` idle CPU and full runtime CPU scenario
   matrix evidence.
3. Configure and verify hosted MUSU.PRO P2P control-plane release gates:
   owner-scoped auth, release-grade relay lease storage, connect endpoint,
   payload endpoint, relay route evidence, and relay payload delivery proof.
4. Record support mailbox delivery evidence for `musu@musu.pro`.
5. Record Partner Center product reservation, Store submission, Microsoft
   certification, and restricted capability approval evidence.
6. Regenerate the final operator packet and action pack only after the release
   gates above are green.
