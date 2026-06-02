# Chief of Staff Memory: Runtime Matrix Resource-Budget Verifier

Date: 2026-06-02 09:25 KST

## Durable Decision

The runtime CPU scenario matrix is now also a fail-closed resource-budget gate.
It must not pass if process-count, WebView2-count, working-set, private-memory,
or resource-budget-violation fields are missing or contradictory.

## Change

`scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` now requires:

- matrix-level owned process, WebView2 process, and working-set budgets
- per-scenario `resource_budget_violations`
- per-scenario `process_counts_by_role`
- per-scenario `total_working_set_mb_after`
- per-scenario `total_private_memory_mb_after`
- WebView2 count within budget for every scenario
- at least one owned WebView2 process for `desktop-open`

The verifier exits nonzero when `ok=false`.

`scripts\windows\test-release-evidence-verifiers.ps1` now includes runtime
matrix verifier fixtures. The latest validation passed 13/13 cases at
`.local-build\release-evidence-verifier-tests\20260602-093028`.

`scripts\windows\verify-final-operator-gate-packet.ps1` now self-checks that
operator packets include the hardened runtime matrix verifier, including
resource-budget fields and nonzero failure behavior.

## Current Evidence

The latest primary runtime CPU matrix
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-083314-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
still verifies with `ok=true`, `fail_count=0`, and `operator_machine=HUGH_SECOND`
under the stricter verifier.

## Follow-Up

The gate is still `1/2`. The next second-PC return must include both
release-grade `desktop-open` idle CPU evidence and the full 4-state runtime CPU
scenario matrix.
