# Chief of Staff Memory: Packaged Local Runtime Identity Gate

Date: 2026-06-05T04:25+09:00

Decision:

- Keep MUSU local-first: each installed local MUSU program executes work on its
  own device.
- Keep `musu.pro` as the authenticated web input, project/company room,
  rendezvous, path-selection, fallback relay coordination, and evidence plane.
- Treat `localhost` as a same-machine local UI/bridge surface, not internet or
  cloud dashboard access.
- Release evidence must prove that localhost/dashboard/bridge are backed by the
  packaged WindowsApps runtime, not a workspace/debug process.

Implementation:

- `audit-musu-process-ownership.ps1` now records command lines and packaged
  runtime identity.
- The process ownership audit fails release mode when a debug runtime, repo
  Next dashboard, or repo orphan helper backs the local surface.
- `audit-musu-startup-single-instance.ps1` defaults to the WindowsApps
  `musu.exe` app execution alias and embeds the strict process ownership audit.
- `write-release-go-no-go.ps1` rejects old evidence that lacks packaged runtime
  identity proof.

Current status:

- `http://127.0.0.1:3001/app` is reachable on HUGH_SECOND.
- Current live process ownership correctly fails because the bridge registry PID
  points at `musu-rs\target\debug\musu.exe` and port 3001 is served by a
  workspace `next start -p 3001`.
- Startup audit now uses
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`, then fails
  nested process ownership for the same live-state reason.
- Dirty-tree go/no-go now reports `process_ownership_verified=false`,
  `startup_single_instance_verified=false`, and `single_machine_verified=true`.
- Release evidence verifier regression passed with `ok=true`, `case_count=29`,
  and `failed_case_count=0`.
- This is the expected failure for the user's localhost confusion: the problem
  is not that localhost is internet, it is that release gates previously did
  not fail closed on debug/workspace runtime identity.
- Public release remains No-Go on packaged runtime identity refresh,
  current-build second-PC evidence, hosted P2P, support mailbox, and Store
  evidence.
