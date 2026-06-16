# RELEASE 1.15.0-rc.1 Non-Interactive Docker Exec Audit

**Wiki ID**: wiki/1168

Date: 2026-06-15 KST

Scope:

- `musu-rs/src/install/private_mesh.rs`
- generated `scripts/create-join-key.ps1`
- generated `scripts/create-join-key.sh`
- `musu mesh start-control-host --json`
- Add PC control-host health and device-add pass issuance paths

## Verdict

The Add PC control-plane path had one more desktop reliability mismatch: it was
now hidden and bounded, but parts of the Docker/Headscale execution still used
`docker compose exec` without `-T`. That is acceptable in an interactive
terminal, but it is the wrong contract for a GUI button or a non-interactive
helper process because Compose can try to allocate or expect a TTY.

This pass makes the generated Headscale commands non-interactive by default.
The health probe, PowerShell helper, shell helper, README command list, and
tests now use or require `docker compose exec -T`.

## Product Spec Update

Add PC control-plane command contract:

1. Desktop-triggered Docker Compose `exec` calls must be non-interactive.
2. Generated helper scripts must not require an operator TTY.
3. The normal Cockpit path must not flash a terminal, block on TTY behavior, or
   ask the user to rerun a raw interactive Compose command.
4. Manual fallback instructions should show the same `exec -T` shape so copied
   commands behave like the GUI path.

## Code Audit Findings

### Fixed: start-control-host health probe used interactive Compose exec shape

Evidence before fix:

- `run_start_control_host()` health probe used:
  `["exec", "headscale", "headscale", "health"]`.

Risk:

- In a GUI/non-interactive parent process, Compose can fail with TTY-related
  behavior instead of returning a clean Headscale health result.

Change:

- Health probe now uses:
  `["exec", "-T", "headscale", "headscale", "health"]`.

### Fixed: generated join-key helpers used interactive Compose exec shape

Evidence before fix:

- The PowerShell helper generated:
  `docker compose exec headscale headscale ...`.
- The shell helper generated:
  `docker compose exec headscale headscale ...`.
- Error messages and manual fallback hints repeated the same interactive form.

Change:

- PowerShell helper now invokes:
  `docker compose exec -T headscale headscale ...`.
- Shell helper now invokes:
  `docker compose exec -T headscale headscale ...`.
- Manual fallback messages and README command list now use the same `-T`
  non-interactive shape.

## Verification

Passed:

- `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check`
- `git diff --check`
- `$env:CARGO_INCREMENTAL='0'; cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs -j 1`
  - `3m 42s`
- `$env:CARGO_INCREMENTAL='0'; cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs --tests -j 1`
  - `3m 16s`

Test execution note:

- `cargo test --manifest-path musu-rs\Cargo.toml bootstrap_bundle_writes_headscale_control_plane_files --lib -j 1`
  was started to execute the generated-bundle test, but the Windows/MSVC test
  binary build ran for more than 15 minutes without output and had to be stopped
  to keep the audit moving.
- `cargo check --tests` still compiled the updated test assertions, so syntax
  and type checking for the new contract assertions passed. Runtime execution of
  that one Rust test remains a Windows toolchain throughput risk, not a source
  diagnostic.

## Qualitative Assessment

This moves Add PC closer to S-grade desktop behavior. The previous work made the
path hidden and bounded; this pass makes the Headscale/Docker calls match the
same non-interactive product posture. A GUI button should behave like a product
action, not like an embedded terminal session.

Remaining risk:

- Physical two-PC proof is still required. This change proves the generated
  command contract and compile surface, not real Docker/Headscale execution on
  separate hardware.
- Windows/MSVC test execution remains slow/unreliable in this workspace. Use
  `CARGO_INCREMENTAL=0 -j 1` checks for source validation and prefer WSL/GNU or
  a clean machine for full Rust test execution evidence.

Search terms should include `wiki/1168`, `docker compose exec -T`,
`non-interactive Docker exec`, `create-join-key.ps1`,
`create-join-key.sh`, `START_CONTROL_HEALTH_TIMEOUT`, `cargo check --tests`,
and `bootstrap_bundle_writes_headscale_control_plane_files`.
