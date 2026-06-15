# RELEASE 1.15.0-rc.1 Bootstrap Identifier Validation Audit

**Wiki ID**: wiki/1172

Date: 2026-06-15 KST

Scope:

- `musu-rs/src/install/private_mesh.rs`
- `musu mesh bootstrap`
- generated Headscale config
- generated `create-join-key.ps1`
- generated `create-join-key.sh`

## Verdict

The Private Mesh bootstrap path had a trust-boundary gap: `server_url` was
normalized, but `tailnet_name` and `base_domain` were accepted directly from CLI
options and then embedded into generated YAML, shell, PowerShell, and JSON
templates.

The default values were safe, but a CLI/operator override could introduce
whitespace, quotes, newlines, path-like characters, or DNS-invalid labels. That
is below release quality for a generated control-plane bundle. A productized
Add PC flow should reject unsafe identifiers before writing scripts.

This pass adds explicit validation for the two bootstrap identifiers before any
bundle files are generated.

## Product Spec Update

Private Mesh bootstrap input contract:

1. `--tailnet-name` must be a short ASCII identifier suitable for Headscale user
   naming and generated helper scripts.
2. `--base-domain` must be a DNS-like name suitable for Headscale MagicDNS config.
3. Unsafe characters must fail before writing `docker-compose.yaml`,
   `config/config.yaml`, helper scripts, README, or pass helpers.
4. Generated scripts must not rely on shell/PowerShell escaping to make arbitrary
   identifier input safe.

## Code Audit Findings

### Fixed: tailnet_name accepted script-unsafe input

Evidence before fix:

- `write_bootstrap_bundle()` validated `server_url` but passed
  `opts.tailnet_name` directly into:
  - generated PowerShell param defaults
  - generated shell defaults
  - generated pass file paths
  - generated Headscale user commands
  - generated report fields

Change:

- Added `validate_private_mesh_tailnet_name(...)`.
- Allowed characters: ASCII letters, digits, `-`, `_`, and `.`.
- The identifier must be non-empty, at most `63` characters, and start/end with
  an ASCII letter or digit.

### Fixed: base_domain accepted DNS/config-unsafe input

Evidence before fix:

- `opts.base_domain` was embedded into generated Headscale YAML without
  validating DNS label shape.

Change:

- Added `validate_private_mesh_base_domain(...)`.
- Rejects empty labels, trailing dot, labels longer than `63`, overall values
  longer than `253`, non-ASCII/non-DNS characters, and labels that do not start
  and end with an ASCII letter or digit.

## Verification

Passed:

- `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check`
- `git diff --check`
- `$env:CARGO_INCREMENTAL='0'; cargo check --manifest-path musu-rs\Cargo.toml -p musu-rs --tests -j 1`
  - `3m 12s`
- `$env:CARGO_INCREMENTAL='0'; cargo test --manifest-path musu-rs\Cargo.toml bootstrap_rejects_script_unsafe_tailnet_and_base_domain_inputs --lib -j 1`
  - `1 passed`
  - test binary build took `6m 39s` on Windows/MSVC

## Qualitative Assessment

This is a small but important hardening pass. It prevents the generated
Headscale control-plane bundle from becoming a script/config injection surface
through operator-supplied identifiers. It also keeps Add PC closer to a product
wizard posture: invalid names are rejected as input errors, not discovered later
as broken generated files.

Remaining risk:

- The bootstrap flow still needs physical two-machine execution proof. This
  change proves identifier validation and generated-source safety, not live
  Headscale enrollment on separate hardware.

Search terms should include `wiki/1172`,
`validate_private_mesh_tailnet_name`, `validate_private_mesh_base_domain`,
`bootstrap_rejects_script_unsafe_tailnet_and_base_domain_inputs`,
`--tailnet-name`, `--base-domain`, and `generated helper scripts`.
