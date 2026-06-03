# MUSU 1.15.0-rc.1 Startup-Open CPU Matrix Gate

Recorded: 2026-06-03 11:10 KST

## Summary

The runtime CPU scenario matrix now includes a release-gated `startup-open`
scenario so "right after opening MUSU" is measured separately from
`runtime-started`, `dashboard-open`, `desktop-open`, and `post-route`.

This is a gate hardening change. It does not close the public release because
second-PC runtime evidence, support mailbox verification, Store evidence, and
hosted P2P relay proof are still missing.

## Code Changes

- `measure-musu-runtime-cpu-scenarios.ps1` default scenarios now include
  `startup-open`.
- `startup-open` launches the packaged desktop app and records
  `sample_delay_seconds` before delegating to `measure-musu-idle-cpu.ps1`.
- `verify-runtime-cpu-scenario-matrix.ps1` rejects `startup-open` unless the
  packaged desktop app was launched and sampling started within 3s.
- `write-release-go-no-go.ps1` now requires
  `startup-open,runtime-started,dashboard-open,desktop-open,post-route`.
- The second-PC wrapper, final operator packet, multi-device kit, handoff
  status command, and release verifier fixture were updated to the five-scenario
  matrix.
- `show-final-release-handoff-status.ps1` now emits an operator step when the
  runtime CPU scenario matrix gate is not verified.
- Freshness allowlists now treat `measure-musu-runtime-cpu-scenarios.ps1` as a
  status-only harness script for unrelated single-machine and desktop-open CPU
  evidence. The base idle CPU sampler remains runtime-affecting.

## Validation

- PowerShell parser passed for changed scripts.
- `git diff --check` passed.
- Release evidence verifier regressions passed `20/20`.
- Dirty-tree go/no-go after the source commit required all five scenarios and
  dropped old four-scenario matrix evidence to `0` valid machines.
- The first 5-scenario local matrix `20260603-105008-HUGH_SECOND` intentionally
  was not copied to docs because the dashboard was not reachable; verifier
  rejected it with `fail_count=1` on `dashboard opened`.

## New Primary Matrix Evidence

Canonical evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-105650-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Evidence properties:

- git commit: `2defe28d9ff107813f476ae22720e2d715894f9e`
- clean git during capture: `true`
- operator machine: `HUGH_SECOND`
- sample seconds: `60`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_105650`
- verifier result: `ok=true`, `fail_count=0`

Scenario CPU summary:

- `startup-open`: action `Start packaged desktop app`, delay `2.026s`, MUSU
  `0`, Node `0.10`, WebView2 `1.51`, working set `485.24MB`, hot `0`
- `runtime-started`: MUSU `0`, Node `0`, WebView2 `0.21`, working set
  `486.67MB`, hot `0`
- `dashboard-open`: action `Start-Process DashboardUrl`, dashboard URL
  `http://127.0.0.1:3001/app`, MUSU `0`, Node `0`, WebView2 `0.16`, working
  set `485.98MB`, hot `0`
- `desktop-open`: action `Start packaged desktop app`, MUSU `0`, Node `0`,
  WebView2 `0.03`, working set `486.07MB`, hot `0`
- `post-route`: action `musu route --wait`, MUSU `0`, Node `0.03`, WebView2
  `0.05`, working set `487.86MB`, hot `0`

All five scenarios had no resource-budget violations.

## Go/No-Go After Evidence

Dirty-tree go/no-go after adding the docs evidence and freshness allowlist
reported:

- `single_machine_verified=true`
- runtime idle CPU valid machines: `1` (`HUGH_SECOND`)
- runtime CPU scenario matrix valid machines: `1` (`HUGH_SECOND`)
- required matrix scenarios:
  `startup-open,runtime-started,dashboard-open,desktop-open,post-route`

Remaining blockers:

- real second-PC multi-device evidence
- second-PC desktop-open CPU evidence
- second-PC five-scenario CPU matrix evidence
- support mailbox delivery evidence for `musu@musu.pro`
- Partner Center / Store certification evidence
- hosted `https://musu.pro` P2P relay lease storage, relay payload transport,
  and owner-scoped release-grade relay route evidence

