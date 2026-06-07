# Release 1.15.0-rc.1 Runtime Idle CPU Scenario Selection Gate

Generated: 2026-06-07 KST

## Problem

After adding targeted `startup-open` CPU attribution evidence, clean
go/no-go reported `runtime_idle_cpu_valid_machine_count=0`.

The local desktop-open CPU evidence was still valid, but go/no-go selected only
the latest runtime-idle CPU file per machine. The new `startup-open` evidence
was newer than the release-gated `desktop-open` evidence, so the verifier saw
the wrong scenario and did not count the machine.

## Fix

`scripts\windows\write-release-go-no-go.ps1` now scans up to 12 recent runtime
idle CPU candidates per machine instead of 3 and reports
`candidate_selection=latest-per-machine-up-to-12`.

`scripts\windows\test-release-evidence-verifiers.ps1` now source-checks this
contract so targeted attribution evidence cannot mask the release-gated
`desktop-open` candidate again.

## Release Meaning

This is release-gate selection hardening only. It does not change runtime
behavior or relax CPU budgets.

The release idle CPU gate still requires:

- scenario `desktop-open`
- at least `60s`
- `<= 5%` one logical core
- owned WebView2 attribution
- clean/current evidence
- two machines before public release

Targeted `bridge-only`, `runtime-started`, `startup-open`, and future
post-route attribution files can coexist with `desktop-open` release evidence
without masking it.

## Validation

Required validation:

- `git diff --check`
- targeted startup-open matrix verifier
- release evidence verifier regression
- clean go/no-go confirming `runtime_idle_cpu_valid_machine_count=1`

Public release remains No-Go until the second Windows machine, hosted
MUSU.PRO P2P/relay proof, support mailbox, and Store proof are complete.
