# MUSU 1.15.0-rc.1 Runtime CPU Attribution Role Gate

Date: 2026-06-05

## Decision

The idle CPU gate must prove attribution, not just low aggregate CPU. Release
runtime matrix evidence must identify CPU by role so a future idle/busy-loop
regression can be assigned to the right process family:

- MUSU runtime / bridge process
- Node helper processes
- WebView2 helpers
- other matched helper processes

## Hardening

Root cause: `measure-musu-idle-cpu.ps1` already records
`musu`, `node`, `webview2`, and `other` role fields, but
`verify-runtime-cpu-scenario-matrix.ps1` only required MUSU and WebView2 fields
inside the CPU attribution block. A malformed evidence file could omit node
role attribution while still passing the verifier.

The verifier now requires `musu`, `node`, `webview2`, and `other` fields in:

- `measurement.max_one_core_percent_by_role`
- `measurement.process_counts_by_role`
- `measurement.cpu_attribution.sample_count_by_role`
- `measurement.cpu_attribution.total_cpu_seconds_by_role`
- `measurement.cpu_attribution.max_one_core_percent_by_role`

The release verifier regression suite now includes a negative fixture that
removes the node CPU attribution role and verifies the runtime matrix fails.

Changed files:

- `scripts/windows/verify-runtime-cpu-scenario-matrix.ps1`
- `scripts/windows/test-release-evidence-verifiers.ps1`

## Validation

- PowerShell parser check passed for both changed scripts
- `test-release-evidence-verifiers.ps1 -Json` passed with `ok=true`,
  `case_count=39`, `failed_case_count=0`
- new regression:
  `runtime matrix rejects CPU attribution without node role fields`
- latest runtime CPU matrix evidence also passed the stricter verifier:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-124652-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- the stricter verifier confirmed every required scenario records
  MUSU/node/WebView2/other role sample counts, CPU totals, max CPU fields, and
  process count fields
- `git diff --check` passed

## Release State

This is a source verifier hardening change. It does not replace the required
two-machine CPU evidence. Public release remains blocked until the second
Windows PC records current-build idle CPU and runtime matrix evidence, and
until hosted `musu.pro` P2P release proof, support mailbox proof, and Store
evidence are complete.
