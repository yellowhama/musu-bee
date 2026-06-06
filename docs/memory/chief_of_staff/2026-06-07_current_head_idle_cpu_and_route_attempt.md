# 2026-06-07 Current-HEAD Idle CPU And Route Attempt

## Decision

Refresh current packaged CPU evidence after current-HEAD MSIX reinstall and
single-instance proof.

## Change

- Captured current desktop-open 60s idle CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-003914-HUGH_SECOND.desktop-open.evidence.json`.
- Fixed `measure-musu-runtime-cpu-scenarios.ps1` so route probes that miss the
  expected token record non-zero effective `exit_code` while preserving
  `raw_exit_code`.
- Captured current runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-005241-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
- Recorded target-route verification pass and full-matrix verification fail.

## Validation

- desktop-open idle CPU: `ok=true`, `sample_seconds=60.031`, MUSU `0`,
  Node `0`, WebView2 max `0.03`, runtime `1`, desktop `1`, owned WebView2 `6`.
- runtime matrix CPU budget: all five scenarios `ok=true`, WebView2 max `0.1`.
- route attempt: `HUGH-MAIN`, `route_ok=false`, effective `exit_code=1`,
  `raw_exit_code=0`, timeout to `192.168.1.192:8949`.
- target route-attempt verifier: `ok=true`, `fail_count=0`.
- full matrix verifier: `ok=false`, `fail_count=1`, because route token was
  not returned.
- dirty-tree go/no-go: targeted route-attempt CPU verified, blocker count `7`
  including temporary `git`.

## Audit Result

No high/medium issue was found. Current primary-machine CPU evidence is quiet,
but public release still needs second-PC idle CPU/matrix, successful route
proof, hosted MUSU.PRO relay proof, support mailbox proof, and Store proof.
