# MUSU 1.15.0-rc.1 CLI Pipe and Public Site Deploy Audit

**Wiki ID**: wiki/534
**Date**: 2026-06-02
**Scope**: follow-up audit after the observed `musu up --json | ConvertFrom-Json` hang, the operator's question about deploying the public scroll/logo/accent fix to `musu.pro`, and the current release hardening roadmap.

## Verdict

MUSU is still **No-Go for public desktop release**.

The important change is narrower: the primary Windows CLI path no longer reproduces the pipe-handle hang when `musu up --json` spawns a fresh long-lived bridge from the debug binary. The public website scroll/logo/accent fix is also already live on `https://musu.pro` and verified across the public routes.

Current qualitative state:

| Area | Status | Qualitative score | Notes |
| --- | --- | ---: | --- |
| Single-machine Windows beta | usable | 92% | Fresh MSIX primary evidence and packaged desktop single-instance evidence pass. |
| CLI startup/operator path | hardened on primary debug binary | 88% | Direct pipe hang fixed in source and verified once; next proof should be installed MSIX CLI evidence. |
| Public website | deployed and verified | 100% for current scroll/logo/accent scope | Live `musu.pro` QA passed on `/`, `/landing`, `/pricing`, and `/install` across desktop/mobile. |
| Runtime hardening | improving, not complete | 75% on primary / 55% cross-machine | Primary CPU/process evidence is clean; second-PC CPU/matrix evidence remains missing. |
| Hosted P2P control plane | wired but blocked | 45% | Registry/rendezvous/relay lease policy exists, but production owner-scoped relay lease evidence still fails until `musu.pro` auth/env is configured and verified. |
| Public desktop release | blocked | 70% | Remaining blockers are second-PC CPU/matrix, release-grade multi-device route proof, live P2P control-plane auth, `musu@musu.pro`, and Store evidence. |

## What Changed

`musu-rs/src/install/cli_commands.rs` now hardens Windows bridge spawn from `musu up`:

- bridge stdout/stderr are still redirected to `~/.musu/logs/bridge.log`
- before spawning the bridge, the short-lived parent clears inheritance on its standard handles
- the child process uses `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW`

This addresses the observed failure mode where PowerShell already received the JSON output from `musu up`, but `ConvertFrom-Json` never completed because the detached `musu.exe bridge` child kept the caller's stdout pipe open.

## Product Spec Update

Windows `musu up --json` is now treated as a public operator path, not only a smoke-test helper. The product contract is:

- `musu up --json` must emit finite JSON and return, even when it has to spawn a long-lived bridge.
- The long-lived bridge must not inherit the caller's stdin/stdout/stderr pipe handles.
- Bridge runtime logs belong in the MUSU log file, not in the caller's structured-output pipe.
- Tauri shell code may still use timeout-bounded temp-file capture for UI safety, but the CLI itself must also be safe for ordinary PowerShell pipelines.

Public website deployment contract:

- `musu-bee/**` changes pushed to `main` deploy to Vercel production for `https://musu.pro`.
- `.github/workflows/deploy-musu-bee.yml` also supports manual `workflow_dispatch` for forced redeploy/cache refresh.
- The scroll/logo/accent change is already production-verified; the remaining `musu.pro` release task is P2P control-plane auth/env, not another web UI deploy.

## Code Audit

Finding: `musu up --json | ConvertFrom-Json` could hang after the parent CLI exited because a freshly spawned bridge inherited the caller's stdout pipe.

Impact:

- CI/smoke wrappers already avoided this through temp-file capture, but real operators can still pipe JSON directly.
- A hung pipe looks like a CLI/runtime freeze even when bridge health is `ok`.
- It can also leave an extra debug bridge alive if the user kills only the waiting shell.

Fix rationale:

- Clearing handle inheritance targets the exact Windows pipe lifetime issue without changing JSON shape or bridge health behavior.
- `DETACHED_PROCESS` better matches the intended lifecycle: the bridge is independent of the short-lived `musu up` parent.
- `CREATE_NEW_PROCESS_GROUP` and `CREATE_NO_WINDOW` are preserved.

Residual risk:

- The follow-up packaged WindowsApps alias proof now passes from a fresh MSIX,
  so this is no longer only a debug-binary fix.
