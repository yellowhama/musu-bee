# 1.15.0-rc.1 Polling Interval Clamp and Primary Evidence

**Date**: 2026-06-03 04:01 KST  
**Wiki ID**: wiki/583  
**Scope**: frontend busy-loop hardening, fresh packaged primary evidence, current go/no-go

## Change

`musu-bee/src/lib/useLowDutyPolling.ts` now clamps shared low-duty polling to
a minimum visible interval:

- `MIN_LOW_DUTY_POLL_INTERVAL_MS = 5_000`
- `LOW_DUTY_HIDDEN_BACKOFF_MULTIPLIER = 4`
- `effectiveIntervalMs = Math.max(intervalMs, MIN_LOW_DUTY_POLL_INTERVAL_MS)`
- `effectiveMaxBackoffMs = Math.max(maxBackoffMs, effectiveIntervalMs)`
- visibility event binding is guarded with `typeof document !== "undefined"`

This extends the previous default timeout hardening. The shared poller now has
both a default task timeout and a minimum scheduling floor, so a future caller
cannot accidentally create a sub-second frontend refetch loop through this hook.

## Validation

Passed:

- `npx tsx --test src/app/runtime-polling-contract.test.ts` - 11/11
- `npm run test:runtime-polling` - 11/11
- `npm run typecheck`
- `npm run build`
- `npm run lint` - 0 errors, 74 existing warnings
- `git diff --check`

## MSIX Rebuild and Install

The local-sideload MSIX was rebuilt and replaced after the polling clamp:

- source commit: `3c6cf213cc24a468e34120d4fc288909d76bfb6e`
- smoke/evidence commit: `fad519c509d784453f938a79df28b02fff497c10`
- primary evidence commit: `d547a38c`
- package: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Package build, startup smoke, install, installed package verification, and
packaged runtime identity verification passed.

The current development machine still has a local alias shadowing conflict:

- `C:\Users\empty\.cargo\bin\musu.exe` appears before
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

This is why `write-release-go-no-go.ps1` still reports the
`runtime-package` blocker even though the installed MSIX package verifies. The
evidence runs explicitly used the WindowsApps alias where needed.

## Evidence

Single-machine smoke:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-035325-HUGH_SECOND.evidence.json`
- dashboard task: `69c7b961-ace3-4c1f-92fc-2e1a6667e1e7`
- bridge: `http://127.0.0.1:7979`
- CLI route checked: `true`

Desktop single-instance:

- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-035450-HUGH_SECOND.desktop-single-instance.json`
- `ok=true`
- `git_dirty=false`
- final desktop shell count: `1`
- repeated activation count: `3`

Process ownership:

- `docs\evidence\process-ownership\1.15.0-rc.1\20260603-035436-HUGH_SECOND.process-ownership.json`
- `ok=true`
- MUSU runtime: `1`
- desktop shell: `1`
- MUSU-owned Node: `0`
- MUSU-owned WebView2: `6`
- machine-wide Node: `18`
- machine-wide WebView2: `12`
- orphan repo helpers: `0`

Desktop-open CPU:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-035458-HUGH_SECOND.desktop-open.evidence.json`
- `ok=true`
- sample: `60.07s`
- max one-core CPU: MUSU `0`, Node `0.03`, WebView2 `0.6`
- working set: `500.44MB`
- hot processes: `0`

Runtime CPU scenario matrix:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-035608-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier: `ok=true`, `fail_count=0`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_035608`
- scenarios: `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`
- max one-core CPU by scenario:
  - runtime-started: MUSU `0`, Node `0.03`, WebView2 `0.13`
  - dashboard-open: MUSU `0`, Node `0.05`, WebView2 `0.16`
  - desktop-open: MUSU `0`, Node `0.03`, WebView2 `0.26`
  - post-route: MUSU `0`, Node `0.03`, WebView2 `0.26`
- hot processes: `0` in every scenario

## Go/No-Go

Clean go/no-go after the evidence commit reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=false`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- runtime idle CPU: `1/2 [HUGH_SECOND]`
- runtime CPU matrix: `1/2 [HUGH_SECOND]`
- process ownership: `true`
- startup single-instance: `true`
- desktop single-instance: `true`
- public metadata: `true`
- multi-device: `false`
- support mailbox: `false`
- Store release: `false`
- P2P control-plane: `false`

Remaining blockers:

- local dev alias shadowing keeps `runtime-package` false
- real second-PC multi-device evidence
- second-PC desktop-open CPU evidence
- second-PC four-state runtime CPU matrix evidence
- `musu@musu.pro` mailbox delivery evidence
- Partner Center/Store evidence
- live owner-scoped `musu.pro` P2P KV/Upstash relay lease evidence

## Qualitative Result

The primary machine still does not reproduce a MUSU-owned 20%-of-one-core busy
loop. Under the installed desktop path, MUSU-owned runtime CPU is essentially
idle and WebView2 remains below the 5% one-core release budget.

The product is still not public-release ready. The next high-value work is
second-PC evidence and `musu.pro` KV/Upstash owner-scoped relay lease proof,
plus resolving the local PATH alias shadow before using this developer machine
as final Store install evidence.
