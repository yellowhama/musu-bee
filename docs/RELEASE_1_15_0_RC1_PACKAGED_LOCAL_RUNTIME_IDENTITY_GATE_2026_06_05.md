# Release 1.15.0-rc.1 Packaged Local Runtime Identity Gate

Date: 2026-06-05T04:25+09:00

## Decision

The release process now treats `localhost` as a local same-machine surface only
when it is backed by the installed packaged MUSU runtime.

This preserves the product boundary:

- local MUSU programs execute work on each device
- `musu.pro` accepts authenticated remote input, room events, rendezvous,
  path-selection, fallback-relay coordination, and evidence
- `localhost` is a same-machine operator/developer URL, not cloud dashboard
  access
- web-assisted rendezvous can bootstrap P2P mesh, but the local runtime still
  owns execution

## Root Cause

The operator observed `ERR_CONNECTION_REFUSED` and confusion around
`localhost`.

`localhost` itself is not the internet. It is the local loopback interface.
The confusing state was that existing release audits could still pass while a
workspace/debug runtime or workspace Next server was backing the local
dashboard/bridge boundary. That made it too easy to treat a developer process
as the installed local program.

## Gate Change

`audit-musu-process-ownership.ps1` now records command lines and packaged
runtime identity. The default release audit fails if:

- any MUSU runtime process is not from the packaged WindowsApps runtime,
- the bridge registry PID does not point at the packaged WindowsApps runtime,
- the dashboard listener is a repo/workspace-backed Next server,
- repo-related orphan Node/WebView2 helpers are present, or
- desktop shell processes are not packaged WindowsApps runtime processes.

`-AllowDeveloperRuntime` is available only for diagnostic developer runs.

`audit-musu-startup-single-instance.ps1` now defaults to the WindowsApps
`musu.exe` app execution alias instead of `musu-rs\target\debug\musu.exe`.
It embeds the same packaged runtime identity process-ownership audit after
repeated startup.

`write-release-go-no-go.ps1` now rejects process/startup evidence that does not
prove packaged runtime identity, so older debug-backed evidence cannot close
the release gates.

## Validation

Passed:

- PowerShell parser for `audit-musu-process-ownership.ps1`
- PowerShell parser for `audit-musu-startup-single-instance.ps1`
- PowerShell parser for `write-release-go-no-go.ps1`
- PowerShell parser for `verify-single-machine-evidence.ps1`
- PowerShell parser for `verify-runtime-cpu-scenario-matrix.ps1`
- PowerShell parser for `prepare-final-operator-gate-packet.ps1`
- `http://127.0.0.1:3001/app` returned HTTP 200 on the current machine
- release evidence verifier regression:
  - `ok=true`
  - `case_count=29`
  - `failed_case_count=0`
- `git diff --check` completed without whitespace errors; it emitted only CRLF
  normalization warnings for existing docs

Current live-state audit intentionally fails because HUGH_SECOND is currently
running a workspace/debug bridge and workspace Next dashboard:

- process ownership `ok=false`
- failed checks include `release runtime identity`, `orphan repo helper count`,
  `bridge registry runtime identity`, and `dashboard server identity`
- bridge registry PID points at
  `F:\workspace\musu-bee\musu-rs\target\debug\musu.exe`
- dashboard listener PID points at the workspace `next start -p 3001` command

Startup single-instance audit now uses:

- `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

The startup audit also intentionally fails in the current live state because
the nested process ownership audit sees the same debug bridge/workspace
dashboard leak.

Dirty-tree go/no-go summary after this gate change:

- `ready_for_public_desktop_release=false`
- `single_machine_verified=true`
- `process_ownership_verified=false`
- `startup_single_instance_verified=false`
- `process_ownership_evidence.valid_machine_count=0`
- `startup_single_instance_evidence.valid_machine_count=0`
- `manifest_git.dirty=true`

## Release Implication

This is gate/source and roadmap hardening. It does not remove localhost from
the local product; it makes localhost evidence stricter.

Public release remains No-Go until:

- fresh packaged local runtime identity evidence passes,
- current-build second-PC multi-device evidence is recorded,
- two-machine idle CPU and runtime matrix evidence pass,
- hosted `musu.pro` P2P control-plane evidence passes,
- support mailbox evidence is recorded, and
- Store evidence is recorded.
