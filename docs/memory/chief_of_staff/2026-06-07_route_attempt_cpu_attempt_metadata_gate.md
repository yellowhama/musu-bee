# 2026-06-07 route attempt CPU attempt metadata gate

## Decision

Allowed failed target-route CPU evidence must include per-attempt route probe
metadata, not only a top-level failure summary.

## Change

- `verify-runtime-cpu-scenario-matrix.ps1` now requires allowed failed route
  probes to include `raw_exit_code`, `attempt_count`, matching `attempts[]`,
  complete attempt rows, and summary/final-attempt exit-code agreement.
- `test-release-evidence-verifiers.ps1` now includes
  `runtime matrix rejects allowed failed route attempt without per-attempt metadata`.
- The matrix writer source contract now checks for `attempt_count` and
  `attempts`.

## Evidence

Current primary evidence
`20260607-025704-HUGH_SECOND.runtime-cpu-scenario-matrix.json` already includes
the required route attempt metadata for target `HUGH-MAIN`.

Validation:

- direct target-route verifier: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=103`, `failed_case_count=0`
- dirty go/no-go after narrowing: `single_machine=true`, runtime idle `1`,
  runtime matrix `1`, targeted route-attempt CPU `true`

## Product Boundary

This strengthens evidence for CPU sampling after a second-PC route attempt. It
does not implement the hosted MUSU.PRO route/relay control plane and does not
turn failed route attempts into release-grade route success proof.
