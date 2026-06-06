# 1.15.0-rc.1 Second-PC Route-Attempt Self-Target Gate

Date: 2026-06-06 KST

## Summary

Targeted second-PC route-attempt CPU evidence now rejects self-target probes.

The release gate already required a `post-route` CPU sample with
`-RequirePostRouteTarget` and `-AllowFailedPostRouteProbe` for the diagnostic
case where a second PC is unreachable. The gap was that any non-empty target
could satisfy the targeted-route shape. A matrix whose route probe targeted the
operator machine itself could therefore look like a second-PC route-attempt CPU
sample.

## Change

- `verify-runtime-cpu-scenario-matrix.ps1` now supports
  `-RejectSelfPostRouteTarget`.
- When enabled, the verifier fails if `route_probe.target` matches
  `operator_machine`.
- `write-release-go-no-go.ps1` now enables this option for
  `runtime_cpu_second_pc_route_attempt_*`.
- `test-release-evidence-verifiers.ps1` now has a regression case:
  `runtime matrix rejects self-target second-PC route attempt`.
- The source-contract case for go/no-go now checks that targeted route-attempt
  selection passes `-RejectSelfPostRouteTarget`.

## Validation

- `git diff --check`: pass
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=71`, `failed_case_count=0`
- New negative fixture:
  `runtime-matrix-failed-self-target-route-attempt.json`
- New verifier result: self-target failed route probes are rejected even when
  `-AllowFailedPostRouteProbe` is set.

## Release Interpretation

This does not close the second-PC gate. It makes that gate harder to spoof.

Release-grade targeted second-PC route-attempt CPU evidence must now prove all
of the following:

- `post-route` scenario was sampled
- route probe is present
- route probe is successful, or failure is explicitly allowed for the bounded
  diagnostic path
- route target is present
- route target is not the same as `operator_machine`
- the matrix is current/clean or differs only by allowed documentation/status
  changes
- CPU/process/resource attribution still passes the runtime matrix verifier

Public release remains No-Go until real second-PC route/CPU/matrix evidence,
live MUSU.PRO P2P/relay proof, support mailbox proof, and Store/Partner Center
proof are recorded.

