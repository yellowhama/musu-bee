# 2026-06-01 14:30 KST - Dashboard-Open Matrix Gate Tightening

The runtime CPU scenario matrix gate was tightened so the `dashboard-open`
scenario cannot silently measure the same state as `runtime-started`.

Changes:

- `measure-musu-runtime-cpu-scenarios.ps1` now stores the dashboard URL reported
  by `musu up --json` (`reachable_url`, then `dev_url`, then `start_url`).
- If `-DashboardUrl` is not supplied, `dashboard-open` launches the discovered
  URL before sampling.
- If `dashboard-open` is run without a prior `runtime-started` entry, it performs
  its own bounded `musu up --json` discovery first.
- `verify-runtime-cpu-scenario-matrix.ps1` fails `dashboard-open` unless its
  preparation launched a non-empty dashboard URL.
- `post-route` probe success now requires the exact per-run expected token.

Reason:

The operator's busy-loop report names distinct states: MUSU just opened,
dashboard opened, runtime started, and post-route. A release matrix that leaves
`dashboard-open` as `none` is too weak, so it is now rejected.

Validation:

- Dirty-tree 3s diagnostic matrix
  `.local-build\runtime-cpu-scenarios\20260601-143309-HUGH_SECOND\20260601-143309-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  ran `dashboard-open` by itself.
- The runner performed `musu up --json`, launched `http://127.0.0.1:3000/app`,
  recorded `dashboard_url_source=musu_up_dashboard_open`, and measured one MUSU
  process with owned Node `0`, owned WebView2 `0`, and max one-core CPU `0`.
- This is harness validation only, not release evidence.
