# 2026-06-06 runtime idle CPU full role attribution gate

## Decision

Single `desktop-open` runtime idle CPU evidence must prove full process role
attribution, not just MUSU and WebView2.

## What changed

- `write-release-go-no-go.ps1` now requires `process_counts_by_role`,
  `cpu_attribution.sample_count_by_role`, `cpu_attribution.total_cpu_seconds_by_role`,
  and `cpu_attribution.max_one_core_percent_by_role` to include `musu`, `node`,
  `webview2`, and `other`.
- Existing subrole requirements remain: `musu_runtime`, `bridge_runtime`,
  `desktop_shell`, `node_helper`, `webview2_helper`, and `other`.
- Release verifier regressions now include source-contract case
  `go-no-go runtime idle CPU requires full role attribution`.

## Validation

- PowerShell parser: pass
- release evidence verifier regression: `ok=true`, `case_count=46`,
  `failed_case_count=0`
- dirty-tree go/no-go with public metadata skipped:
  `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`
- `git diff --check`: pass

## Product status

This is verifier hardening. It does not replace fresh 60-second CPU evidence,
and public release remains blocked on second-PC route/CPU/matrix evidence,
hosted P2P proof, support mailbox proof, and Store proof.
