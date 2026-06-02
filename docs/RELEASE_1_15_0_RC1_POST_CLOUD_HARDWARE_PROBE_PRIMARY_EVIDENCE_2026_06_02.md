# MUSU 1.15.0-rc.1 Post Cloud Hardware Probe Primary Evidence

**Date**: 2026-06-02 21:45 KST  
**Source commit**: `9fff34aa1dda3eb58d5b105271f660a0c417efaf`  
**Scope**: fresh packaged primary evidence after cloud heartbeat hardware probe idle hardening.

## Build and Install

The `local-sideload-manual` MSIX was rebuilt and installed after the runtime
hardware probe source change.

- build command:
  `scripts\windows\build-msix.ps1 -StartupContract local-sideload-manual`
- runtime release build duration: `15m 50s`
- package:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

## Fresh Evidence

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-213655-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-213404-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-213412-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-213436-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-213706-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

## Result

Desktop activation and process ownership:

- repeated packaged desktop activation passed: final desktop shell count `1`
- process ownership passed with runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `6`, machine-wide Node `16`, orphan repo helpers `0`
- bridge `/health` returned HTTP 200 at `127.0.0.1:7644`
- installed runtime path:
  `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6\musu.exe`

Desktop-open CPU:

- sample duration: `60.064s`
- MUSU max one-core CPU: `0`
- Node max one-core CPU: `0`
- WebView2 max one-core CPU: `0.49`
- total owned working set: `363.18MB`
- hot process count: `0`

Single-machine smoke:

- dashboard task id: `151efc29-1bd4-4df4-925c-6b1c9d7a88e0`
- output token: `MUSU_RELEASE_SMOKE_OK_20260602_213633`
- bridge URL: `http://127.0.0.1:7644`
- CLI route checked: `true`

Runtime CPU scenario matrix:

- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_213706`
- verifier: `ok=true`, `fail_count=0`
- `runtime-started`: MUSU `0.03`, Node `0.03`, WebView2 `0.1`,
  working set `498.72MB`, hot `0`
- `dashboard-open`: MUSU `0.03`, Node `0.03`, WebView2 `0.1`,
  working set `502.44MB`, hot `0`
- `desktop-open`: MUSU `0`, Node `0.03`, WebView2 `0.16`,
  working set `502.58MB`, hot `0`
- `post-route`: MUSU `0`, Node `0`, WebView2 `0.31`,
  working set `502.57MB`, hot `0`

Cleanup:

- packaged `musu down --json --timeout-sec 5 --include-desktop` stopped bridge
  PID `32264` and desktop PID `34248`
- bridge registry was deregistered
- temporary dashboard process tree was stopped
- post-cleanup check found no MUSU runtime/desktop processes and port `3001`
  closed

## Qualitative Assessment

The primary Windows packaged path remains healthy after the cloud hardware
probe hardening. The operator-reported busy-loop is still not reproduced on
`HUGH_SECOND`; the latest desktop-open evidence shows no MUSU or Node CPU and
WebView2 below `0.5%` of one logical core.

This closes the evidence staleness created by commit `9fff34aa` on the primary
machine only. Public release remains No-Go because the gate still needs:

- second-PC runtime idle CPU evidence;
- second-PC runtime CPU matrix evidence;
- release-grade two-machine route evidence;
- live `musu.pro` P2P owner-scoped control-plane evidence;
- `musu@musu.pro` mailbox evidence;
- Store/Partner Center evidence.
