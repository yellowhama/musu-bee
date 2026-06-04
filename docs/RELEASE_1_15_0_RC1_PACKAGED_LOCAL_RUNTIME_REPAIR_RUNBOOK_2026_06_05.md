# Release 1.15.0-rc.1 Packaged Local Runtime Repair Runbook

Date: 2026-06-05T04:40+09:00

## Decision

The release handoff now includes an explicit packaged local runtime repair
script for machines where localhost/process/startup evidence is backed by a
workspace/debug runtime.

The product boundary remains:

- local MUSU programs execute work on each device
- `musu.pro` accepts authenticated remote input and coordinates rooms,
  rendezvous, path selection, relay fallback, and evidence
- `localhost` is a same-machine local surface, not internet
- a browser dashboard on port 3001 is separate from the installed packaged
  local runtime bridge

## New Script

`scripts\windows\repair-packaged-local-runtime-state.ps1` writes
`musu.packaged_local_runtime_repair.v1` evidence under
`.local-build\packaged-runtime-repair\`.

Default flow:

1. Run `audit-musu-process-ownership.ps1` and save before evidence.
2. Resolve the exact WindowsApps alias:
   `C:\Users\<user>\AppData\Local\Microsoft\WindowsApps\musu.exe`.
3. Run packaged `musu down --json --timeout-sec <n> --include-desktop`.
4. If `-StopRepoOrphanHelpers` is supplied, terminate only the repo/workspace
   orphan Node.js/WebView2 helpers already identified by the before audit.
5. Run packaged `musu up --json` unless `-SkipPackagedStart` is supplied.
6. Run `audit-musu-process-ownership.ps1` again and save after evidence.

`-StopRepoOrphanHelpers` is intentionally explicit because it can terminate a
developer workspace dashboard such as `next start -p 3001`.

## Operator Command

Use this during release evidence runs when process ownership or startup
single-instance is blocked by workspace/debug runtime identity:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\repair-packaged-local-runtime-state.ps1 -StopRepoOrphanHelpers -FailOnProblem -Json
```

Then record:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-process-ownership.ps1 -FailOnProblem -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-musu-startup-single-instance.ps1 -RepeatCount 3 -FailOnProblem -Json
```

## Live Validation

The first diagnostic run, without `-StopRepoOrphanHelpers`, correctly failed:

- `before_repo_orphan_helper_count=1`
- `after_repo_orphan_helper_count=1`
- packaged `musu down --include-desktop` stopped debug bridge PID `42236`
- remaining blocker was workspace Next helper PID `2812`

The release repair run with `-StopRepoOrphanHelpers` passed:

- schema: `musu.packaged_local_runtime_repair.v1`
- `ok=true`
- stopped repo orphan helper PID `2812`
- packaged `musu up --json` started bridge PID `23860`
- bridge local URL: `http://127.0.0.1:7555`
- `before_ok=false`
- `after_ok=true`
- `before_repo_orphan_helper_count=1`
- `after_repo_orphan_helper_count=0`
- `fail_count=0`

Follow-up audits passed:

- process ownership:
  - `ok=true`
  - `fail_count=0`
  - `bridge_pid=23860`
  - `bridge_pid_packaged_runtime=true`
  - `non_packaged_runtime=0`
  - `orphan_repo_helpers=0`
- startup single-instance:
  - `ok=true`
  - `fail_count=0`
  - `musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
  - `observed_bridge_pid_count=1`
  - `repeated_spawn_count=0`
  - nested process ownership `ok=true`

`http://127.0.0.1:3001/app` returned connection refused after the repair. That
is expected in this repaired state because the repo/workspace Next dashboard was
stopped. The installed packaged local runtime bridge is healthy separately at
`http://127.0.0.1:7555`.

Script validation passed:

- PowerShell parser for `repair-packaged-local-runtime-state.ps1`
- PowerShell parser for handoff/packet/readiness/freshness verifier scripts
- `git diff --check` completed without whitespace errors; it emitted only CRLF
  normalization warnings for existing docs
- release evidence verifier regression:
  - `ok=true`
  - `case_count=29`
  - `failed_case_count=0`
- dirty-tree go/no-go after repair:
  - `process_ownership_verified=true`
  - `startup_single_instance_verified=true`
  - `single_machine_verified=true`
  - `process_ownership_evidence.valid_machine_count=1`
  - `startup_single_instance_evidence.valid_machine_count=1`
  - remaining blockers are second-PC CPU/matrix/multi-device, support mailbox,
    Store release, hosted P2P, and dirty git
- final handoff after repair no longer lists process/startup operator steps

## Release Implication

This adds an operational repair path for the packaged runtime identity gate. It
does not complete the public release by itself.

Public release remains No-Go until:

- current clean-source process/startup evidence is recorded after this commit,
- two-machine idle CPU and runtime matrix evidence pass,
- current-build second-PC multi-device evidence is recorded,
- hosted `musu.pro` P2P control-plane evidence passes,
- support mailbox evidence is recorded, and
- Store evidence is recorded.
