# 2026-06-07 - Release Relay Tunnel Submit Metadata Clean Go/No-Go

Clean go/no-go after the release relay tunnel submit metadata code change
correctly requires fresh packaged local evidence.

Summary:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=false`
- `runtime_idle_cpu_valid_machine_count=0`
- `runtime_cpu_scenario_matrix_valid_machine_count=0`
- `runtime_cpu_second_pc_route_attempt_verified=false`
- `p2p_control_plane_env_ready=false`
- `multi_device_verified=false`
- `manifest_git.dirty=false`

Reason: Rust runtime source changed in `musu-rs/src/bridge/rendezvous.rs` after
the latest packaged local evidence. The freshness gate is behaving
conservatively.

Next local evidence step: rebuild/reinstall current HEAD and refresh
single-machine, process ownership, startup/desktop single-instance,
desktop-open idle CPU, five-state runtime matrix, and targeted second-PC
route-attempt CPU evidence.
