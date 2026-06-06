# Release 1.15.0-rc.1 Current-HEAD Target Route CPU Audit and Spec Refresh

Generated: 2026-06-07T07:33:44+09:00

## Summary

Current HEAD `6cbeb3b34dad0c01c4a539f170435759095efc59` now has fresh
targeted `HUGH-MAIN` route-attempt CPU evidence after mDNS cancellation
hardening and the packaged local desktop evidence refresh.

This restores the targeted second-PC route-attempt CPU gate on `HUGH_SECOND`:

- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `ready_for_public_desktop_release=false`

The route target remained unreachable at `192.168.1.192:8949`, so this is not
successful two-machine route proof. It is only CPU/resource evidence for a
failed but explicit non-local target route attempt.

## Evidence

Promoted evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-072059-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- target-route verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-072059-HUGH_SECOND.target-route.verification.json`

Route probe:

- target: `HUGH-MAIN`
- command:
  `musu route --target HUGH-MAIN --wait-timeout-sec 180 --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260607_072059"`
- token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_072059`
- result: `ok=false`, `failure_allowed=true`
- normalized exit code: `1`
- raw exit code: `0`
- attempt count: `1`
- failure: timeout to `http://192.168.1.192:8949/api/tasks/delegate`

Five-state matrix result:

| Scenario | OK | Hot processes | MUSU CPU | Node CPU | WebView2 CPU | Working set | WebView2 helpers |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| startup-open | true | 0 | 0 | 0 | 0.05 | 362.38MB | 6 |
| runtime-started | true | 0 | 0 | 0 | 0.08 | 362.31MB | 6 |
| dashboard-open | true | 0 | 0 | 0 | 0.13 | 362.36MB | 6 |
| desktop-open | true | 0 | 0 | 0 | 0.03 | 362.37MB | 6 |
| post-route | true | 0 | 0 | 0 | 0.10 | 362.50MB | 6 |

Target-route verifier:

- `ok=true`
- `fail_count=0`
- expected target: `HUGH-MAIN`
- failed post-route probe allowed: true
- self-target route attempts rejected by verifier
- local/localhost target route attempts rejected by verifier

Clean go/no-go after promotion:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_control_plane_env_ready=false`

## Code Audit

Validation run on current HEAD:

- `cargo fmt --check`
- `cargo check --lib`
- `cargo test --lib mdns`
  - `3` passed
  - `335` filtered
- Rust background-loop audit
  - `ok=true`
  - `fail_count=0`
  - `unaudited_loop_hit_count=0`
  - `unaudited_spawn_hit_count=0`
- release evidence verifier regression
  - `ok=true`
  - `case_count=104`
  - `failed_case_count=0`

Qualitative audit:

- No high or medium issue found in the current change set or release evidence
  gate behavior.
- Low residual risk: the route probe still times out because `HUGH-MAIN` is not
  reachable from this machine at `192.168.1.192:8949`.
- Low residual risk: this Codex shell still has PATH shadowing for `musu.exe`;
  release commands used the explicit packaged WindowsApps alias.
- Low residual risk: release builds still emit dead-code warnings for source
  contract relay tunnel hooks and the legacy mDNS wrapper. They are intentional
  source contracts for future runtime work, not runtime activation.

## Product Spec Update

The product boundary remains:

- MUSU Desktop is the local executor. It owns local files, local processes,
  local browser/app automation, local bridge runtime, CPU budget, and P2P
  participation.
- MUSU.PRO is the remote input and coordination plane. It receives user work
  orders, hosts project/company rooms, tracks presence, coordinates rendezvous
  and path selection, issues relay fallback only after direct paths fail, and
  records release evidence.
- MUSU.PRO must not become the default execution server or default payload data
  path.
- A local dashboard at `127.0.0.1` or `localhost:3001` is not the packaged
  desktop contract. It is only a local diagnostic/developer surface.
- Cross-device discovery may use MUSU.PRO as the initial web-assisted broker,
  then devices should switch to direct P2P mesh when a direct path is available.
- Project rooms are coordination rooms for local AI agents attached to the same
  project. The room can hold orders, decisions, presence, discussion, and
  audit history, but the actual work remains on the local devices.

## Release Meaning

This closes the current-HEAD targeted failed-route CPU diagnostic gap. It does
not close:

- real second-PC route success proof
- second-PC desktop-open idle CPU evidence
- second-PC five-state runtime CPU matrix evidence
- live MUSU.PRO P2P env readiness
- release `quic_relay_tunnel` runtime and payload endpoint
- release relay route transport proof and payload delivery proof
- support mailbox evidence
- Microsoft Store evidence

Public release remains No-Go, and that is the correct gate state.
