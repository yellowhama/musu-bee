# 1.15.0-rc.1 Second-PC Route-Attempt Target Binding Gate

Date: 2026-06-06 KST

## Summary

Targeted second-PC route-attempt CPU evidence now requires the recorded target
to be bound to the actual route command and arguments.

The prior self-target gate prevented `route_probe.target == operator_machine`.
The remaining false-positive gap was weaker: a JSON matrix could report
`route_probe.target = SECOND-PC` while the recorded `command` and `arguments`
still showed a different route target. That would make the target field look
release-relevant without proving that the sampled CPU followed the claimed
`musu route --target <peer>` attempt.

## Change

- `verify-runtime-cpu-scenario-matrix.ps1` now checks targeted `post-route`
  probes for:
  - command text containing `--target` and the reported target
  - arguments containing either `--target <target>` or `--target=<target>`
- Empty target cases remain verifier failures, not PowerShell binding errors.
- `test-release-evidence-verifiers.ps1` now has:
  - source-contract case
    `runtime CPU matrix target command binding contract`
  - negative fixture case
    `runtime matrix rejects target field not bound to route command arguments`

## Validation

- parser checks: pass
- `git diff --check`: pass
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=73`, `failed_case_count=0`

## Release Interpretation

This is evidence hardening. It does not prove second-PC connectivity.

For targeted second-PC route-attempt CPU diagnostics, release tooling now
requires:

- target is present
- target is not self
- command records a targeted route attempt
- arguments bind the same target
- failed probes are counted only when the diagnostic path explicitly allows
  failed route probes

Public release remains No-Go until real second-PC route/CPU/matrix evidence,
live MUSU.PRO P2P/relay proof, support mailbox proof, and Store/Partner Center
proof are recorded.

