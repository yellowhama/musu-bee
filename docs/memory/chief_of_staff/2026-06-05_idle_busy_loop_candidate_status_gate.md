# 2026-06-05 Idle Busy-Loop Candidate Status Gate

`write-release-go-no-go.ps1` now emits `idle_busy_loop_candidate_contract_verified`
and `idle_busy_loop_candidate_status`.

The candidate summary maps the original idle CPU suspects to concrete audits:

- clipboard polling
- mDNS discovery
- health/readiness retry loops
- frontend interval/refetch polling
- relay payload target polling
- cloud heartbeat

Validation:

- PowerShell parser passed for `write-release-go-no-go.ps1`
- `git diff --check` passed
- Rust loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`
- Frontend polling audit passed with `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, and
  `direct_visibility_listener_hit_count=0`
- Dirty-tree go/no-go summary reported
  `idle_busy_loop_candidate_contract_verified=true`, candidate count `6`, and
  no failed candidates

This is a status/gate change only. It does not change packaged runtime behavior
and does not close the two-machine idle CPU release gate.
