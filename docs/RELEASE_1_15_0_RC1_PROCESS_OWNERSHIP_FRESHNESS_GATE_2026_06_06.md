# MUSU 1.15.0-rc.1 Process Ownership Freshness Gate

**Wiki ID**: wiki/895
**Date**: 2026-06-06

## Summary

Process ownership release evidence is now freshness-gated like runtime CPU
evidence.

Before this change, `process_ownership_verified` could pass from an older
`musu.process_ownership_audit.v1` file as long as the process counts and
packaged identity checks passed. That left a narrow stale-proof gap: a later
runtime-affecting change could land without forcing fresh process ownership
evidence.

## Change

Updated `scripts/windows/write-release-go-no-go.ps1`:

- `Test-ProcessOwnershipEvidence` now requires `ExpectedGitCommit`.
- Process ownership evidence must record a valid `git_commit`.
- The evidence commit must match current HEAD, or the delta to current HEAD
  must be documentation/evidence/status/tooling-only according to
  `Test-DocumentationOrStatusOnlyGitDelta`.
- The process ownership result now exposes the candidate `git_commit`.

Updated `scripts/windows/test-release-evidence-verifiers.ps1`:

- added source-contract case
  `go-no-go process ownership requires current freshness`

Updated runtime stabilization spec:

- process ownership evidence is now explicitly current/freshness-gated
- runtime-affecting changes after process ownership capture require fresh
  process ownership evidence

## Validation

Passed:

- PowerShell parser checks for updated scripts
- `git diff --check`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=85`, `failed_case_count=0`
- Dirty-tree go/no-go smoke:
  - `ready=false`
  - `manifest_git.dirty=true`
  - `process_ownership_verified=true`
  - process ownership valid machines: `1`
  - first process ownership candidate commit:
    `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2`
  - `expected git commit` check: `pass`
  - check message: delta to current HEAD is
    documentation/evidence/status/tooling-only

## Qualitative Audit

No high or medium issue was found in this scoped gate hardening.

The risk removed is stale process ownership proof after runtime-affecting
changes. This makes process ownership evidence match the same release
freshness discipline already applied to idle CPU and runtime CPU matrix
evidence.

This does not capture second-PC CPU proof, does not prove a real two-machine
route, and does not close hosted MUSU.PRO relay, support mailbox, or Store
proof gates.

## Product Boundary

The product boundary remains local-first:

- MUSU Desktop executes local work on each device.
- MUSU.PRO coordinates remote input, project/company rooms, rendezvous, path
  selection, relay fallback, and release evidence.
- Process ownership proof belongs to the local execution plane and must be
  current whenever runtime-affecting local code changes.

## Release Status

Public release remains No-Go until real second-PC route/CPU/matrix evidence,
live MUSU.PRO owner-scoped release relay proof, support mailbox proof, and
Store/Partner Center proof are recorded.
