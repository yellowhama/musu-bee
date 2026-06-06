# MUSU 1.15.0-rc.1 Telemetry Flush Scope Audit

**Wiki ID**: wiki/837
**Date**: 2026-06-06

## Summary

The Rust background-loop audit now distinguishes an explicit one-shot CLI log
flush from background telemetry/log flush worker primitives.

The only current Rust flush primitive is the uninstall purge prompt:

- `musu-rs\src\install\uninstall.rs`
- `std::io::stderr().flush().ok()`

That call is a request-scoped TTY prompt flush, not a background worker. It is
now listed in `$allowedTelemetryFlushPrimitiveFiles`, and the audit fails if
any other Rust source introduces telemetry/exporter/log flush primitives.

## Code Changes

- `scripts\windows\audit-rust-background-loop-contract.ps1`
  - scans actual `stdout().flush()` and `stderr().flush()` calls, plus
    telemetry/exporter primitives such as OpenTelemetry, tracing appender,
    force flush, tracer provider flush, and metrics/prometheus exporters
  - records allowlisted one-shot hits separately as
    `allowed_telemetry_flush_primitive_hit_count`
  - keeps disallowed hits in `telemetry_flush_primitive_hit_count`
  - adds check `one-shot log flush primitives stay allowlisted`
- `scripts\windows\test-release-evidence-verifiers.ps1`
  - adds source-contract case
    `rust background audit limits telemetry flush scope`
  - raises release verifier regressions from `64/64` to `65/65`
- `scripts\windows\verify-final-operator-gate-packet.ps1`
  - requires final operator packets to include the log-flush scope contract

## Qualitative Evaluation

No high or medium issue was found after the fix.

The issue fixed here was a low-risk audit blind spot: the existing audit
already blocked telemetry/exporter keywords, but it did not explicitly classify
plain Rust `stdout/stderr.flush()` calls. In the current source, that did not
hide a background loop because the only match is a one-shot uninstall prompt.
Still, making the allowlist explicit is the right release posture: future log
flush workers cannot appear silently under the local desktop idle budget.

Product interpretation remains unchanged:

- MUSU Desktop is the local executor and resource owner.
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay-fallback policy, and evidence/control plane.
- A web page or hosted control plane must not add background log/telemetry
  workers to the packaged local runtime without this audit catching it.

## Validation

Passed:

- PowerShell parser checks for changed scripts
- `audit-rust-background-loop-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`
  - `telemetry_flush_primitive_hit_count=0`
  - `allowed_telemetry_flush_primitive_hit_count=1`
- `test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=65`
  - `failed_case_count=0`

## Remaining Blockers

Public release remains No-Go on:

- real second-PC route evidence
- second-PC idle CPU and runtime CPU scenario matrix evidence
- production KV/Upstash env and live runtime login proof
- missing release relay tunnel payload endpoint
- live relay route transport proof and release relay payload delivery proof
- support mailbox evidence
- Microsoft Partner Center / Store evidence

## Next Step Document

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_TELEMETRY_FLUSH_SCOPE_AUDIT_2026_06_06.md`
