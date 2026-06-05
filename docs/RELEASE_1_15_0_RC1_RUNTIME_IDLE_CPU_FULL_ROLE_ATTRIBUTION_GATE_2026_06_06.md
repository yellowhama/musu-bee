# MUSU 1.15.0-rc.1 Runtime Idle CPU Full Role Attribution Gate

Date: 2026-06-06 KST
Branch: `harden-relay-fallback-payload-evidence`
Base HEAD before this change: `a7bd6aca79432b0d66b2775cef8138204c53c257`

## Summary

The public release go/no-go idle CPU verifier now requires full role
attribution for single `desktop-open` runtime idle CPU evidence.

Required role fields:

- `musu`
- `node`
- `webview2`
- `other`

This closes a verification gap between the runtime CPU scenario matrix and the
single idle CPU evidence gate. The matrix verifier already required all four
role fields; the single idle CPU verifier now applies the same role
completeness standard.

## Source Changes

- `scripts/windows/write-release-go-no-go.ps1`
  - adds `Test-ObjectHasPropertyNames`
  - requires `process_counts_by_role` to include all four roles
  - requires `cpu_attribution.sample_count_by_role`,
    `total_cpu_seconds_by_role`, and `max_one_core_percent_by_role` to include
    all four roles
  - keeps existing bridge/runtime/desktop/WebView2 subrole checks
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds source-contract regression case
    `go-no-go runtime idle CPU requires full role attribution`

## Validation

Passed:

- PowerShell parser for `write-release-go-no-go.ps1` and
  `test-release-evidence-verifiers.ps1`
- `scripts/windows/test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=46`, `failed_case_count=0`
- `git diff --check`
- dirty-tree `write-release-go-no-go.ps1 -SkipPublicMetadata -Json`:
  - `local_artifacts_ready=true`
  - `single_machine_verified=true`
  - `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
  - `runtime_cpu_scenario_matrix_valid_machine_count=1/2`
  - `runtime_cpu_second_pc_route_attempt_verified=true`
  - `idle_busy_loop_candidate_contract_verified=true`
  - `manifest_git.dirty=true` because this source change is uncommitted

## Code Audit

Finding severity: no high or medium issue found in the changed source.

This is verifier hardening only. It does not change runtime behavior, replace
fresh 60-second CPU evidence, or close the two-machine idle CPU gate.

## Code And Document Indexing

MUSU local indexing was refreshed after the runtime idle CPU full-role
attribution gate source, report, wiki, checklist, GOAL, and CoS updates:

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- files: `2480`
- symbols: `2719`
- elapsed: `9798 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index remains the reliable current code/document index.

## Product Status

The local runtime evidence shape now better matches the product requirement:
MUSU, WebView2, Node helpers, and other owned helper buckets must be visible
before idle CPU evidence can count toward release.

Public release remains No-Go until second-PC multi-device evidence, second-PC
idle CPU evidence, second-PC runtime CPU matrix evidence, live hosted P2P proof,
support mailbox proof, and Store evidence are complete.
