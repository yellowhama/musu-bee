# 2026-06-07 Route Reachability Diagnostic Tooling

## Decision

Promote HUGH-MAIN route reachability checks from manual notes into reusable
release tooling.

## Change

- Added `record-route-reachability-diagnostic.ps1`.
- Added `verify-route-reachability-diagnostic.ps1`.
- Registered both scripts as status-only release tooling so current local CPU
  and single-instance evidence is not made stale by the diagnostic tool change.
- Added release verifier coverage for recorder source contract, valid failed
  non-local peer diagnostic, local-only target rejection, and fake success
  rejection.

## Validation

- Parser checks passed.
- Existing HUGH-MAIN diagnostic verified with `ok=true`, `fail_count=0`.
- New recorder full smoke against `HUGH-MAIN` captured TCP `false`, route
  result `failed`, and failure `submit_http_error`.
- Generated full smoke diagnostic verified with `ok=true`, `fail_count=0`.
- Release verifier regression passed with `ok=true`, `case_count=90`,
  `failed_case_count=0`.

## Audit Result

No high/medium issue was found. This is diagnostic hardening only; public
release still needs successful second-PC route/CPU/matrix, hosted MUSU.PRO
P2P/relay proof, support mailbox proof, and Store proof.
