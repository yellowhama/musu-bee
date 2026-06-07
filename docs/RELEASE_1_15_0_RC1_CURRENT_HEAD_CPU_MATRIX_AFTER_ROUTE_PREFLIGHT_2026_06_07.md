# MUSU 1.15.0-rc.1 Current-Head CPU Matrix After Route Preflight

Date: 2026-06-07 17:56 KST

## Scope

This records the current clean-head HUGH_SECOND runtime CPU matrix after the
second-PC route preflight helper and late SaaS/AG-UI source recheck.

It answers one narrow question:

Can the current installed MUSU Desktop/runtime stay under the one-machine idle
CPU/resource budget across startup-open, runtime-started, dashboard-open,
desktop-open, and post-route sampling?

Answer: yes for this one machine. This is not successful multi-device proof.

## Evidence

Matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-174550-HUGH_SECOND.current-head-after-route-preflight.runtime-cpu-scenario-matrix.json`

Verifier:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-174550-HUGH_SECOND.current-head-after-route-preflight.runtime-cpu-scenario-matrix.verification.json`

Raw capture source:

- `.local-build\runtime-cpu-scenarios\20260607-174550-HUGH_SECOND\20260607-174550-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Capture Summary

- schema: `musu.runtime_cpu_scenario_matrix.v1`
- version: `1.15.0-rc.1`
- commit: `26ae15a853837cfbbbf19d6e72eb0bf9facaa1fc`
- git dirty during capture: `false`
- operator machine: `HUGH_SECOND`
- executable: `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- release identity: `true`
- sample seconds: `60`
- verifier: `ok=true`, `fail_count=0`, `267` checks
- verifier mode: `-AllowFailedPostRouteProbe`

| Scenario | Seconds | MUSU one-core CPU | Node one-core CPU | WebView2 one-core CPU | Hot processes | Owned processes | Working set |
|---|---:|---:|---:|---:|---:|---:|---:|
| startup-open | 60.03 | 0 | 0 | 0.05 | 0 | 8 | 370.44MB |
| runtime-started | 60.03 | 0 | 0 | 0.05 | 0 | 8 | 370.44MB |
| dashboard-open | 60.03 | 0 | 0 | 0.08 | 0 | 8 | 370.43MB |
| desktop-open | 60.03 | 0 | 0 | 0.05 | 0 | 8 | 370.43MB |
| post-route | 60.03 | 0 | 0 | 0.10 | 0 | 8 | 370.46MB |

Resource result:

- all roles stayed below the `<=5%` one-core CPU budget;
- hot process count stayed `0`;
- owned process count stayed `8` under the budget of `16`;
- owned WebView2 helper count stayed `6` under the budget of `8`;
- working set stayed below `1024MB`.

## Route Probe Result

The post-route probe targeted `PRIMARY-PC`:

```text
musu route --target PRIMARY-PC --wait-timeout-sec 180 --wait "Reply exactly: MUSU_CPU_SCENARIO_ROUTE_OK_20260607_174550"
```

Result:

- `ok=false`
- `failure_allowed=true`
- exit code: `1`
- output:
  `Error: peer 'PRIMARY-PC' not found. Use: musu peer add --addr <ip:port> --name PRIMARY-PC`

Interpretation:

- the CPU matrix is valid failed-route-allowed target-route diagnostic evidence;
- it is not successful second-PC route proof;
- before the next physical second-PC run, use
  `scripts\windows\test-second-pc-route-preflight.ps1` to add/list/explain the
  peer first.

## Loop And Polling Audit

Rust background-loop contract audit:

- `ok=true`
- `fail_count=0`
- `unaudited_loop_hit_count=0`
- `unaudited_spawn_hit_count=0`
- `telemetry_flush_primitive_hit_count=0`
- `filesystem_watcher_primitive_hit_count=0`
- `network_watcher_primitive_hit_count=0`

Frontend polling contract audit:

- `ok=true`
- `fail_count=0`
- low-duty polling call sites: `29`
- expected low-duty polling call sites: `29`
- missing low-duty polling call sites: `0`
- unexpected low-duty polling call sites: `0`
- direct interval hits: `0`
- direct visibility listener hits: `0`

Qualitative audit:

- No high or medium issue found in the measured runtime-loop/polling contract
  surface.
- No source code changed in this step; only evidence and documentation were
  promoted.
- Remaining CPU risk is not one-machine idle behavior on HUGH_SECOND; it is
  second-machine and two-machine post-route evidence that still has to be
  captured after peer registration succeeds.

## Release Meaning

This closes no public-release gate by itself.

It keeps one-machine current-head runtime CPU evidence healthy, but public
release remains No-Go until all of the following pass:

- successful second-PC route evidence;
- second-machine idle CPU and five-scenario CPU matrix;
- live MUSU.PRO owner-scoped P2P route metadata;
- release `quic_relay_tunnel` runtime byte path;
- relay transport proof and payload delivery proof;
- support mailbox proof;
- Microsoft Store / Partner Center proof.
