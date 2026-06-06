# 1.15.0-rc.1 Idle Busy-Loop Candidate Count Gate

Date: 2026-06-06 KST

## Summary

The release go/no-go JSON now reports explicit idle busy-loop candidate counts:

- `idle_busy_loop_candidate_count`
- `idle_busy_loop_candidate_verified_count`
- `idle_busy_loop_candidate_unverified_count`

This makes the CPU hardening evidence easier to audit. The existing
`idle_busy_loop_candidate_status` array already records each candidate and its
source checks, but the top-level count fields now make it unambiguous whether
the full candidate matrix is covered.

## Candidate Matrix

The current matrix remains eight candidates:

1. `clipboard polling`
2. `mDNS discovery`
3. `health check retry loop`
4. `bridge readiness wait loop`
5. `frontend interval/refetch`
6. `relay payload target poller`
7. `cloud heartbeat`
8. `log/telemetry flush loop`

## Validation

- parser checks: pass
- `test-release-evidence-verifiers.ps1 -Json`: `ok=true`,
  `case_count=77`, `failed_case_count=0`
- dirty-tree go/no-go validation: `idle_busy_loop_candidate_count=8`,
  `idle_busy_loop_candidate_verified_count=8`,
  `idle_busy_loop_candidate_unverified_count=0`

The dirty-tree go/no-go run still reported public release No-Go. The `git`
blocker was expected because this report and the source changes were not yet
committed during that validation run.

## Release Interpretation

This is evidence visibility hardening. It does not replace the required
two-machine 60s CPU samples, process attribution, or second-PC route attempt
evidence. Public release remains No-Go until second-PC CPU/matrix/route
evidence, live MUSU.PRO P2P control-plane evidence, support mailbox proof, and
Store/Partner Center proof are complete.
