# MUSU 1.15.0-rc.1 Route Attempt CPU Attempt Metadata Gate

**Date**: 2026-06-07 04:42 KST
**Wiki ID**: wiki/921
**Machine**: `HUGH_SECOND`

## Summary

Runtime CPU scenario matrix verification now requires allowed failed target
route probes to carry per-attempt metadata. This tightens the release gate for
the second-PC route-attempt CPU path without changing the product boundary.

The goal is to prevent a weak failed route probe summary from satisfying the
post-route CPU evidence path. A failed target route attempt may still be useful
for CPU sampling, but it must prove what command was attempted, how many
attempts ran, what the effective and raw exit codes were, and that the summary
matches the final attempt.

## Changed

Updated `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` for the
`-AllowFailedPostRouteProbe` path:

- requires numeric `raw_exit_code` on `route_probe`
- requires `attempt_count > 0`
- requires `attempts[]` to exist and match `attempt_count`
- requires each attempt row to include attempt number, timestamp,
  `exit_code`, `raw_exit_code`, stdout/stderr/output fields, `ok`, and
  `timeout_sec`
- requires the top-level route probe summary exit/raw-exit codes to match the
  final attempt

Updated `scripts\windows\test-release-evidence-verifiers.ps1`:

- fixture route probes now include full per-attempt metadata
- added regression case
  `runtime matrix rejects allowed failed route attempt without per-attempt metadata`
- route probe source contract now checks that the matrix writer emits
  `attempt_count` and `attempts`

## Evidence Check

The current clean primary post-route matrix already has the required metadata:

- evidence:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-025704-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- target: `HUGH-MAIN`
- route probe `ok=false`, `failure_allowed=true`
- `attempt_count=1`
- `attempts[]` count `1`
- `wait_timeout_sec` present
- `command_timeout_sec` present

Direct verifier run for the current post-route target attempt passed with
`ok=true` and `fail_count=0`.

## Validation

- PowerShell parser checks passed.
- Current post-route target route-attempt CPU evidence passed the new verifier
  checks.
- Release evidence verifier regression passed with `ok=true`,
  `case_count=103`, and `failed_case_count=0`.
- Dirty-tree go/no-go after narrowing the check preserved existing local
  evidence recognition: `single_machine_verified=true`, runtime idle count `1`,
  runtime matrix count `1`, and targeted route-attempt CPU true; the temporary
  `git` blocker was expected before commit.

## Qualitative Audit

No high or medium issue was found in this scoped change.

This is evidence hardening, not route implementation. It does not close the
second-PC, runtime CPU 2/2, hosted MUSU.PRO P2P/relay, support mailbox, or
Store release gates. It makes the allowed failed target-route CPU diagnostic
harder to fake or accidentally overstate.
