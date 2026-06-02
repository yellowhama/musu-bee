# Runtime CPU Matrix Resource-Budget Verifier

**Wiki ID**: wiki/542
**Date**: 2026-06-02 09:25 KST

## Scope

This hardens the `musu.runtime_cpu_scenario_matrix.v1` verifier so the
four-state CPU matrix is also a resource-budget gate, not only a CPU gate.

It directly supports the release requirement that MUSU can stay open as a
desktop app without uncontrolled process growth, WebView2 accumulation, memory
growth, or hidden busy-loop candidates across these states:

- `runtime-started`
- `dashboard-open`
- `desktop-open`
- `post-route`

## Change

`scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` now fails closed when
resource-budget evidence is missing or contradictory.

It now requires matrix-level budgets:

- `max_owned_process_count`
- `max_owned_webview2_process_count`
- `max_total_working_set_mb`

For every required scenario measurement it now verifies:

- `resource_budget_violations` field is present
- no resource budget violations are reported
- `process_counts_by_role` is present
- summed owned process count is within `max_owned_process_count`
- owned WebView2 count is within `max_owned_webview2_process_count`
- `total_working_set_mb_after` is present and within budget
- `total_private_memory_mb_after` is present
- `desktop-open` still has at least one owned WebView2 process

The verifier now exits nonzero when `ok=false`, matching the other release
evidence verifiers.

`verify-final-operator-gate-packet.ps1` now also self-checks that packaged
operator packets contain the hardened matrix verifier with resource-budget
fields and nonzero failure behavior.

## Regression Coverage

`scripts\windows\test-release-evidence-verifiers.ps1` now covers the runtime
matrix verifier in addition to P2P control-plane and multi-device verifiers.

Validation result:

- output root:
  `.local-build\release-evidence-verifier-tests\20260602-093028`
- cases: `13`
- failed cases: `0`
- result: `ok=true`

New runtime matrix regression cases:

- accepts complete resource-budget evidence
- rejects missing `resource_budget_violations`
- rejects working set over budget
- rejects owned WebView2 process count over budget
- verifies final operator packets include the hardened matrix verifier

## Current Evidence Impact

The latest primary matrix evidence still passes under the stricter verifier:

- evidence:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-083314-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier result: `ok=true`
- fail count: `0`
- operator machine: `HUGH_SECOND`

This means the new verifier closes a gap without invalidating the current
primary evidence. The release gate remains `1/2` until the second Windows PC
returns the same clean 4-state matrix.

## Release Interpretation

This is release hardening, not public readiness. Public release remains No-Go
until second-PC runtime CPU/matrix evidence, real multi-device route evidence,
live `musu.pro` P2P control-plane evidence, `musu@musu.pro` delivery evidence,
and Store evidence are recorded.
