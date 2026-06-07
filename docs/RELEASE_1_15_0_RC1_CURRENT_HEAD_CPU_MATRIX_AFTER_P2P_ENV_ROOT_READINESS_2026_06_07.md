# 1.15.0-rc.1 Current-Head CPU Matrix After P2P Env Root Readiness

Date: 2026-06-07 16:59 KST

## Scope

This refresh captures the packaged MUSU Desktop runtime CPU scenario matrix from
current clean HEAD after the P2P env root readiness JSON update.

This is single-machine runtime budget evidence on `HUGH_SECOND`. It is not
successful multi-device route proof and does not close the second-PC CPU/matrix
release gates.

## Evidence

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-165333-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-165333-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- scenario evidence:
  - `20260607-165333-HUGH_SECOND.startup-open.evidence.json`
  - `20260607-165333-HUGH_SECOND.runtime-started.evidence.json`
  - `20260607-165333-HUGH_SECOND.dashboard-open.evidence.json`
  - `20260607-165333-HUGH_SECOND.desktop-open.evidence.json`
  - `20260607-165333-HUGH_SECOND.post-route.evidence.json`

## Command

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget PRIMARY-PC -AllowFailedRouteProbe -Json
```

Verifier:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath .local-build\runtime-cpu-scenarios\20260607-165333-HUGH_SECOND\20260607-165333-HUGH_SECOND.runtime-cpu-scenario-matrix.json -ExpectedGitCommit eb7f58231547d73d8f011a3fbbebca90d585f1e9 -RequirePostRouteTarget -ExpectedPostRouteTarget PRIMARY-PC -RejectSelfPostRouteTarget -AllowFailedPostRouteProbe -Json
```

## Result

- `ok=true`
- `fail_count=0`
- `git_commit=eb7f58231547d73d8f011a3fbbebca90d585f1e9`
- `git_dirty=false`
- `musu_exe_release_identity=true`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- sample seconds: `60`
- route target: `PRIMARY-PC`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_165333`
- route probe: `ok=false`, `failure_allowed=true`, `exit_code=1`
- route failure: `peer 'PRIMARY-PC' not found`

CPU/resource maxima across the five scenarios:

- MUSU one-core CPU: `0`
- Node one-core CPU: `0`
- owned WebView2 one-core CPU: `0.10`
- owned process count: `8`
- owned WebView2 helper count: `6`
- max working set: `370.51MB`
- hot process count: `0`

## Release Meaning

The latest packaged desktop build still stays within the local runtime CPU,
process-count, WebView2-count, and memory budgets on `HUGH_SECOND`.

The `PRIMARY-PC` target was intentionally bound into the route command and the
failed diagnostic was allowed because no second machine is registered on this
host. This evidence therefore proves current-head local resource stability
after a target route attempt, but it does not prove successful two-machine
routing, second-machine CPU/matrix health, hosted MUSU.PRO relay proof, support
mailbox proof, or Store readiness.
