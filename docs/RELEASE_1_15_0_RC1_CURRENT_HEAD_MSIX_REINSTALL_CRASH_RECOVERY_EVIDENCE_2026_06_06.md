# MUSU 1.15.0-rc.1 Current HEAD MSIX Reinstall and Crash-Recovery Evidence

**Wiki ID**: wiki/871
**Generated**: 2026-06-06 20:13 KST
**Evidence HEAD**: `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2`
**Machine**: `HUGH_SECOND`

## Summary

Current HEAD was rebuilt as a release MSIX, reinstalled on `HUGH_SECOND`, and
rechecked as MUSU Desktop. This closes the earlier ambiguity where the
installed package did not yet expose the new crash-recovery fields.

The local packaged runtime now proves:

- installed package `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- `musu up --json` exposes `stale_bridge_registry_removed`
- dynamic stale bridge registry cleanup removes a dead PID record before bridge
  startup
- crash-recovery audit passes with `ok=true` and `fail_count=0`
- single-machine packaged smoke passes as `local-bridge-only`
- canonical desktop-open idle CPU evidence passes with hot process count `0`
- process ownership, Rust background loop, and frontend polling audits pass

Public desktop release is still No-Go because this is still one-machine local
proof. It does not prove a successful second-PC route, a current full
post-route CPU matrix, live MUSU.PRO runtime login/storage, or release
`quic_relay_tunnel` transport and payload delivery proof.

## Product Boundary

This evidence reinforces the current product split:

- MUSU Desktop is the local executor and resource owner.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback coordination, and evidence/control
  plane.
- `localhost:3001` is not the packaged runtime contract.
- A refused developer dashboard port is not evidence that the desktop runtime
  failed.

The packaged one-machine path is bridge-only when the installed runtime reports
`dashboard.required=false`.

## Rebuild and Install Evidence

Command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting
```

Result:

- release Rust runtime build passed
- Tauri shell build passed
- MSIX package/sign passed
- packaged startup smoke passed
- sideload readiness passed
- package install passed
- installed package contract passed
- runtime identity check passed
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Operator note: this Codex shell has stale current-process `PATH` ordering and
resolves `C:\Users\empty\.cargo\bin\musu.exe` before WindowsApps. Persisted
User/Machine PATH is clean. Release commands in this session therefore used the
explicit packaged alias:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe"
```

## Crash-Recovery Evidence

Installed runtime smoke:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" up --json
```

Observed contract fields:

- `stale_bridge_registry_removed`
- `stale_bridge_registry_pid`
- bridge HTTP endpoint `http://127.0.0.1:3678`

Dynamic stale registry simulation:

- stopped the bridge
- wrote `~\.musu\services\bridge.json` with dead PID `999999`
- used the actual registry schema:
  - `name`
  - `addr`
  - `pid`
  - integer `started_at`
  - `transport="tcp"`
- reran packaged `musu up --json`

Result:

- `ok=true`
- `stale_bridge_registry_removed=true`
- `stale_bridge_registry_pid=999999`
- `bridge_started=true`
- new bridge PID `40132`
- bridge health HTTP `200`

Audit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-crash-recovery-contract.ps1 -Json
```

Result:

- `ok=true`
- `fail_count=0`
- commit `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2`

## Single-Machine Evidence

Smoke command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\smoke-single-machine-beta.ps1
```

Result:

- `ok=true`
- single-machine surface `local-bridge-only`
- dashboard required `false`
- bridge `http://127.0.0.1:3678`
- CLI route checked `true`

Canonical recorded evidence:

- `docs\evidence\single-machine\1.15.0-rc.1\20260606-195631-HUGH_SECOND.evidence.json`
- `docs\evidence\single-machine\1.15.0-rc.1\20260606-195631-HUGH_SECOND.verification.json`
- `docs\evidence\single-machine\1.15.0-rc.1\20260606-195631-HUGH_SECOND.summary.md`

## Idle CPU Evidence

Canonical command:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -OutputPath docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-200405-HUGH_SECOND.desktop-open.evidence.json -Json
```

Result:

- `ok=true`
- `git_dirty=false`
- sample `60.049s`
- hot process count `0`
- MUSU max one-core CPU `0`
- Node max one-core CPU `0`
- WebView2 max one-core CPU `0.08`
- `bridge_runtime=1`
- `desktop_shell=1`
- `node_helper=0`
- `webview2_helper=6`
- working set `178 MB`

Canonical recorded evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-200405-HUGH_SECOND.desktop-open.evidence.json`

## Additional Audit Evidence

Process ownership:

- `ok=true`
- `fail_count=0`
- evidence `.local-build\process-ownership\musu-process-ownership-20260606-193436.json`
- packaged runtime `1`
- desktop shell `0` at that audit instant
- owned Node helpers `0`
- owned WebView2 helpers `0`
- bridge registry PID `40132` alive and packaged
- bridge health HTTP `200`

Rust background-loop contract:

- `ok=true`
- `fail_count=0`
- unaudited loops/spawns `0`

Frontend polling contract:

- `ok=true`
- `fail_count=0`
- low-duty call-site count `29`
- direct interval hits `0`
- direct visibility listener hits `0`

Four-state runtime CPU diagnostic after reinstall:

- path:
  `.local-build\runtime-cpu-scenarios\20260606-193453-HUGH_SECOND\20260606-193453-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `ok=true`
- `git_dirty=false`
- `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`
- hot process count `0` in all four states
- highest WebView2 max one-core CPU `0.68`
- working set around `358 MB`

This four-state matrix is diagnostic only for full release purposes because it
does not include `post-route`.

## Test Evidence

Scoped Rust crash-recovery unit test:

```powershell
cargo test cleanup_stale --package musu-rs --lib
```

Result:

- 2 passed
- 0 failed

Broader filtered `cargo test cleanup_stale --package musu-rs` built and ran the
relevant library/main tests, but the command as a whole attempted to launch a
filtered-out integration test binary that requires elevation on Windows and
failed with `os error 740`. The scoped library command above is the clean
recorded test.

## Go/No-Go Status

Current local evidence status after the new canonical files:

- local artifacts ready: true
- single-machine verified: true
- MSIX install verified: true
- public metadata OK: true
- crash-recovery contract verified: true
- runtime idle CPU valid machine count: `1`
- runtime CPU scenario matrix valid machine count: `0`
- multi-device verified: false
- public desktop release ready: false

The matrix count is expected to remain `0` for this evidence set because the
current reinstall matrix did not include `post-route`.

## Qualitative Audit

No high or medium code issue was found in the current local runtime evidence
path.

Low/residual risks:

- the active Codex process has stale PATH ordering, so release commands must
  keep using the explicit WindowsApps alias until a fresh shell inherits the
  fixed persisted PATH
- current evidence is still one-machine only
- the current post-reinstall matrix lacks `post-route`, so it cannot replace a
  full release matrix
- live MUSU.PRO runtime login/storage and release relay tunnel proof are still
  absent
- support mailbox and Microsoft Store proof remain external blockers

## Next Decision

Do not treat `localhost:3001` as the blocker. The next release-relevant work is:

1. install the same current build on a second Windows PC
2. produce successful route evidence between the two local programs
3. run second-PC idle CPU and full runtime matrix including `post-route`
4. log the packaged runtime into MUSU.PRO and record owner-scoped live P2P
   evidence
5. wire and prove release `quic_relay_tunnel` transport and payload delivery
6. record support mailbox and Store evidence
