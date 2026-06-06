# 2026-06-07 Current-HEAD Target Route CPU Audit and Spec Refresh

Current HEAD `6cbeb3b34dad0c01c4a539f170435759095efc59` restored the targeted
second-PC route-attempt CPU gate on `HUGH_SECOND` after mDNS cancellation
hardening and the local desktop evidence refresh.

Evidence promoted:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-072059-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-072059-HUGH_SECOND.target-route.verification.json`

Route attempt:

- target `HUGH-MAIN`
- timeout to `http://192.168.1.192:8949/api/tasks/delegate`
- token `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_072059`
- `ok=false`
- `failure_allowed=true`
- normalized exit code `1`
- attempt count `1`

CPU result:

- five scenarios passed
- hot process count `0` in all scenarios
- MUSU CPU `0`
- Node CPU `0`
- max WebView2 one-core CPU `0.13`
- max working set `362.50MB`

Gate result:

- `ready_for_public_desktop_release=false`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_control_plane_env_ready=false`

Validation:

- `cargo fmt --check`
- `cargo check --lib`
- `cargo test --lib mdns` passed `3/3`
- Rust background-loop audit `ok=true`, `fail_count=0`, unaudited loops/spawns
  `0`
- release verifier regression `ok=true`, `case_count=104`,
  `failed_case_count=0`

Qualitative assessment: no high or medium issue found. This is current-HEAD
CPU diagnostic evidence only. It does not prove successful second-PC routing.
Public release remains blocked by real second-PC route/CPU/matrix evidence,
live MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof.

Product boundary updated in specs: MUSU Desktop is the local executor; MUSU.PRO
is remote input, project room, presence, rendezvous, path-selection, relay
fallback, and evidence/control plane. `localhost:3001` is not the packaged
desktop contract.
