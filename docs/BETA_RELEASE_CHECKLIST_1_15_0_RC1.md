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

Verified locally against a production-built dashboard on `3001` and bridge on dynamic port `11041`:

- `musu up --json`: ok, used `~\.musu\bridge.env`, started/confirmed bridge
- `musu doctor --json`: warn only for PATH alias shadowing; account/bridge/dashboard/package ok
- dashboard `/api/doctor`: overall ok, bridge version `1.15.0-rc.1`
- dashboard `/api/device-status`: local node online, version `1.15.0-rc.1`
- `/api/bridge-tasks`: works after bridge restart, proving dynamic bridge URL resolution
- `/api/tasks/forward -> bridge -> claude -> /api/bridge/tasks/{id}`: done
- task id: `72ff5cff-f122-496b-ad6a-6d7e55711bf4`
- terminal output: `MUSU_SMOKE_OK`
- SSE route: 200 `text/event-stream`

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
