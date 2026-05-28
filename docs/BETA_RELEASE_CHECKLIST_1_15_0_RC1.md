# MUSU 1.15.0-rc.1 Beta Release Checklist

Date: 2026-05-29

## Release Target

`1.15.0-rc.1` is beta-ready when a fresh Windows operator can:

1. run `musu up`,
2. open the dashboard,
3. see doctor/readiness status as healthy,
4. delegate one local agent task,
5. observe the result from the dashboard task APIs.

## Must-Pass Smoke

Repeatable script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-single-machine-beta.ps1 `
  -DashboardBaseUrl http://127.0.0.1:3000
```

Manual equivalent:

```powershell
.\musu-rs\target\debug\musu.exe up --json
.\musu-rs\target\debug\musu.exe doctor --json
```

Expected:

- account token present or an actionable `musu login` next step
- bridge token present from `~\.musu\bridge.env`
- bridge `/health` returns `status=ok`
- dashboard reachable when running on the standard app port
- Windows alias shadowing is reported as a warning, not hidden

Dashboard API smoke:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/doctor
Invoke-RestMethod http://127.0.0.1:3001/api/device-status
Invoke-RestMethod http://127.0.0.1:3001/api/bridge-tasks?limit=5
```

Agent smoke:

```powershell
$body = @{
  instruction = "Reply exactly: MUSU_SMOKE_OK"
  channel = "dashboard-smoke"
  sender_id = "release-smoke"
  adapter_type = "claude"
  workspace_uri = "file:///F:/workspace/musu-bee"
} | ConvertTo-Json -Compress

$task = Invoke-RestMethod `
  -Uri http://127.0.0.1:3001/api/tasks/forward `
  -Method Post `
  -ContentType "application/json" `
  -Body $body

Invoke-RestMethod "http://127.0.0.1:3001/api/bridge/tasks/$($task.task_id)"
```

Expected terminal task state: `done`, `output=MUSU_SMOKE_OK`, `exit_code=0`.

SSE smoke:

```powershell
curl.exe -I --max-time 5 http://127.0.0.1:3001/api/bridge-tasks/events
```

Expected: `HTTP/1.1 200 OK` and `content-type: text/event-stream`.

## Current Verified Result

Verified locally against dashboards on `3001` and `3000`, and bridge on dynamic port `11041`:

- `musu up --json`: ok, used `~\.musu\bridge.env`, started/confirmed bridge
- `musu doctor --json`: warn only for PATH alias shadowing; account/bridge/dashboard/package ok
- dashboard `/api/doctor`: overall ok, bridge version `1.15.0-rc.1`
- dashboard `/api/device-status`: local node online, version `1.15.0-rc.1`
- `/api/bridge-tasks`: works after bridge restart, proving dynamic bridge URL resolution
- `/api/tasks/forward -> bridge -> claude -> /api/bridge/tasks/{id}`: done
- task id: `72ff5cff-f122-496b-ad6a-6d7e55711bf4`
- terminal output: `MUSU_SMOKE_OK`
- SSE route: 200 `text/event-stream`

Repeatable script smoke also passed on 2026-05-29:

- script: `scripts\windows\smoke-single-machine-beta.ps1`
- dashboard: `http://127.0.0.1:3000`
- dashboard task id: `2d9e93b1-fb2f-4cd4-ab40-1147fea89a6d`
- dashboard output: `MUSU_SCRIPT_SMOKE_OK`
- CLI route output: `MUSU_SCRIPT_CLI_OK`

Fresh repeatable script smoke passed again on 2026-05-29 06:52 KST:

- dashboard: `http://127.0.0.1:3000`
- bridge: `http://127.0.0.1:11041`
- dashboard task id: `b4b05b93-34d2-4946-b4cd-fdd5c5c6632d`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_0652`
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_0652`

Machine-readable single-machine evidence passed and was recorded on 2026-05-29 07:04 KST:

- evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260529-070403-HUGH_SECOND.evidence.json`
- verification: `docs\evidence\single-machine\1.15.0-rc.1\20260529-070403-HUGH_SECOND.verification.json`
- dashboard task id: `b772a958-ded9-4cb1-a180-98ca75c9b91f`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260529_0705`
- CLI route output: `MUSU_CLI_ROUTE_OK_20260529_0705`

Multi-device packet:

