# 2026-06-06 second-PC runtime CPU subrole import gate

Status: DONE_WITH_CONCERNS.

What changed:

- `run-second-pc-release-check.ps1` now emits
  `runtime_idle_cpu_subrole_summary`,
  `runtime_cpu_scenario_subrole_summary`, and
  `runtime_cpu_subrole_contract_ok`.
- `import-second-pc-return.ps1 -RequireReleaseGateEvidence` now re-parses the
  returned idle CPU and runtime matrix JSONs and rejects missing subrole fields.
- Required release import fields include `process_counts_by_subrole`,
  `max_one_core_percent_by_subrole`, `memory_totals_by_subrole_mb`, and
  `cpu_attribution.top_processes[*].process_subrole`.
- The import gate requires `bridge_runtime`, requires `desktop_shell` for
  desktop/startup evidence, and requires `webview2_helper` for `desktop-open`.
- Operator action pack, final packet, and multi-device kit docs now state that
  older second-PC returns without subrole fields are diagnostic only.

Validation:

- PowerShell parser: pass for edited scripts
- release evidence verifier regressions: `ok=true`, `case_count=45`,
  `failed_case_count=0`

Code audit:

- Fixed one medium issue: release import trusted returned release-check booleans
  and file presence too much after the CPU subrole gate. Import now verifies the
  returned CPU JSONs directly and requires `runtime_cpu_subrole_contract_ok`.
- No remaining high or medium issue found in the changed scripts.

Product boundary:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, rendezvous,
  path-selection, relay-fallback policy, and evidence/control coordination.
- This does not complete real second-PC route/CPU/matrix evidence, hosted P2P
  proof, support mailbox proof, or Store proof.

Next required external action:

- Regenerate the operator packet/action pack after commit.
- Run the new second-PC transfer on the second Windows PC.
- Return the zip and import it with `-RequireReleaseGateEvidence`.
