# 2026-06-06 Process Ownership Freshness Gate

## Decision

Process ownership release evidence must be freshness-gated like runtime CPU
evidence. A passing `musu.process_ownership_audit.v1` file is release-valid
only if its `git_commit` matches current HEAD, or the delta to current HEAD is
documentation/evidence/status/tooling-only.

## Change

- `write-release-go-no-go.ps1` now passes current HEAD into
  `Test-ProcessOwnershipEvidence`.
- `Test-ProcessOwnershipEvidence` now validates `git_commit` and exposes the
  candidate commit in the result.
- `test-release-evidence-verifiers.ps1` adds source-contract case
  `go-no-go process ownership requires current freshness`.

## Validation

- parser checks passed
- `git diff --check` passed
- release evidence verifier: `ok=true`, `case_count=85`,
  `failed_case_count=0`
- dirty-tree go/no-go smoke reported process ownership valid machines `1` and
  `expected git commit` check `pass` for the current status-only delta

## Product Spec Update

MUSU Desktop remains the local execution plane. Process ownership proof belongs
to that local runtime boundary and must be refreshed after runtime-affecting
local code changes. MUSU.PRO remains the remote input/control-plane and does
not replace local process ownership proof.

## Audit Result

No high/medium issue was found. This is gate hardening only; public release
still requires second-PC CPU/matrix/route evidence, hosted MUSU.PRO relay
proof, support mailbox proof, and Store proof.
