# 2026-06-07 Single-Instance Freshness Gate

## Decision

Startup and desktop single-instance release evidence must be freshness-gated.
A passing `musu.startup_single_instance_audit.v1` or
`musu.desktop_single_instance_audit.v1` file is release-valid only if its
`git_commit` matches current HEAD, or if the delta to current HEAD is
documentation/evidence/status/tooling-only.

## Change

- `write-release-go-no-go.ps1` now passes current HEAD into
  `Test-StartupSingleInstanceEvidence` and
  `Test-DesktopSingleInstanceEvidence`.
- Both single-instance verifiers validate `git_commit` and expose the
  candidate commit in go/no-go output.
- `test-release-evidence-verifiers.ps1` adds source-contract case
  `go-no-go single-instance evidence requires current freshness`.

## Validation

- parser checks passed
- `git diff --check` passed
- release evidence verifier: `ok=true`, `case_count=86`,
  `failed_case_count=0`
- dirty-tree go/no-go smoke rejected stale startup and desktop
  single-instance candidates with `expected git commit` check `fail`

## Product Spec Update

MUSU Desktop remains the local executor. MUSU.PRO remains remote input,
project/company room, rendezvous, path-selection, relay policy, and
evidence/control plane. MUSU.PRO input or room coordination cannot replace
local single-instance proof on each Windows device.

## Audit Result

No high/medium issue was found. Public release still requires fresh
single-instance evidence, second-PC CPU/matrix/route evidence, hosted
MUSU.PRO relay proof, support mailbox proof, and Store proof.
