# RELEASE 1.15.0-rc.1 Add PC Backend Timeout Audit

**Wiki ID**: wiki/1164

Date: 2026-06-15 KST

Scope:

- `musu-rs/src/install/private_mesh.rs`
- `musu-bee/src-tauri/src/lib.rs`
- `musu-bee/src-tauri-shell/cockpit-contract.test.ts`
- Add PC `Generate bundle`, `Start control host`, and `Issue pass` backend execution boundaries

## Verdict

The Add PC product path is now materially stronger. The UI wiring was already
proven in the previous Add PC audits, but the backend still had an execution
boundary weakness: the desktop wrapper had a timeout, while the CLI internals
could wait indefinitely on generated helper scripts or Docker Compose. That is
not S-grade UX because a stuck Docker/Headscale/helper path can leave the user
with a spinner or an unclear failure instead of a bounded, retryable error.

This pass closes that class for the Add PC backend path. The generated
create-join-key helper is now bounded, Docker Compose config/up/health steps are
bounded, and the Tauri desktop wrapper uses named Add PC-specific outer
timeouts instead of generic doctor/startup durations.

## Product Spec Update

Add PC backend contract:

1. `Generate bundle` must validate input before native IPC and must run under a
   named desktop timeout.
2. `Issue pass` must not wait forever on the generated helper. The CLI helper
   timeout is `45s`; the desktop parent timeout is `60s`.
3. `Start control host` must not wait forever on Docker Compose. The CLI bounds
   `config` at `15s`, `up -d` at `90s`, and each health probe at `8s`; the
   desktop parent timeout is `180s`.
4. Windows child helper processes must use `CREATE_NO_WINDOW` and
   non-interactive PowerShell flags so Add PC does not reintroduce terminal
   flicker.
5. Timeout failures should return a user-readable stage/error that points to
   Docker/Headscale retry, not a silent permanent spinner.

## Code Audit Findings

### Fixed: CLI helper could wait indefinitely

Evidence before fix:

- `run_create_join_key()` used `tokio::process::Command::output()` directly.
- The generated helper ultimately talks to Docker/Headscale, which can hang or
  stall if Docker is unavailable, slow, or prompting.

Change:

- Added `CREATE_JOIN_KEY_HELPER_TIMEOUT = 45s`.
- Wrapped helper execution in `tokio::time::timeout(...)`.
- Added `kill_on_drop(true)` so timed-out children are not intentionally kept
  alive by the Rust process.
- The timeout error now says:
  `create-join-key helper timed out after 45 seconds. Check Docker/Headscale, then retry from Add PC.`

### Fixed: Docker Compose start-control steps could wait indefinitely

Evidence before fix:

- `run_start_control_host()` used a nested `compose_step()` helper that called
  `docker compose ... output()` directly.
- The outer Tauri wrapper could time out first, but the CLI path itself had no
  direct bound and direct CLI users had no deadline.

Change:

- Added `START_CONTROL_CONFIG_TIMEOUT = 15s`.
- Added `START_CONTROL_UP_TIMEOUT = 90s`.
- Added `START_CONTROL_HEALTH_TIMEOUT = 8s`.
- `compose_step()` now wraps each Docker command in
  `tokio::time::timeout(...)`, uses `kill_on_drop(true)`, and distinguishes:
  success output, process spawn error, and timeout.

### Fixed: desktop Add PC timeouts were generic and too small for cold starts

Evidence before fix:

- `private_mesh_bootstrap()` reused `DOCTOR_STATUS_TIMEOUT`.
- `private_mesh_create_join_key()` reused `PRIVATE_MESH_DOCTOR_TIMEOUT`.
- `private_mesh_start_control_host()` used an inline `60s` timeout even though
  Docker image pulls plus health retries can exceed a minute.

Change:

- Added `ADD_PC_BOOTSTRAP_TIMEOUT = 25s`.
- Added `ADD_PC_CREATE_JOIN_KEY_TIMEOUT = 60s`.
- Added `ADD_PC_START_CONTROL_HOST_TIMEOUT = 180s`.
- Contract tests now require those named constants and require each Add PC Tauri
  command to use the correct constant.

## Verification

Passed:

- `npm run test:tauri-shell`
  - `43 passed`
  - includes new contract test:
    `Add PC native commands use named outer timeouts aligned to bounded CLI work`
- `cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs`
  - passed
- `cargo test --manifest-path musu-rs\Cargo.toml add_pc_backend_process_timeouts_are_bounded --lib -j 1`
  - `1 passed`
- `git diff --check`
  - passed

Rust unit test status:

- Added `add_pc_backend_process_timeouts_are_bounded`.
- First `cargo test --manifest-path musu-rs\Cargo.toml private_mesh --lib -j 1`
  attempt was interrupted by Windows/MSVC `rustc` process failure
  `STATUS_IN_PAGE_ERROR (0xc0000006)`. This is an environment/toolchain I/O
  failure, not a source diagnostic.
- A narrower retry for
  `add_pc_backend_process_timeouts_are_bounded` completed successfully after a
  long test-binary compile.

## Qualitative Assessment

Grade after this slice: **A- for backend resilience of Add PC, not yet S-grade
for full product proof**.

Why it improved:

- The Add PC path now has explicit, named, documented execution deadlines.
- Failure should return a bounded error instead of leaving a Cockpit action in
  an ambiguous waiting state.
- The frontend, Tauri wrapper, and CLI helper now agree on a layered timeout
  model instead of relying on one generic parent timeout.

Why it is not S-grade yet:

- The physical two-machine Headscale path still needs to be proven on genuinely
  separate hardware and network conditions.
- The product still needs a guided secure pass-transfer/cleanup wizard instead
  of only showing a secret-bearing local file path.
- Windows MSVC Rust test binary compilation showed one environment-level
  `STATUS_IN_PAGE_ERROR` on the broad first attempt. The targeted retry passed,
  but release validation should still prefer a clean full-suite rerun or WSL/GNU
  confirmation before claiming broad test-suite certainty.

## Next Step Plan

1. Run the installed desktop build and click:
   `Generate bundle -> Start control host -> Issue pass`.
2. Confirm no terminal window appears during helper/Docker operations.
3. Simulate Docker unavailable and Docker slow-start cases; confirm Add PC
   returns bounded, useful errors.
4. Use the generated pass on a second physical PC.
5. Run target-bound `musu mesh verify`, delegated Cockpit order, callback
   reconciliation, and release proof with physical peer evidence.

Search terms should include `wiki/1164`, `ADD_PC_BOOTSTRAP_TIMEOUT`,
`ADD_PC_CREATE_JOIN_KEY_TIMEOUT`, `ADD_PC_START_CONTROL_HOST_TIMEOUT`,
`CREATE_JOIN_KEY_HELPER_TIMEOUT`, `START_CONTROL_UP_TIMEOUT`,
`add_pc_backend_process_timeouts_are_bounded`, `STATUS_IN_PAGE_ERROR`, and
`Add PC backend timeout audit`.
