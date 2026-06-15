# 2026-06-15 Root WSL Scratch Hygiene Audit

- Found untracked root WSL probe scripts:
  `.wsl_hs.sh`, `.wsl_net.sh`, `.wsl_ts.sh`, and `.wsl_join2.sh`.
- These scripts are local Headscale/Tailscale/WSL operator scratch, not product
  source. `.wsl_join2.sh` reads a local temp preauth key path, so the pattern
  should never appear as a commit candidate.
- Did not delete the files because they may be useful local scratch.
- Added `.wsl_*.sh` to `.gitignore` under the root temporary debug script
  section.
- Verification planned/recorded in the canonical report:
  `git check-ignore .wsl_hs.sh .wsl_net.sh .wsl_ts.sh .wsl_join2.sh`,
  `git diff --check`, and
  `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check`.
- Canonical report:
  `docs/RELEASE_1_15_0_RC1_ROOT_WSL_SCRATCH_HYGIENE_AUDIT_2026_06_15.md`
