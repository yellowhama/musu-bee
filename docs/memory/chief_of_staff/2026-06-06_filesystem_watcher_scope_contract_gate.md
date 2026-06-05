# 2026-06-06 filesystem watcher scope contract gate

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, rendezvous, path-selection, relay-fallback policy, and
evidence control plane.

This session strengthened the Rust background-loop release audit so default
desktop/runtime code cannot silently grow hidden filesystem watchers.

Changed source:

- `scripts/windows/audit-rust-background-loop-contract.ps1`
  - filesystem watcher primitives are allowed only in
    `musu-rs/src/indexer/watch.rs` and `musu-rs/src/install/sync.rs`
  - `musu indexer watch` must stay command-scoped
  - the default bridge/runtime path must not call the indexer watcher
  - file-sync watcher starts are allowed only from configured bridge sync or
    explicit `musu sync`
  - emits `filesystem_watcher_primitive_hit_count` and
    `file_sync_watcher_start_hit_count`
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - added source-contract case
    `rust background audit limits filesystem watcher scope`
- `scripts/windows/verify-final-operator-gate-packet.ps1`
  - final packet verifier now checks for the stronger watcher-scope audit

Validation:

- PowerShell parser: pass
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `filesystem_watcher_primitive_hit_count=0`,
  `file_sync_watcher_start_hit_count=0`
- release evidence verifier: `ok=true`, `case_count=47`,
  `failed_case_count=0`
- `git diff --check`: pass
- dirty go/no-go with public metadata skipped:
  `single_machine_verified=true`, `msix_install_verified=true`,
  `runtime_idle_cpu_valid_machine_count=1/2`,
  `runtime_cpu_scenario_matrix_valid_machine_count=1/2`,
  `runtime_cpu_second_pc_route_attempt_verified=true`,
  `rust_background_loop_contract_verified=true`,
  `p2p_control_plane_verified=false`

Code audit: no high/medium runtime issue found. Audit-layer gap closed: watcher
primitive location and command scope are now source-gated instead of only
covered indirectly by named loop checks.

Docs:

- GOAL v596
- wiki/771
- `RELEASE_1_15_0_RC1_FILESYSTEM_WATCHER_SCOPE_CONTRACT_GATE_2026_06_06.md`
- BETA checklist
- network boundary spec

Public release remains No-Go on real second-PC route/CPU/matrix evidence,
hosted owner-scoped MUSU.PRO P2P/relay proof, support mailbox proof, and Store
proof.