- script: `scripts\windows\smoke-multidevice-beta.ps1`
- kit builder: `scripts\windows\prepare-multidevice-test-kit.ps1`
- evidence verifier: `scripts\windows\verify-multidevice-evidence.ps1`
- evidence recorder: `scripts\windows\record-multidevice-evidence.ps1`
- runbook: `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md`
- latest generated kit pattern: `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-*.zip` (use the newest file by `LastWriteTime`)
- latest verified final gate packet with fresh multi-device kit: `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- current state: install/test kit ready, second-PC execution pending

Store metadata:

- privacy route: `musu-bee/src/app/privacy/page.tsx` -> `https://musu.pro/privacy`
- support route: `musu-bee/src/app/support/page.tsx` -> `https://musu.pro/support`
- public metadata verifier: `scripts\windows\verify-store-public-metadata.ps1`
- support mailbox evidence verifier: `scripts\windows\verify-support-mailbox-evidence.ps1`
- support mailbox evidence recorder: `scripts\windows\record-support-mailbox-verification.ps1`
- Store release evidence verifier: `scripts\windows\verify-store-release-evidence.ps1`
- Store release evidence recorder: `scripts\windows\record-store-release-verification.ps1`
- support mailbox DNS: `musu.pro` MX resolves to `smtp.google.com`; actual delivery still requires operator evidence
- release go/no-go preflight: `scripts\windows\write-release-go-no-go.ps1`
- final operator packet builder: `scripts\windows\prepare-final-operator-gate-packet.ps1`
- final operator packet verifier: `scripts\windows\verify-final-operator-gate-packet.ps1`
- final evidence completion runner: `scripts\windows\complete-final-operator-gates.ps1`
- final release handoff status: `scripts\windows\show-final-release-handoff-status.ps1`
- metadata handoff: `docs/STORE_SUBMISSION_METADATA_2026_05_29.md`
- public deployment now verifies; mailbox delivery evidence still must be recorded before Partner Center submission; Store release approval evidence must be recorded after Microsoft certification and restricted capability approval.
- final operator gates: `docs/RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md`

Current MSIX artifacts:

- local sideload: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Store reviewed: `.local-build\msix\output\musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix`
- submission bundle: `.local-build\msix\submission-bundles\store-reviewed-20260529-033609`

Desktop release audit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-desktop-release-readiness.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1
```

Latest result:

- `runtime_package_ready=True`
- `desktop_shell_ready=True`
- `single_machine_verified=True`
- `multi_device_verified=False`
- `public_desktop_release_ready=False`

Tauri desktop shell evidence:

- source: `musu-bee\src-tauri-shell`
- build command: `npm run build:tauri-shell`
- bundle command: `npm run tauri:build`
- release binary: `musu-bee\src-tauri\target\release\musu-desktop.exe`
- MSI bundle: `musu-bee\src-tauri\target\release\bundle\msi\MUSU_1.15.0_x64_en-US.msi`
- NSIS bundle: `musu-bee\src-tauri\target\release\bundle\nsis\MUSU_1.15.0_x64-setup.exe`
- render proof: `.local-build\tauri-shell-1280x800.png`
- caveat: this is a runtime launcher/status shell, not the full dashboard GUI.

Release candidate manifest:

- script: `scripts\windows\write-release-candidate-manifest.ps1`
- latest manifest: `.local-build\release-candidates\1.15.0-rc.1\release-candidate-manifest.json`
- latest checksums: `.local-build\release-candidates\1.15.0-rc.1\SHA256SUMS.txt`
- private signing material is excluded unless explicitly requested with `-IncludePrivateArtifacts`.

## RC Gate Commands

```powershell
npm run typecheck
npm run lint -- --quiet
npm run build
cargo check --manifest-path .\musu-rs\Cargo.toml -j 1
cargo clippy --manifest-path .\musu-rs\Cargo.toml --all-targets -j 1 -- -D warnings
cargo test --manifest-path .\musu-rs\Cargo.toml --lib -- --test-threads=1
```

Run the low-resource integration bundle before tagging:

```powershell
$env:CARGO_INCREMENTAL='0'
cargo test --manifest-path .\musu-rs\Cargo.toml `
  --test r13_mcp_http `
  --test r10_registry `
  --test r9_workflow_dag `
  --test r7_peer_register `
  --test w12_deadline_middleware `
  -j 1
```

## Known Beta Caveats

- Windows PATH can prefer `C:\Users\empty\.cargo\bin\musu.exe` over the packaged WindowsApps alias. `musu doctor` must keep reporting this.
- `openai_compat_local` is not wired into the task runner hot path. Dashboard agent task default must stay on `claude` until runner dispatch is unified.
- `musu up` currently checks standard dashboard ports, not arbitrary dev smoke ports such as `3002`.
