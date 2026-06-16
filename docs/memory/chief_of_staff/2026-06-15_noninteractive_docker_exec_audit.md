# 2026-06-15 Non-Interactive Docker Exec Audit

- Found that Add PC was hidden and bounded but still generated or used
  interactive Docker Compose exec shapes in the Headscale helper path.
- Fixed `run_start_control_host()` health probe from
  `docker compose exec headscale ...` to `docker compose exec -T headscale ...`.
- Fixed generated `scripts/create-join-key.ps1` and
  `scripts/create-join-key.sh` so health, user lookup, user creation, and
  preauth-key creation all use `docker compose exec -T`.
- Updated generated manual fallback/error text and README command list to use
  the same `-T` non-interactive shape.
- Added generated-bundle assertions requiring `exec -T` and rejecting the old
  interactive `docker compose exec headscale headscale` string.
- Verification passed:
  `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check`,
  `git diff --check`,
  `$env:CARGO_INCREMENTAL='0'; cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs -j 1`,
  and
  `$env:CARGO_INCREMENTAL='0'; cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs --tests -j 1`.
- Direct Rust test execution for
  `bootstrap_bundle_writes_headscale_control_plane_files` was stopped after the
  Windows/MSVC test binary build ran more than 15 minutes without output; the
  updated test assertions were still compiled by `cargo check --tests`.
- Canonical report:
  `docs/RELEASE_1_15_0_RC1_NONINTERACTIVE_DOCKER_EXEC_AUDIT_2026_06_15.md`