- The fix clears inheritance on standard handles. If a future caller injects other unrelated inheritable handles, this specific code path does not enumerate all process handles. That is acceptable for the observed stdout-pipe hang but should stay on the hardening watchlist.
- `HUGH_SECOND` still has a developer PATH shadow where
  `C:\Users\empty\.cargo\bin\musu.exe` resolves before the WindowsApps alias.
  The packaged proof therefore uses the explicit WindowsApps path.

## Verification

Commands that passed:

```powershell
cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
cargo fmt --manifest-path .\musu-rs\Cargo.toml --check
git diff --check
```

Fresh pipe reproduction command passed and returned instead of hanging:

```powershell
.\musu-rs\target\debug\musu.exe up --json --timeout-sec 10 |
  ConvertFrom-Json |
  Select-Object ok,bridge_started,bridge_pid,
    @{Name='bridge_status';Expression={$_.bridge.status}},
    @{Name='bridge_url';Expression={$_.bridge.local_url}},
    @{Name='dashboard_status';Expression={$_.dashboard.status}} |
  ConvertTo-Json -Depth 5
```

Result:

```json
{
  "ok": true,
  "bridge_started": true,
  "bridge_pid": 37284,
  "bridge_status": "ok",
  "bridge_url": "http://127.0.0.1:5692",
  "dashboard_status": "warn"
}
```

The debug bridge PID `37284` was stopped after the test; only the installed desktop shell was left running.

Live public-site QA also passed against `https://musu.pro`:

- routes: `/`, `/landing`, `/pricing`, `/install`
- viewports: desktop `1280x720`, mobile `390x844`
- checks: actual scroll movement, no horizontal overflow, `.musu-public-scroll-root`, favicon-header logo source, `--musu-color-brand-emerald=#24C8DB`, and visible `data-brand-accent="emerald"`

Clean go/no-go after committing this source change:

- commit state: clean post-commit HEAD
- `ready_for_public_desktop_release=false`
- `manifest_dirty=false`
- `local_artifacts_ready=true`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `desktop_single_instance_verified=true`
- `startup_single_instance_verified=true`
- `process_ownership_verified=true`
- `single_machine_verified=false`
- `runtime_idle_cpu_valid_machine_count=0`
- `runtime_cpu_scenario_matrix_valid_machine_count=0`
- `p2p_control_plane_verified=false`
- `support_mailbox_verified=false`
- `store_release_verified=false`

Interpretation: this old clean go/no-go was the expected source-freshness
reset immediately after the Rust fix. It has now been followed by fresh MSIX
packaged CLI/runtime evidence in wiki/535.

## 2026-06-02 03:48 KST Follow-Up

Fresh MSIX build/install completed after this audit. The installed package
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6` now has release evidence for the
same pipe class through the packaged WindowsApps alias:

- evidence:
  `docs\evidence\cli-pipe\1.15.0-rc.1\20260602-032728-HUGH_SECOND.packaged-cli-pipe.evidence.json`
- result: `ok=true`, `returned_without_hang=true`, duration `7544ms`
- bridge status: `ok`
- dashboard status: `warn`

Primary runtime evidence was also refreshed:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-033029-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-033145-HUGH_SECOND.desktop-single-instance.json`
- startup single-instance:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260602-033225-HUGH_SECOND.startup-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-033257-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-033412-HUGH_SECOND.desktop-open.evidence.json`
- four-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-033636-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Current primary CPU: `60.071s`, hot process count `0`, max one-core CPU
`musu=0`, `node=0`, `webview2=0.23`, working set `445.87MB`. Matrix route
token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_033636`.

Live `musu.pro` P2P evidence was re-recorded at
`docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-034756-musu.pro.evidence.json`.
It still fails release verification because relay lease query returns
`p2p_control_auth_not_configured` with `accepted_auth_modes=[]`.

## Next Steps

1. Configure production `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent scoped auth on `musu.pro`, run the Vercel production deploy/reload path, then record passing P2P control-plane evidence without `-AllowUnverified`.
2. Capture second-PC desktop-open CPU and runtime CPU scenario matrix evidence from the fresh package.
3. Capture release-grade multi-device route evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Store evidence.
4. Rerun `write-release-go-no-go.ps1` and `complete-final-operator-gates.ps1` only after those evidence records exist.
