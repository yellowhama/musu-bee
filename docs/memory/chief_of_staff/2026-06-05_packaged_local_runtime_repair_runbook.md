# Chief of Staff Memory: Packaged Local Runtime Repair Runbook

Date: 2026-06-05T04:40+09:00

Decision:

- Added `scripts\windows\repair-packaged-local-runtime-state.ps1`.
- The script records before/after process ownership evidence, runs packaged
  WindowsApps `musu down --include-desktop`, optionally stops repo/workspace
  orphan helpers with explicit `-StopRepoOrphanHelpers`, starts packaged
  `musu up --json`, and verifies process ownership again.
- Final handoff now suggests this repair step when process ownership or startup
  single-instance gates are blocked.

Live validation:

- Diagnostic run without `-StopRepoOrphanHelpers` stopped debug bridge PID
  `42236` but left workspace Next helper PID `2812`, so `ok=false`.
- Release repair run with `-StopRepoOrphanHelpers` stopped PID `2812`, started
  packaged bridge PID `23860`, and returned `ok=true`.
- Process ownership audit then passed with `bridge_pid_packaged_runtime=true`,
  `non_packaged_runtime=0`, and `orphan_repo_helpers=0`.
- Startup single-instance audit then passed using
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`, one stable
  bridge PID, no repeated spawn, and nested process ownership `ok=true`.
- `127.0.0.1:3001/app` is now connection-refused because the workspace Next
  dashboard was intentionally stopped; the packaged local runtime bridge is
  healthy separately at `127.0.0.1:7555`.
- Parser checks passed for the new script and its handoff/packet/readiness
  integration points.
- Release evidence verifier regression passed with `ok=true`, `case_count=29`,
  and `failed_case_count=0`.
- Dirty go/no-go after repair reports `process_ownership_verified=true`,
  `startup_single_instance_verified=true`, `single_machine_verified=true`, and
  one valid machine for both process/startup gates.

Release status:

- This fixes the repair path for local packaged runtime identity.
- Public release remains No-Go on clean-source evidence refresh, second-PC
  evidence, two-machine CPU/matrix, hosted P2P, support mailbox, and Store
  evidence.
