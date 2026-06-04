# 2026-06-05 Log/Telemetry Idle Candidate Gate

The idle busy-loop candidate contract now includes `log/telemetry flush loop`.

Changes:

- `audit-rust-background-loop-contract.ps1` now reports
  `telemetry_flush_primitive_hit_count` and fails
  `logging-telemetry / no background telemetry flush worker primitives` if Rust
  source introduces background telemetry/log flush worker primitives.
- `write-release-go-no-go.ps1` now includes the seventh candidate,
  `log/telemetry flush loop`, under `idle_busy_loop_candidate_status`.

Validation:

- PowerShell parser passed for `write-release-go-no-go.ps1` and
  `audit-rust-background-loop-contract.ps1`.
- Rust loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, and
  `telemetry_flush_primitive_hit_count=0`.
- Frontend polling audit passed with `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, and
  `direct_visibility_listener_hit_count=0`.
- Dirty-tree go/no-go summary reported
  `idle_busy_loop_candidate_contract_verified=true`, candidate count `7`, and
  no failed candidates.

This is a status/gate change only. It does not change packaged runtime behavior
and does not close the two-machine idle CPU release gate.
