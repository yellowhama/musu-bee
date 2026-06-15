# RELEASE 1.15.0-rc.1 Root WSL Scratch Hygiene Audit

**Wiki ID**: wiki/1170

Date: 2026-06-15 KST

Scope:

- repo-root untracked `.wsl_*.sh` scripts
- `.gitignore`
- Private Mesh / Headscale / Tailscale local probe hygiene

## Verdict

The repo root contained untracked WSL probe scripts used for Headscale/Tailscale
manual experiments:

- `.wsl_hs.sh`
- `.wsl_net.sh`
- `.wsl_ts.sh`
- `.wsl_join2.sh`

These are operator scratch files, not product source and not durable release
evidence. One script reads a local temp preauth-key path from the operator
machine. It did not expose the key in the repository output inspected here, but
the file pattern is still unsafe to leave as a visible untracked commit
candidate.

This pass does not delete the files because they may be useful local scratch.
Instead, it codifies the boundary: root `.wsl_*.sh` scripts are ignored like the
existing root `tmp_*.ts`, `check_*.py`, and other debug helpers.

## Product/Repo Hygiene Contract

1. WSL/Headscale/Tailscale local probe scripts are operator scratch, not product
   code.
2. Scratch scripts that can read local auth material, preauth files, sockets, or
   machine-specific IPs must not appear as release/commit candidates.
3. Durable evidence belongs under named docs/evidence or report files, not as
   ad-hoc root scripts.
4. The Windows checkout remains the source of truth; WSL scripts are test
   helpers unless promoted intentionally into `scripts/` with docs and tests.

## Change

Added `.wsl_*.sh` to `.gitignore` under the existing root temporary debug script
section.

This keeps local WSL probe helpers out of:

- `git status --short`
- release blocker diffs
- accidental review/commit scope
- MUSU wiki/index source evidence claims

## Verification

Passed:

- `git check-ignore .wsl_hs.sh .wsl_net.sh .wsl_ts.sh .wsl_join2.sh`
  - all four are ignored by `.gitignore`
- `git diff --check`
- `cargo fmt --manifest-path musu-rs\Cargo.toml -- --check`

## Qualitative Assessment

This is a repo hygiene fix, not a user-visible feature. It improves release
discipline by keeping local mesh experiments from looking like product source.
That matters for the broader adversarial audit because a dirty root with
preauth/Tailscale probe scripts can hide real release blockers and can mislead a
future reviewer into treating local scratch as intended architecture.

Search terms should include `wiki/1170`, `.wsl_*.sh`, `.wsl_join2.sh`,
`preauth_key.txt`, `root WSL scratch hygiene`, `git check-ignore`, and
`operator scratch`.
