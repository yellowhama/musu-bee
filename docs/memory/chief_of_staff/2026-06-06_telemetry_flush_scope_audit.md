# 2026-06-06 telemetry flush scope audit

Rust background-loop auditing now has an explicit log/telemetry flush scope
contract.

What changed:

- `audit-rust-background-loop-contract.ps1` now scans Rust source for actual
  `stdout().flush()` and `stderr().flush()` calls plus telemetry/exporter flush
  primitives.
- `musu-rs\src\install\uninstall.rs` is the only allowlisted one-shot flush
  source.
- disallowed hits remain in `telemetry_flush_primitive_hit_count`.
- allowlisted one-shot hits are reported as
  `allowed_telemetry_flush_primitive_hit_count`.
- release verifier regression case `rust background audit limits telemetry
  flush scope` raises the verifier suite to `65/65`.
- final operator packet verification now checks for the log-flush scope
  contract.

Validation:

- parser checks: pass
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `telemetry_flush_primitive_hit_count=0`,
  `allowed_telemetry_flush_primitive_hit_count=1`
- release evidence verifier regressions: `ok=true`, `case_count=65`,
  `failed_case_count=0`

Qualitative evaluation:

- no high or medium issue remains after the fix
- fixed issue was a low-risk audit blind spot around plain Rust
  `stdout/stderr.flush()` calls

Product boundary:

- MUSU Desktop remains the local executor and resource owner.
- MUSU.PRO remains remote input, project/company room, rendezvous,
  path-selection, relay-fallback policy, and evidence/control plane.
