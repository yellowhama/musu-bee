# 2026-06-03 Startup Helper Source Primary Evidence Refresh

Decision:

- `musu-rs\src\bin\musu-startup.rs` must be tracked so clean MSIX release
  builds can reproduce the packaged startup helper.
- The root `.gitignore` `bin/` rule now explicitly unignores
  `musu-rs\src\bin\` and `musu-rs\src\bin\*.rs`.

Validation:

- `cargo check --bin musu-startup -j 1` passed.
- A clean detached worktree at `79368c53` built and installed the
  local-sideload MSIX.
- Single-machine evidence passed:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-160842-HUGH_SECOND.evidence.json`
- Desktop-open CPU passed:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-161155-HUGH_SECOND.desktop-open.evidence.json`
- Five-state runtime CPU matrix passed:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-161836-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key numbers:

- smoke output: `MUSU_RELEASE_SMOKE_OK_20260603_160819`
- desktop-open CPU: MUSU `0.03`, Node `0`, WebView2 `0.21`, hot `0`
- matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_161836`
- dirty-tree go/no-go: `local_artifacts_ready=true`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`

Release interpretation:

- Primary-machine packaged evidence is current for commit `79368c53`.
- Public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted relay payload proof, support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_STARTUP_HELPER_SOURCE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`
