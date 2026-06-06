# 2026-06-07 Runtime CPU Matrix OutputRoot Hygiene Gate

## Decision

Runtime CPU matrix capture must not write directly into tracked repo evidence
paths. It now rejects in-repo OutputRoot paths unless `git check-ignore`
confirms they are ignored.

## Change

- `measure-musu-runtime-cpu-scenarios.ps1` detects whether OutputRoot is inside
  the repo and git-ignored.
- Unsafe tracked OutputRoot paths throw before sampling.
- Matrix JSON now records `output_root`, `output_root_within_repo`, and
  `output_root_git_ignored`.
- `test-release-evidence-verifiers.ps1` adds regression
  `runtime CPU matrix rejects tracked in-repo output roots`.

## Evidence

- unsafe `docs/evidence/.../unsafe-output-root-smoke` OutputRoot failed before
  sampling
- default `.local-build` smoke succeeded and recorded
  `output_root_git_ignored=true`
- parser check passed
- release verifier regression passed with `case_count=95`,
  `failed_case_count=0`

## Audit Result

No high/medium issue was found. This hardens evidence hygiene only. Public
release still needs second-PC route/CPU/matrix, hosted MUSU.PRO P2P/relay,
support mailbox, and Store proof.
