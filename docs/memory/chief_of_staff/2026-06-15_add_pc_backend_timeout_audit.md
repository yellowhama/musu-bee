# 2026-06-15 Add PC Backend Timeout Audit

- Found that Add PC UI wiring was proven, but backend process deadlines were not
  fully layered: `run_create_join_key()` and `run_start_control_host()` used
  unbounded `tokio::process::Command::output()` calls internally.
- Fixed CLI internals with bounded helper/Docker timeouts:
  `CREATE_JOIN_KEY_HELPER_TIMEOUT = 45s`,
  `START_CONTROL_CONFIG_TIMEOUT = 15s`,
  `START_CONTROL_UP_TIMEOUT = 90s`, and
  `START_CONTROL_HEALTH_TIMEOUT = 8s`.
- Fixed the nested Docker `compose_step()` result handling to distinguish
  `Ok(Ok(output))`, `Ok(Err(spawn_error))`, and `Err(timeout)`.
- Added Tauri Add PC-specific outer timeouts:
  `ADD_PC_BOOTSTRAP_TIMEOUT = 25s`,
  `ADD_PC_CREATE_JOIN_KEY_TIMEOUT = 60s`, and
  `ADD_PC_START_CONTROL_HOST_TIMEOUT = 180s`.
- Added contract coverage requiring the named Tauri timeouts and Rust unit
  coverage for the CLI timeout constants.
- Verification: `npm run test:tauri-shell` passed `43/43`,
  `cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs` passed,
  targeted
  `cargo test --manifest-path musu-rs\Cargo.toml add_pc_backend_process_timeouts_are_bounded --lib -j 1`
  passed `1/1`, and `git diff --check` passed.
- Rust unit test compile hit Windows/MSVC `STATUS_IN_PAGE_ERROR (0xc0000006)` on
  the broad first attempt; narrow retry passed. Treat the first failure as an
  environment/toolchain issue unless a source diagnostic appears.
- Canonical report:
  `docs/RELEASE_1_15_0_RC1_ADD_PC_BACKEND_TIMEOUT_AUDIT_2026_06_15.md`
