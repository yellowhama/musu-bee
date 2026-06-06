# 2026-06-07 Process Ownership Transient CLI Hardening

## Decision

Process ownership evidence must count only long-lived bridge runtime roots as
`musu_runtime`. Short-lived `musu.exe` commands such as `musu status --json`
are operator CLI processes and are reported separately as `musu_cli`.

## Change

- `audit-musu-process-ownership.ps1` now identifies bridge roots through
  `musud`, bridge registry PID, or `musu.exe bridge` command line.
- Other `musu.exe` processes are classified as `musu_cli`.
- `show-musu-process-attribution.ps1` exposes the CLI count.
- `test-release-evidence-verifiers.ps1` adds regression case
  `process ownership excludes transient MUSU CLI from bridge runtime count`.

## Evidence

- Local bridge on `HUGH_SECOND`: `http://127.0.0.1:1158`, healthy.
- `HUGH-MAIN`: `192.168.1.192:8949`, unhealthy, `version=unknown`.
- Process ownership after patch: `ok=true`, `musu_runtime=1`,
  `musu_cli=0`, `desktop_shell=1`, `owned_node=0`, `owned_webview2=6`.
- 60s desktop-open CPU diagnostic after patch: `ok=true`, hot processes `0`,
  MUSU CPU `0`, WebView2 max `0.05`; dirty tree, so diagnostic only.
- Release verifier regression: `ok=true`, `case_count=94`,
  `failed_case_count=0`.

## Product Spec Update

MUSU Desktop is still the local executor. MUSU.PRO can receive remote user
input and coordinate company/project room, meeting, rendezvous, route choice,
relay fallback, and evidence, but it does not execute local work and does not
turn `localhost:3001` into the packaged runtime contract.

## Audit Result

No high/medium issue was found. This removes a false-positive release audit
path. It does not close second-PC route/CPU/matrix, hosted MUSU.PRO relay,
support mailbox, or Store proof gates.
