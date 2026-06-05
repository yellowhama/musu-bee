# MUSU 1.15.0-rc.1 Post MSIX Tauri Desktop Shell CPU Matrix Refresh

Recorded: 2026-06-05 KST  
Machine: HUGH_SECOND  
Commit: `27d5a4eb1e5d677080bff8cb7fa8303b6729906f`

## Scope

After fixing the MSIX desktop shell build path to use the Tauri CLI, fresh
current-HEAD CPU evidence was captured for the packaged WindowsApps runtime and
installed MUSU Desktop. This refresh keeps the idle/busy-loop gate tied to the
actual installed app rather than a repo/debug runtime.

## Full Runtime CPU Matrix

Evidence:
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-173714-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Verification:
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-173714-HUGH_SECOND.verification.json`

Result:

- `ok=true`, `fail_count=0`
- `git_dirty=false`
- runtime executable:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- release identity: `true`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- local route probe succeeded with task
  `bad8d3a6-adeb-4918-96ec-0152860633fc`
- max role CPU:
  - startup-open: MUSU `0%`, Node `0%`, WebView2 `0.05%`
  - runtime-started: MUSU `0%`, Node `0%`, WebView2 `0.16%`
  - dashboard-open: MUSU `0%`, Node `0%`, WebView2 `0.05%`
  - desktop-open: MUSU `0%`, Node `0%`, WebView2 `0.05%`
  - post-route: MUSU `0%`, Node `0%`, WebView2 `0.13%`
- owned process count: `8`
- owned WebView2 count: `6`
- hot process count: `0`

## Targeted HUGH-MAIN Route Attempt

Evidence:
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-174318-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Verification:
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-174318-HUGH_SECOND.target-route.verification.json`

Result:

- `ok=true`, `fail_count=0`
- target: `HUGH-MAIN`
- route attempt failed as allowed because the cleaned packaged runtime peer list
  did not contain `HUGH-MAIN`
- post-route sample remained under budget:
  - MUSU `1.69%`
  - Node `0%`
  - WebView2 `2.76%`
  - hot process count `0`

This satisfies the current targeted post-route CPU-attempt evidence shape for
HUGH_SECOND. It does not replace real second-PC multi-device evidence because no
HUGH-MAIN peer was registered in the cleaned packaged runtime state.

## Release Status

This refresh restores current primary-machine runtime CPU scenario evidence
after the MSIX Tauri desktop shell fix. Public release remains No-Go until the
remaining external and second-machine gates are satisfied: real multi-device
route evidence, second-PC CPU/matrix evidence, hosted `musu.pro` P2P
control-plane proof, support mailbox proof, and Store/Partner Center evidence.
