# 2026-06-15 Bootstrap Identifier Validation Audit

- Found that `musu mesh bootstrap` validated `server_url` but not
  `tailnet_name` or `base_domain` before embedding them into generated YAML,
  shell, PowerShell, JSON, README, and report fields.
- Added `validate_private_mesh_tailnet_name(...)`:
  non-empty, max `63`, ASCII alphanumeric start/end, and only ASCII
  letters/digits/`-`/`_`/`.` inside.
- Added `validate_private_mesh_base_domain(...)`:
  DNS-like labels, no trailing dot, no empty labels, max `253` total and `63`
  per label, ASCII alphanumeric start/end, and only ASCII letters/digits/`-` in
  labels.
- Added targeted Rust test
  `bootstrap_rejects_script_unsafe_tailnet_and_base_domain_inputs`.
- Verification passed:
  `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check`,
  `git diff --check`,
  `$env:CARGO_INCREMENTAL='0'; cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs --tests -j 1`,
  and
  `$env:CARGO_INCREMENTAL='0'; cargo test --manifest-path musu-rs\Cargo.toml bootstrap_rejects_script_unsafe_tailnet_and_base_domain_inputs --lib -j 1`.
- Canonical report:
  `docs/RELEASE_1_15_0_RC1_BOOTSTRAP_IDENTIFIER_VALIDATION_AUDIT_2026_06_15.md`
