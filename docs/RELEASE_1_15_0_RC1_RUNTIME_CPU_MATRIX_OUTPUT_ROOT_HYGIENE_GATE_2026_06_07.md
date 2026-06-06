# MUSU 1.15.0-rc.1 Runtime CPU Matrix OutputRoot Hygiene Gate

**Date**: 2026-06-07 03:18 KST
**Wiki ID**: wiki/913
**Machine**: `HUGH_SECOND`

## Summary

Runtime CPU matrix capture now rejects tracked in-repo output roots before any
scenario sample starts.

Root cause from the current primary CPU refresh:

- a multi-scenario run was pointed directly at
  `docs\evidence\runtime-cpu-scenarios`
- the first scenario file made the worktree dirty
- later scenario samples recorded `git_dirty=true`
- a route prompt token built outside the script also drifted by one second from
  the script-owned expected token

That invalid evidence was discarded. The correct flow is now enforced in code:
capture in ignored `.local-build`, verify there, then copy verified matrix and
verification JSON into `docs\evidence`.

## Implementation

Updated `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1`:

- added OutputRoot path normalization
- detects whether `OutputRoot` is inside the repo
- checks in-repo output roots with `git check-ignore`
- throws before `New-Item` and before scenario sampling when an in-repo
  `OutputRoot` is not ignored
- records `output_root`, `output_root_within_repo`, and
  `output_root_git_ignored` in the matrix JSON

Updated `scripts\windows\test-release-evidence-verifiers.ps1`:

- added source-contract regression
  `runtime CPU matrix rejects tracked in-repo output roots`

## Validation

Passed:

- PowerShell parser check for both changed scripts
- unsafe OutputRoot smoke:
  `-OutputRoot docs/evidence/runtime-cpu-scenarios/1.15.0-rc.1/unsafe-output-root-smoke`
  failed before sampling with the expected error
- default `.local-build` smoke:
  `-SampleSeconds 3 -Scenario runtime-started -Json` succeeded and recorded
  `output_root_git_ignored=true`
- release evidence verifier regression:
  `ok=true`, `case_count=95`, `failed_case_count=0`

The default smoke was diagnostic only because the source tree was dirty while
this patch was under test.

## Qualitative Audit

No high or medium issue was found in this scoped change.

The change makes release evidence stricter. It does not weaken CPU budgets,
route token binding, packaged runtime identity, process attribution, or route
success requirements. It also does not close the second-PC or hosted
MUSU.PRO P2P/relay gates.

## Product Boundary

MUSU Desktop remains the local executor and resource owner. MUSU.PRO remains
remote input, rooms, rendezvous, path selection, relay fallback coordination,
and evidence/control plane. This gate protects the evidence pipeline used to
prove local runtime health; it does not move execution into MUSU.PRO or make
`localhost:3001` part of the packaged runtime contract.

## Release Status

Public release remains No-Go until second-PC route/CPU/matrix, hosted MUSU.PRO
P2P/relay proof, support mailbox proof, and Store/Partner Center proof pass.
