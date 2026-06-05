# MUSU 1.15.0-rc.1 Beta Release Checklist

Date: 2026-05-29

## Release Target

`1.15.0-rc.1` is beta-ready when a fresh Windows operator can:

1. run `musu up`,
2. see local bridge/doctor readiness as healthy,
3. delegate one local agent task from the installed local program or CLI,
4. optionally attach a same-machine dashboard,
5. accept authenticated remote input from `https://musu.pro` without moving
   execution off the local device.

## Product Split

The release target is a local-executor product with a web coordination plane:

- the installed MUSU program does local execution on each device
- `http://127.0.0.1:*` dashboards are same-machine local/operator surfaces
- `https://musu.pro` is the intended remote user input, project room, company
  meeting room, device presence, rendezvous, path-selection, relay-fallback,
  and evidence surface
- `musu.pro` sends authenticated work-order envelopes and room events to local
  programs; it must not become the default execution server or default data
  path
- room state, rendezvous sessions, route candidates, relay leases, relay
  payload queues, and delivery proofs must be scoped to the authenticated P2P
  control owner
- devices should use `musu.pro` to bootstrap peer discovery, then prefer direct
  P2P mesh; hosted relay is fallback after direct route failure

Current one-machine validation can continue without the second PC. Successful
multi-device proof and second-PC CPU/resource evidence require installing the
same current MUSU build on the second Windows machine.

## Current P2P Candidate Publish Contract

`musu.pro` is the meeting room and rendezvous surface. Each installed local
MUSU program remains the executor and publishes its reachable route candidates
to that room.

Current local CLI candidate publishing supports:

- the default local bridge candidate from `MUSU_BRIDGE_PUBLIC_URL` or the
  local bridge registry
- repeated `--candidate-url` values for LAN, Tailscale, overlay, or public
  candidates
- `--nat-type` and `--nat-observed-by` on public/direct candidates
- `--relay-url` and `--relay-protocol` for fallback relay descriptors

The web control plane preserves `public_addr`, `nat_type`, `nat_observed_by`,
`relay_url`, and `relay_protocol` through room presence, candidate cache
seeding, and rendezvous creation. This does not make `musu.pro` the default
execution server or default data path.

Current runtime CPU subrole attribution packaged primary-machine evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-013337-HUGH_SECOND.evidence.json`
- idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-011243-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012030-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012740-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Clean go/no-go after these evidence commits remains No-Go for public release,
but local artifacts, MSIX install, single-machine smoke, primary idle CPU
`1/2 [HUGH_SECOND]`, primary runtime matrix `1/2 [HUGH_SECOND]`, targeted
second-PC route CPU `1/1 [HUGH_SECOND]`, public metadata, and the P2P
store-forward relay contract are current and passing.

CPU evidence now requires process subrole attribution. The current HUGH_SECOND
idle and matrix evidence separates `bridge_runtime=1`, `desktop_shell=1`, and
`webview2_helper=6`; older CPU evidence without those subrole fields is not
release-current.

Second-PC return import enforces the same subrole contract. A returned zip must
include a current `*.release-check.json` with
`runtime_cpu_subrole_contract_ok=true`, plus idle CPU and runtime matrix JSON
that preserve `process_counts_by_subrole`,
`max_one_core_percent_by_subrole`, `memory_totals_by_subrole_mb`, and
`cpu_attribution.top_processes[*].process_subrole`. Older second-PC returns
without those fields are diagnostic only and cannot satisfy
`import-second-pc-return.ps1 -RequireReleaseGateEvidence`.

## Must-Pass Smoke

Repeatable script:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\smoke-single-machine-beta.ps1
```

The script defaults to the packaged WindowsApps `musu.exe`. Debug
`musu-rs\target\debug\musu.exe` is only accepted with `-AllowDeveloperRuntime`
and is not release evidence.

For packaged local runtimes, a workspace dashboard is optional. When
`musu up --json` / `musu doctor --json` report `dashboard.required=false`, the
single-machine smoke records bridge-only evidence and checks CLI routing
without starting or requiring `127.0.0.1:3000` / `127.0.0.1:3001`. When a
dashboard URL is explicitly supplied, the script still checks the dashboard
APIs.

Manual equivalent:

```powershell
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" up --json
& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" doctor --json
```

Expected:

- account token present or an actionable `musu login` next step
- bridge token present from `~\.musu\bridge.env`
- bridge `/health` returns `status=ok`
- `dashboard.required=false` is acceptable for packaged local runtime evidence
- Windows alias shadowing is reported as a warning, not hidden

Optional same-machine dashboard API smoke:

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

## Current Security Contract Audit

Current Rust bridge local API auth contract:

- localhost requests require `Authorization: Bearer <MUSU_BRIDGE_TOKEN>` by default
- `MUSU_BRIDGE_LOCALHOST_AUTH=0` is only an explicit trusted local development bypass
- production/shared-machine docs must not recommend localhost auth bypass

Repeatable audit:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\audit-local-api-auth-contract.ps1 -FailOnProblem -Json
```

Expected: schema `musu.local_api_auth_contract.v1`, `ok=true`, `fail_count=0`.

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

Current 2026-06-04 packaged smoke evidence:

- evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-130301-HUGH_SECOND.evidence.json`
- dashboard: `http://127.0.0.1:3001`
- dashboard source: `musu up.dashboard.reachable_url`
- bridge: `http://127.0.0.1:8573`
- dashboard task id: `42c7678d-22dd-4126-8ec2-1a1f4a3e15e8`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260604_130238`

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

Current machine-readable single-machine evidence passed and was recorded on 2026-06-01 15:56 KST after the CPU scenario matrix attribution fix:

- evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260601-155630-HUGH_SECOND.evidence.json`
- verification: `docs\evidence\single-machine\1.15.0-rc.1\20260601-155630-HUGH_SECOND.verification.json`
- summary: `docs\evidence\single-machine\1.15.0-rc.1\20260601-155630-HUGH_SECOND.summary.md`
- commit: `f4c2e0fd6565a81a21d5537e146a0f098ff763bd`
- dashboard task id: `e6757818-7dc2-432d-b9fb-19143cded009`
- bridge: `http://127.0.0.1:4747`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260601_155610`
- evidence SHA-256: `6597a9e8b9c4d08f236a164c88e23f6c4d061d32f7e0226a9e4273600229eb70`
- verification SHA-256: `c578cd6a7de7c83f99c44777e7f4acf2d787c4861db6fa78fdab9929eb23ef45`
- CLI route checked: `true`

Current machine-readable single-machine evidence was refreshed on 2026-06-02 02:02 KST after a fresh release MSIX build/install:

- evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.evidence.json`
- verification: `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.verification.json`
- summary: `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.summary.md`
- commit: `2e97d135538f063252577c49762f8018bc366843`
- dashboard task id: `3e96b141-6aa5-4d39-a29b-450f15eed8b3`
- bridge: `http://127.0.0.1:6907`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260602_015326`
- CLI route checked: `true`

Current machine-readable single-machine evidence was refreshed again on 2026-06-02 08:31 KST after frontend polling timeout hardening and a fresh packaged MSIX build/install:

- evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260602-083131-HUGH_SECOND.evidence.json`
- verification: `docs\evidence\single-machine\1.15.0-rc.1\20260602-083131-HUGH_SECOND.verification.json`
- summary: `docs\evidence\single-machine\1.15.0-rc.1\20260602-083131-HUGH_SECOND.summary.md`
- commit: `22ba6c313dea4dd32ae43a46dca424b3443edf85`
- dashboard: `http://127.0.0.1:3001`
- dashboard task id: `4ae56776-f54d-4955-98cb-d6774626d072`
- bridge: `http://127.0.0.1:9967`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260602_083131`
- CLI route checked: `true`
- paired desktop single-instance evidence: `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-0832-HUGH_SECOND.desktop-single-instance.json`
- paired process ownership evidence: `docs\evidence\process-ownership\1.15.0-rc.1\20260602-0832-HUGH_SECOND.process-ownership.json`
- paired CPU evidence: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-0833-HUGH_SECOND.desktop-open.evidence.json`
- paired CPU matrix evidence: `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-083314-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Current machine-readable packaged evidence was refreshed on 2026-06-03 02:25 KST after `musu status --json` hardening and a fresh local-sideload MSIX build/install:

- single-machine evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260603-021321-HUGH_SECOND.evidence.json`
- desktop single-instance evidence: `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-021134-HUGH_SECOND.desktop-single-instance.json`
- process ownership evidence: `docs\evidence\process-ownership\1.15.0-rc.1\20260603-021134-HUGH_SECOND.process-ownership.json`
- desktop-open CPU evidence: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-021134-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix evidence: `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-021552-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260603_021259`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_021552`
- CPU summary: MUSU `0`, Node `0`, WebView2 `0.13`, hot `0`
- go/no-go: local artifacts and single-machine pass; runtime CPU and matrix each have `1/2 [HUGH_SECOND]`, so public release still requires second-PC evidence.

Multi-device packet:

- script: `scripts\windows\smoke-multidevice-beta.ps1`
- kit builder: `scripts\windows\prepare-multidevice-test-kit.ps1`
- second-PC one-command release check: `scripts\windows\run-second-pc-release-check.ps1`
- second-PC return archive: `.local-build\second-pc-return\*.zip`
- second-PC return importer: `scripts\windows\import-second-pc-return.ps1`
- MSIX legacy conflict preflight: `scripts\windows\check-msix-legacy-conflicts.ps1 -Json -FailOnProblem`
- release imports should use `-RequireReleaseGateEvidence` so MSIX-only return
  archives and stale CPU returns without subrole attribution cannot be mistaken
  for CPU/matrix release evidence
- MSIX install evidence capture: `scripts\windows\capture-msix-install-evidence.ps1`
- runtime idle CPU evidence capture: `scripts\windows\measure-musu-idle-cpu.ps1` is now run by `run-second-pc-release-check.ps1` unless `-SkipRuntimeIdleCpu` is used
- runtime CPU scenario matrix: `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` writes `musu.runtime_cpu_scenario_matrix.v1` for `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route`; `startup-open` must launch the packaged desktop app and start sampling within 3s, `dashboard-open` launches an explicit dashboard URL or the `reachable_url` from `musu up --json` before sampling, never an unverified `dev_url`/`start_url` fallback, `post-route` requires the exact per-run route token, and `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` rejects no-op startup/dashboard matrices, missing resource-budget fields, missing `cpu_attribution` / `top_processes`, missing subrole attribution, working-set overages, and WebView2 process-count overages while verifying clean/current 60s matrices with a successful post-route probe; this is now bundled into the second-PC kit, captured by `run-second-pc-release-check.ps1` unless `-SkipRuntimeCpuScenarioMatrix` is used, imported by `import-second-pc-return.ps1`, and is a separate go/no-go attribution gate rather than a replacement for the release-grade two-machine `desktop-open` CPU evidence
- second-PC release-check subrole summary: `run-second-pc-release-check.ps1` now records `runtime_idle_cpu_subrole_summary`, `runtime_cpu_scenario_subrole_summary`, and `runtime_cpu_subrole_contract_ok`; `import-second-pc-return.ps1 -RequireReleaseGateEvidence` rejects stale returns that lack those fields or whose imported CPU JSONs do not separate `bridge_runtime`, `desktop_shell`, and `webview2_helper`
- process attribution summary: `scripts\windows\show-musu-process-attribution.ps1` writes `musu.process_attribution_summary.v1`; the second-PC wrapper includes `.local-build\process-attribution\*.process-attribution-summary.json` in the return zip, and the importer copies it back to `.local-build\process-attribution\`. Use this to distinguish machine-wide `node.exe`/WebView2 counts from MUSU-owned helpers before treating Task Manager process counts as release defects.
- MSIX install evidence verifier: `scripts\windows\verify-msix-install-evidence.ps1`
- MSIX install evidence recorder: `scripts\windows\record-msix-install-evidence.ps1`
- MSIX install evidence must match the current release version, include operator metadata, pass non-future timestamp checks, and include passing capture checks from the second-PC package install
- evidence verifier: `scripts\windows\verify-multidevice-evidence.ps1`
- evidence recorder: `scripts\windows\record-multidevice-evidence.ps1`
- route evidence source: `smoke-multidevice-beta.ps1` now calls
  `musu route --route-evidence-path <path>` and imports the CLI-written
  `musu.route_evidence.v1` instead of synthesizing route evidence in the
  script. The current HTTP bearer evidence is still intentionally rejected for
  release until peer identity and release-grade `quic_tls_1_3` encryption proof
  exist. Accepted release evidence must also include
  `transport_verified_by=musu_quic_tls_transport`; an encryption string alone is
  not proof. HTTPS fingerprint-pinned bridge evidence remains useful diagnostic
  evidence but is not accepted by the multi-device release verifier.
- runbook: `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md`
- latest generated kit pattern: `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-*.zip` (use the newest file by `LastWriteTime`)
- latest verified final gate packet with fresh multi-device kit: `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- current state: install/test kit ready, second-PC MSIX install evidence recorded, multi-device execution pending
- current second-PC MSIX install evidence: `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json`

Runtime hardening:

- idle CPU measurement: `scripts\windows\measure-musu-idle-cpu.ps1`
- multi-state CPU diagnostics: `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1`
- multi-state CPU verifier: `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`
- MSIX desktop entrypoint audit: `scripts\windows\audit-msix-desktop-entrypoint.ps1`
- process ownership audit: `scripts\windows\audit-musu-process-ownership.ps1`
- process attribution summary: `scripts\windows\show-musu-process-attribution.ps1`
- startup single-instance audit: `scripts\windows\audit-musu-startup-single-instance.ps1`
- packaged desktop single-instance audit:
  `scripts\windows\audit-musu-desktop-single-instance.ps1`
- P2P control-plane live evidence recorder:
  `scripts\windows\record-p2p-control-plane-evidence.ps1`
- P2P control-plane live evidence verifier:
  `scripts\windows\verify-p2p-control-plane-evidence.ps1`
- hosted P2P env configurator:
  `scripts\windows\configure-musu-pro-p2p-env.ps1` sets `KV_REST_API_URL`
  and `KV_REST_API_TOKEN` through `gh` without printing values and can trigger
  `deploy-musu-bee.yml`
- public beta target: MUSU packaged desktop open and idle, at least one MUSU runtime process sampled, at least one MUSU-owned WebView2 process attributed, no MUSU/Node.js/WebView2 process above 5% of one logical CPU for a 60s idle sample, owned process count <= 16, owned WebView2 count <= 8, total owned working set <= 1024MB
- process ownership target: one live MUSU runtime, no repo-related orphan Node/WebView2 helpers, and bridge registry PID plus `/health` matching the live runtime. Machine-wide `node.exe` count is diagnostic only; MUSU-owned descendants and repo-related orphan helpers are the release accountability boundary.
- current live process attribution recheck: `show-musu-process-attribution.ps1`
  at 2026-06-03 05:35 KST found MUSU not running (`musu_runtime=0`,
  missing bridge registry) and 16 machine-wide `node.exe` processes, all
  outside the MUSU process tree. This is diagnostic evidence for local dev/tool
  cleanup, not a MUSU-owned release CPU failure. Latest release-grade
  desktop-open CPU evidence remains
  `20260603-035458-HUGH_SECOND.desktop-open`, which passes with MUSU `0`,
  Node `0.03`, WebView2 `0.6`, and hot process count `0`.
- startup single-instance target: repeated `musu up --json` calls reuse one bridge PID and do not spawn another runtime
- default mDNS: off unless `MUSU_ENABLE_MDNS=1`; IPv6, Tailscale, and common VPN/virtual adapters also require `MUSU_MDNS_ENABLE_IPV6=1`, `MUSU_MDNS_ENABLE_TAILSCALE=1`, and `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`
- mDNS disconnected-channel hardening: explicit mDNS discovery now treats
  receive timeouts as ordinary bounded waiting but exits immediately when the
  browse receiver disconnects. This prevents the Windows/Tailscale
  `sending on a closed channel` failure class from spinning inside the
  discovery window when an operator opts into mDNS.
- default clipboard polling: off unless `MUSU_ENABLE_CLIPBOARD_SYNC=1`
- runtime hardening and relay-control roadmap: `docs/RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md`
- go/no-go preflight now reports `msix_desktop_entrypoint_verified`, `runtime_idle_cpu_verified`, `runtime_cpu_scenario_matrix_verified`, `process_ownership_verified`, `startup_single_instance_verified`, and `desktop_single_instance_verified`
- P2P relay control-plane status: runtime direct-route failure now requests a
  fail-closed `/api/v1/p2p/relay/lease` when a rendezvous session and account
  token exist; this is policy/audit wiring only and `relay_transport_wired`
  remains `false`
- P2P relay lease audit status: `musu relay leases --json` now queries
  owner-scoped relay lease records and reports `owner_scope_verified`; P2P auth
  now supports `MUSU_P2P_CONTROL_TOKEN_SHA256S`, but production env must be set
  and live `https://musu.pro` must stop returning
  `p2p_control_auth_not_configured` before relay lease evidence is release-grade
- P2P control auth env helper:
  `scripts\windows\show-p2p-control-token-hash.ps1 -Json` computes
  `MUSU_P2P_CONTROL_TOKEN_SHA256S` from `~\.musu\token` without printing the
  raw account token
- P2P hosted env/status preflight:
  `scripts\windows\show-musu-pro-p2p-env-status.ps1 -Json` reports required
  GitHub secret/variable names, the latest live P2P evidence error class, and
  next steps without printing secret values. Current expected blockers before
  storage provisioning are
  `missing_kv_rest_api_url_or_upstash_redis_rest_url`,
  `missing_kv_rest_api_token_or_upstash_redis_rest_token`, and
  `live_evidence_p2p_relay_lease_kv_not_configured`.
- P2P hosted storage env alias status: route-evidence, rendezvous, and relay
  lease stores now accept either `KV_REST_API_URL` / `KV_REST_API_TOKEN` or
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. The deploy workflow
  syncs both name families and maps Upstash values into the canonical
  `KV_REST_API_*` names before `@vercel/kv` loads. This broadens production
  provisioning options but does not close the live P2P gate until actual
  storage credentials are set and owner-scoped evidence passes.
- relay fallback evidence status: failed runtime route evidence now carries a
  `relay_fallback` addendum after direct-route failure and lease evaluation,
  so `musu.pro` can audit whether the lease was requested/issued/skipped
  without claiming relay payload transport
- P2P forwarded-task audit status: the target bridge now writes an
  `audit_log` row when `/api/tasks/forward` accepts and spawns a forwarded
  cross-machine task. The row uses `ConnectInfo` peer IP, `cross_machine=true`,
  status `202`, `company_id`, and bounded task/source/rendezvous identifiers;
  prompt text, cwd, callback URL, model, and adapter metadata are intentionally
  excluded. This improves P2P command forensics but does not close the
  release-grade route gate.
- current packaged primary evidence after forwarded-task audit hardening:
  fresh MSIX rebuild/install succeeded for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6` from source commit
  `c25c109e`. Current evidence passes single-machine
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-001225-HUGH_SECOND.evidence.json`,
  desktop single-instance
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-000306-HUGH_SECOND.desktop-single-instance.json`,
  process ownership
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-000306-HUGH_SECOND.process-ownership.json`,
  desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-001200-HUGH_SECOND.desktop-open.evidence.json`,
  and runtime CPU matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-001416-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  Desktop-open CPU reports MUSU `0.03`, Node `0`, WebView2 `0.08`, working
  set `454.06MB`, hot `0`; process ownership reports MUSU-owned Node `0`
  while machine-wide Node is `19`; matrix route token is
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_001416`. Public release remains No-Go
  until second-PC desktop-open CPU evidence, second-PC scenario matrix
  evidence, release-grade multi-device route proof, live `musu.pro` P2P
  control-plane auth, support inbox, and Store evidence all pass.
- current packaged primary evidence after P2P storage env alias hardening:
  fresh MSIX rebuild/install succeeded for the same installed package from
  source commit `fbd01746`. Current evidence now passes single-machine
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-005257-HUGH_SECOND.evidence.json`,
  desktop single-instance
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-005000-HUGH_SECOND.desktop-single-instance.json`,
  process ownership
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-005010-HUGH_SECOND.process-ownership.json`,
  desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-010000-HUGH_SECOND.desktop-open.evidence.json`,
  and runtime CPU matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-010315-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  Desktop-open CPU reports MUSU `0`, Node `0`, WebView2 `0.1`, working set
  `363.87MB`, hot `0`; process ownership reports MUSU-owned Node `0` while
  machine-wide Node is `16`; matrix route token is
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_010315`. Public release remains No-Go
  until second-PC desktop-open CPU evidence, second-PC scenario matrix
  evidence, release-grade multi-device route proof, live `musu.pro` P2P
  storage-backed owner-scope evidence, support inbox, and Store evidence all
  pass.
- status JSON hardening: `musu status --json` now emits schema
  `musu.fleet_status_cli.v1` with `ok`, `bridge_url`, and raw fleet status,
  which improves process/status automation. Validation passed `cargo fmt`,
  `cargo check`, `cargo test install::cli_commands` 14/14, `cargo build`, a
  binary parser test, and a debug runtime `up/status/down --json` smoke. This
  is Rust source, so the previous packaged primary evidence is stale for
  current HEAD until MSIX build/install and primary smoke/process/CPU/matrix
  evidence are refreshed again.
- 2026-06-01 21:17 KST final primary refresh after the deploy workflow hardening commit: single-machine smoke now passes at `docs\evidence\single-machine\1.15.0-rc.1\20260601-211031-HUGH_SECOND.evidence.json`; clean `desktop-open` CPU passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-211132-HUGH_SECOND.desktop-open.evidence.json` from commit `a0184e89851d7ac99e1162a301f9219104a4df04` with `git_dirty=false`, MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`, `webview2=0.23`, working set `506.71MB`, and no hot processes; clean 4-state matrix passes at `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-211252-HUGH_SECOND.runtime-cpu-scenario-matrix.json` with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_211252`, all four scenarios under budget, and no hot processes. Public release remains No-Go until second-PC CPU/matrix, release-grade multi-device route, production P2P env/live verification, support inbox, and Store evidence are complete.
- `musu.pro` deployment note: Vercel run `26753317276` for `96303af3` was stuck and canceled; deploy workflow hardening commit `65950384` passed Vercel production run `26753908889` and `Tests` run `26753908911`. Live `https://musu.pro` QA with cachebuster `qa=65950384` passed on `/`, `/landing`, `/pricing`, and `/install` across desktop/mobile for scroll, no horizontal overflow, favicon-header logo, `.musu-public-scroll-root`, and `#24C8DB` emerald accent.
- 2026-06-01 21:41 KST P2P control-plane live gate: `record-p2p-control-plane-evidence.ps1 -AllowUnverified -Json` recorded `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260601-214149-musu.pro.evidence.json`. Relay status proves logged-in `musu.pro` control-plane wiring is present, but relay lease query still reports `ok=false`, `owner_scope_verified=false`, and the underlying live error is `p2p_control_auth_not_configured` with no accepted auth modes. `write-release-go-no-go.ps1` now reports `p2p_control_plane_verified=false` and adds a `p2p-control-plane` blocker until production `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent scoped auth is configured on live `musu.pro`, deployed/reloaded there, and live evidence verifies owner-scoped lease queries with `relay_default_data_path=false` without `-AllowUnverified`.
- 2026-06-01 21:56 KST post-P2P-gate go/no-go: clean commit `a6e41609d1c9ceaaf13ce73119f25e62471bfb5b` reports `ready=false`, `manifest_dirty=false`, `single_machine=false`, runtime idle CPU `0/2`, runtime CPU scenario matrix `0/2`, and `p2p_control_plane_verified=false`. Because release scripts changed, refresh primary smoke/CPU/matrix evidence again before treating second-PC evidence as the remaining runtime gate.
- 2026-06-01 22:26 KST primary evidence refresh: single-machine evidence passes at `docs\evidence\single-machine\1.15.0-rc.1\20260601-221225-HUGH_SECOND.evidence.json`; production-dashboard `desktop-open` CPU evidence passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-221918-HUGH_SECOND.desktop-open.evidence.json` with MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`, `webview2=0.13`, working set `469.28MB`, and no hot processes; primary runtime CPU matrix passes at `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-222043-HUGH_SECOND.runtime-cpu-scenario-matrix.json` with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_222043`. Clean go/no-go on `5b8650f084a0df9cf5cabde77af31dd11b366c0a` reports `single_machine=true`, runtime idle CPU `1/2`, runtime CPU matrix `1/2`, `manifest_dirty=false`, and `ready=false`.
- frontend polling hardening: `musu-bee/src` currently has no direct
  `setInterval(` matches. Workflow run status, remote screen device refresh,
  agents surface refresh, onboarding research polling, dashboard main refresh,
  and the node panel registry/discovery refresh use `useLowDutyPolling`;
  `musu-bee/src/app/runtime-polling-contract.test.ts` guards the contract.
  This reduces known frontend busy-loop candidates but does not replace the
  two-machine 60s CPU evidence gate. Any source commit touching these paths
  makes the previous CPU evidence stale until primary and second-PC samples are
  refreshed.
- optional planner hardening: `MUSU_ENABLE_PLANNER=1` remains off by default,
  `MUSU_PLANNER_INTERVAL_SEC` is floored at 60s, planner crawler execution is
  timeout-bounded with `MUSU_PLANNER_COMMAND_TIMEOUT_SEC` clamped to 5s..120s,
  and `musu doctor --json` reports the effective planner interval/timeout so
  CPU evidence can see the active background budget.
- cloud heartbeat hardware probes: logged-in `musu.pro` heartbeat still gathers
  hardware capability metadata, but heartbeat metadata now uses process-cached
  `gather_hardware_info_cached()`. Windows total memory and CPU brand use Win32
  `GlobalMemoryStatusEx` and registry `RegGetValueW` instead of
  PowerShell/WMIC. macOS `sysctl` and `nvidia-smi` remain timeout-bounded;
  `nvidia-smi` is reached through the cached metadata path so recurring
  heartbeat cycles do not repeatedly spawn it.

Brand assets:

- official app mark: `musu-bee\src-tauri\icons\icon.png`
- web favicon/header mark: `musu-bee\public\images\favicon-header.png`
- public logo lockups: `musu-bee\public\images\logos\musu-logo-{header,display,hero}-{on-light,on-dark,on-yellow}.png`
- standalone public mark: `musu-bee\public\images\logos\musu-mark-512.png`
- logo generator: `scripts\windows\generate-brand-logo-assets.ps1`
- current state: the favicon-quality mark is usable as the official beta mark; static lockups now exist for Store/README/landing-page handoff, but Store screenshots and a 60-90s demo video are still pending.

Store metadata:

- privacy route: `musu-bee/src/app/privacy/page.tsx` -> `https://musu.pro/privacy`
- support route: `musu-bee/src/app/support/page.tsx` -> `https://musu.pro/support`
- public metadata verifier: `scripts\windows\verify-store-public-metadata.ps1`
- support mailbox evidence verifier: `scripts\windows\verify-support-mailbox-evidence.ps1`
- support mailbox evidence recorder: `scripts\windows\record-support-mailbox-verification.ps1`
- Store release evidence verifier: `scripts\windows\verify-store-release-evidence.ps1`
- Store release evidence recorder: `scripts\windows\record-store-release-verification.ps1`
- Store submission bundle verifier: `scripts\windows\verify-store-submission-bundle.ps1`
- MSIX desktop entrypoint verifier: `scripts\windows\audit-msix-desktop-entrypoint.ps1`; regenerated Store-reviewed bundle `.local-build\msix\submission-bundles\store-reviewed-20260531-224352` passes artifact-level desktop-entrypoint verification, and `local-sideload-manual -RequireInstalledPackage` now passes on `HUGH_SECOND`. Store-reviewed `-RequireInstalledPackage` is expected to fail on local sideload installs unless the Microsoft Store-signed restricted-capability package is actually installed.
- support mailbox DNS: `musu.pro` MX resolves to `smtp.google.com`; actual delivery still requires operator evidence
- support mailbox evidence must match the current release version and include an explicit `musu-...` verification token; Store release evidence must include an explicit Partner Center product-name reservation timestamp
- release go/no-go preflight: `scripts\windows\write-release-go-no-go.ps1`
- final operator packet builder: `scripts\windows\prepare-final-operator-gate-packet.ps1`
- final operator packet verifier: `scripts\windows\verify-final-operator-gate-packet.ps1`
- final operator action pack builder: `scripts\windows\prepare-operator-action-pack.ps1`
- final operator action pack verifier: `scripts\windows\verify-operator-action-pack.ps1`
- final evidence completion runner: `scripts\windows\complete-final-operator-gates.ps1`
- final release handoff status: `scripts\windows\show-final-release-handoff-status.ps1`
- metadata handoff: `docs/STORE_SUBMISSION_METADATA_2026_05_29.md`
- public deployment now verifies; Vercel production workflow run `26738950440`
  and live Playwright checks confirmed scroll, favicon logo/browser icon, and
  `#24C8DB` accent on `https://musu.pro`; mailbox delivery evidence still must
  be recorded before Partner Center submission; Store release approval evidence
  must be recorded after Microsoft certification and restricted capability
  approval.
- public site regression gate: `musu-bee\playwright.public-site.config.ts` and
  `musu-bee\e2e\public-site-scroll-brand.spec.ts` now verify the homepage
  scrolls on desktop/mobile, has no horizontal overflow, renders the favicon
  mark through `MusuLogo`, and exposes `--musu-color-brand-emerald=#24C8DB`;
  local follow-up validation passed on 2026-06-01 before push; commit
  `674f501` then passed GitHub `Tests` run `26743680160`, `E2E Tests —
  musu-bee` run `26743680172`, and Vercel production deploy run
  `26743680165`; live `musu.pro` QA with `qa=674f501` passed for `/`,
  `/landing`, `/pricing`, and `/install` on desktop/mobile.
- final operator gates: `docs/RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md`

Fresh MSIX primary evidence:

- fresh MSIX: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package: `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- AppUserModelId: `Yellowhama.MUSU_ygcjq669as2b6!MUSU`
- desktop repeated activation evidence:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-014803-HUGH_SECOND.evidence.json`
- primary desktop-open CPU evidence:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-015358-HUGH_SECOND.desktop-open.evidence.json`
- primary four-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-015510-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- process ownership evidence:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-020031-HUGH_SECOND.evidence.json`
- current state: the primary installed desktop single-instance blocker is
  closed by fresh package evidence. Public release remains No-Go until the
  second PC returns matching CPU/matrix evidence, release-grade multi-device
  route proof exists, live `musu.pro` P2P control-plane auth verifies,
  `musu@musu.pro` delivery evidence is recorded, and Store/Partner Center
  evidence is recorded.

Current MSIX artifacts:

- local sideload: `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- Store reviewed: `.local-build\msix\output\musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix`
- latest Store submission bundle: `.local-build\msix\submission-bundles\store-reviewed-20260531-224352`
- historical submission bundle: `.local-build\msix\submission-bundles\store-reviewed-20260529-033609`

Desktop release audit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\audit-desktop-release-readiness.ps1
powershell -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1
```

Latest result:

- `runtime_package_ready=True`
- `msix_desktop_entrypoint_ready=True`
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
- 2026-06-01 hardening: the shell's `Start Runtime` command no longer uses
  direct `Command::output()` for `musu up --json`; it uses temp-file output
  capture and a 45s timeout so inherited bridge child handles cannot leave the
  UI in an indefinite busy state. `cargo test --manifest-path
  .\musu-bee\src-tauri\Cargo.toml -j 1` passed 3/3 shell tests.
- 2026-06-01 failure handling: `desktop_status` now removes stale
  `~/.musu/services/bridge.json` entries when the recorded Windows PID is dead,
  and returns no bridge URL instead of probing an obsolete port. The same Tauri
  shell test command now passes 5/5 tests.
- 2026-06-01 idle diagnostics: `musu doctor --json` now includes a
  `background` object that reports mDNS, clipboard sync, cloud heartbeat,
  file watcher roots, writable file serving, and planner opt-ins. Live
  `HUGH_SECOND` output showed the intended idle profile: mDNS/clipboard/file
  sync/planner off and cloud heartbeat `300s` with a `60s` floor.
- 2026-06-01 live public-site deployment check: `https://musu.pro` currently
  returns HTTP 200 and browser QA passed on desktop/mobile for the homepage
  scroll, favicon-header logo, and `#24C8DB` brand accent. No extra manual web
  deploy is pending for the scroll/logo/accent fix.
- 2026-06-01 22:58 KST public-site follow-up: `PublicSiteShell` marks the
  shared emerald `Open App` CTA with `data-brand-accent="emerald"`, and
  `public-site-scroll-brand.spec.ts` covers `/`, `/landing`, `/pricing`, and
  `/install` on desktop/mobile. Commit `b08ed746` passed GitHub `Tests` run
  `26759256487`, `E2E Tests - musu-bee` run `26759256574`, and Vercel
  production deploy run `26759256616`; live `musu.pro` QA passed with scroll,
  no horizontal overflow, favicon-header logo, and `#24C8DB` accent.
- 2026-06-02 00:17 KST desktop shell single-instance source hardening: current
  installed MSIX/local-sideload package still duplicates desktop shells under
  repeated Start-menu activation; local repro went from one to three
  `musu-desktop.exe` PIDs. Source now registers
  `tauri-plugin-single-instance = 2.4.2` and focuses the existing `main`
  window on repeat activation. `cargo test --manifest-path
  .\musu-bee\src-tauri\Cargo.toml -j 1` passed 5/5. Treat prior packaged
  desktop evidence as stale until a fresh MSIX is built, installed, and
  repeated-activation/process-ownership/CPU evidence is refreshed.
- 2026-06-02 00:17 KST public-site source follow-up: public logo rendering now
  uses the favicon mark only, scroll rules are explicit on
  `.musu-public-scroll-root`, and the homepage `Open App` CTA uses the emerald
  `#24C8DB` point color. Local `npm run typecheck`, public-site Playwright
  8/8, and `npm run build` passed. Push should trigger `musu.pro` deployment;
  run live QA after Vercel production completes.
- 2026-06-02 00:27 KST public-site deploy verification: commit `0ed3673a`
  passed Vercel production deploy run `26764307713`, GitHub `Tests` run
  `26764309477`, and `E2E Tests - musu-bee` run `26764310368`. Production
  Playwright QA against `https://musu.pro` passed 8/8 on `/`, `/landing`,
  `/pricing`, and `/install` for desktop/mobile scroll, no horizontal overflow,
  favicon-mark logo, and `#24C8DB` accent.
- 2026-06-02 02:42 KST live public-site recheck: `https://musu.pro` still
  passes 8/8 on `/`, `/landing`, `/pricing`, and `/install` across desktop
  `1280x720` and mobile `390x844` for actual scroll movement, no horizontal
  overflow, favicon-header logo, `.musu-public-scroll-root`, and `#24C8DB`
  emerald accent. No additional website UI deploy is pending for this scope.
- 2026-06-02 02:42 KST CLI pipe hardening: source `musu up --json` now clears
  Windows standard-handle inheritance before spawning a detached bridge, so a
  long-lived bridge cannot keep `musu up --json | ConvertFrom-Json` open after
  JSON output. Debug-binary verification returned `ok=true`,
  `bridge_started=true`, bridge PID `37284`, bridge status `ok`, then PID
  `37284` was stopped. Next packaged release proof must run the same command
  through the installed WindowsApps alias after a fresh MSIX build/install.
- 2026-06-02 02:50 KST clean go/no-go after the CLI pipe hardening commit:
  `ready=false`,
  `manifest_dirty=false`, local artifacts true, public metadata true, MSIX
  install true, MSIX desktop entrypoint true, desktop single-instance true,
  startup single-instance true, process ownership true, but single-machine
  false, runtime idle CPU `0/2`, runtime CPU matrix `0/2`, P2P control-plane
  false, support false, and Store false. The Rust CLI source fix invalidates
  the prior release-current primary evidence until a fresh MSIX with this fix
  is built/installed and primary smoke/CPU/matrix evidence is refreshed.
- 2026-06-02 03:48 KST fresh packaged CLI/runtime evidence after the pipe fix:
  fresh local-sideload MSIX installed package
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`; packaged WindowsApps CLI
  pipe proof passed at
  `docs\evidence\cli-pipe\1.15.0-rc.1\20260602-032728-HUGH_SECOND.packaged-cli-pipe.evidence.json`
  with `returned_without_hang=true`, duration `7544ms`, and bridge status
  `ok`. Current primary smoke passes at
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-033029-HUGH_SECOND.evidence.json`;
  packaged desktop repeated activation passes at
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-033145-HUGH_SECOND.desktop-single-instance.json`;
  startup single-instance and process ownership pass at
  `20260602-033225-HUGH_SECOND` and `20260602-033257-HUGH_SECOND`. Primary
  desktop-open CPU passes at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-033412-HUGH_SECOND.desktop-open.evidence.json`
  with max one-core CPU `musu=0`, `node=0`, `webview2=0.23`, hot process
  count `0`, working set `445.87MB`; primary matrix passes at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-033636-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_033636`.
- 2026-06-02 03:48 KST live `musu.pro` P2P control-plane recheck:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-034756-musu.pro.evidence.json`
  still verifies false. Relay status is logged in and wired, but relay leases
  return `p2p_control_auth_not_configured` with `accepted_auth_modes=[]`,
  `owner_scope_verified=false`, and `relay_default_data_path=false`. The next
  hosted action is production env/auth configuration, not a website UI deploy.
- 2026-06-02 04:12 KST hosted P2P auth deploy follow-up: deploy workflow
  commit `3be37e54a30bbd0bee95e9b2e22ce27d0450846c` synced
  `MUSU_P2P_CONTROL_TOKEN_SHA256S` into Vercel production via successful manual
  deploy run `26776054030`; `Tests` run `26775836294` also passed. Fresh live
  evidence
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-041225-musu.pro.evidence.json`
  no longer fails on `p2p_control_auth_not_configured`; it now fails closed at
  `relay_lease_query_failed` with detail `p2p_relay_lease_kv_not_configured`.
  Current GitHub repo secrets include no `KV_REST_API_URL` or
  `KV_REST_API_TOKEN`, and repo variables are empty, so the next hosted action
  is provisioning Vercel KV/Upstash Redis and setting those env values before
  rerunning P2P evidence. Use
  `scripts\windows\configure-musu-pro-p2p-env.ps1` after KV values exist.
- 2026-06-02 04:29 KST final remote verification: commit
  `9a3ec52df102d36075f245bdab526dc57fb99e08` passed `Tests` run
  `26776909221` and `Deploy musu-bee to Vercel` run `26776909275`. The deploy
  run synced `MUSU_P2P_CONTROL_TOKEN_SHA256S`, skipped missing KV/relay env
  values by name, built production, and aliased `https://musu.pro`. The
  workflow is valid; KV provisioning remains the blocker.
- 2026-06-02 04:48 KST latest HEAD redeploy: manual Vercel production run
  `26777905910` succeeded for commit
  `00694a2e766da8e0a79dd6dd7bb82fdadb6c39d1`. Live browser QA against
  `https://musu.pro` passed on `/`, `/landing`, `/pricing`, and `/install` for
  desktop/mobile scroll, no horizontal overflow, favicon-header logo, and
  `#24C8DB` emerald accent. No website UI deploy remains pending for the
  scroll/logo/accent request.
- 2026-06-02 04:56 KST release-gate freshness audit: the apparent drop to
  `single_machine=false`, runtime idle CPU `0/2`, and matrix `0/2` after the
  hosted P2P status script was a gate-classification problem. The only
  non-doc deltas since the latest primary evidence were the deploy workflow and
  the P2P env status preflight, neither of which changes local desktop runtime
  behavior. The verifiers now allow exactly those docs/status/tooling-only
  deltas; full go/no-go returns `single_machine_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, and runtime CPU matrix `1/2 [HUGH_SECOND]`. Public
  release remains No-Go pending second-PC evidence, release-grade multi-device
  route evidence, KV-backed P2P control-plane proof, `musu@musu.pro` mailbox
  proof, and Microsoft Store evidence.
- 2026-06-02 05:24 KST second-PC return and handoff refresh: the returned
  `F:\Aisaak\Projects\localsend\second-pc-return\20260531-165240-HUGH-MAIN.second-pc-return.zip`
  imports successfully, but it only contains MSIX install evidence and a
  handoff JSON for `HUGH-MAIN` at `192.168.1.192:8949`. It contains no
  release-grade runtime idle CPU evidence, no runtime CPU scenario matrix, and
  no release-check JSON, so it cannot close runtime CPU/matrix or multi-device
  release gates. Fresh current-HEAD artifacts are now ready:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-052411.zip`
  verifies with `ok=true`, `fail_count=0`, `kit_count=1`, and
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-052442.zip`
  verifies with `ok=true`, `fail_count=0`. Send its nested
  `second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-052442.zip` to the
  second PC and run `run-second-pc-release-check.ps1` without
  `-SkipRuntimeIdleCpu` or `-SkipRuntimeCpuScenarioMatrix`.
- 2026-06-02 07:16 KST fresh mDNS runtime evidence refresh: after commit
  `39a9adf9833acb4324c46c646001c8c1ab622bfa`, fresh local-sideload MSIX
  build/install succeeded and the current primary evidence was rerun on
  `HUGH_SECOND`. Single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-070642-HUGH_SECOND.evidence.json`
  passed with output `MUSU_RELEASE_SMOKE_OK_20260602_070616`; desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-070807-HUGH_SECOND.desktop-open.evidence.json`
  passed with hot `0`, MUSU max one-core CPU `0`, repo Node `0.05`, owned
  WebView2 `0.26`, and working set `534.5MB`; four-state matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-070927-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_070927`.
  Release status remains No-Go because runtime CPU and matrix are still
  `1/2 [HUGH_SECOND]`, real multi-device route evidence is false,
  `musu@musu.pro` support mailbox evidence is missing, Store evidence is
  missing, and `musu.pro` P2P relay lease KV storage is not configured.
- 2026-06-02 07:36 KST current operator action pack refresh: clean HEAD
  `1228cb0396c76d2438f4a814e33eb4b38f398198` produced and verified the current
  final operator packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-073317.zip`
  (`ok=true`, `fail_count=0`, `kit_count=1`) and current operator action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-073356.zip`
  (`ok=true`, `fail_count=0`). Send the nested second-PC transfer zip
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-073356\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-073356.zip`
  to the second Windows PC and run `run-second-pc-release-check.ps1` without
  `-SkipRuntimeIdleCpu` or `-SkipRuntimeCpuScenarioMatrix`.
- 2026-06-02 08:02 KST release evidence verifier regression audit:
  `scripts\windows\test-release-evidence-verifiers.ps1 -Json` passed 9/9 at
  `.local-build\release-evidence-verifier-tests\20260602-080146`. The harness
  uses synthetic fixtures only and proves the live release verifiers fail
  closed for non-`musu.pro` P2P base URLs, unverified owner scope, relay as
  default data path, non-release-grade route transport proof,
  `route_kind=failed`, and incorrect direct/relay payload-transit claims. This
  does not close second-PC, live P2P, support mailbox, or Store gates; it locks
  the verifier policy while those external gates are still pending. The harness
  is included in desktop readiness script coverage and in the exact
  non-runtime-affecting evidence freshness allowlist.
- 2026-06-02 08:17 KST frontend polling timeout hardening:
  `useLowDutyPolling` now supports `taskTimeoutMs`, and major dashboard/desktop
  frontend pollers have bounded task timeouts: dashboard aggregate refresh
  `10s`, relay-token lookup `5s`, service health `5s`, device discovery `5s`,
  node mesh `8s`, process polling `5s`, agents surface `8s`, and task SSE
  fallback `8s`. Validation passed runtime-polling contract 7/7,
  `npm run typecheck`, `npm run build`, and `npm run lint -- --quiet`. Because
  this changes runtime source, the current packaged primary evidence becomes
  stale after commit; rebuild/install MSIX and rerun smoke, desktop
  single-instance, process ownership, desktop-open CPU, and matrix evidence
  before treating current HEAD as release-evidence-current.
- 2026-06-02 10:12 KST health poll backoff hardening:
  `musu up` bridge startup wait and auto-update post-swap `/health` polling now
  use capped 250ms -> 500ms -> 1s -> 2s backoff instead of fixed 500ms retry.
  Targeted Rust validation passed 2/2 via `cargo test --manifest-path
  .\musu-rs\Cargo.toml --lib -j 1 health_poll_delay`, and `git diff --check`
  passed. This reduces one local busy-loop candidate but is runtime source;
  fresh primary MSIX install plus smoke, process ownership, desktop-open CPU,
  and runtime CPU matrix evidence are required after commit. It does not close
  the second-PC CPU/matrix, route, P2P control-plane, support mailbox, or Store
  gates.
- 2026-06-02 10:51 KST fresh primary evidence after health poll backoff:
  release MSIX build/install passed for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`. Current primary evidence now
  passes on commit `1990b60b7e0b9f093c62bc48fa9b101a3f035c1b`:
  desktop single-instance
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-104113-HUGH_SECOND.desktop-single-instance.json`,
  process ownership
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-104113-HUGH_SECOND.process-ownership.json`,
  single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-104202-HUGH_SECOND.evidence.json`,
  desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-104113-HUGH_SECOND.desktop-open.evidence.json`,
  and runtime CPU matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-104331-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  Primary busy-loop is not reproduced: CPU hot `0`, MUSU `0`, Node `0.03`,
  WebView2 `0.18`; matrix max WebView2 `0.31`. Release remains No-Go because
  the two-machine CPU/matrix gates still need second-PC evidence.
- 2026-06-02 11:01 KST current operator packet/action pack refresh:
  clean HEAD `f68806cc026cabfea6706ced31134001d4847016` produced final packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-110033.zip`
  and action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-110105.zip`;
  both verify with `ok=true`, `fail_count=0`. Send the nested second-PC
  transfer zip
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-110105\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-110105.zip`
  to the second Windows PC and run the included release check without skipping
  runtime idle CPU or runtime CPU scenario matrix.
- 2026-06-02 11:14 KST relay idle hardening:
  dashboard cloud relay is now on-demand. `DashboardClient.tsx` no longer
  fetches `/api/account/relay-token` on mount and no longer auto-connects the
  relay WebSocket just because a node is selected. `Connect` lazily fetches the
  token with the existing `5s` timeout; selected-node changes and unmount abort
  pending token fetches, clear retry timers, and close relay WebSocket state.
  Validation passed: runtime-polling contract `8/8`, `npm run typecheck`,
  `npm run lint -- --quiet`, `npm run build`, and `git diff --check`. This is
  runtime source, so fresh MSIX smoke/process/desktop-open CPU/matrix evidence
  is required after commit before current-HEAD release evidence can be claimed.
- 2026-06-02 11:22 KST `musu.pro` deployment evidence:
  commit `77ba7a112581dfd3a2e05d62d7ba0b6a0ce2a0d6` passed GitHub Actions
  `Tests` run `26794342633`, `E2E Tests - musu-bee` run `26794342638`, and
  `Deploy musu-bee to Vercel` run `26794342631`. Vercel production URL
  `https://musu-9wn2j1cat-yellowhamas-projects.vercel.app` was aliased to
  `https://musu.pro`. This confirms web deployment only; live P2P route/relay
  lease evidence remains a separate release blocker.
- 2026-06-02 12:05 KST current-head evidence and qual audit:
  fresh primary evidence after relay idle hardening now passes desktop
  single-instance
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-113614-HUGH_SECOND.desktop-single-instance.json`,
  process ownership
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-113702-HUGH_SECOND.process-ownership.json`,
  single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-113759-HUGH_SECOND.evidence.json`,
  desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-114149-HUGH_SECOND.desktop-open.evidence.json`,
  and four-state matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-115359-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  The primary busy-loop report is not reproduced: desktop-open CPU records
  MUSU `0`, Node `0`, WebView2 `0.13`, hot `0`; matrix route token is
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_115359`. Clean go/no-go on
  `9b836bd1` reports `ready=false`, `local_artifacts_ready=true`,
  `single_machine=true`, runtime idle CPU `1/2`, runtime CPU matrix `1/2`,
  and blockers `multi-device`, `runtime-idle-cpu`,
  `runtime-cpu-scenario-matrix`, `p2p-control-plane`, `support-mailbox`, and
  `store-release`. Canonical public support address remains `musu@musu.pro`.
- 2026-06-02 12:22 KST current operator action pack refresh:
  clean HEAD `ef80aa94d76db4b08ca0866f6bc29c2ed889bdc4` generated final
  packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-121850.zip`
  and operator action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918.zip`;
  both verify with `ok=true`, `fail_count=0`. The current second-PC transfer
  zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-121918.zip`.
  The current Partner Center zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-121918.zip`.
  The current support verification id is
  `musu-store-support-1.15.0-rc.1-20260602-121850`.
- 2026-06-02 12:38 KST mDNS/P2P KV blocker audit:
  current clean source `6f3f598271ec0b6225524c7d63bbd8da068e7ae5` preserves
  the mDNS/Tailscale default hardening. Targeted mDNS unit tests passed 3/3,
  `cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed,
  and `RUST_LOG=debug .\musu-rs\target\debug\musu.exe discover --timeout 2`
  with mDNS opt-in env vars unset emitted no `Failed to send`, `ff02::fb`,
  `10065`, or `closed channel`; it disabled IPv6, Tailscale, and 9
  virtual/VPN interfaces and sent only on physical LAN `이더넷 2`.
  P2P control-plane status still reports `ok=false` because
  `KV_REST_API_TOKEN` and `KV_REST_API_URL` are missing while
  `MUSU_P2P_CONTROL_TOKEN_SHA256S` is present in GitHub. Latest live evidence
  remains blocked by `p2p_relay_lease_kv_not_configured`.
- 2026-06-02 13:00 KST operator API security hardening:
  `/api/nodes/execute`, `/api/processes`, `/api/processes/start`, and
  `/api/processes/kill` are no longer anonymous worker proxy conveniences.
  They now require authenticated operator identity, route through
  `operator-api-security.ts`, and enforce command/process policy gates:
  `MUSU_NODE_EXECUTE_ALLOWLIST` defaults to narrow diagnostics,
  `MUSU_PROCESS_START_ALLOWLIST` fails closed when empty,
  `MUSU_ENABLE_PROCESS_KILL` must be explicitly set for process termination,
  and `MUSU_ENABLE_REMOTE_WORKER_PROXY` must be explicitly set for remote
  process proxying. Accepted/rejected mutations are written to
  `~\.musu\audit\command-center.jsonl`. Validation passed `npm run
  test:routes` 12/12, `npm run typecheck`, `npm run build`, `git diff
  --check`, and `audit-operator-api-security-contract.ps1 -FailOnProblem`
  with `ok=true`, `fail_count=0`.
- 2026-06-02 13:15 KST post-security go/no-go:
  clean commit `94ecda1caceba4a40f091071e8d64825ce7a7b29` reports
  `ready=false`, `local_artifacts_ready=true`, `single_machine=false`,
  `multi_device=false`, `msix_install=true`, `msix_desktop_entrypoint=true`,
  runtime idle CPU `0/2`, runtime CPU matrix `0/2`,
  `p2p_control_plane=false`, `support_mailbox=false`, and
  `store_release=false`. This is expected after runtime/web source hardening:
  fresh primary MSIX install, smoke, desktop-open CPU, and runtime CPU matrix
  evidence must be rerun before final release claims.
- 2026-06-02 13:36 KST post-security primary evidence refresh:
  fresh MSIX workflow succeeded and installed
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`. Explicit WindowsApps alias
  `musu up --json` restored bridge health at `http://127.0.0.1:1065`.
  Current single-machine smoke passes at
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-132814-HUGH_SECOND.evidence.json`;
  desktop-open CPU passes at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-132531-HUGH_SECOND.desktop-open.evidence.json`
  with MUSU `0`, owned Node `0`, WebView2 `0.52`, working set `366.38MB`,
  and hot `0`; runtime CPU matrix passes at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-132921-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_132921`. Clean
  go/no-go on `6f7fe937fcc5dd7e9665bf374aee1bdd1be0e48c` reports
  `single_machine=true`, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime CPU
  matrix `1/2 [HUGH_SECOND]`, process/startup/desktop single-instance true,
  and `manifest_dirty=false`, but `ready=false` because second-PC,
  P2P control-plane, support mailbox, and Store gates are still open.
- 2026-06-02 13:40 KST current operator action pack refresh:
  final packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-134019.zip`
  and action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035.zip`
  both verify with `ok=true`, `fail_count=0`. The current second-PC transfer
  zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-134035.zip`;
  Partner Center zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-134035.zip`;
  support verification id is `musu-store-support-1.15.0-rc.1-20260602-134019`.
- 2026-06-02 13:57 KST P2P control-plane CI coverage:
  `npm run test:p2p` now covers route evidence, rendezvous, and relay lease
  routes and is wired into GitHub Actions after `npm run test:routes`. Local
  validation passed `npm run test:p2p` 21/21, `npm run test:routes` 12/12, and
  `git diff --check`. This is CI hardening only; the live release gate remains
  blocked until production KV env is configured and `musu.pro` owner-scope P2P
  evidence passes.
- 2026-06-02 14:25 KST release gate status script failure handling:
  `write-release-candidate-manifest.ps1` now falls back to .NET SHA256 when a
  child Windows PowerShell host lacks `Get-FileHash`. `write-release-go-no-go.ps1`
  and `show-final-release-handoff-status.ps1` now accept
  `-ScriptTimeoutSeconds` and bound child verifier execution. Validation passed
  manifest generation under `powershell.exe`, `write-release-go-no-go.ps1
  -ScriptTimeoutSeconds 120 -Json`, full `show-final-release-handoff-status.ps1
  -ScriptTimeoutSeconds 120 -Json`, and a forced 1s timeout fail-fast test.
  Status-only freshness allowlists were also updated in go/no-go,
  single-machine, and runtime-matrix verifiers for the new status scripts and
  the exact `test:p2p` package/workflow tooling-only diff.
  This is release-gate failure handling only; it does not close second-PC,
  P2P, support mailbox, or Store evidence gates.
- 2026-06-02 15:00 KST runtime reconnect backoff hardening:
  dashboard cloud relay WebSocket reconnect now uses capped backoff instead of
  a fixed retry delay, and chat task SSE reconnect now clears pending timers,
  suppresses duplicate `EventSource.CONNECTING` attempts, and uses a generation
  guard to prevent stale reconnects after channel/node changes or unmount.
  `npm run test:runtime-polling` is now a first-class web CI step before route
  and P2P tests. Validation passed runtime polling contract 10/10, typecheck,
  route tests 12/12, P2P tests 21/21, production build, lint with 0 errors,
  and `git diff --check`. This is runtime web source, so primary MSIX smoke,
  desktop-open CPU, and runtime matrix evidence must be refreshed after commit
  before current-HEAD release claims.
- 2026-06-02 15:45 KST post-reconnect primary evidence refresh:
  current-head primary evidence was restored on `HUGH_SECOND` after rebuilding
  and installing the MSIX package
  `musu_1.15.0.0_x64_local-sideload-manual.msix` as
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`. Use the explicit WindowsApps
  alias for packaged evidence because the local dev PATH still shadows with
  `C:\Users\empty\.cargo\bin\musu.exe`. Desktop single-instance passes at
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-152526-HUGH_SECOND.desktop-single-instance.json`.
  Process ownership passes at
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-152537-HUGH_SECOND.process-ownership.json`
  with runtime `1`, desktop `1`, owned Node `0`, owned WebView2 `6`,
  machine-wide Node `18`, machine-wide WebView2 `12`, and orphan repo helpers
  `0`. Single-machine smoke passes at
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-152615-HUGH_SECOND.evidence.json`.
  Desktop-open CPU passes at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-152845-HUGH_SECOND.desktop-open.evidence.json`
  with MUSU `0`, repo Node `0.05`, WebView2 `0.13`, working set `500.86MB`,
  and hot `0`. The four-state matrix passes at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-153038-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_153038`. Public release
  remains No-Go until second-PC CPU/matrix/route evidence, live `musu.pro` P2P
  owner-scope evidence, `musu@musu.pro` mailbox evidence, and Store evidence
  are recorded.
- 2026-06-02 15:58 KST current operator action pack refresh:
  clean HEAD `7bb367988d1ae5cbc41bbcd7ce68f4eeb4f57d10` generated final packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-155746.zip`
  and action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815.zip`.
  `verify-final-operator-gate-packet.ps1` passed with `ok=true`,
  `fail_count=0`, `kit_count=1`; `verify-operator-action-pack.ps1` passed with
  `ok=true`, `fail_count=0`. The current second-PC transfer zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-155815.zip`;
  Partner Center zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-155815.zip`;
  support verification id is `musu-store-support-1.15.0-rc.1-20260602-155746`.
  `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json` remains
  No-Go with blockers `multi-device`, `runtime-idle-cpu`,
  `runtime-cpu-scenario-matrix`, `p2p-control-plane`, `support-mailbox`, and
  `store-release`. On this host, full handoff status should be run singly with
  `-ScriptTimeoutSeconds 240` when validating the current action pack; a
  concurrent 120s status run timed out while the independent go/no-go completed.
- 2026-06-02 16:30 KST release status fast/deep verification hardening:
  `show-final-release-handoff-status.ps1` now defaults to quick packet/action
  pack verification and exposes `-PacketVerificationMode quick|deep|skip` plus
  `-ActionPackVerificationMode quick|deep|skip`; the old skip switches still
  map to `skip`. Quick mode checks archive metadata, required entries, clean
  git/support metadata, second-PC/Partner/support paths, and absence of `.pfx`
  files without full checksum traversal. Deep mode still runs the packet/action
  pack verifier scripts. `write-release-go-no-go.ps1` now preselects latest
  evidence candidates per machine and reports `available_candidate_count` plus
  `candidate_selection=latest-per-machine`, so accumulated stale evidence does
  not force every historical sample through child verifiers. Validation passed
  go/no-go with selected runtime idle `4/59`, runtime matrix `3/38`, and process
  ownership `3/36`; default handoff status completed under 120s with quick
  packet/action pack `fail_count=0` and `public_metadata_ok=true`; deep
  packet/action pack status completed under 240s with `fail_count=0`; release
  evidence verifier regression passed 13/13. Default operator status command is
  now quick 120s; use deep 240s only for full packet/action pack checksum
  verification.
- 2026-06-02 16:50 KST file sync watcher storm hardening:
  optional file sync now has bounded background behavior in
  `musu-rs/src/install/sync.rs`. The watcher event queue is capped at `1024`,
  each batch is capped at `256` events or `2s`, same-path events are coalesced
  to the latest event before processing, and batch-cap hits yield `50ms`.
  Validation passed cargo fmt, targeted `install::sync` unit test, and
  `git diff --check`. This reduces a file/network watcher resource-budget risk
  when shared roots are configured; because this is runtime Rust source, fresh
  primary MSIX/smoke/desktop-open CPU/runtime-matrix evidence is required after
  commit before current-HEAD release claims.

Release candidate manifest:

- script: `scripts\windows\write-release-candidate-manifest.ps1`
- latest manifest: `.local-build\release-candidates\1.15.0-rc.1\release-candidate-manifest.json`
- latest checksums: `.local-build\release-candidates\1.15.0-rc.1\SHA256SUMS.txt`
- private signing material is excluded unless explicitly requested with `-IncludePrivateArtifacts`.

## RC Gate Commands

```powershell
npm run typecheck
npm run test:runtime-polling
npm run test:routes
npm run test:p2p
npm run lint -- --quiet
npm run build
cargo check --manifest-path .\musu-rs\Cargo.toml -j 1
cargo clippy --manifest-path .\musu-rs\Cargo.toml --all-targets -j 1 -- -D warnings
cargo test --manifest-path .\musu-rs\Cargo.toml --lib -- --test-threads=1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1 -ScriptTimeoutSeconds 120 -Json
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\show-final-release-handoff-status.ps1 -PacketVerificationMode deep -ActionPackVerificationMode deep -ScriptTimeoutSeconds 240 -Json
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
- `check-msix-legacy-conflicts.ps1` now emits `musu.msix_legacy_conflicts.v1`
  JSON and exits nonzero with `-FailOnProblem`; `run-second-pc-release-check.ps1`
  includes this summary in return zips when present.
- `openai_compat_local` is not wired into the task runner hot path. Dashboard agent task default must stay on `claude` until runner dispatch is unified.
- `musu up` currently checks standard dashboard ports, not arbitrary dev smoke ports such as `3002`.
- Direct `musu up --json | ConvertFrom-Json` is now hardened in source for
  fresh bridge spawn, but packaged MSIX evidence for that exact CLI pipe is
  now present and passing through the explicit WindowsApps alias. Developer
  PATH shadowing still exists on `HUGH_SECOND` because
  `C:\Users\empty\.cargo\bin\musu.exe` precedes the WindowsApps alias.

## 2026-06-02 17:22 KST Post File-Sync Primary Evidence

After file sync watcher storm hardening, the primary release MSIX was rebuilt
and installed again on `HUGH_SECOND`. Fresh current evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-171420-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-171538-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-171659-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-171500-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-171500-HUGH_SECOND.process-ownership.json`

Current primary result:

- bridge health: `http://127.0.0.1:8155`
- single-machine dashboard task id: `60884022-fa9f-4e81-b0fc-775045bb63d0`
- desktop-open CPU: MUSU `0`, repo Node `0.03`, WebView2 `0.57`, hot `0`
- runtime matrix token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_171659`
- process ownership: runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `7`, machine-wide Node `18`

Public release remains No-Go: this restores primary evidence to `1/2` for the
runtime CPU gates, not `2/2`. The next gate is current second-PC CPU/matrix and
release-grade route evidence, followed by live `musu.pro` P2P owner-scope
evidence, `musu@musu.pro` mailbox evidence, and Store evidence.

2026-06-02 17:27 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1379` files and `2242` symbols after the post-file-sync primary evidence
  docs/evidence/spec updates.

## 2026-06-02 Runtime Stop/Down Command

The CLI now has a bounded runtime cleanup command for operator/evidence runs:

```powershell
musu stop --json
musu down --json
```

Both commands emit `musu.stop_report.v1` and only terminate the bridge PID
registered in `~\.musu\services\bridge.json` when that PID is a MUSU runtime
binary. Stale registry records are removed; non-MUSU PIDs are refused.

Validation passed:

- cargo fmt
- `cargo check --bin musu`
- targeted `install::cli_commands` tests 14/14
- `cargo build --bin musu`
- temporary-home `up --json` then `down --json` smoke

This is Rust CLI/runtime source, so package/evidence freshness must be restored
after commit before current-HEAD primary release evidence is claimed again.

2026-06-02 runtime stop/down index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1382` files and `2245` symbols after the runtime stop/down source and docs
  updates.

## 2026-06-02 18:20 KST Post Stop/Down Primary Evidence

After adding `musu stop` / `musu down`, the primary release MSIX was rebuilt,
installed, and revalidated on `HUGH_SECOND`.

Fresh primary evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-183133-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-183056-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-183056-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-183056-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-183240-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- packaged `musu down --json` emitted `musu.stop_report.v1` and stopped the
  registered bridge with `registry_deregistered=true` and
  `pid_alive_after=false`
- single-machine smoke passed with dashboard task
  `74e0a4fa-64ce-4463-a288-7b4ed2f7ba3a`, bridge `http://127.0.0.1:2890`,
  output `MUSU_RELEASE_SMOKE_OK_20260602_183115`, and CLI route checked
- desktop repeated activation passed: repeat count `3`, final desktop shell
  count `1`, fail count `0`
- process ownership passed: runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `6`, machine-wide Node `18`, orphan repo helpers `0`
- desktop-open CPU passed from clean git state: MUSU `0`, repo Node `0.03`,
  WebView2 `0`, working set `497.57MB`, hot `0`
- four-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_183240`

Public release remains No-Go. Primary evidence is restored to the current
runtime stop/down source, but second-PC CPU/matrix/route evidence, live
`musu.pro` P2P owner-scope evidence, `musu@musu.pro` mailbox evidence, and
Store evidence are still required.

2026-06-02 18:21 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1407` files and `2245` symbols after the post-stop/down primary evidence
  docs/evidence/spec/wiki updates.

## 2026-06-02 18:52 KST Second-PC Runtime Cleanup Hardening

The second-PC wrapper now records cleanup evidence at the end of every run:

- script: `scripts\windows\run-second-pc-release-check.ps1`
- schema: `musu.second_pc_runtime_cleanup.v1`
- output: `.local-build\runtime-cleanup\*.runtime-cleanup.json`
- action: packaged WindowsApps alias `musu down --json --timeout-sec 5`
- action: close packaged `musu-desktop.exe` shells opened by the evidence run
- return zip: includes the runtime cleanup JSON
- wrapper `ok=true`: now requires cleanup success

The multidevice kit README and operator action-pack quickstart now mention the
cleanup artifact, and `verify-operator-action-pack.ps1` checks for those
instructions. Parser validation passed for the wrapper, kit generator,
operator action-pack generator, and action-pack verifier.
`test-release-evidence-verifiers.ps1` passed 13/13.

Short local wrapper smoke on `HUGH_SECOND` failed early at MSIX install evidence
capture because the known development alias
`C:\Users\empty\.cargo\bin\musu.exe` shadows the WindowsApps alias, but the new
`finally` cleanup still ran and produced
`.local-build\runtime-cleanup\20260602-185052-HUGH_SECOND.runtime-cleanup.json`
with `ok=true`, `stop_exit_code=0`, and `remaining_desktop_shell_count=0`.

Release meaning: this does not close the second-PC gate, but it makes the next
second-PC return safer and more attributable. A real current second-PC run is
still required for runtime idle CPU, runtime CPU matrix, and route evidence.

2026-06-02 18:53 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1409` files and `2245` symbols after second-PC runtime cleanup hardening,
  docs/wiki/spec updates, and CoS memory updates.

## 2026-06-02 18:58 KST Current Operator Handoff Refresh

After committing the second-PC runtime cleanup wiring, the clean HEAD
`a3cfdb5c153da2f3e2fca0f7ad337890290a2ff4` generated and verified the
current operator handoff artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-185745.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-185802.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-185802.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260602-185745`
- support mailbox:
  `musu@musu.pro`

`verify-final-operator-gate-packet.ps1` passed with `ok=true`,
`fail_count=0`, and `kit_count=1`. `verify-operator-action-pack.ps1` passed
with `ok=true` and `fail_count=0`; the second-PC transfer quickstart and nested
kit README now both verify that `.local-build\runtime-cleanup\*.runtime-cleanup.json`
is listed for return.

2026-06-02 19:00 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1410` files and `2245` symbols after the current operator action pack
  refresh, BETA/current-head/WIKI/WIKI_INDEX/GOAL updates, and CoS memory
  `2026-06-02_1859_kst_current_operator_action_pack_after_cleanup.md`.

## 2026-06-02 19:26 KST Stop/Desktop Cleanup Hardening

`musu stop` / `musu down` now support explicit desktop-shell cleanup:

```powershell
musu down --json --timeout-sec 5 --include-desktop
```

The default command still stops only the registered bridge runtime. With
`--include-desktop`, `musu.stop_report.v1` also records
`desktop_cleanup_attempted`, `desktop_pids_before`,
`desktop_terminate_requested_pids`, `desktop_pids_after`, and
`desktop_errors`.

The second-PC release wrapper now uses the new option before its existing
packaged-desktop cleanup fallback. Validation passed `cargo check`, services
tests 15/15, install CLI tests 14/14, PowerShell parser check, `git diff
--check`, and a source CLI no-op smoke with `desktop_errors=[]`.

Release caveat: this is a Rust source change, so packaged primary evidence must
be rebuilt/refreshed after commit before current-source local gates are clean
again.

2026-06-02 19:27 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1412` files and `2251` symbols after stop/desktop cleanup hardening, docs,
  WIKI, WIKI_INDEX, GOAL, and CoS memory updates.

## 2026-06-02 20:10 KST Post Stop/Desktop Cleanup Primary Evidence

After rebuilding and installing the local-sideload MSIX with
`--include-desktop`, current primary evidence is restored on `HUGH_SECOND`.

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-195914-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-195058-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-195129-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-195140-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-200531-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- desktop repeated activation: pass, repeat count `3`, final shell count `1`
- process ownership: pass, runtime `1`, desktop `1`, MUSU-owned Node `0`,
  MUSU-owned WebView2 `6`, machine-wide Node `16`, orphan repo helpers `0`
- desktop-open CPU: pass, MUSU `0`, WebView2 `0.39`, owned Node `0`, working
  set `362.27MB`, hot `0`
- runtime CPU matrix: pass, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_200531`
- packaged cleanup:
  `musu down --json --timeout-sec 5 --include-desktop` stopped bridge PID
  `12472` and desktop PID `16460`, with `desktop_pids_after=[]`

Clean go/no-go remains No-Go: `single_machine=true`, runtime idle CPU `1/2`,
runtime matrix `1/2`, process ownership true, desktop single-instance true,
`manifest_dirty=false`. Remaining blockers are real second-PC multi-device
route evidence, second-PC CPU/matrix evidence, live `musu.pro` P2P
owner-scoped evidence, `musu@musu.pro` mailbox evidence, and Store evidence.

2026-06-02 20:10 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1421` files and `2251` symbols after the post stop/desktop cleanup primary
  evidence docs/evidence/wiki updates.

## 2026-06-02 20:30 KST Desktop Runtime Autostart Hardening

Desktop activation is now treated as a runtime-start contract. The Tauri shell
starts one background `musu-runtime-autostart` attempt during setup when bridge
health is missing or failed.

The runtime command path now prefers the packaged sibling `musu.exe` next to
`musu-desktop.exe` before PATH fallback. This avoids the known developer alias
shadowing issue where `C:\Users\empty\.cargo\bin\musu.exe` can be selected
instead of the installed package runtime.

Validation passed:

- `cargo fmt --manifest-path .\musu-bee\src-tauri\Cargo.toml`
- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -- --test-threads=1`
  7/7
- `git diff --check`

Release caveat: this is Tauri source, so current packaged evidence is stale
until MSIX rebuild/install proves desktop activation leaves bridge runtime
running without a separate manual `musu up`.

2026-06-02 20:30 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1423` files and `2257` symbols after the desktop runtime autostart
  source/docs/spec updates.

## 2026-06-02 20:45 KST Post Desktop Autostart Primary Evidence

The rebuilt local-sideload MSIX now proves desktop runtime autostart on
`HUGH_SECOND`.

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-204104-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-203815-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-203833-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-203858-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-204112-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result: desktop activation leaves runtime `1`, desktop `1`, bridge health HTTP
200 at `127.0.0.1:14805`, MUSU-owned Node `0`, and MUSU-owned WebView2 `6`
without manual `musu up`. Desktop-open CPU passes with MUSU `0`, WebView2
`0.42`, working set `364.02MB`, and no hot processes. Matrix token:
`MUSU_CPU_SCENARIO_ROUTE_OK_20260602_204112`.

2026-06-02 20:46 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1432` files and `2257` symbols after the post desktop autostart primary
  evidence docs/evidence/wiki updates.

## 2026-06-02 21:10 KST Cloud Hardware Probe Idle Hardening

The logged-in cloud registration loop now uses cached hardware metadata for
heartbeat registration. Windows no longer uses PowerShell/WMIC as the default
RAM/CPU metadata path; it uses Win32 `GlobalMemoryStatusEx` and registry
`RegGetValueW`. GPU VRAM probing through `nvidia-smi` remains available but is
behind the process-local hardware metadata cache, so it is not rerun on every
heartbeat interval.

Validation passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml peer::hardware --lib -- --test-threads=1`
  3/3

Release caveat: this is Rust runtime source. Current packaged primary evidence
is stale until MSIX rebuild/install and fresh single-machine/process/CPU/matrix
evidence are recorded again.

## 2026-06-02 21:45 KST Post Cloud Hardware Probe Primary Evidence

After rebuilding and installing the local-sideload MSIX from commit
`9fff34aa1dda3eb58d5b105271f660a0c417efaf`, primary packaged evidence is
current again.

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-213655-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-213404-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-213412-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-213436-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-213706-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result: desktop activation passed with one final shell; process ownership
passed with runtime `1`, desktop `1`, owned Node `0`, owned WebView2 `6`, and
bridge `127.0.0.1:7644`; desktop-open CPU passed with MUSU `0`, Node `0`,
WebView2 `0.49`, working set `363.18MB`, hot `0`; matrix passed with token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260602_213706`. Cleanup stopped bridge PID
`32264`, desktop PID `34248`, and the temporary dashboard process tree.

## 2026-06-02 21:58 KST P2P KV and Second-PC Recheck

Fresh hosted P2P control-plane evidence:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.verification.json`

Result: still No-Go. The live endpoint is logged in, rendezvous is wired, relay
lease control-plane is wired, runtime relay fallback is wired, and
`relay_default_data_path=false`; however relay lease query remains `ok=false`,
`owner_scope_verified=false`, and `owner_scoped=false` with
`p2p_relay_lease_kv_not_configured`. GitHub has
`MUSU_P2P_CONTROL_TOKEN_SHA256S`, but `KV_REST_API_URL` and
`KV_REST_API_TOKEN` are still missing. Local process/user/machine env also has
no KV/Upstash values and the repo only has `.env.example`.

Second-PC recheck: `Test-NetConnection 192.168.1.192 -Port 8949` failed
(`TcpTestSucceeded=false`, ping timeout). The previous `HUGH-MAIN`
multi-device target is not currently reachable, so fresh two-machine
CPU/matrix/route evidence cannot be captured from `HUGH_SECOND`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_KV_SECOND_PC_RECHECK_2026_06_02.md`

2026-06-02 22:00 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1448` files and `2262` symbols after the P2P KV/second-PC recheck docs and
  fresh hosted P2P evidence.

## 2026-06-02 22:18 KST Route Explain Trust Boundary

`musu route --explain` no longer trusts candidate metadata claims that peer
identity or encryption are already verified. Explain output can still report
that HTTPS fingerprint pinning is available when advertised key material exists,
but it keeps `peer_identity_verified=false`,
`peer_identity_method=advertised_tls_cert_fingerprint_unverified`, and
`encryption=none_http_bearer` until an actual runtime transport proof exists.

Validation passed:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  14/14
- `git diff --check`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROUTE_EXPLAIN_TRUST_BOUNDARY_HARDENING_2026_06_02.md`

Release caveat: Rust source changed, so current packaged primary evidence is
stale until MSIX build/install and primary smoke/process/CPU/matrix evidence are
refreshed from this source commit.

2026-06-02 22:20 KST index refresh:

- `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  `1450` files and `2261` symbols after route explain trust-boundary
  hardening.

## 2026-06-02 22:56 KST Post Route Explain Primary Evidence

Fresh packaged primary evidence after commit `93025897`:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-224345-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-223734-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-223756-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-223806-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-224917-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result: primary local desktop evidence passes. Desktop repeated activation
kept one final shell; process ownership shows runtime `1`, desktop `1`,
MUSU-owned Node `0`, MUSU-owned WebView2 `6`, machine-wide Node `16`, and no
orphan repo helpers. Desktop-open CPU is MUSU `0`, Node `0`, WebView2 `0.39`,
working set `365.49MB`, and hot `0`. The 4-state matrix passed with token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260602_224917`.

Current release state: local artifacts remain usable, but public release is
No-Go until second-PC CPU/matrix/route, live owner-scoped P2P KV evidence,
release-grade transport proof, `musu@musu.pro` mailbox evidence, and Store
evidence pass.

## 2026-06-02 Relay Route Lease-Proof Hardening

`POST /api/v1/p2p/route-evidence` now rejects relay-route false positives for
release grading. A `route_kind=relay` record is release-grade only if it also
includes relay fallback lease proof: direct route failure, lease requested,
issued status, `lease_issued=true`, non-empty lease id, a prior non-relay
attempted route, and no lease policy blockers.

Validation:

- `npm run test:p2p -- src/app/api/v1/p2p/route-evidence/route.test.ts`
  23/23
- `npm run typecheck`
- `npm run build`
- current-commit single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-231612-HUGH_SECOND.evidence.json`

This does not implement relay payload transport. It hardens the evidence gate
so relay remains an explicit Connect/Pro fallback after direct-route failure,
not a silent/default data path.

## 2026-06-03 Current Operator Pack and P2P Recheck

Current-head external handoff artifacts from clean commit `f83174fb`:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-023702.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-023727.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-023727.zip`

Both verifiers pass with `ok=true` and `fail_count=0`.

Fresh P2P live evidence:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-023834-musu.pro.evidence.json`
- verification fail count: `4`
- passing: relay status logged-in/wired, route evidence client wired,
  rendezvous wired, relay lease control-plane wired,
  `relay_default_data_path=false`
- failing: relay leases `ok=false`, `owner_scope_verified=false`,
  `owner_scoped=false`
- live blocker: `p2p_relay_lease_kv_not_configured`
- env blocker: missing `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
  `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`

## 2026-06-03 02:51 KST Low-Duty Polling Default Timeout Hardening

`useLowDutyPolling` now applies
`DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS = 10_000` when callers omit
`taskTimeoutMs`. This means shared frontend polling tasks default to bounded
`AbortSignal.timeout(...)` / `AbortSignal.any(...)` cancellation instead of
relying on every caller to remember a timeout.

Validation passed:

- `npx tsx --test src/app/runtime-polling-contract.test.ts` - 10/10
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Release caveat: this is a frontend source change, so the latest packaged MSIX
primary evidence is stale until MSIX rebuild/install and primary
single-machine/process/CPU/matrix evidence are refreshed from this commit.
Public release remains No-Go on second-PC CPU/matrix/route, live owner-scoped
P2P KV/Upstash evidence, release-grade transport proof, `musu@musu.pro`
mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_LOW_DUTY_POLLING_DEFAULT_TIMEOUT_HARDENING_2026_06_03.md`

## 2026-06-03 03:25 KST Post Low-Duty Polling Primary Evidence

After the low-duty polling timeout source change, the local-sideload MSIX was
rebuilt and replaced on `HUGH_SECOND`, then primary evidence was refreshed from
clean commit `335f2836473137e2fae06f1f8ce0b0fc198678a9`.

Current primary evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-031050-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-031229-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-031234-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-031248-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-031911-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result: single-machine is back to true, runtime idle CPU is `1/2`, runtime CPU
matrix is `1/2`, process ownership is true, and desktop single-instance is
true. Desktop-open CPU reports MUSU `0.03`, Node `0.05`, WebView2 `0.6`,
working set `499.66MB`, and hot `0`. Matrix route token:
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_031911`.

mDNS regression also passed: targeted tests 3/3 and debug `musu discover
--timeout 2` with opt-in env vars unset emitted no `Failed to send`,
`ff02::fb`, `10065`, or `closed channel`; it disabled 9 virtual/VPN interfaces
and sent only on physical `이더넷 2`.

Public release remains No-Go on second-PC CPU/matrix/route, live owner-scoped
P2P KV/Upstash evidence, release-grade transport proof, `musu@musu.pro`
mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_LOW_DUTY_POLLING_PRIMARY_EVIDENCE_2026_06_03.md`

## 2026-06-03 03:35 KST Operator Pack and P2P Recheck

Current-head external handoff artifacts from clean commit `aaf74ca2`:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-033322.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-033353.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-033353.zip`

Both final packet and action pack verifiers pass with `ok=true` and
`fail_count=0`.

Second-PC reachability recheck: `Test-NetConnection 192.168.1.192 -Port 8949`
still reports `TcpTestSucceeded=false` and ping timeout, so live two-machine
route/CPU/matrix evidence cannot be captured from the primary machine yet.

Fresh P2P live evidence:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-033453-musu.pro.evidence.json`
- verification fail count: `4`
- failing: evidence `ok=false`, relay leases `ok=false`,
  owner scope false, owner-scoped false
- env blocker: missing `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
  `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`
- live blocker: `p2p_relay_lease_kv_not_configured`
- `relay_default_data_path=false`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_OPERATOR_PACK_P2P_RECHECK_2026_06_03_0335.md`

## 2026-06-03 04:01 KST Polling Interval Clamp and Primary Evidence

`useLowDutyPolling` now clamps accidental tight frontend intervals:

- `MIN_LOW_DUTY_POLL_INTERVAL_MS = 5_000`
- hidden polling uses `LOW_DUTY_HIDDEN_BACKOFF_MULTIPLIER = 4`
- effective max backoff is never below the effective interval
- document visibility binding is guarded with `typeof document !== "undefined"`

Validation passed `npx tsx --test src/app/runtime-polling-contract.test.ts`
11/11, `npm run test:runtime-polling` 11/11, `npm run typecheck`,
`npm run build`, `npm run lint` with 0 errors and 74 existing warnings, and
`git diff --check`.

Fresh packaged primary evidence after MSIX rebuild/install:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-035325-HUGH_SECOND.evidence.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-035450-HUGH_SECOND.desktop-single-instance.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260603-035436-HUGH_SECOND.process-ownership.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-035458-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-035608-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Desktop-open CPU reports MUSU `0`, Node `0.03`, WebView2 `0.6`, working set
`500.44MB`, and hot `0`. Matrix route token:
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_035608`.

Clean go/no-go remains No-Go: local artifacts, single-machine, MSIX install,
MSIX desktop entrypoint, process ownership, startup single-instance, desktop
single-instance, and public metadata pass, but runtime idle CPU and matrix are
still `1/2`. Remaining blockers are second-PC multi-device/CPU/matrix evidence,
support mailbox, Store release, and live owner-scoped `musu.pro` P2P relay lease
evidence.

Local alias shadowing:

- `C:\Users\empty\.cargo\bin\musu.exe` precedes
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- explicit packaged invocation:
  `& "C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe"`
- this is now recorded as an operator PATH remediation item, not a
  `runtime-package` artifact blocker.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POLLING_INTERVAL_CLAMP_PRIMARY_EVIDENCE_2026_06_03.md`

Current operator handoff after the polling clamp evidence commit:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-040654.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-040714.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-040714\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-040714.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-040714\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-040714.zip`

Both packet verifiers pass with `ok=true` and `fail_count=0`.

## 2026-06-03 04:25 KST MSIX Alias Shadowing Hardening

MSIX release tooling now separates true PATH alias shadowing from later
alternate `musu.exe` binaries. `msix-common.ps1` records alias order, WindowsApps
alias presence/discovery, first alias path, alternate alias sources, and true
alias shadowing. The install evidence capture also records
`windowsapps_alias_invocation`, `alias_resolution_order`, `alternate_alias_count`,
`alternate_alias_sources`, and `alias_remediation`.

Validation:

- `check-msix-legacy-conflicts.ps1 -Json` reports current local shadowing:
  `C:\Users\empty\.cargo\bin\musu.exe` before the WindowsApps alias.
- `verify-installed-msix-package.ps1` confirms the installed MSIX package,
  manifest, Start menu entry, alias contract, and artifact contract match.
- `capture-msix-install-evidence.ps1 -Json` records alias order and remediation.
- `audit-desktop-release-readiness.ps1 -Json` reports
  `runtime_package_ready=True`, `desktop_shell_ready=True`,
  `single_machine_verified=True`.
- `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120` reports
  `local_artifacts_ready=True`; public release remains No-Go on second-PC,
  runtime CPU 2/2, support mailbox, Store, and live `musu.pro` P2P
  control-plane evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MSIX_ALIAS_SHADOWING_HARDENING_2026_06_03.md`

## 2026-06-03 04:30 KST External Gate Recheck

Current HEAD `c7b0d599` still reports public No-Go, with
`local_artifacts_ready=True` and local package/single-machine gates passing.

Second-PC reachability:

- command: `Test-NetConnection 192.168.1.192 -Port 8949`
- source: `192.168.1.154`
- interface: `이더넷 2`
- `PingSucceeded=False`
- `TcpTestSucceeded=False`

Fresh P2P live evidence:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-043017-musu.pro.summary.md`

The P2P verifier still reports `ok=false`, `fail_count=4`: relay status is
logged in and path-selection/rendezvous/lease wiring pass, but relay leases are
not ok and owner scope is not verified. `relay_default_data_path=false`, and the
live error remains `p2p_relay_lease_kv_not_configured`.

P2P env status still has `MUSU_P2P_CONTROL_TOKEN_SHA256S` but lacks
`KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
`KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_GATE_RECHECK_2026_06_03_0430.md`

## 2026-06-03 04:41 KST P2P Evidence Recorder Alias Hardening

`record-p2p-control-plane-evidence.ps1` now defaults to the packaged
WindowsApps alias when the operator does not pass `-MusuExe`. Resolution order:

1. explicit `-MusuExe`
2. packaged WindowsApps alias
3. repo debug binary
4. PATH `musu.exe`

Fresh default-run evidence:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-044110-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-044110-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-044110-musu.pro.summary.md`

The recorder output includes:

- `musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `musu_exe_source=windowsapps_alias`

P2P still fails correctly on production storage/owner-scope:
`p2p_relay_lease_kv_not_configured`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_EVIDENCE_RECORDER_ALIAS_HARDENING_2026_06_03.md`

## 2026-06-03 05:09 KST External Recheck Recorder and Clean Evidence

Added `scripts\windows\record-external-release-gate-recheck.ps1` as the
repeatable operator snapshot for external release gates. It records final
go/no-go, second-PC reachability, `musu.pro` P2P env status, and live P2P
control-plane evidence in one command under
`docs\evidence\external-gates\1.15.0-rc.1`.

Clean HEAD `d80e929e` evidence:

- external recheck:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-050915-HUGH_SECOND.external-gates.evidence.json`
- P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-051044-musu.pro.evidence.json`

Result:

- `local_artifacts_ready=True`
- `single_machine_verified=True`
- runtime idle CPU `1/2`
- runtime CPU scenario matrix `1/2`
- second-PC `192.168.1.192:8949` unreachable
  (`PingSucceeded=False`, `TcpTestSucceeded=False`, source `192.168.1.154`,
  interface `이더넷 2`)
- P2P evidence uses `musu_exe_source=windowsapps_alias`
- P2P remains blocked by `p2p_relay_lease_kv_not_configured`

Public desktop release remains No-Go on second-PC route/CPU/matrix evidence,
live owner-scoped `musu.pro` P2P lease evidence, `musu@musu.pro` mailbox
delivery evidence, and Store / Partner Center evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_RECHECK_RECORDER_2026_06_03.md`

## 2026-06-03 05:24 KST Bounded External Gate Probe

`record-external-release-gate-recheck.ps1` now uses a bounded second-PC
reachability probe instead of `Test-NetConnection` defaults. Clean HEAD
`080bc6dc` evidence:

- external recheck:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-052447-HUGH_SECOND.external-gates.evidence.json`
- P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-052547-musu.pro.evidence.json`

Second-PC probe records `probe_method=bounded_ping_and_tcp`,
`probe_timeout_ms=3000`, `source_address=192.168.1.154`,
`interface_alias=이더넷 2`, `ping_elapsed_ms=2887`, `tcp_elapsed_ms=3016`, and
`tcp_error=tcp_connect_timeout`.

Release result remains No-Go: `local_artifacts_ready=True`,
`single_machine_verified=True`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, P2P still blocked by `p2p_relay_lease_kv_not_configured`, and
support/Store evidence are still missing.

## 2026-06-03 06:12 KST Post Relay Store Status Live P2P Evidence

After the relay lease store status hardening was deployed, current-source CLI
evidence was recorded with:

```powershell
cargo build --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\record-p2p-control-plane-evidence.ps1 -MusuExe .\musu-rs\target\debug\musu.exe -AllowUnverified -Json
```

Fresh P2P artifacts:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.summary.md`

Verification remains failed with `ok=false`, `fail_count=6`:
`relay_status_logged_in=true`, `relay_leases_ok=false`,
`owner_scope_verified=false`, `owner_scoped=false`,
`relay_default_data_path=false`, `relay_lease_store_configured=false`,
`relay_lease_store_backend=unconfigured`, and
`relay_lease_store_release_grade=false`.

The remaining live P2P blocker is production KV/Upstash provisioning:
`p2p_relay_lease_kv_not_configured`. Relay payload transport remains unwired,
so even after owner-scoped relay lease storage is configured, relay payload
transit evidence is still required before `route_kind=relay` can be treated as
release-grade.

## 2026-06-03 06:44 KST Primary Evidence Refresh After Relay Store Status

Fresh primary-machine evidence was recorded after the live relay lease store
status P2P pass:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-062456-HUGH_SECOND.evidence.json`
- verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-062456-HUGH_SECOND.verification.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-062633-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-063400-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- single-machine smoke passed with task
  `5fa8a73b-3d0b-4976-b234-0b9d256827c6` and output
  `MUSU_RELEASE_SMOKE_OK_20260603_062433`
- desktop-open CPU passed for `60.068s`; MUSU `0`, Node `0.05`, WebView2
  `0.31`, working set `501.98MB`, hot `0`
- runtime matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_063400`; all four scenarios recorded
  `git_dirty=false` and hot `0`
- clean go/no-go on HEAD `85dec851` reports
  `local_artifacts_ready=True`, `single_machine_verified=True`,
  `multi_device_verified=False`, runtime idle CPU still not 2/2, runtime CPU
  matrix still not 2/2, P2P false, support mailbox false, and Store false

Public release remains No-Go until second-PC route/CPU/matrix evidence, live
`musu.pro` owner-scoped KV/Upstash relay lease evidence, relay payload transport
proof, `musu@musu.pro` mailbox evidence, and Partner Center/Store evidence are
recorded.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_PRIMARY_EVIDENCE_REFRESH_AFTER_RELAY_STORE_STATUS_2026_06_03.md`

## 2026-06-03 07:00 KST External Recheck CLI Override and Operator Pack

`record-external-release-gate-recheck.ps1` now accepts `-MusuExe` and passes it
through to `record-p2p-control-plane-evidence.ps1`. This lets the external gate
recorder capture current-source CLI P2P fields when the installed WindowsApps
alias is behind the current evidence schema.

Fresh current operator artifacts:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-065454.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-065519.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-065519.zip`

Verification:

- final packet: `ok=true`, `fail_count=0`, `kit_count=1`
- action pack: `ok=true`, `fail_count=0`

Fresh external evidence:

- external:
  `docs\evidence\external-gates\1.15.0-rc.1\20260603-065918-HUGH_SECOND.external-gates.evidence.json`
- P2P:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-070018-musu.pro.evidence.json`

Result remains No-Go: second-PC `192.168.1.192:8949` TCP connect timed out,
P2P env is missing KV/Upstash storage, and live P2P evidence records
`relay_lease_store_backend=unconfigured`,
`relay_lease_store_release_grade=false`, and
`p2p_relay_lease_kv_not_configured`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_RECHECK_CLI_OVERRIDE_OPERATOR_PACK_2026_06_03.md`

## 2026-06-03 07:20 KST Fleet SSE Lifecycle Hardening

The global Fleet EventSource in `useFleetStore` was hardened after the
busy-loop/process attribution audit. This closes one frontend runtime lifecycle
gap but does not close the public release gates.

Code changes:

- `useFleetStore` now has bounded Fleet SSE reconnect:
  `1_000ms` initial, `10_000ms` max, multiplier `2`, max attempts `5`
- stale reconnect timers are ignored through `fleetReconnectGeneration`
- `closeSSE()` clears timers, closes the global EventSource, and resets retry
  state
- `/dashboard/fleet` and `/dashboard/agent/[id]` close Fleet SSE on unmount
- `runtime-polling-contract.test.ts` now locks this behavior

Validation:

- `npm run test:runtime-polling`: `12/12`
- `npm run typecheck`: passed
- `npm run build`: passed
- `git diff --check`: passed

Clean go/no-go after code commit `aa23fc85c7caba0e05e3436df3aa3c64e3acfa39`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=false`
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `msix_desktop_entrypoint_verified=true`
- `manifest_git.dirty=false`

Interpretation:

- the current frontend source is safer than before
- previous primary-machine MSIX smoke/CPU/matrix evidence is stale for this
  HEAD
- next local release action is to rebuild/install MSIX for `aa23fc85` and
  refresh single-machine smoke, desktop-open CPU, and runtime CPU matrix
- external No-Go blockers remain second-PC evidence, `musu.pro` KV/Upstash
  owner-scoped P2P evidence, relay payload transport proof,
  `musu@musu.pro` mailbox evidence, and Store evidence

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FLEET_SSE_LIFECYCLE_HARDENING_2026_06_03.md`

## 2026-06-03 07:50 KST Post Fleet SSE Primary Evidence Refresh

Current primary-machine evidence was restored after Fleet SSE lifecycle
hardening.

Build/install:

- rebuilt local-sideload MSIX:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- runtime evidence used explicit packaged alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-073941-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-074231-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-074415-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- single-machine smoke passed with task
  `595585da-e3c5-43f4-8468-d1cec100133a`
- desktop-open CPU passed for `60.061s`: MUSU `0`, Node `0.05`,
  WebView2 `0.16`, working set `500.12MB`, hot `0`
- runtime matrix passed all four scenarios with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_074415`
- clean go/no-go on `0428c20020a5fbd0331e3aa6ed2ae319e54348d0`:
  `local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle
  CPU valid machines `1`, runtime CPU matrix valid machines `1`,
  `manifest_git.dirty=false`

Caveat:

- `capture-msix-install-evidence.ps1` still fails on HUGH_SECOND because
  `C:\Users\empty\.cargo\bin\musu.exe` shadows the WindowsApps alias. The
  package install verifier passed, but no new MSIX install evidence was recorded
  to docs in this pass.

Release state:

- local primary evidence is restored
- public release remains No-Go until second-PC route/CPU/matrix, live
  `musu.pro` owner-scoped KV/Upstash relay lease evidence, relay payload
  transport proof, `musu@musu.pro` mailbox evidence, and Store evidence are
  recorded

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_FLEET_SSE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

## 2026-06-03 08:10 KST MSIX Alias Shadow Warning Policy

MSIX install evidence now separates strict public release gates from developer
warning diagnostics:

- default `AliasShadowingMode=fail` remains the release-gate behavior
- `warn-explicit-windowsapps` is explicit diagnostic mode only
- warning mode requires a discoverable packaged WindowsApps alias and
  `windowsapps_alias_invocation`
- warning mode accepts only alias-shadow-only legacy conflicts; startup/bin
  conflicts still fail

Current HUGH_SECOND warning-mode evidence:

- `.local-build\msix-install-shadow-warning\20260603-080717-HUGH_SECOND.evidence.json`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- shadowing path:
  `C:\Users\empty\.cargo\bin\musu.exe`
- packaged alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- default verifier rejects it with `fail_count=4`
- warning verifier accepts it with `fail_count=0`

Release interpretation:

- no warning evidence was recorded into canonical
  `docs\evidence\msix-install\1.15.0-rc.1`
- public release still requires clean alias order on the evidence machine
- this fixes diagnosis/reporting; it does not close second-PC, `musu.pro`,
  support mailbox, relay payload transport, or Store blockers

Validation:

- PowerShell parser: changed scripts parse
- `test-release-evidence-verifiers.ps1 -Json`: `17/17`
- real HUGH_SECOND warning capture: `ok=true`
- dirty-tree go/no-go preserved `msix_install_verified=true` from the canonical
  clean HUGH-MAIN MSIX install evidence with `alias_shadowing_mode=fail`
- clean post-commit go/no-go at 2026-06-03 08:15 KST:
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `msix_install_verified=true`, `msix_desktop_entrypoint_verified=true`,
  `public_metadata_ok=true`, `manifest_git.dirty=false`, public No-Go

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MSIX_ALIAS_SHADOW_WARNING_POLICY_2026_06_03.md`

2026-06-03 08:12 KST index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1634` files and `2283` symbols after wiki/596, GOAL v399-v400,
  MSIX alias-shadow warning policy docs, WIKI/WIKI_INDEX updates, and CoS
  memories

## 2026-06-03 08:29 KST P2P Relay Transport Gate Hardening

Hosted P2P release evidence now rejects lease-only relay readiness.

Changed gate behavior:

- `verify-p2p-control-plane-evidence.ps1` requires
  `relay_status.relay_transport_wired=true`
- `verify-p2p-control-plane-evidence.ps1` requires
  `relay_leases.relay_transport_wired=true`
- `show-musu-pro-p2p-env-status.ps1` reports relay transport fields and emits
  `live_evidence_relay_transport_not_wired`
- `write-release-go-no-go.ps1` now says the live P2P gate requires
  `relay_default_data_path=false` and `relay_transport_wired=true`

Validation:

- PowerShell parser passed for changed scripts
- release evidence verifier regression passed `18/18`
- new regression fixture:
  `p2p rejects lease-only relay without payload transport`
- live P2P evidence
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-070018-musu.pro.evidence.json`
  now fails with `fail_count=8`
- clean post-commit go/no-go reports
  `manifest_git.dirty=false`, `local_artifacts_ready=false`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, `public_metadata_ok=true`,
  `p2p_control_plane_verified=false`, and `p2p_relay_transport_wired=false`

Current hosted P2P blockers:

- missing `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL`
- missing `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`

Release interpretation:

- KV/Upstash provisioning remains required but is no longer sufficient by
  itself.
- Relay payload transport must be implemented and proven before
  `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` can be treated as release-grade.
- Public release remains No-Go on second-PC route/CPU/matrix, hosted P2P
  storage plus relay transport, `musu@musu.pro` mailbox evidence, and Store
  evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_TRANSPORT_GATE_HARDENING_2026_06_03.md`

2026-06-03 08:33 KST index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1637` files and `2283` symbols after wiki/597, GOAL v401-v402,
  P2P relay transport gate tooling/docs/spec updates, WIKI/WIKI_INDEX updates,
  and CoS memories

## 2026-06-03 09:36 KST P2P Relay Route Evidence Gate

Hosted P2P release evidence now rejects env-flag-only relay transport claims.

Changed gate behavior:

- `musu relay route-evidence --json` queries owner-scoped route evidence with
  `route_kind=relay`, `result=success`, and `release_grade=true`
- `record-p2p-control-plane-evidence.ps1` records the query output as
  `relay_route_evidence`
- `verify-p2p-control-plane-evidence.ps1` requires
  `relay_route_evidence.relay_transport_proven=true` and
  `relay_route_evidence.count > 0`
- `show-musu-pro-p2p-env-status.ps1` reports
  `live_evidence_relay_route_not_proven`

Validation:

- PowerShell parser passed
- `cargo fmt --check` passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- Rust cloud tests passed `3/3`
- Rust install CLI tests passed `14/14`
- `npm run test:p2p` passed `28/28`
- release evidence verifier regression passed `19/19`
- `git diff --check` passed

Fresh live P2P evidence:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.verification.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.summary.md`

Verification remains `ok=false`, `fail_count=13`:

- `relay_lease_store_backend=unconfigured`
- `relay_lease_store_release_grade=false`
- `relay_route_evidence_count=0`
- `relay_payload_transport_proven=false`
- `relay_transport_wired=false`

Current hosted P2P blockers:

- missing `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL`
- missing `KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`

Release interpretation:

- KV/Upstash provisioning remains required but is not sufficient.
- `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` is not sufficient.
- A real relay route must carry payload and be recorded as owner-scoped
  release-grade route evidence before the hosted P2P gate can pass.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_ROUTE_EVIDENCE_GATE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1646` files and `2291` symbols after wiki/599, GOAL v405-v406,
  fresh P2P evidence `20260603-093640-musu.pro`, P2P route-evidence gate
  tooling/docs/spec updates, WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 10:17 KST Post Relay Route Evidence Primary Refresh

Fresh primary-machine evidence was restored after P2P relay route evidence gate
hardening changed current HEAD.

MSIX refresh:

- `scripts\windows\run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting`
- Rust release build passed in `9m 55s`
- Tauri shell and local-sideload MSIX packaging passed
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- runtime evidence used the explicit WindowsApps alias because
  `C:\Users\empty\.cargo\bin\musu.exe` still shadows PATH

Current primary evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-101716-HUGH_SECOND.evidence.json`
- single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-101716-HUGH_SECOND.verification.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-100903-HUGH_SECOND.desktop-open.evidence.json`
- runtime matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-101013-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_101013`

Primary CPU result:

- desktop-open `60.069s`
- MUSU `0`
- Node `0.03`
- WebView2 `0.52`
- hot `0`
- process counts: MUSU `2`, Node `1`, WebView2 `6`
- working set `496.76MB`

Runtime matrix result:

- `runtime-started`: MUSU `0`, Node `0`, WebView2 `0.13`
- `dashboard-open`: MUSU `0`, Node `0`, WebView2 `0.18`
- `desktop-open`: MUSU `0`, Node `0`, WebView2 `0.26`
- `post-route`: MUSU `0`, Node `0`, WebView2 `0.10`
- all four scenarios have hot `0` and no resource-budget violations

Dirty-tree go/no-go after adding evidence recognized:

- `single_machine_verified=true`
- runtime idle CPU valid machines `1`: `HUGH_SECOND`
- runtime CPU matrix valid machines `1`: `HUGH_SECOND`

Release interpretation:

- current primary-machine packaged evidence is restored
- public release remains No-Go until second-PC route/CPU/matrix, hosted P2P
  relay proof, support mailbox evidence, and Store/Partner Center evidence pass

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_ROUTE_EVIDENCE_PRIMARY_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1654` files and `2291` symbols after wiki/600, GOAL v407-v408,
  fresh primary evidence `20260603-101716-HUGH_SECOND`,
  `20260603-100903-HUGH_SECOND.desktop-open`, and
  `20260603-101013-HUGH_SECOND.runtime-cpu-scenario-matrix`, WIKI/WIKI_INDEX
  updates, and CoS memories

## 2026-06-03 10:35 KST Go/No-Go P2P Route Evidence Output

Release go/no-go output now surfaces hosted P2P route-evidence proof directly.

Changed output:

- `p2p_owner_scope_verified`
- `p2p_relay_lease_store_release_grade`
- `p2p_relay_transport_wired`
- `p2p_relay_route_evidence_ok`
- `p2p_relay_route_evidence_count`
- `p2p_relay_payload_transport_proven`

The `p2p-control-plane` blocker now requires owner-scoped release-grade relay
lease storage, `relay_default_data_path=false`, `relay_transport_wired=true`,
and owner-scoped release-grade relay route evidence with
`relay_payload_transport_proven=true` and `count > 0`.

Current output remains No-Go:

- `p2p_control_plane_verified=false`
- `p2p_relay_route_evidence_count=0`
- `p2p_relay_payload_transport_proven=false`

Validation:

- PowerShell parser passed
- JSON go/no-go output includes the new fields
- non-JSON go/no-go output prints the new fields
- release evidence verifier regression passed `19/19`
- `git diff --check` passed

Canonical report:

- `docs\RELEASE_1_15_0_RC1_GO_NO_GO_P2P_ROUTE_EVIDENCE_OUTPUT_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1657` files and `2291` symbols after wiki/601, GOAL v409-v410,
  go/no-go P2P route-evidence output hardening, WIKI/WIKI_INDEX updates, and
  CoS memories

## 2026-06-04 08:05 KST Relay Payload Delivery Proof Gate

The hosted P2P release gate now requires per-record relay payload delivery
proof, not only `relay_payload_transport_proven=true`.

Changed output:

- `p2p_relay_payload_delivery_proof_valid_count`

The `p2p-control-plane` blocker now also requires owner-scoped release-grade
relay route evidence to include `relay_payload_delivery_proof` for returned
relay success records. The verifier checks schema
`musu.relay_payload_delivery_proof.v1`, payload/session/lease/source/target
identity, tunnel id, payload hash, positive payload byte count, and parseable
`delivered_at`.

Validation:

- PowerShell parser passed for the touched release scripts
- release evidence verifier regression passed `24/24`
- the new negative case rejects relay route evidence without payload delivery
  proof
- `git diff --check` passed

## 2026-06-04 08:22 KST Primary Evidence Refresh After Relay Proof Gate

Primary-machine evidence was refreshed after the relay payload delivery proof
gate commit.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-081248-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-081313-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU scenario matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-081601-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- single-machine smoke passed with task `24aa7a30-f9a2-4084-8226-bfa8b9cf7015`
  and bridge `http://127.0.0.1:10503`
- desktop-open CPU passed for `60.064s`: MUSU `0.29`, repo Node `0.73`,
  owned WebView2 `0.08`, working set `542.72MB`, hot `0`
- runtime matrix passed startup-open/runtime-started/dashboard-open/
  desktop-open/post-route with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_081601`
- clean go/no-go on `34fa1cf46fe15c698515570483ce5e7065526e8e`
  reports `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU
  matrix `1/2`, and public release No-Go on second-PC, P2P, support, Store
  metadata, and Store release evidence

## 2026-06-04 08:29 KST Live P2P Recheck And Proof-Count Status

Fresh hosted P2P control-plane evidence was recorded with the packaged
WindowsApps alias:

- evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-082740-musu.pro.evidence.json`
- verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-082740-musu.pro.verification.json`
- summary:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-082740-musu.pro.summary.md`

Current live result:

- verifier `ok=false`, `fail_count=27`
- `relay_status_transport_wired=false`
- `relay_status_payload_endpoint_wired=false`
- `relay_transport_payload_endpoint_wired=false`
- `relay_route_evidence_count=0`
- `relay_payload_transport_proven=false`
- `relay_payload_delivery_proof_valid_count=0`
- live error remains `p2p_relay_lease_kv_not_configured`

`show-musu-pro-p2p-env-status.ps1` now reports relay payload delivery proof
counts and adds the blocker
`live_evidence_relay_payload_delivery_proof_missing`. GitHub secret-name status
still lacks `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
`KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`, so the next external action is
KV/Upstash provisioning and deployment before owner-scoped relay route proof can
be captured.

## 2026-06-04 08:37 KST External Recheck Relay Proof Output

The external gate recheck and final handoff status now surface relay proof
requirements directly:

- `record-p2p-control-plane-evidence.ps1` final JSON includes
  `relay_route_evidence_count`
- `record-external-release-gate-recheck.ps1` final JSON and summary include
  `p2p_relay_route_evidence_count`,
  `p2p_relay_payload_transport_proven`, and
  `p2p_relay_payload_delivery_proof_valid_count`
- external recheck adds blockers
  `p2p_relay_payload_transport_not_proven` and
  `p2p_relay_payload_delivery_proof_missing`
- `show-final-release-handoff-status.ps1` gate output includes owner scope,
  route evidence count, payload transport proof, and delivery proof count

This keeps the operator checklist aligned with the roadmap: local MUSU programs
perform work on each device, while `musu.pro` coordinates login/rendezvous and
stores release-grade fallback proof. Public release still requires second-PC
evidence, hosted relay delivery proof, support mailbox evidence, and Store
evidence.

Clean evidence after commit `1e1fc43cf0da04c4b71621e1b8329496d2c6b810`:

- external gate recheck:
  `docs\evidence\external-gates\1.15.0-rc.1\20260604-084033-HUGH_SECOND.external-gates.evidence.json`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-084136-musu.pro.evidence.json`
- final blockers now include `p2p_relay_payload_transport_not_proven` and
  `p2p_relay_payload_delivery_proof_missing`
- release remains No-Go: second PC is unreachable, P2P env/evidence are not
  ready, route evidence count is `0`, payload transport proof is `false`, and
  delivery proof valid count is `0`

## 2026-06-04 09:02 KST Relay Payload Drain Route Evidence

Target-side relay payload delivery now produces route evidence:

- Rust route evidence added
  `record_relay_payload_delivery_route_evidence(...)`
- relay delivery evidence uses `route_kind=relay`,
  `payload_transited_musu_infra=true`, `result=success`, and
  `relay_payload_delivery_proof`
- relay payload drain now writes local route evidence and attempts bounded
  submit to `musu.pro` after delivery proof is confirmed
- drain item output includes `route_evidence_recorded`,
  `route_evidence_submitted`, `route_evidence_path`, and
  `route_evidence_failure_class`
- drain `ok=true` now requires route evidence to be recorded and submitted
- `RouteEvidencePayload` TypeScript type now includes
  `relay_payload_delivery_proof`

Validation passed Rust relay payload tests `24/24`, Rust route evidence tests
`13/13`, `cargo check --bin musu`, `npm run typecheck`, route-evidence API
tests `22/22`, and `git diff --check`.

Public release remains No-Go because this is still preview relay payload queue
evidence, not release-grade QUIC/TLS relay transport proof.

Post-commit go/no-go on
`2777554e6ce80b73a5bc471629b47059595d126b` reports
`manifest_git.dirty=false`, `local_artifacts_ready=true`, and
`single_machine_verified=false`; the drop is expected source freshness after
the Rust runtime route-evidence change. Refresh packaged primary smoke, idle
CPU, and runtime CPU matrix evidence after this source commit before treating
primary runtime gates as current again.

## 2026-06-04 09:38 KST Post Relay-Drain Primary Evidence Refresh

Fresh current-source packaged primary evidence is restored.

Setup correction:

- User PATH now places
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps` before
  `C:\Users\empty\.cargo\bin`
- strict MSIX evidence now passes with `alias_shadowing_mode=fail`
- no developer binary was deleted

Fresh evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-093646-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-092446-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-092544-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-092758-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- stale same-session smoke evidence `20260604-092004-HUGH_SECOND` was removed
  because an old repo debug bridge was still registered
- replacement smoke used packaged bridge
  `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6\musu.exe`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_092419`
- desktop-open CPU passed for `60.071s`: MUSU `0`, Node `0`,
  WebView2 `0.57`, hot `0`, working set `506.43MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_092758`
- matrix max CPU: MUSU `0.03`, Node `0.10`, WebView2 `1.41`
- matrix max working set: `508.66MB`

Clean go/no-go on `83e7e5db06cb2706f2350683a78f67c00f461e37` reports
`ready_for_public_desktop_release=false`, `local_artifacts_ready=true`,
`single_machine_verified=true`, `msix_install_verified=true`, and
`manifest_git.dirty=false`.

Public release remains No-Go because the release gate still requires second-PC
runtime/multi-device evidence, live `musu.pro` relay proof, support mailbox
evidence, and Store/Partner Center evidence.

## 2026-06-04 09:54 KST Current Operator Handoff Pack

The final operator packet and operator action pack were regenerated from clean
HEAD after the post relay-drain primary evidence refresh.

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-094858.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-094940.zip`
- Partner Center submission zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-094940.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-094858`

Verification:

- final packet verifier: `ok=true`, `fail_count=0`, `kit_count=1`
- action-pack verifier: `ok=true`, `fail_count=0`
- final handoff status: `packet.verified=true`, `action_pack.verified=true`,
  `ready_for_public_desktop_release=false`

Roadmap interpretation:

- one-machine local runtime testing is current
- second-PC installation and return import are required before P2P mesh,
  multi-device, and two-machine CPU gates can close
- MUSU.PRO remains the web coordination/control-plane surface for remote user
  input, rendezvous, meeting-room style project coordination, and relay proof;
  local MUSU programs still perform the actual work on each device
- live `musu.pro` relay route evidence still has
  `p2p_relay_route_evidence_count=0`,
  `p2p_relay_payload_transport_proven=false`, and
  `p2p_relay_payload_delivery_proof_valid_count=0`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_2026_06_04.md`

## 2026-06-04 Relay Route Evidence Stale Proof Query Gate

Live `musu.pro` P2P status still reports No-Go because production KV/Upstash
env is missing, release-grade relay transport is not wired, relay route
evidence count is `0`, relay payload transport proof is `false`, and relay
payload delivery proof valid count is `0`.

The local release-gate hardening added a regression test for the route-evidence
query path:

- seed a stale relay record with `release_grade=true`
- omit current `musu.relay_transport_proof.v1`
- query `GET /api/v1/p2p/route-evidence?release_grade=true`
- assert the stale relay record is excluded

Validation:

- `npm run test:p2p` passed `61/61`
- `npm run typecheck` passed
- `git diff --check` passed

This prevents stale/manual relay records from inflating the release-grade relay
route evidence count. It does not close the hosted P2P gate; public release
still needs a real owner-scoped relay route with stored QUIC/TLS transport proof
and stored relay payload delivery proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_ROUTE_EVIDENCE_STALE_PROOF_QUERY_GATE_2026_06_04.md`

## 2026-06-04 Post Stale-Proof Query Primary Evidence Refresh

Fresh primary-machine evidence is restored after the relay route-evidence stale
proof query hardening.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-100843-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-101133-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-101925-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_100843`
- desktop-open CPU passed for `60.052s`: MUSU `0`, Node `0.03`,
  WebView2 `0.16`, hot `0`, working set `509.29MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_101925`
- matrix max CPU: MUSU `0`, Node `0.08`, WebView2 `0.18`
- matrix max working set `509.47MB`

Clean go/no-go on `a2087e6b` reports `single_machine_verified=true`,
runtime idle CPU `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
P2P relay route evidence count `0`, relay payload proof `false`, and
`manifest_dirty=false`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_STALE_PROOF_QUERY_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 10:33 KST Current Operator Handoff Pack After Stale-Proof Evidence

The final operator packet and operator action pack were regenerated from clean
HEAD after the stale-proof query hardening and current primary evidence refresh.

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-103143.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-103216.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-103216\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-103216.zip`
- Partner Center submission zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-103216\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-103216.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-103143`

Verification:

- final packet verifier: `ok=true`, `fail_count=0`, `kit_count=1`
- action-pack verifier: `ok=true`, `fail_count=0`
- final handoff status: `packet.verified=true`, `action_pack.verified=true`,
  `ready_for_public_desktop_release=false`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_AFTER_STALE_PROOF_EVIDENCE_2026_06_04.md`

## 2026-06-04 11:38 KST Post CLI Route Wait Primary Evidence Refresh

Fresh primary-machine evidence is restored after the CLI route wait hardening
and web-input/local-executor roadmap update.

Fresh evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-112129-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-112308-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-112809-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-112954-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_112241`
- smoke bridge `http://127.0.0.1:3153`
- desktop-open CPU passed for `60.062s`: MUSU `0`, Node `0.03`,
  WebView2 `0.39`, hot `0`, working set `489.98MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_112954`
- matrix max CPU: MUSU `0.13`, Node `0.05`, WebView2 `0.13`
- matrix max working set `490.17MB`

Clean go/no-go on `c9ada37b` reports `local_artifacts_ready=true`,
`single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, `manifest_dirty=false`, and blocker count `6`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_CLI_ROUTE_WAIT_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 11:44 KST Current Operator Handoff Pack After CLI Route Wait Evidence

The final operator packet and operator action pack were regenerated from clean
HEAD after the CLI route wait hardening and current primary evidence refresh.

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-114250.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-114319.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-114319\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-114319.zip`
- Partner Center submission zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-114319\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-114319.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-114250`

Verification:

- final packet verifier: `ok=true`, `fail_count=0`, `kit_count=1`
- action-pack verifier: `ok=true`, `fail_count=0`
- final handoff status: `packet.verified=true`, `action_pack.verified=true`,
  `ready_for_public_desktop_release=false`, `single_machine_verified=true`,
  runtime idle CPU `1/2`, and runtime CPU matrix `1/2`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_AFTER_CLI_ROUTE_WAIT_EVIDENCE_2026_06_04.md`

## 2026-06-03 11:10 KST Startup-Open CPU Matrix Gate

The runtime CPU scenario matrix now requires five scenarios:

- `startup-open`
- `runtime-started`
- `dashboard-open`
- `desktop-open`
- `post-route`

Gate hardening:

- `startup-open` launches the packaged desktop app and records
  `sample_delay_seconds`.
- `verify-runtime-cpu-scenario-matrix.ps1` rejects startup evidence unless the
  packaged app was launched and sampling began within 3s.
- `write-release-go-no-go.ps1` now requires the five-scenario matrix on primary
  and second Windows PCs.
- The second-PC wrapper, final operator packet, multi-device kit, handoff
  status, and verifier fixture now use the five-scenario command.

New primary matrix evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-105650-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_105650`
- verifier `ok=true`, `fail_count=0`
- startup-open delay `2.026s`
- startup-open WebView2 `1.51`
- runtime-started WebView2 `0.21`
- dashboard-open WebView2 `0.16`
- desktop-open WebView2 `0.03`
- post-route WebView2 `0.05`
- all five scenarios have hot `0` and no resource-budget violations

Dirty-tree go/no-go after evidence and freshness allowlist update reports:

- `single_machine_verified=true`
- runtime idle CPU valid machines `1`: `HUGH_SECOND`
- runtime CPU scenario matrix valid machines `1`: `HUGH_SECOND`

Release interpretation:

- current primary five-scenario CPU matrix evidence is restored
- public release remains No-Go until second-PC route/CPU/matrix, hosted P2P
  relay proof, support mailbox evidence, and Store/Partner Center evidence pass

Canonical report:

- `docs\RELEASE_1_15_0_RC1_STARTUP_OPEN_CPU_MATRIX_GATE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1660` files and `2291` symbols after wiki/602, GOAL v411,
  startup-open CPU matrix gate scripts, primary evidence
  `20260603-105650-HUGH_SECOND.runtime-cpu-scenario-matrix`, WIKI/WIKI_INDEX
  updates, and CoS memories

## 2026-06-03 11:30 KST Frontend Polling Contract Go/No-Go Gate

The frontend polling hardening is now represented as a release go/no-go gate,
not only as `npm run test:runtime-polling`.

New audit:

- `scripts\windows\audit-frontend-polling-contract.ps1`
- schema `musu.frontend_polling_contract.v1`
- verifies `useLowDutyPolling` timeout/abort/clamp/backoff behavior, dashboard
  and node panel low-duty refresh wiring, relay on-demand connect and capped
  reconnect, Chat/Fleet SSE bounded reconnect, Fleet SSE unmount cleanup, no
  direct non-test `setInterval(`, no direct `visibilitychange` listener outside
  the shared poller, package script, and CI coverage

Go/no-go now reports:

- `frontend_polling_contract_verified`
- `frontend_polling_contract_audit`

If the audit fails, go/no-go adds blocker area `frontend-polling`.

Operator packet/handoff changes:

- final operator packet includes `audit-frontend-polling-contract.ps1`
- packet README includes the audit command and expected schema
- packet verifier self-checks the script, README, go/no-go blocker, and handoff
  status operator step
- handoff status now suggests the audit command if the frontend polling contract
  is not verified

Validation:

- PowerShell parser passed for changed scripts
- `audit-frontend-polling-contract.ps1 -Json`: `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- `npm run test:runtime-polling`: 12/12
- release evidence verifier regressions: 20/20

Release interpretation:

- this is release/status tooling, not runtime source
- current primary CPU evidence remains valid under the release evidence
  freshness allowlist
- public release remains No-Go on second-PC, two-machine CPU/matrix, hosted P2P,
  support mailbox, and Store evidence

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FRONTEND_POLLING_CONTRACT_GO_NO_GO_GATE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1664` files and `2291` symbols after wiki/604, GOAL v413,
  frontend polling contract go/no-go gate scripts, operator packet/handoff
  updates, BETA/WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 11:50 KST Relay Route Evidence Stored Lease Gate

`route_kind=relay` route evidence can no longer become release-grade using only
an issued-looking `relay_fallback.lease_id`.

`POST /api/v1/p2p/route-evidence` now checks the owner-scoped relay lease store
and requires a stored lease matching:

- owner key from the bearer token
- `session_id`
- `source_node_id`
- `target_node_id`
- `lease_id`
- attempted route kind set

New non-release-grade blockers:

- `relay_route_lease_not_found`
- `relay_route_lease_attempts_mismatch`
- `relay_route_lease_store_unavailable:<detail>`

Validation:

- route-evidence API test: 13/13
- `npm run test:p2p`: 29/29
- `npm run typecheck`: passed
- `git diff --check`: passed

Release interpretation:

- this hardens P2P evidence integrity
- it does not implement relay/tunnel payload transport
- runtime web source changed, so fresh current-HEAD MSIX/smoke/CPU/matrix
  evidence is required before primary release evidence can be claimed current
- public release remains No-Go on second-PC, two-machine CPU/matrix, hosted P2P
  relay payload proof, support mailbox, and Store evidence

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_ROUTE_EVIDENCE_STORED_LEASE_GATE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1667` files and `2296` symbols after wiki/606, GOAL v415,
  route-evidence stored lease gate source/tests, P2P spec update,
  BETA/WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 12:17 KST Post Stored-Lease Primary Evidence Refresh

Primary-machine evidence was refreshed after the stored relay lease route
evidence gate commit `ec9db1d29fa350f256ddc6fc9ae8e54ebb2435e5`.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-120751-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-120903-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-121028-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Validation:

- single-machine verifier: `ok=true`, `fail_count=0`
- idle CPU: `ok=true`, `git_dirty=false`, MUSU `0`, Node `0.05`,
  WebView2 `0.08`, hot `0`
- matrix verifier: `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_121028`

Release remains No-Go until second-PC runtime evidence, hosted P2P relay
payload proof, support mailbox evidence, and Store evidence are complete.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_STORED_LEASE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1675` files and `2296` symbols after GOAL v417, wiki/608,
  fresh primary evidence, BETA/WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 12:47 KST P2P Relay Transport Descriptor Gate

Hosted P2P evidence now requires a separate relay transport
descriptor/preflight artifact.

Added:

- `GET /api/v1/p2p/relay/transport`
- `musu relay transport --json`
- recorder field `relay_transport`
- verifier checks for `musu.relay_transport.v1`

The verifier now requires:

- owner-scoped transport descriptor
- `relay_transport_descriptor_wired=true`
- `relay_transport_wired=true`
- `relay_default_data_path=false`
- `payload_transit_requires_lease=true`
- `relay_url` starts with `wss://`
- release-grade relay lease storage
- release-grade relay route evidence with payload proof and count greater than
  zero

Existing live P2P evidence
`docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.evidence.json`
now fails closed under the new verifier:

- `ok=false`
- `fail_count=31`
- `relay_transport_descriptor_wired=false`
- `relay_transport_preflight_ok=false`
- `relay_route_evidence_count=0`
- `relay_payload_transport_proven=false`

Validation:

- `npm run test:p2p`: 34/34
- `npm run typecheck`: passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`: passed
- PowerShell parser validation: passed
- release evidence verifier regressions: 20/20
- `git diff --check`: passed

Not release complete:

- this is not relay/tunnel payload transport
- debug `cargo build --bin musu` was stopped after more than six minutes
- source changed after the latest primary evidence refresh, so current-HEAD
  MSIX/smoke/CPU/matrix evidence must be refreshed again after commit/build

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_TRANSPORT_DESCRIPTOR_GATE_2026_06_03.md`

Post-deploy endpoint probe:

- direct authenticated `GET https://musu.pro/api/v1/p2p/relay/transport`
- schema `musu.p2p_relay_transport.v1`
- `relay_transport_descriptor_wired=true`
- `ok=false`
- `relay_transport_wired=false`
- `relay_url=""`
- `relay_lease_store_backend=unconfigured`
- blockers include `relay_disabled`, `relay_transport_not_wired`,
  `relay_url_not_configured`, `connect_pro_entitlement_required`,
  `relay_lease_store_not_configured`, and
  `relay_lease_store_not_release_grade`
- not a full P2P live evidence capture

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1681` files and `2307` symbols after GOAL v419, wiki/610,
  relay transport descriptor source/tests, P2P recorder/verifier updates,
  BETA/spec/WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 13:29 KST Post Transport Descriptor Primary Evidence Refresh

Primary-machine evidence was refreshed after the P2P relay transport
descriptor gate.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-131556-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-131811-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-131938-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Validation:

- single-machine verifier: `ok=true`, `fail_count=0`
- idle CPU: `ok=true`, `git_dirty=false`, MUSU `0`, Node `0.05`,
  WebView2 `0.31`, hot `0`
- matrix verifier: `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_131938`
- clean go/no-go on `2fe8d220`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`, P2P control plane false, relay route count `0`, relay payload proof
  false, and `git_dirty=false`

Release remains No-Go until second-PC runtime/multi-device evidence, hosted P2P
relay payload proof, support mailbox evidence, and Store evidence are complete.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_TRANSPORT_DESCRIPTOR_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1689` files and `2307` symbols after GOAL v422, wiki/612,
  fresh primary evidence, BETA/current-head/WIKI/WIKI_INDEX updates, and CoS
  memories

## 2026-06-03 13:50 KST Relay Transport Proof Gate

Hosted P2P relay route evidence now requires explicit payload transport proof.

New contract:

- field `relay_transport_proof`
- schema `musu.relay_transport_proof.v1`
- required for `route_kind=relay` release grading
- must match the issued relay lease and route session
- must prove `wss://` relay URL, positive payload byte transit,
  `payload_transited_musu_infra=true`, `encryption=quic_tls_1_3`, and
  `transport_verified_by=musu_quic_tls_transport`

Validation:

- `npm run test:p2p`: 35/35
- `npm run typecheck`: passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`: passed
- focused Rust route-evidence serialization test: passed
- release evidence verifier regressions: 20/20
- `git diff --check`: passed

This is evidence-chain hardening, not relay/tunnel payload transport. Because
web and Rust source changed, current packaged primary evidence is stale until
MSIX/smoke/CPU/matrix evidence is refreshed after this commit.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_TRANSPORT_PROOF_GATE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1692` files and `2311` symbols after GOAL v424, wiki/614,
  route-evidence source/tests, Rust cloud DTO updates, P2P spec updates,
  BETA/WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 14:25 KST Post Relay Transport Proof Primary Evidence Refresh

Primary-machine evidence was refreshed after the relay transport proof gate.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-141358-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-141524-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-141712-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Validation:

- single-machine verifier: `ok=true`, `fail_count=0`
- idle CPU: `ok=true`, `git_dirty=false`, MUSU `0`, Node `0.03`,
  WebView2 `0.44`, hot `0`
- matrix verifier: `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_141712`
- clean go/no-go on `2445c3bb`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`, P2P control plane false, relay route count `0`, relay payload proof
  false, and `git_dirty=false`

Release remains No-Go until second-PC runtime/multi-device evidence, hosted P2P
relay payload proof, support mailbox evidence, and Store evidence are complete.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_TRANSPORT_PROOF_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1700` files and `2311` symbols after GOAL v426, wiki/616, fresh
  primary evidence, BETA/WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 14:45 KST Targeted Post-Route CPU Matrix Diagnostic

The runtime CPU scenario matrix now supports explicit target route attempts for
post-route CPU attribution:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -RouteTarget PRIMARY-PC -AllowFailedRouteProbe -Json
```

The verifier supports the matching target/failure boundary:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath <MATRIX_JSON> -RequirePostRouteProbe -ExpectedPostRouteTarget PRIMARY-PC -AllowFailedPostRouteProbe -Json
```

The normal release path without `-AllowFailedRouteProbe` still requires a
successful post-route probe. The allow-failed target path only records CPU after
a bounded failed route attempt and does not close the multi-device route proof.

Validation:

- PowerShell parser checks passed
- release evidence verifier regressions passed `22/22`
- `git diff --check` passed

Canonical report:

- `docs\RELEASE_1_15_0_RC1_TARGETED_POST_ROUTE_CPU_MATRIX_DIAGNOSTIC_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1705` files and `2311` symbols after GOAL v428, wiki/618,
  targeted post-route CPU matrix scripts, the canonical report,
  BETA/WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 14:56 KST Targeted Post-Route CPU Evidence

Captured clean post-route CPU attribution after a timed-out target route attempt
to `HUGH-MAIN`.

Evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- post-route sample:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.post-route.evidence.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.targeted-post-route.verification.json`

Result:

- verifier `ok=true`, `fail_count=0`
- route target `HUGH-MAIN`; route output timed out against
  `192.168.1.192:8949`
- sample duration `60.049s`
- hot process count `0`
- max CPU: MUSU `0`, Node `0`, WebView2 `0.10`, other `0`
- process counts: MUSU `2`, Node `0`, WebView2 `6`, other `0`
- working set `402.69MB`
- cleanup stopped the bridge and desktop shell it opened

Harness hardening:

- normal route probes now fail when the expected per-run route token is
  missing
- `-AllowFailedRouteProbe` remains diagnostic-only

This evidence does not close multi-device route success or second-PC release
CPU gates.

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1711` files and `2311` symbols after GOAL v430, wiki/620,
  targeted post-route CPU evidence JSON, route token-missing fail-fast
  hardening, BETA/WIKI/WIKI_INDEX updates, and CoS memories

## 2026-06-03 15:16 KST Relay Payload Endpoint Fail-Closed Hardening

`MUSU_P2P_RELAY_TRANSPORT_WIRED=1` can no longer make hosted relay transport
readiness pass by itself. Current source keeps
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false` because `/api/v1/relay/connect`
payload transport is not implemented.

Expected current blockers:

- `relay_payload_endpoint_wired=false`
- `relay_payload_endpoint_not_wired`
- `relay_route_payload_endpoint_not_wired`

Validation:

- `npm run test:p2p` passed `35/35`
- `npm run typecheck` passed
- release evidence verifier regressions passed `22/22`

This is fail-closed hardening only. Public release still requires real
relay/tunnel payload transport and owner-scoped release-grade relay route
evidence.

## 2026-06-03 16:24 KST Startup Helper Source Primary Evidence Refresh

The packaged startup helper source is now reproducible from a clean checkout.
Commit `79368c53` tracks `musu-rs\src\bin\musu-startup.rs` and unignores
`musu-rs\src\bin\*.rs`; `cargo check --bin musu-startup -j 1` passed.

Fresh primary evidence from a clean detached worktree at `79368c53`:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-160842-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-161155-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-161836-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_160819`
- desktop-open CPU passed for `60.076s`: MUSU `0.03`, Node `0`,
  WebView2 `0.21`, hot `0`, working set `461.69MB`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_161836`
- matrix maximum working set was `518.12MB`
- go/no-go now sees primary idle CPU `1/2` and primary matrix `1/2`

The first CPU attempt with a Next dev dashboard was rejected because the dev
Node process exceeded the release memory/CPU budget. The accepted idle CPU
evidence measured the packaged desktop state without Next dev, and the accepted
matrix used a production dashboard on `http://127.0.0.1:3001/app`.

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted relay payload proof, support mailbox evidence, and Store evidence are
complete.

## 2026-06-05 08:16 KST P2P Candidate Endpoint Metadata Preservation

`musu.pro` room presence and rendezvous candidate exchange now preserve public
endpoint, NAT, and relay descriptor metadata instead of reducing candidates to
only `kind`, `addr`, `observed_at`, and `scheme`.

This aligns the roadmap discussed with the operator:

- the installed MUSU local program executes work
- `localhost:3001/app` is an optional workspace dashboard, not the packaged
  local app
- `musu.pro` accepts remote input, hosts project/company rooms, records
  presence, coordinates rendezvous, helps path selection, and records
  relay-fallback evidence
- local MUSU programs should use the web control plane to find each other, then
  prefer LAN, Tailscale/overlay, direct QUIC, and only then relay fallback

Observed local state during the investigation:

- `127.0.0.1:3001` had no listener and refused the browser request
- `127.0.0.1:8186/health` returned `200 OK` from the installed local MUSU
  bridge

Validation:

- `npm run test:p2p` passed `79/79`
- `npm run typecheck` passed
- `audit-p2p-store-forward-relay-contract.ps1 -Json -FailOnProblem` passed
  with `ok=true` and `fail_count=0`
- `git diff --check` passed

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_CANDIDATE_ENDPOINT_METADATA_PRESERVATION_2026_06_05.md`

## 2026-06-05 08:32 KST Post Candidate Metadata Primary Evidence Refresh

After source commit `9be40bc4`, HUGH_SECOND packaged local-runtime evidence was
refreshed.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-082350-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-082546-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-082656-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-082656-HUGH_SECOND.verification.json`

Results:

- bridge `http://127.0.0.1:10518`
- `dashboard_required=false`
- idle CPU `60.058s`: MUSU `0.05`, Node `0`, WebView2 `0.73`,
  working set `365.65MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_082656`
- route task `3b2b0137-e3ee-4548-ad45-cb33228d89a9`

MSIX rebuild/reinstall and packaged-state verification passed, but strict MSIX
evidence capture is still blocked by the local PATH alias shadow
`C:\Users\empty\.cargo\bin\musu.exe`. The explicit-WindowsApps warning-mode
capture remains in `.local-build` only.

Final handoff after this refresh removed the `single-machine` blocker.
Remaining blockers are multi-device, second-machine idle CPU, second-machine
runtime matrix, support mailbox, Store/Microsoft, hosted `musu.pro` P2P release
proof, and dirty git until this evidence/report commit is made.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_P2P_CANDIDATE_ENDPOINT_METADATA_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-04 23:04 KST Secret Storage Contract Hardening

Secret storage is now an explicit hardening gate for the
local-program/web-input roadmap:

- `musu.pro` remains the remote input, room, presence, rendezvous,
  path-selection, fallback-relay coordination, and evidence plane
- local MUSU programs still execute work and prefer P2P mesh after
  web-assisted rendezvous
- bridge/account/P2P credentials must not appear in ordinary web output,
  release evidence, routine config backups, or support bundles

New gate:

- `scripts\windows\audit-secret-storage-contract.ps1`
- schema `musu.secret_storage_contract.v1`
- go/no-go field `secret_storage_contract_verified`
- blocker area `secret-storage`

Validation:

- secret-storage audit passed with `ok=true`, `fail_count=0`
- targeted Rust token storage test passed `1/1`
- `cargo fmt --check` passed
- `git diff --check` passed with only the existing `docs/PRODUCTION.md` CRLF
  normalization warning

Release note:

- this changed Rust runtime source, so packaged MSIX/smoke/CPU/matrix evidence
  and final operator packets must be regenerated from the resulting commit
  before this source can claim current packaged evidence
- public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted `musu.pro` P2P control-plane/relay proof, support mailbox evidence,
  and Store evidence

## 2026-06-04 23:40 KST Post Secret Storage Primary Evidence Refresh

After commit `26294fa2`, the local-sideload MSIX was rebuilt and reinstalled
with current source.

Build/install:

- `run-msix-workflow.ps1` passed release runtime build, Tauri desktop build,
  MSIX packing/signing, packaged startup smoke, install, and installed package
  contract verification
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- HUGH_SECOND still has warning-mode `.cargo\bin\musu.exe` PATH shadowing; use
  the explicit WindowsApps alias for packaged checks

Fresh packaged primary evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-232809-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-233024-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-233135-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Evidence highlights:

- smoke output: `MUSU_RELEASE_SMOKE_OK_20260604_232737`
- desktop-open CPU: MUSU `0.05`, Node `0.03`, WebView2 `0.6`, owned WebView2
  `6`, working set `487.21MB`, hot `0`
- matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_233135`
- matrix max role CPU: MUSU `0`, Node `0.03`, WebView2 `0.39`
- matrix max working set: `490.08MB`

Release note:

- primary-machine packaged evidence is current again for commit `26294fa2`
- runtime CPU and matrix gates still require second-PC evidence before public
  release
- public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted `musu.pro` P2P control-plane/relay proof, support mailbox evidence,
  and Store evidence

## 2026-06-04 23:59 KST Relay Connect Auth Hardening

`/api/v1/relay/connect` now requires P2P control auth before returning its
fail-closed relay status/preflight response.

Validation:

- operator API security audit passed with `ok=true`, `fail_count=0`
- `npm run test:p2p` passed `77/77`
- `npm run typecheck` passed
- `git diff --check` passed

Release note:

- this is security hardening, not relay transport completion
- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=false`,
  `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`, and
  `relay_transport_wired=false` remain intentional
- because this changed web runtime source, fresh packaged primary evidence is
  required after commit before current-source local artifact readiness can be
  claimed again

## 2026-06-05 00:19 KST Post Relay Connect Auth Primary Evidence Refresh

After commit `68cc6f27407c68f1e0aac6615e21f86d19495568`, the local-sideload
MSIX was rebuilt and reinstalled from current source.

Build/install:

- `run-msix-workflow.ps1` passed release runtime build, Tauri desktop build,
  MSIX packing/signing, packaged startup smoke, install, and installed package
  contract verification
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- HUGH_SECOND still has warning-mode `.cargo\bin\musu.exe` PATH shadowing; use
  the installed WindowsApps package path for packaged checks

Fresh packaged primary evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-000624-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-000707-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-000820-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Evidence highlights:

- smoke output: `MUSU_RELEASE_SMOKE_OK_20260605_000551`
- desktop-open CPU: MUSU `0`, Node `0.05`, WebView2 `0.52`, owned WebView2
  `6`, working set `497.9MB`, hot `0`
- matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_000820`
- matrix max scenario CPU: MUSU `0.29`, Node `0.05`, WebView2 `0.52`
- matrix max working set: `500.49MB`

Roadmap and release note:

- `musu.pro` is the web control plane for remote input, project/company rooms,
  presence, rendezvous, path selection, relay fallback coordination, and
  evidence
- local MUSU programs on each device execute work and prefer P2P mesh after
  web-assisted rendezvous
- current validation is still one-machine only; second-PC install/route/CPU
  evidence is required before public multi-device release gates can close
- clean public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted `musu.pro` P2P proof, support mailbox evidence, and Store evidence

## 2026-06-05 Room Work-Order Auth Hardening

The MUSU.PRO room work-order route is now owner-scoped before it can reach the
local bridge:

- route: `POST /api/rooms/[roomId]/work-orders`
- added `authorizeP2pControl(req)`
- missing bearer auth returns `401 unauthorized`
- bridge forwarding is not attempted before auth succeeds
- response records `owner_scoped=true`
- context values for channel, sender, target node, and adapter type are bounded

Validation:

- `npm run test:routes` passed `19/19`
- operator API security audit passed with `ok=true`, `fail_count=0`
- `npm run typecheck` passed
- `npm run test:p2p` passed `77/77`
- `npm run build` passed after transient TLS socket retries
- `git diff --check` passed

Release note:

- this is web-input security hardening for the local-program/control-plane
  roadmap
- packaged primary evidence is stale until rebuilt/refreshed after this source
  change is committed
- public release remains No-Go on second-PC, hosted P2P, support mailbox, and
  Store evidence

## 2026-06-05 00:54 KST Post Room Work-Order Auth Primary Evidence Refresh

After commit `aa52b243cb6b1b8350f060516e72c26d730da059`, the local-sideload
MSIX was rebuilt and reinstalled from current source.

Build/install:

- `run-msix-workflow.ps1` passed release runtime build, Tauri desktop build,
  MSIX packing/signing, packaged startup smoke, install, and installed package
  contract verification
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- HUGH_SECOND still has warning-mode `.cargo\bin\musu.exe` PATH shadowing; use
  the installed WindowsApps package path for packaged checks

Fresh packaged primary evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-004657-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-004808-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Evidence highlights:

- smoke output: `MUSU_RELEASE_SMOKE_OK_20260605_004448`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260605_004448`
- desktop-open CPU: MUSU `0`, Node `0`, WebView2 `0.39`, owned WebView2
  `6`, working set `489.86MB`, hot `0`
- matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_004808`
- matrix max scenario CPU: MUSU `0.57`, Node `0.08`, WebView2 `0.65`
- matrix max working set: `492.2MB`

Roadmap and release note:

- `musu.pro` is the web control plane for remote input, project/company rooms,
  presence, rendezvous, path selection, relay fallback coordination, and
  evidence
- local MUSU programs on each device execute work and prefer P2P mesh after
  web-assisted rendezvous
- current validation is still one-machine only; second-PC install/route/CPU
  evidence is required before public multi-device release gates can close
- clean public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted `musu.pro` P2P proof, support mailbox evidence, and Store evidence

## 2026-06-04 22:40 KST Hardening Gate Surface Alignment

Final release status now exposes the hardening gates needed for the
local-program/web-input roadmap.

`musu.pro` remains the remote input, project room, company meeting room,
presence, rendezvous, path-selection, fallback-relay coordination, and evidence
plane. Local MUSU programs still execute the work. Because the web plane can
coordinate local executors, go/no-go and handoff status now surface the relevant
security/resource gates directly:

- `frontend_polling_contract_verified`
- `rust_background_loop_contract_verified`
- `local_api_auth_contract_verified`
- `operator_api_security_contract_verified`
- `process_ownership_verified`
- `startup_single_instance_verified`
- `desktop_single_instance_verified`

Validation:

- parser checks passed for the changed release scripts
- local API auth audit passed with `ok=true`, `fail_count=0`,
  `stale_doc_hit_count=0`
- operator API security audit passed with `ok=true`, `fail_count=0`
- dirty-tree go/no-go and handoff status reported all four hardening contract
  gates true
- `git diff --check` passed

This is status/packet hardening only, not runtime source. Packaged runtime
evidence remains current. Public release remains No-Go on second-PC
runtime/multi-device evidence, hosted `musu.pro` P2P proof, support mailbox
evidence, and Store evidence.

## 2026-06-04 22:13 KST Rust Loop Allowlist Contract Hardening

The local/web roadmap remains locked:

- local MUSU programs execute work on each device,
- `musu.pro` is remote input, project room, company meeting room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence,
- `localhost` dashboards are same-machine local surfaces, and
- devices use `musu.pro` to bootstrap discovery before preferring P2P mesh.

To support the idle CPU release gate, `audit-rust-background-loop-contract.ps1`
now verifies concrete safety properties for the allowlisted Rust loops instead
of relying only on the file allowlist. New checks cover Claude adapter
stdout timeout/cancel/deadline, file-sync debounce/cooldown, indexer watch
notify/debounce, CLI login expiry and 5s sleep, workflow task-completion poll
deadline, hardware probe timeout kill, PTY/WebRTC request-scoped loops, finite
Windows process enumeration, and writer runner admission/stream loops.

Validation:

- `audit-rust-background-loop-contract.ps1 -Json`
- `ok=true`
- `fail_count=0`
- `unaudited_loop_hit_count=0`

Release interpretation:

- this is audit/status-gate hardening only
- packaged runtime evidence remains current
- public release remains No-Go until second-PC multi-device evidence,
  two-machine CPU/matrix evidence, hosted `musu.pro` P2P proof,
  `musu@musu.pro` mailbox evidence, and Store evidence are complete

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_LOOP_ALLOWLIST_CONTRACT_HARDENING_2026_06_04.md`

## 2026-06-04 22:26 KST P2P Source Relay Marker Status

`show-musu-pro-p2p-env-status.ps1` now reports local source relay implementation
markers in addition to GitHub env names and live evidence.

Current source markers:

- `relay_connect_endpoint_implemented=false`
- `relay_payload_endpoint_implemented=false`
- `relay_payload_queue_endpoint_implemented=true`
- `relay_transport_kind=websocket_tunnel`
- `release_grade_transport_required=quic_tls_1_3`

Current status blockers now include:

- `source_relay_connect_endpoint_not_implemented`
- `source_relay_payload_endpoint_not_implemented`
- missing KV/Upstash URL/token
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`
- `live_evidence_relay_payload_delivery_proof_missing`

Release interpretation:

- KV/Upstash provisioning remains required
- env flags alone cannot make `relay_transport_wired=true`
- `/api/v1/relay/connect` remains fail-closed until a real Connect/Pro
  fallback relay/tunnel transport can emit release-grade `quic_tls_1_3` proof
- this is status/gate hardening only; packaged runtime evidence remains current

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_SOURCE_RELAY_MARKER_STATUS_2026_06_04.md`

## 2026-06-04 21:12 KST MCP App Views Low-Duty Polling Hardening

The separate Vite single-file MCP app views no longer own direct
`setInterval` polling loops.

Changed:

- added `musu-bee\views\shared\useLowDutyPolling.ts`
- migrated `musu-bee\views\nodes\NodesView.tsx`
- migrated `musu-bee\views\tasks\TasksView.tsx`
- expanded `audit-frontend-polling-contract.ps1` to scan both `musu-bee\src`
  and `musu-bee\views`
- added runtime-polling contract coverage for the MCP app views

Validation:

- `npm run test:runtime-polling` passed `16/16`
- `audit-frontend-polling-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`, `direct_interval_hit_count=0`,
  `direct_visibility_listener_hit_count=0`
- `npm run build` in `musu-bee\views` passed
- `npx tsc --noEmit` in `musu-bee\views` passed
- `git diff --check` passed

Release interpretation:

- this removes another frontend interval/refetch-loop candidate
- this is runtime frontend source, so fresh clean MSIX/smoke/CPU/matrix
  evidence and regenerated operator packets are required after commit before
  current source can claim packaged primary evidence
- public release remains No-Go on actual second-PC multi-device evidence,
  two-machine CPU/matrix evidence, hosted P2P control-plane proof, support
  mailbox evidence, and Store evidence

## 2026-06-04 21:28 KST Post MCP App Views Low-Duty Polling Primary Evidence Refresh

After the MCP app views polling hardening, current primary-machine packaged
evidence was refreshed.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-211929-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-212016-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-212147-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_211856`
- desktop-open CPU passed for `60.041s`: MUSU `0`, Node `0.05`,
  WebView2 `0.49`, owned WebView2 `6`, hot `0`, working set `490.13MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token was `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_212147`
- matrix max CPU: MUSU `0.03`, Node `0.03`, WebView2 `0.39`
- matrix max working set: `494.64MB`

Public release remains No-Go until actual second-PC runtime/multi-device
evidence, two-machine CPU/matrix evidence, hosted P2P control-plane proof,
support mailbox evidence, and Store evidence are complete.

## 2026-06-04 21:56 KST MCP App View Abort-Signal Hardening And Primary Evidence Refresh

The MCP app view low-duty poller now passes its `AbortSignal` into actual
`app.callServerTool` requests for `poll_agents` and `poll_tasks`, and stale
results after abort are ignored.

Validation:

- `npm run test:runtime-polling` passed `16/16`
- `audit-frontend-polling-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`, `direct_interval_hit_count=0`, and
  `direct_visibility_listener_hit_count=0`
- `npx tsc --noEmit` and `npm run build` passed in `musu-bee\views`

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-214647-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-214900-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-215050-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_214623`
- desktop-open CPU passed for `60.061s`: MUSU `0`, Node `0.1`,
  WebView2 `0.1`, owned WebView2 `6`, hot `0`, working set `492.61MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token was `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_215050`
- matrix max CPU: MUSU `0`, Node `0.03`, WebView2 `0.26`
- matrix max working set: `495.13MB`

Public release remains No-Go until actual second-PC runtime/multi-device
evidence, two-machine CPU/matrix evidence, hosted P2P control-plane proof,
support mailbox evidence, and Store evidence are complete.

## 2026-06-04 20:18 KST Room Presence Client CLI

Local Rust CLI support now connects installed MUSU programs to the MUSU.PRO
room presence API:

- `musu room presence publish <room-id>`
- `musu room presence list <room-id>`

This keeps the product split clear. `musu.pro` is remote input, project room,
company meeting room, presence, rendezvous, path-selection, relay-fallback
coordination, and evidence. Local MUSU programs execute the work on each
device and use `musu.pro` only to bootstrap discovery and coordination before
preferring direct P2P mesh.

Validation:

- targeted Rust room presence lib tests passed `4/4`
- Rust CLI parser test passed `1/1`
- `cargo check --bin musu` passed
- debug `musu.exe` build passed
- CLI help checks passed for `room presence`, `publish`, and `list`
- `git diff --check` passed

Release interpretation:

- this is on-demand CLI only; no background heartbeat, timer, or polling loop
  was added
- this is Rust runtime source, so the current packaged MSIX, smoke evidence,
  desktop-open CPU sample, runtime CPU matrix, final packet, and operator
  action pack are stale until regenerated from this commit
- public release remains No-Go until second-PC runtime/multi-device evidence,
  hosted `musu.pro` P2P proof, `musu@musu.pro` mailbox evidence, and Store
  evidence are complete

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_PRESENCE_CLIENT_CLI_2026_06_04.md`

## 2026-06-04 20:52 KST Post Room Presence Client CLI Primary Evidence Refresh

Fresh primary-machine evidence was restored after the room presence client CLI
source change.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-204006-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-205835-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-204423-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_203939`
- CLI route output `MUSU_CLI_ROUTE_OK_20260604_203939`
- desktop-open CPU passed for `60.049s` with
  `require_owned_webview2=true`, MUSU `0`, Node `0.03`, WebView2 `0.1`,
  owned WebView2 `6`, working set `488.93MB`, and hot `0`
- matrix verifier passed with `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_204423`, and hot `0`
- clean go/no-go on `75348c74` reports `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, `manifest_git.dirty=false`, and
  public release No-Go

HUGH_SECOND still has `.cargo\bin\musu.exe` before the WindowsApps alias in
PATH, so the fresh install verification passed but the warning-mode state was
not recorded as new strict MSIX install evidence.

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted `musu.pro` P2P proof, `musu@musu.pro` mailbox evidence, and Store
evidence are complete.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_PRESENCE_CLIENT_CLI_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 18:02 KST Post Room Work-Order API Primary Evidence Refresh

After adding `POST /api/rooms/[roomId]/work-orders`, the local-sideload MSIX
was rebuilt/reinstalled and primary-machine evidence was refreshed.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-175043-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-175223-HUGH_SECOND.desktop-open.evidence.json`
- five-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-175413-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke passed on `http://127.0.0.1:3001` with bridge
  `http://127.0.0.1:2001` and output
  `MUSU_RELEASE_SMOKE_OK_20260604_175010`
- desktop-open CPU passed for `60.052s`: MUSU `0.03`, Node `0.05`,
  WebView2 `0.6`, owned WebView2 `6`, working set `480.89MB`, hot `0`
- matrix verifier passed `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_175413`, max CPU MUSU `0.31`,
  Node `0.05`, WebView2 `0.47`, max working set `483.12MB`, hot `0`
- clean go/no-go on `b3776f0c` reports `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  runtime idle CPU `1/2 [HUGH_SECOND]`, runtime CPU matrix
  `1/2 [HUGH_SECOND]`, `public_metadata_ok=true`, `manifest_git.dirty=false`,
  and blocker count `6`

HUGH_SECOND's fresh warning-mode MSIX install capture remains diagnostic-only
because developer PATH currently shadows WindowsApps with
`C:\Users\empty\.cargo\bin\musu.exe`. Canonical MSIX install evidence remains
strict release evidence.

Public release remains No-Go until the second Windows PC has the same current
build installed and records multi-device, runtime idle CPU, and runtime CPU
matrix evidence, plus hosted `musu.pro` P2P control-plane proof, support mailbox
proof, and Store evidence.

## 2026-06-04 19:05 KST Room Event API

Added room-scoped event log endpoints:

- `POST /api/rooms/[roomId]/events`
- `GET /api/rooms/[roomId]/events`

This gives MUSU.PRO project/company rooms a concrete coordination and
meeting-room event surface for local MUSU programs and attached AI agents.

Contract:

- requires P2P control bearer auth for reads and writes
- records owner-scoped `musu.room_event.v1` events
- supports event types `presence`, `status`, `message`, `decision`,
  `work_order`, `rendezvous`, `route`, and `error`
- preserves bounded `company_id`, `project_id`, `work_order_id`,
  `source_node_id`, `source_agent_id`, `message`, `payload`, and `origin`
- returns `newest_first` room events and supports scoped filters
- uses KV/Upstash when configured; production requires KV or explicit
  `MUSU_ROOM_EVENT_STORE_PATH`

Validation passed:

- direct room event route test `5/5`
- `npm run test:p2p` `70/70`
- `npm run test:routes` `18/18`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

This is web runtime source, so the current packaged primary evidence must be
refreshed for the new commit before local artifact readiness can be claimed.

## 2026-06-04 19:10 KST Post Room Event API Primary Evidence Refresh

After adding `POST /api/rooms/[roomId]/events` and
`GET /api/rooms/[roomId]/events`, the local-sideload MSIX was rebuilt and
reinstalled, then primary-machine packaged evidence was refreshed.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-185920-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-190029-HUGH_SECOND.desktop-open.evidence.json`
- five-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-190203-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke passed on `http://127.0.0.1:3001`, reachable URL
  `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:2555`, task
  `985b7bae-8a1d-4815-82e8-67202abe7938`, and output
  `MUSU_RELEASE_SMOKE_OK_20260604_185856`
- desktop-open CPU passed for `60.063s`: MUSU `0.03`, Node `0`, WebView2
  `0.49`, owned WebView2 `6`, working set `484.19MB`, hot `0`
- matrix verifier passed `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_190203`, max CPU MUSU `0.1`, Node
  `0.05`, WebView2 `0.55`, max working set `484.91MB`, route probe ok
- clean go/no-go on `5d94c236` reports `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `public_metadata_ok=true`, `manifest_git.dirty=false`, and public release
  No-Go

HUGH_SECOND's fresh warning-mode install output remains diagnostic-only because
developer PATH currently shadows WindowsApps with
`C:\Users\empty\.cargo\bin\musu.exe`. Canonical strict MSIX install evidence
remains the prior strict release record.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_EVENT_API_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 19:30 KST Room Presence API

Added current room presence endpoints:

- `POST /api/rooms/[roomId]/presence`
- `GET /api/rooms/[roomId]/presence`

This gives MUSU.PRO project/company rooms a current owner-scoped presence
table for local MUSU programs and attached AI agents, instead of relying only
on append-only room events.

Contract:

- requires P2P control bearer auth for reads and writes
- records owner-scoped `musu.room_presence.v1` records
- supports statuses `online`, `idle`, `busy`, and `offline`
- preserves bounded company/project/source-agent/active-work-order context
- preserves node identity, app version, capabilities, public key, relay
  capability, route candidate endpoints, origin, `last_seen_at`, and
  `expires_at`
- seeds the existing P2P rendezvous candidate cache on `POST`
- returns `last_seen_desc` current presence with scoped filters
- uses KV/Upstash when configured; production requires KV or explicit
  `MUSU_ROOM_PRESENCE_STORE_PATH`

Validation passed:

- direct room presence route test `6/6`
- `npm run test:p2p` `76/76`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

This is web runtime source, so the current packaged primary evidence must be
refreshed for the new commit before local artifact readiness can be claimed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_PRESENCE_API_2026_06_04.md`

## 2026-06-04 19:45 KST Post Room Presence API Primary Evidence Refresh

After adding `POST /api/rooms/[roomId]/presence` and
`GET /api/rooms/[roomId]/presence`, the local-sideload MSIX was rebuilt and
reinstalled, then primary-machine packaged evidence was refreshed.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-193251-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-193347-HUGH_SECOND.desktop-open.evidence.json`
- five-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-193512-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke passed on `http://127.0.0.1:3001`, reachable URL
  `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:10358`, task
  `fcd02b2e-1516-4eae-b839-4758fe971bdd`, and output
  `MUSU_RELEASE_SMOKE_OK_20260604_193224`
- desktop-open CPU passed for `60.162s`: MUSU `0`, Node `0.05`, WebView2
  `0.78`, owned WebView2 `6`, working set `482.9MB`, hot `0`
- matrix verifier passed `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_193512`, max CPU MUSU `0.03`, Node
  `0.03`, WebView2 `0.34`, max working set `483.64MB`, route probe ok
- clean go/no-go on `8e1dc11` reports `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `public_metadata_ok=true`, `manifest_git.dirty=false`, and public release
  No-Go

The roadmap boundary remains explicit: `musu.pro` is the remote user input,
project room, company meeting room, presence, rendezvous, path-selection,
fallback-relay, and evidence plane; local MUSU programs execute work on each
device and prefer direct P2P mesh after web-assisted rendezvous.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_PRESENCE_API_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 18:37 KST Post Room-Scoped Rendezvous API Primary Evidence Refresh

After adding `POST /api/rooms/[roomId]/rendezvous`, the local-sideload MSIX was
rebuilt/reinstalled and primary-machine packaged evidence was refreshed.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-182640-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-182732-HUGH_SECOND.desktop-open.evidence.json`
- five-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-182915-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke passed on `http://127.0.0.1:3001`, reachable URL
  `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:12502`, and output
  `MUSU_RELEASE_SMOKE_OK_20260604_182613`
- desktop-open CPU passed for `60.04s`: MUSU `0.13`, Node `0`, WebView2
  `0.68`, owned WebView2 `6`, working set `486.19MB`, hot `0`
- matrix verifier passed `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_182915`, max CPU MUSU `0`, Node `0.05`,
  WebView2 `0.31`, max working set `489.12MB`
- clean go/no-go on `5fb40731` reports `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `public_metadata_ok=true`, `manifest_git.dirty=false`, and public release
  No-Go

HUGH_SECOND's fresh warning-mode install output remains diagnostic-only because
developer PATH currently shadows WindowsApps with
`C:\Users\empty\.cargo\bin\musu.exe`. Canonical strict MSIX install evidence
remains the prior strict release evidence.

Public release remains No-Go until the second Windows PC has the same current
build installed and records multi-device, runtime idle CPU, and runtime CPU
matrix evidence, plus hosted `musu.pro` P2P control-plane proof, support mailbox
proof, and Store evidence.

## 2026-06-04 18:28 KST Room-Scoped Rendezvous API

Added `POST /api/rooms/[roomId]/rendezvous` so a MUSU.PRO
project/company room can create a P2P rendezvous session between two local MUSU
nodes.

Contract:

- requires P2P control bearer auth
- requires `source_node_id` and `target_node_id`
- stamps `origin=musu.pro`
- uses path `roomId` as the authoritative `room_id`
- preserves bounded `company_id`, `project_id`, `room_id`, `work_order_id`, and
  `origin` on `StoredP2pRendezvousSession`
- seeds source/target from cached node candidates
- returns path selection order `lan`, `tailscale`, `direct_quic`, `relay`

Validation passed:

- direct room rendezvous test `3/3`
- `npm run test:p2p` `65/65`
- `npm run test:routes` `18/18`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

This is web runtime source, so the current packaged primary evidence must be
refreshed for the new commit before local artifact readiness can be claimed.

## 2026-06-04 17:44 KST MUSU.PRO Room Work-Order API

`musu.pro` company/project rooms now have an explicit work-order input API:

- `POST /api/rooms/[roomId]/work-orders`

The endpoint stamps `origin=musu.pro`, defaults `channel=company-room` and
`sender_id=musu.pro-room`, preserves bounded `company_id`, `project_id`,
`room_id`, and `work_order_id`, generates a bounded `work_order_id` when
omitted, normalizes `file://` workspace URIs, and forwards the envelope to the
local bridge `/api/tasks/delegate`.

Validation:

- `npm run test:routes` passed `18/18`
- direct room route test passed `4/4`
- `npm run typecheck` passed
- `npm run build` passed
- `git diff --check` passed

Release interpretation:

- this is web runtime source, so current packaged MSIX/smoke/CPU evidence is
  stale until rebuilt/refreshed after commit
- this does not close second-PC, hosted P2P relay proof, support mailbox, or
  Store gates

## 2026-06-04 MUSU.PRO Work-Order Context Hardening

The roadmap split is now implemented in the task forwarding contract:
`musu.pro` can submit web work orders with `company_id`, `project_id`,
`room_id`, `work_order_id`, and `origin`, while local MUSU programs execute the
work through the local bridge. The same context is preserved through Rust
`/api/tasks/delegate`, direct peer `ForwardedTask`, relay payload preview
serialization, and MCP `delegate_task`.

Validation passed `npm run test:routes` `14/14`, specific forward route test
`2/2`, `npm run typecheck`, `cargo fmt`, `cargo check --bin musu`, and three
targeted Rust audit/context/relay payload tests.

Release impact: this is source code, so current packaged primary evidence is
stale until a fresh MSIX/single-machine/CPU refresh is recorded for this HEAD.
This does not implement release-grade relay transport; public release remains
No-Go on second-PC evidence, hosted P2P proof, support mailbox, and Store
evidence.

## 2026-06-04 16:58 KST Post Work-Order Context Primary Evidence Refresh

After MUSU.PRO work-order context hardening, primary-machine packaged evidence
was refreshed again.

Fresh evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-164153-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-164313-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-164620-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-164933-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_164246`
- dashboard reachable URL `http://127.0.0.1:3001/app`
- desktop-open CPU passed for `60.065s`: MUSU `0`, Node `0`, WebView2
  `0.18`, hot `0`, working set `466.49MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token was `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_164933`
- matrix max CPU: MUSU `0.03`, Node `0.03`, WebView2 `0.18`
- matrix max working set: `470.97MB`
- clean go/no-go on `d8e91f0f` reports single-machine true, MSIX true, runtime
  idle CPU `1/2`, runtime CPU matrix `1/2`, public metadata true, and manifest
  clean

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted P2P relay proof, support mailbox evidence, and Store evidence are
complete.

## 2026-06-04 P2P Connect Endpoint Evidence Gate Hardening

Hosted P2P release evidence now requires explicit relay connect endpoint proof.

Changed:

- relay status must report `relay_connect_endpoint_wired=true`
- relay transport preflight must report `relay_connect_endpoint_wired=true`
- recorder `ok` calculation now includes connect endpoint proof
- verifier regression added `p2p-bad-relay-connect-endpoint`

Validation:

- PowerShell parser checks passed
- release evidence verifier regression passed with `ok=true`, `case_count=29`,
  `failed_case_count=0`
- current hosted P2P evidence remains blocked with `fail_count=29`, connect
  endpoint false, payload endpoint false, lease store unconfigured, route
  evidence count `0`, and relay payload transport unproven

This is evidence-gate hardening only. Public release remains No-Go until
second-PC evidence, hosted P2P relay proof, support mailbox evidence, and Store
evidence are complete.

## 2026-06-04 HUGH-MAIN Route Attempt CPU Evidence

Captured a targeted post-route CPU sample after attempting
`musu route --target HUGH-MAIN --wait`.

Evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.post-route.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-171623-HUGH_SECOND.target-route.verification.json`

Result:

- target `HUGH-MAIN`
- route probe failed by timeout to `http://192.168.1.192:8949/api/tasks/delegate`
- failure was explicitly allowed for this CPU-only evidence
- verifier `ok=true`, `fail_count=0`
- 60.058s sample: MUSU `0`, Node `0.05`, WebView2 `0.18`
- owned WebView2 `6`, working set `465.97MB`, hot process count `0`

This proves the primary machine stays within idle CPU budget after a failed
second-PC route attempt. It is not successful multi-device route evidence.

## 2026-06-04 15:57 KST Post Relay Connect/Queue Primary Evidence Refresh

After the relay connect endpoint state and preview queue state were split, the
current local-sideload MSIX was rebuilt/installed and primary-machine evidence
was refreshed.

Fresh evidence:

- strict MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-155606-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-154159-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-154401-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-154626-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke dashboard `http://127.0.0.1:3001`, bridge `http://127.0.0.1:2817`,
  output `MUSU_RELEASE_SMOKE_OK_20260604_154129`
- desktop-open CPU passed for `60.055s`: MUSU `0`, Node `0.05`, WebView2
  `1.09`, working set `483.5MB`, hot `0`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_154626`
- clean go/no-go on `c3d36a7b`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`, runtime idle
  CPU `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `manifest_git.dirty=false`, blocker count `6`

Roadmap interpretation:

- `localhost` dashboards are local-only and require a running local runtime
- `musu.pro` is the web input/project-room/company-meeting-room/rendezvous/
  path-selection/relay-fallback/evidence plane
- local MUSU programs execute the actual work on each device
- devices should prefer P2P mesh after web-assisted rendezvous

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_CONNECT_QUEUE_STATUS_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 14:27 KST Post CEO Dispatch SSE Primary Evidence Refresh

After CEO dispatch SSE cleanup hardening, primary-machine evidence was
refreshed again.

Fresh evidence:

- strict MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-140415-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-140717-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-141753-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-141924-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- MSIX alias shadowing count `0`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_140650`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260604_140650`
- desktop-open CPU passed for `60.062s`: MUSU `0`, Node `0.03`,
  WebView2 `0.16`, owned WebView2 `6`, hot `0`, working set `485.51MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token was `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_141924`
- matrix max CPU: MUSU `0`, Node `0.05`, WebView2 `0.23`
- matrix max working set: `485.13MB`
- clean go/no-go reports `single_machine_verified=true`, primary idle CPU
  `1/2`, primary matrix `1/2`, `manifest_git.dirty=false`, and six blockers

Public release remains No-Go until second-PC runtime/multi-device evidence,
live owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence are complete.

## 2026-06-04 14:34 KST Current Operator Handoff Pack After CEO Dispatch Evidence

After the primary evidence refresh commit, the operator handoff artifacts were
regenerated from clean HEAD.

Artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-143204.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-143217.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-143217\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-143217.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-143217\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-143217.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-143204`

Validation:

- final packet verifier `ok=true`, `fail_count=0`
- action pack verifier `ok=true`, `fail_count=0`
- final handoff status reports `packet_verified=true`,
  `action_pack_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`, P2P relay route evidence count `0`, relay payload proof `false`,
  delivery proof valid count `0`, and blocker count `6`

The second-PC transfer zip is the current package to run on another Windows PC
for the remaining multi-device and second-machine CPU/matrix gates.

## 2026-06-04 14:39 KST External Gate Recheck After CEO Dispatch Evidence

After the current handoff pack was regenerated, the remaining external release
gates were rechecked from the packaged Windows alias.

Evidence:

- external gate evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260604-143952-HUGH_SECOND.external-gates.evidence.json`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.evidence.json`
- live P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.verification.json`

Local audits remain clean:

- Rust background loops `ok=true`, `fail_count=0`
- frontend polling `ok=true`, `fail_count=0`
- process ownership `ok=true`, `fail_count=0`
- local API auth `ok=true`, `fail_count=0`
- operator API security `ok=true`, `fail_count=0`

Result remains No-Go:

- local artifacts and single-machine evidence are current and passing
- runtime idle CPU remains `1/2`
- runtime CPU matrix remains `1/2`
- second PC `192.168.1.192:8949` is unreachable with `tcp_connect_timeout`
- P2P env is not ready because KV/Upstash URL/token are missing
- P2P verification is `ok=false`, `fail_count=27`
- relay route evidence count is `0`
- relay payload proof is `false`
- relay payload delivery proof valid count is `0`

Roadmap lock: `musu.pro` is the web input/project room/rendezvous/path-selection
/relay-fallback/evidence plane. Local MUSU programs execute the work and direct
P2P mesh remains preferred after web-assisted rendezvous.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_GATE_RECHECK_AFTER_CEO_DISPATCH_EVIDENCE_2026_06_04.md`

## 2026-06-04 Relay Drain Preview Evidence Gate Hardening

Hosted route-evidence regression now proves target-side relay payload drain
preview records cannot be mistaken for release-grade relay transport.

The new test covers preview evidence with:

- `transport_verified_by=musu_relay_payload_drain_preview`
- `encryption=relay_payload_queue_preview`
- stored `musu.relay_payload_delivery_proof.v1`

Expected result:

- delivery proof is accepted as stored
- route remains `release_grade=false`
- blockers remain `transport_not_release_grade_quic_tls`,
  `relay_route_missing_transport_proof`, `relay_route_transport_not_wired`, and
  `relay_route_payload_endpoint_not_wired`

Validation:

- `npm run test:p2p` passed `62/62`
- `npm run typecheck` passed
- `git diff --check` passed

This does not close the hosted P2P gate. It prevents preview queue evidence from
weakening the release requirement for QUIC/TLS relay transport proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_DRAIN_PREVIEW_EVIDENCE_GATE_HARDENING_2026_06_04.md`

## 2026-06-04 test file freshness and web input roadmap (wiki/683)

Release freshness now treats TypeScript test/spec source files as status-only:

- `*.test.ts`
- `*.test.tsx`
- `*.spec.ts`
- `*.spec.tsx`

This prevents test-only release-gate hardening from incorrectly staling current
packaged MSIX/smoke/CPU/matrix evidence.

Validation:

- PowerShell parser check passed for modified release scripts
- release evidence verifier regression passed with `ok=true`, `case_count=28`,
  and `failed_case_count=0`
- clean go/no-go on `dd4fb7efab643c52cc47bcbb6ddd921058ef437a` restored
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `msix_install_verified=true`, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime
  CPU matrix `1/2 [HUGH_SECOND]`, and `manifest_git.dirty=false`

Roadmap:

- `localhost` dashboards are local-only
- `musu.pro` is the web input, project room, company meeting room, rendezvous,
  path-selection, relay-fallback coordination, and evidence plane
- local MUSU programs execute work on each device
- devices should prefer direct P2P mesh after web-assisted rendezvous
- relay is fallback-only, not the default data path

Current validation remains one-machine until the same current build is installed
and tested on a second Windows PC.

Public release remains No-Go on six unchanged blockers:

- multi-device
- second-PC runtime idle CPU
- second-PC runtime CPU scenario matrix
- support mailbox
- Store release
- hosted `musu.pro` P2P control-plane proof

Canonical report:

- `docs\RELEASE_1_15_0_RC1_TEST_FILE_FRESHNESS_AND_WEB_INPUT_ROADMAP_2026_06_04.md`

## 2026-06-04 relay connect and queue status split (wiki/684)

Relay evidence now distinguishes preview queue progress from release-grade
connect/tunnel transport:

- `relay_connect_endpoint_wired=false`
- `relay_payload_endpoint_wired=false`
- `relay_payload_queue_endpoint_wired=true`
- `relay_transport_wired=false`
- `relay_default_data_path=false`

Updated hosted relay transport/lease/connect responses, Rust relay status and
transport DTOs, and the P2P evidence recorder.

Validation:

- `npm run test:p2p` passed `62/62`
- `npm run typecheck` passed
- Rust fmt passed
- targeted Rust relay status test passed `1/1`
- `cargo check --bin musu` passed
- PowerShell parser check passed
- `git diff --check` passed

This is status/evidence clarity only. It does not implement release-grade
`/api/v1/relay/connect` transport. Fresh packaged primary evidence is required
after commit because runtime/web/Rust source changed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_CONNECT_AND_QUEUE_STATUS_SPLIT_2026_06_04.md`

## 2026-06-04 13:57 KST CEO Dispatch SSE Cleanup Hardening

CEO dispatch run streams now have explicit frontend cleanup:

- active dispatch run `EventSource` instances are tracked in `runStreamsRef`
- duplicate subscriptions for the same run id close the previous stream first
- terminal stream messages close and unregister the stream
- SSE errors close and unregister the stream and mark still-streaming runs as
  error
- component unmount closes all active run streams
- frontend polling audit now checks shared bounded EventSource and CEO dispatch
  stream cleanup contracts

Validation passed:

- `npm run test:runtime-polling` `15/15`
- frontend polling audit `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- `npm run typecheck`
- `npm run build`

Release meaning: this is a frontend runtime source change. Fresh packaged
single-machine smoke, idle CPU, and runtime CPU matrix evidence are required
after commit before current-source release gates can pass again.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CEO_DISPATCH_SSE_CLEANUP_HARDENING_2026_06_04.md`

## 2026-06-04 12:00 KST Chat SSE Retry Cap and Local-Executor Roadmap

`useChat` now stops retrying a failed bridge task SSE stream after a bounded
retry count. The previous path had capped delay and stale-generation cleanup,
but no retry-count cap, so a missing local bridge SSE endpoint could keep
reconnecting forever every `10s`.

Changed:

- `SSE_MAX_RETRIES=5`
- `reconnectAttempts`
- `resetReconnectState()`
- retry-cap guard in `es.onerror`
- runtime polling contract checks for the cap/guard/reset markers
- frontend polling release audit checks the cap/guard/reset markers

Roadmap interpretation:

- `musu.pro` is the remote input, project-room, rendezvous, path-selection,
  relay-fallback coordination, and evidence surface
- local MUSU programs execute the work on each machine
- `localhost` dashboards are local operator/dev surfaces and only work when the
  local runtime/dashboard is running
- current validation is one-machine; second-PC route proof and two-machine CPU
  evidence require installing the current MUSU build on another Windows PC

Validation passed:

- `npm run test:runtime-polling` `14/14`
- frontend polling audit `ok=true`, `fail_count=0`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Clean go/no-go on `e92e0e558d2336237b7eca70d59c8ce35f764229` reports
`local_artifacts_ready=true`, `msix_install_verified=true`,
`single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU matrix
`0/2`, `manifest_git.dirty=false`, and seven blockers. The primary evidence
drop is expected because frontend runtime source changed after the latest
packaged evidence. Fresh MSIX/smoke/CPU/matrix evidence is required before this
source can reclaim one-machine gates.

## 2026-06-04 12:47 KST Post Chat SSE Primary Evidence Refresh

Fresh current-source one-machine evidence is restored after the chat SSE retry
cap:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-121733-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-122357-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-124137-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-123317-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Clean go/no-go on `d2c29ef95c07e0a1d299289abe3f95358f4424dd` reports
`local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle CPU
`1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
`manifest_git.dirty=false`, and blocker count `6`.

Current handoff artifacts after this refresh:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-124445.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-124456.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-124456\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-124456.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-124456\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-124456.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-124445`

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.

## 2026-06-04 CLI Route Wait and Web-Input Roadmap Update

- roadmap update:
  `docs\RELEASE_1_15_0_RC1_CLI_ROUTE_WAIT_WEB_INPUT_ROADMAP_2026_06_04.md`
- `musu.pro` role: web input, project room, rendezvous, fallback coordination,
  and evidence plane
- local MUSU role: execute work on each device, own local runtime/bridge/files,
  and coordinate over P2P mesh after web-assisted bootstrap
- `localhost` dashboard role: local operator/dev surface, not the product
  entrypoint for remote ordering
- `musu route --wait` now has bounded wait behavior:
  `--wait-timeout-sec`, default `300s`, hard cap `3600s`, timeout-bound status
  requests, bounded poll sleep, and `remote_task_wait_timeout`
- Rust background-loop audit now checks `cli-route-wait` and
  `cli-bridge-health`
- validation passed `cargo fmt --check`,
  `cargo test --lib route_wait_timeout_is_bounded`, Rust background-loop audit
  `ok=true` / `fail_count=0`, and `git diff --check`
- dirty go/no-go after this source change: `ready=false`,
  `local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle
  CPU `1/2`, runtime CPU matrix `1/2`, `manifest_git.dirty=true`, blocker
  count `7`
- release implication: this is local busy-loop/roadmap hardening; public
  release still requires current-source clean evidence after commit, second-PC
  runtime/multi-device evidence, live owner-scoped `musu.pro` relay proof,
  support mailbox evidence, and Store/Partner Center evidence

## 2026-06-04 03:48 KST Relay Payload Target Poller

Rust bridge relay fallback now has an opt-in target-side payload poller.

Implemented:

- `MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1` gate; default remains off
- shared `drain_relay_payloads_for_local_target(...)` primitive for HTTP drain
  and poller
- poll interval default `60s`, floor `30s`
- empty/failure backoff default `300s`, hard ceiling `3600s`
- per-cycle claim limit default `1`, clamp `1..5`
- sleep before first cycle
- cancellation-aware sleep with `tokio::select!` and `CancellationToken`
- `musu doctor` background profile fields for relay payload poller state
- Rust background-loop audit checks for the poller loop contract

Validation:

- relay payload tests passed `19/19`
- doctor background tests passed `5/5`
- `cargo check --bin musu` passed
- Rust background-loop audit passed with `ok=true`, `fail_count=0`, and
  `unaudited_loop_hit_count=0`
- `git diff --check` passed

Release interpretation:

- this closes the "target-side bounded opt-in poller source contract" slice
- this does not make relay the default data path
- this does not prove task completion through relay
- this does not provide release-grade QUIC/TLS relay proof
- fresh packaged MSIX/smoke/CPU/matrix evidence is required after this source
  change
- follow-up atomic KV mutation hardening now closes the hosted concurrent claim
  blocker; public release remains No-Go on hosted relay payload proof,
  second-PC runtime/multi-device evidence, support mailbox, and Store evidence

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_TARGET_POLLER_2026_06_04.md`

## 2026-06-04 Relay Payload Atomic KV Mutation

Hosted KV/Upstash relay payload mutations now run atomically inside Redis Lua
`EVAL` scripts.

Store behavior:

- append, claim, and delivery each use a single Redis `EVAL`
- claim no longer performs app-level `lrange` plus `del`/`rpush` retained-list
  rewrites
- owner scoping, target matching, and optional session/lease/source/tunnel
  filters are preserved
- delivery before claim still rejects with
  `relay_payload_delivery_requires_claim`
- KV reads accept both object records and JSON string records
- configured KV/Upstash stores report `relay_payload_store_release_grade=true`

Validation:

- focused relay payload route tests passed 11/11
- `npm run test:p2p` passed 57/57
- `npm run typecheck` passed

Release interpretation:

- this closes hosted concurrent claim hardening
- payload records still remain `release_grade=false` and
  `transport_kind=http_store_forward_preview`
- this is not release-grade QUIC/TLS relay payload transport
- fresh packaged MSIX/smoke/CPU/matrix evidence is required after this source
  change
- public release remains No-Go on hosted relay proof, second-PC runtime and
  route evidence, support mailbox, and Store evidence

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_ATOMIC_KV_MUTATION_2026_06_04.md`

## 2026-06-04 01:20 KST Relay Payload Queue Runtime Hook

Rust forwarding fallback now queues the failed forwarded-task envelope to the
hosted relay payload queue after direct peer route failure and issued
`musu.pro` relay lease.

Release interpretation:

- direct peer routing remains first
- no issued lease still means payload transport was not attempted
- issued lease plus stored queue payload now records
  `payload_transport_attempted=true`
- queued fallback remains non-release-grade with
  `payload_transport_proven=false` and
  `payload_transport_failure_class=relay_target_polling_not_implemented`
- target-side queue polling/execution and QUIC/TLS relay transport proof remain
  missing
- current packaged primary evidence is stale until MSIX rebuild/install plus
  fresh smoke/CPU/matrix evidence are recorded after this source change

Validation:

- Rust forward tests passed 6/6
- Rust rendezvous tests passed 5/5
- Rust cloud tests passed 5/5
- `cargo check --bin musu` passed
- `npm run test:p2p` passed 51/51
- `npm run typecheck` passed
- Rust fmt check passed
- `git diff --check` passed

## 2026-06-04 01:58 KST Relay Payload Query Client CLI

Rust now has on-demand relay payload queue visibility:

- `P2pRelayPayloadQuery`
- `P2pRelayPayloadQueryResponse`
- `MusuCloud::query_relay_payloads(...)`
- `musu relay payloads`

The CLI supports `--local-target` for target-side diagnostics and only includes
payload bytes in JSON when `--include-payload` is explicitly set. Human output
does not print `payload_base64`.

Validation:

- Rust cloud tests passed 6/6
- install CLI relay payload tests passed 2/2
- `cargo check --bin musu` passed
- `musu relay payloads --help` listed the new query filters
- `musu relay payloads --json --local-target --status queued --limit 1`
  emitted `musu.relay_payloads.v1`, but live production `musu.pro` returned 404
  for `/api/v1/p2p/relay/payload`
- Rust fmt check passed
- `git diff --check` passed

Release interpretation:

- this is target-side visibility only
- this is not background polling
- this is not payload execution
- this is not release-grade relay transport proof
- hosted deployment of the payload route is still required before live target
  polling evidence can be captured

## 2026-06-04 02:16 KST Relay Payload Claim/Delivery API

The hosted relay payload queue now has explicit owner-scoped claim and delivery
transitions through `PATCH /api/v1/p2p/relay/payload`.

New schemas:

- `musu.relay_payload_claim.v1`
- `musu.relay_payload_delivery.v1`

State flow:

- `queued -> claimed -> delivered`
- claim records `claimed_by` and `claimed_at`
- delivery records `delivered_at`
- delivery before claim returns `409 relay_payload_delivery_requires_claim`

Safety behavior:

- public payload records strip `owner_key`
- claim responses include `payload_base64` only when `include_payload=true`
- delivery responses never include payload bytes
- Follow-up wiki/657 added KV/Upstash claim/delivery, and follow-up wiki/660
  replaced the list-rewrite mutation path with Redis Lua `EVAL`. The old
  placeholder errors `relay_payload_claim_kv_not_implemented` and
  `relay_payload_delivery_kv_not_implemented` are no longer current behavior,
  and hosted concurrent atomic claim hardening is now closed.

Validation:

- `npm run test:p2p` passed 54/54
- `npm run typecheck` passed

Release interpretation:

- this is API state-transition semantics only
- this is not background polling
- this is not payload execution
- this is not release-grade QUIC/TLS relay transport proof
- public release remains No-Go until target-side poll/claim/execute,
  release-grade relay proof, hosted proof evidence, and fresh packaged evidence
  are complete

## 2026-06-04 02:42 KST Relay Payload Claim/Delivery Client CLI

Rust now has manual target-side claim/delivery diagnostics for the hosted relay
payload queue.

New Rust surface:

- `P2pRelayPayloadClaimRequest`
- `P2pRelayPayloadClaimResponse`
- `P2pRelayPayloadDeliveryRequest`
- `P2pRelayPayloadDeliveryResponse`
- `MusuCloud::claim_relay_payloads(...)`
- `MusuCloud::mark_relay_payload_delivered(...)`
- `musu relay payload-claim`
- `musu relay payload-deliver`

CLI behavior:

- `payload-claim` and `payload-deliver` require `--target-node-id` or
  `--local-target`
- text output omits payload bytes
- claim JSON includes payload bytes only when `--include-payload` is set
- no live production mutation smoke was run because claim/deliver changes queue
  state

Validation:

- Rust cloud tests passed 10/10
- install CLI relay payload tests passed 4/4
- `cargo check --bin musu` passed
- Rust fmt check passed
- `musu relay payload-claim --help` listed target filters and
  `--include-payload`
- `musu relay payload-deliver --help` listed payload id and target filters

Release interpretation:

- this is on-demand target-side diagnostics only
- this is not background polling
- this is not payload execution
- this is not release-grade QUIC/TLS relay transport proof
- follow-up target poller and atomic KV mutation hardening closed bounded
  polling source-contract and hosted concurrent claim blockers
- public release remains No-Go until execution safety, relay proof, hosted proof
  evidence, and fresh packaged evidence are complete

## 2026-06-04 02:52 KST Vercel CLI Pin Deploy Workflow

PR #8 `Deploy to Vercel` failed after the relay payload claim CLI commit because
the workflow installed `vercel@latest`.

Failure:

- `vercel@latest` resolved to `54.8.0`
- `vercel@54.8.0` depended on `@vercel/express@0.1.96`
- the GitHub runner received npm registry 404 for
  `@vercel/express-0.1.96.tgz`

Fix:

- set `VERCEL_CLI_VERSION=54.7.1`
- install `npm install -g "vercel@${VERCEL_CLI_VERSION}"`
- print `vercel --version` in the workflow
- include `.github/workflows/deploy-musu-bee.yml` in PR path filters

The first pin candidate `44.7.3` installed but was too old for Vercel deploy;
the endpoint requires `47.2.2` or later. `54.7.1` was selected because it
satisfies the endpoint and uses `@vercel/express@0.1.95`, avoiding the missing
`0.1.96` tarball from `54.8.0`.

Validation:

- `npm view vercel dist-tags version dependencies --json` confirmed the broken
  latest package graph
- `npx -y vercel@44.7.3 --version` printed `Vercel CLI 44.7.3`, but PR deploy
  rejected that version as below the endpoint minimum
- `npm view vercel@54.7.1 dependencies.@vercel/express dependencies.@vercel/node dependencies.@vercel/next --json`
  confirmed the final pin uses `@vercel/express=0.1.95`
- `npx -y vercel@54.7.1 --version` printed `Vercel CLI 54.7.1`

Release interpretation:

- this is deploy CI hardening only
- this is not runtime relay progress
- public release remains No-Go on the existing runtime/P2P/release evidence
  blockers

## 2026-06-04 03:03 KST Relay Payload KV Claim/Delivery Store

The hosted relay payload queue now has KV/Upstash claim/delivery support.

Store behavior:

- file and KV paths share the same `queued -> claimed -> delivered` transition
  logic
- KV loads fresh records with `lrange`
- KV rewrites retained records with `del` plus `rpush`
- delivery before claim still rejects with
  `relay_payload_delivery_requires_claim`
- the old placeholder errors `relay_payload_claim_kv_not_implemented` and
  `relay_payload_delivery_kv_not_implemented` are no longer current behavior

Validation:

- focused relay payload route tests passed 10/10
- `npm run test:p2p` passed 56/56
- `npm run typecheck` passed

Release interpretation:

- this is hosted storage capability, not relay transport completion
- follow-up wiki/660 replaces the KV list rewrite with Redis Lua `EVAL` and
  closes hosted concurrent atomic claim hardening
- no background polling or payload execution was added
- public release remains No-Go until bounded target polling, execution safety,
  release-grade relay proof, hosted proof evidence, and fresh packaged evidence
  are complete

## 2026-06-04 03:31 KST Relay Payload Target Drain

The Rust bridge now has a bounded, request-driven target-side drain primitive
for claimed relay payloads:

- local bridge route `POST /api/relay/payloads/drain`
- response schema `musu.relay_payload_drain.v1`
- claim schema `musu.relay_payload_claim.v1`
- delivery schema `musu.relay_payload_delivery.v1`
- manual drain `limit` defaults to `1` and clamps to `1..5`
- cloud claim/delivery timeout uses
  `MUSU_P2P_RELAY_PAYLOAD_DRAIN_TIMEOUT_MS`, default `3000ms`, clamped to
  `250..10000ms`

Drain behavior:

- claims owner-scoped payloads for the local target node
- validates claimed status, local target, claimant, payload kind, base64 bytes,
  byte count, SHA-256, source node, rendezvous session, and embedded target
  node
- decodes `forwarded_task_envelope` bytes into `ForwardedTask`
- accepts decoded tasks through the existing local forwarded-task runner path
- marks payloads delivered back to `musu.pro` only after local acceptance
  succeeds

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml relay_payload --lib -- --test-threads=1`
  passed 14/14
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- Rust background-loop contract passed with `ok=true`, `fail_count=0`, and
  `unaudited_loop_hit_count=0`

Release interpretation:

- this is request-driven target-side claim/decode/accept/delivery plumbing
- delivery means accepted by the local task runner, not task completion
- no idle background poll loop was added
- follow-up wiki/660 closes hosted concurrent claim hardening
- public release remains No-Go until opt-in polling evidence, release-grade
  QUIC/TLS relay proof, hosted production evidence, and fresh packaged MSIX
  smoke/CPU/matrix evidence are complete

## 2026-06-04 Post Relay Transport Proof API Primary Evidence Refresh

After the lease-bound relay transport proof record API source change, the
local-sideload MSIX was rebuilt and reinstalled as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`, then current primary evidence
was refreshed on `HUGH_SECOND`.

The source gate landed on 2026-06-03, but local KST evidence capture crossed
midnight, so the fresh evidence stamps are `20260604-*`.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-000322-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-000405-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-000535-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-000535-HUGH_SECOND.verification.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_000259`
- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:3477`
- dashboard task `836ed892-5340-4be4-8f44-ca897c8c5f49`
- desktop-open CPU passed for `60.059s`: MUSU `0.03`, Node `0.03`,
  WebView2 `0.57`, hot `0`, working set `453.71MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_000535`
- matrix max CPU: MUSU `0.03`, Node `0.05`, WebView2 `0.47`
- matrix max working set: `456.73MB`

Clean go/no-go generated at `2026-06-04T00:16:47.6824922+09:00` on
`049a9a9a` reports `ready=false`, `local_artifacts_ready=true`,
`single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, P2P relay route evidence count `0`, relay payload proof `false`,
`manifest_dirty=false`, and six remaining public release blockers.

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted release-grade relay payload proof, support mailbox evidence, and Store
evidence are complete.

## 2026-06-04 Relay Payload Queue API

Relay fallback now has the first concrete payload data-path slice:

- `POST /api/v1/p2p/relay/payload`
- `GET /api/v1/p2p/relay/payload`
- Rust client hook `MusuCloud::submit_relay_payload(...)`

The endpoint requires bearer auth and a stored owner-scoped relay lease before
it accepts `musu.relay_payload_envelope.v1`. Missing leases return
`409 relay_payload_lease_not_found` without storing. Stored records validate
optional SHA-256, keep `relay_default_data_path=false`, strip `owner_key`, and
return payload bytes only when `include_payload=1`.

Validation:

- relay payload route test passed `5/5`
- `npm run test:p2p` passed `50/50`
- `npm run typecheck` passed
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check` passed
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`
  passed `5/5`
- `git diff --check` passed

Release interpretation:

- this is not a central default data path; it requires a relay lease, and relay
  leases still require direct route failure
- this is not release-grade QUIC/TLS relay transport
- `relay_payload_endpoint_wired=false` and `relay_transport_wired=false` remain
  until target-side relay polling/execution and release-grade tunnel proof land

## 2026-06-03 Relay Transport Proof Store Gate

Route-evidence grading now rejects proof-shaped relay payload JSON unless a
matching owner-scoped relay transport proof record exists in the proof store.

New blockers:

- `relay_route_transport_proof_not_stored`
- `relay_route_transport_proof_store_backend_not_release_grade`
- `relay_route_transport_proof_store_not_release_grade`
- `relay_route_transport_proof_store_unavailable:<detail>`

Validation:

- `npm run test:p2p` passed `41/41`
- `npm run typecheck` passed
- `git diff --check` passed

Release interpretation:

- this is evidence-chain hardening, not relay/tunnel payload transport
  completion
- `/api/v1/relay/connect` still does not produce release-grade QUIC relay proof
- fresh packaged primary smoke/CPU/matrix evidence is required after this source
  change before current-source local runtime evidence is restored

## 2026-06-03 Post Relay Proof Store Primary Evidence Refresh

Current-source primary packaged evidence has been restored after the relay proof
store gate.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-232213-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-232423-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-232620-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_232146`
- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:11952`
- desktop-open CPU `60.046s`: MUSU `0`, Node `0.03`, WebView2 `0.39`,
  hot `0`, working set `462.32MB`
- matrix verifier `ok=true`, `fail_count=0`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_232620`
- clean go/no-go on `4ab4281f`: single-machine true, runtime idle CPU `1/2`,
  runtime CPU matrix `1/2`, public release No-Go with six remaining blockers

## 2026-06-03 Relay Transport Proof Record API

The hosted control-plane now exposes:

- `POST /api/v1/p2p/relay/transport-proof`
- `GET /api/v1/p2p/relay/transport-proof`

The POST route is owner-scoped, requires a matching stored relay lease, and
returns 409 without storing proof for `relay_transport_proof_lease_not_found`.
Local file proof stores remain non-release-grade and surface
`relay_transport_proof_store_backend_not_release_grade`.

Rust cloud client now includes `MusuCloud::submit_relay_transport_proof(...)`
for future relay/tunnel runtime code.

Validation:

- `npm run test:p2p` passed `45/45`
- `npm run typecheck` passed
- Rust cloud tests passed `4/4`
- `git diff --check` passed

Release interpretation:

- this adds the proof recording contract
- it does not implement relay payload transit
- current-source packaged primary evidence must be refreshed after this source
  change

## 2026-06-03 22:30 KST Relay Transport Proof Binding Gate

Relay route evidence now rejects proof-shaped relay payload transport JSON unless
it is bound to the stored owner-scoped relay lease and release transport
contract.

New blockers:

- `relay_route_transport_proof_relay_url_mismatch`
- `relay_route_transport_proof_kind_not_release_grade`
- `relay_route_transport_proof_opened_at_invalid`
- `relay_route_transport_proof_closed_at_invalid`
- `relay_route_transport_proof_timestamp_order_invalid`

Validation:

- `npm run test:p2p` passed `40/40`
- `npm run typecheck` passed
- `git diff --check` passed

Release interpretation:

- this hardens relay evidence integrity
- this does not implement relay/tunnel payload transport
- public release remains No-Go on real relay payload proof, second-PC
  runtime/multi-device evidence, support mailbox evidence, and Store evidence

## 2026-06-03 23:01 KST Post Proof-Binding Primary Evidence Refresh

After the relay transport proof binding gate, current-source primary packaged
evidence was refreshed on `HUGH_SECOND`.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-225154-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-225332-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-225507-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_225125`
- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:1037`
- desktop-open CPU passed for `60.039s`: MUSU `0.03`, Node `0.03`,
  WebView2 `0.6`, hot `0`, working set `455.37MB`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_225507`
- matrix max CPU: MUSU `0.44`, Node `0.13`, WebView2 `0.44`
- matrix max working set: `460.51MB`
- clean go/no-go reports single-machine true, primary idle CPU `1/2`, primary
  matrix `1/2`, and six remaining release blockers

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted relay payload proof, support mailbox evidence, and Store evidence are
complete.

## 2026-06-03 22:09 KST Relay Fallback Payload Gap Gate

Issued relay leases are now explicitly separated from relay payload transport
proof in runtime and hosted route evidence.

New `relay_fallback` fields:

- `payload_transport_attempted`
- `payload_transport_proven`
- `payload_transport_failure_class`

Current bridge forwarding records an issued lease with
`payload_transport_attempted=false`, `payload_transport_proven=false`, and
`payload_transport_failure_class=relay_payload_transport_not_implemented`
because the relay payload path is still not wired.

Hosted route-evidence release grading now adds blockers:

- `relay_fallback_payload_transport_not_attempted`
- `relay_fallback_payload_transport_not_proven`
- `relay_fallback_payload_transport_not_implemented`

Validation:

- `git diff --check`: passed
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`: passed
- `npm run test:p2p`: `38/38`
- `npm run typecheck`: passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --lib -j 1`: passed
- Rust route-evidence tests: `10/10`

Release interpretation:

- this is evidence hardening, not relay payload transport implementation
- public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted relay payload proof, support mailbox evidence, and Store evidence
- current packaged primary evidence is historical until clean post-commit
  MSIX/smoke/CPU/matrix evidence is refreshed

## 2026-06-03 21:10 KST P2P Relay Status Descriptor Gate

Hosted P2P relay status now reports the live transport descriptor instead of
hiding relay readiness behind hardcoded status output.

Implemented:

- `musu relay status --json` queries hosted relay transport and mirrors
  preflight, descriptor, payload endpoint, lease store, blockers, and error
  fields
- `musu relay transport --json` includes `relay_payload_endpoint_wired`
- P2P evidence verification requires status preflight, status descriptor,
  status payload endpoint, empty blockers, release-grade lease storage,
  transport payload endpoint, and release-grade route proof before
  `relay_transport_wired=true`
- P2P recorder and go/no-go output now surface the status/transport payload
  endpoint fields directly

Validation:

- release evidence verifier regressions `22/22`
- `cargo check --lib`
- targeted Rust relay status test `1/1`
- `npm run test:p2p` `37/37`
- `git diff --check`

Dirty-tree go/no-go:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU scenario matrix `1/2`
- `rust_background_loop_contract_verified=true`
- `p2p_control_plane_verified=false`
- `p2p_relay_status_transport_preflight_ok=false`
- `p2p_relay_status_transport_descriptor_wired=false`
- `p2p_relay_status_payload_endpoint_wired=false`
- `p2p_relay_transport_payload_endpoint_wired=false`
- `p2p_relay_payload_transport_proven=false`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_STATUS_DESCRIPTOR_GATE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1786` files and `2339` symbols after GOAL v450, wiki/640, Rust
  relay status live transport descriptor mapping, P2P recorder/verifier/go-no-go
  updates, the canonical report, WIKI/WIKI_INDEX updates, and CoS memory
  `2026-06-03_p2p_relay_status_descriptor_gate.md`

Release remains No-Go until second-PC runtime/multi-device evidence, hosted
relay payload transport proof, support mailbox evidence, and Store evidence are
complete.

## 2026-06-03 21:45 KST Post Relay Status Descriptor Primary Evidence Refresh

After commit `16b7373d383751932651c926225aedbf946a9b99`, the local-sideload
MSIX was rebuilt, installed, and primary-machine packaged evidence was
refreshed.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-213326-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-213716-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-213849-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_213326`
- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:8290`
- desktop-open CPU passed for `60.05s`: MUSU `0`, Node `0`,
  WebView2 `0.21`, hot `0`, working set `511.57MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_213849`
- matrix max WebView2 `0.29`
- matrix max working set `518.07MB`

Dirty-tree go/no-go restored `single_machine_verified=true`, runtime idle CPU
`1/2`, and runtime CPU matrix `1/2`. Public release remains No-Go until
second-PC runtime/multi-device evidence, hosted relay payload proof, support
mailbox evidence, and Store evidence are complete.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_STATUS_DESCRIPTOR_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1794` files and `2339` symbols after GOAL v452, wiki/642, fresh
  primary evidence, the primary refresh report, WIKI/WIKI_INDEX updates, and
  CoS memory `2026-06-03_post_relay_status_descriptor_primary_evidence_refresh.md`

## 2026-06-03 20:30 KST Rust Background Loop Contract Gate

Added `scripts\windows\audit-rust-background-loop-contract.ps1` and wired it
into final go/no-go, final handoff status, and final operator packet
generation/verification.

The new gate verifies Rust bridge/runtime loop contracts for planner,
clipboard, mDNS, cloud registration heartbeat, file sync, and auto-update
health polling. It also fails new unaudited Rust loop constructs outside the
reviewed allowlist.

Validation:

- Rust background-loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`
- dirty-tree go/no-go reported `rust_background_loop_contract_verified=true`
  and `rust_fail_count=0`
- desktop release readiness still only fails on existing second-PC
  multi-device evidence
- `git diff --check` passed

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_BACKGROUND_LOOP_CONTRACT_GATE_2026_06_03.md`

## 2026-06-03 19:38 KST Relay Connect Fail-Closed Endpoint

`/api/v1/relay/connect` now returns an explicit fail-closed `501` response with
schema `musu.relay_connect_unavailable.v1`. It keeps
`relay_payload_endpoint_wired=false`, `relay_transport_wired=false`, and
`relay_default_data_path=false`, and it does not emit payload proof.

Validation:

- `npm run test:p2p` passed `37/37`
- `npm run typecheck` passed
- `git diff --check` passed
- dev `/app` returned `200`
- dev `/api/v1/relay/connect` returned `501`

Fresh local live P2P evidence
`.local-build\p2p-control-plane\20260603-193609-musu.pro.evidence.json`
remains `ok=false` with `fail_count=19`. Public release remains No-Go; this is
failure handling only, not relay payload transport implementation.

## 2026-06-03 20:05 KST Post Relay Connect Primary Evidence Refresh

After commit `e592bf608341f0461b03d55c7c0845ccf7781be0`, the local-sideload
MSIX was rebuilt, reinstalled, and primary-machine evidence was refreshed.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-195528-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-195742-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-195917-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_195506`
- desktop-open CPU passed for `60.059s`: MUSU `0`, Node `0`,
  WebView2 `0.39`, hot `0`, working set `521.48MB`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_195917`
- matrix max CPU: MUSU `0.42`, Node `0.05`, WebView2 `0.42`
- matrix max working set: `527.72MB`

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted relay payload proof, support mailbox evidence, and Store evidence are
complete.

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1760` files and `2326` symbols after GOAL v442, wiki/632, fresh
  primary evidence, the primary refresh report, BETA/WIKI/WIKI_INDEX updates,
  and CoS memories
  `2026-06-03_post_cli_route_pinned_transport_primary_evidence_refresh.md` and
  `2026-06-03_post_cli_route_pinned_transport_primary_evidence_index_refresh.md`

## 2026-06-03 18:31 KST CLI Route Pinned Transport And Bounded SSE Visibility

CLI route evidence now preserves actual HTTPS fingerprint-pinned transport
proof. `musu route` selects HTTPS peer metadata when available and records
`tls_cert_fingerprint_pin` only after the fingerprint-pinned request path
succeeds.

Frontend bounded SSE visibility handling also moved under the shared low-duty
poller. `useBoundedEventSource` no longer owns a direct `visibilitychange`
listener, and the frontend polling contract audit again reports no direct
visibility listeners outside the shared poller.

Validation:

- Rust CLI route tests passed `17/17`
- Rust bridge forward tests passed `4/4`
- Rust route-evidence tests passed `7/7`
- `cargo check --bin musu` passed
- `npm run test:runtime-polling` passed `14/14`
- frontend polling contract audit passed with `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, and `direct_visibility_listener_hit_count=0`
- `npm run typecheck` passed
- `npm run test:p2p` passed `35/35`
- `git diff --check` passed

Release interpretation:

- this is transport proof preservation and polling-contract hardening
- this is not QUIC/TLS relay payload transport implementation
- public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted relay payload proof, support mailbox evidence, Store evidence, and
  current dirty git state
- because runtime source changed, fresh current-commit MSIX/smoke/CPU/matrix
  evidence is required before packaged primary evidence can be claimed current

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CLI_ROUTE_PINNED_TRANSPORT_AND_BOUNDED_SSE_VISIBILITY_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1749` files and `2326` symbols after GOAL v440, wiki/630,
  CLI route pinned transport updates, bounded SSE visible reconnect
  shared-poller updates, the canonical report, BETA/WIKI/WIKI_INDEX updates,
  and CoS memories
  `2026-06-03_cli_route_pinned_transport_and_bounded_sse_visibility.md` and
  `2026-06-03_cli_route_pinned_transport_and_bounded_sse_visibility_index_refresh.md`

## 2026-06-03 19:23 KST Post CLI Route Pinned Transport Primary Evidence Refresh

After commit `dded9eba67415cfdfd371f9c940fa2d59bd366ac`, the local-sideload
MSIX was rebuilt and installed, then primary-machine evidence was refreshed.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-190139-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-190450-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-191447-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_190107`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260603_190107`
- desktop-open CPU passed for `60.064s`: MUSU `0`, Node `0`,
  WebView2 `0.08`, hot `0`, working set `466.26MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix dashboard URL was `http://127.0.0.1:3001/app`
- matrix route token was `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_191447`
- matrix max CPU: MUSU `0`, Node `0.03`, WebView2 `0.10`
- matrix max working set: `595.78MB`

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted relay payload proof, support mailbox evidence, and Store evidence are
complete.

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1745` files and `2318` symbols after GOAL v438, wiki/628, fresh
  primary evidence, the primary refresh report, BETA/WIKI/WIKI_INDEX updates,
  and CoS memory
  `2026-06-03_post_bounded_frontend_sse_primary_evidence_refresh.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1728` files and `2315` symbols after the startup helper source
  primary evidence refresh

## 2026-06-03 16:51 KST Bounded Frontend SSE Hardening

Dashboard mount-time SSE subscriptions now use
`musu-bee/src/lib/useBoundedEventSource.ts` instead of relying on the browser's
unbounded `EventSource` auto-retry behavior.

Applied surfaces:

- `/fleet` machines stream
- `/c/[id]` resource request stream
- `/m/[id]` resource request and machines streams
- `TasksPanel` bridge task stream

Contract:

- failed streams are explicitly closed
- reconnect uses capped exponential backoff from `1s` to `10s`
- reconnect stops after `5` failed attempts
- hidden documents close the stream and clear retry timers
- low-duty polling remains the fallback

Validation:

- `npm run test:runtime-polling` passed `14/14`
- `npm run typecheck` passed
- `npm run build` passed
- `git diff --check` passed with only the existing CRLF normalization warning
  for `musu-bee/src/components/TasksPanel.tsx`

Release interpretation:

- this removes another frontend busy-loop candidate
- this is runtime source, so fresh clean MSIX/smoke/CPU/matrix evidence is
  required after commit before the current source can claim packaged primary
  evidence
- public release remains No-Go on second-PC runtime/multi-device evidence,
  hosted relay payload proof, support mailbox evidence, Store evidence, and
  current dirty git state

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1732` files and `2318` symbols after GOAL v436, wiki/626,
  bounded frontend SSE source/tests, the canonical report, BETA/WIKI/WIKI_INDEX
  updates, and CoS memory
  `2026-06-03_bounded_frontend_sse_hardening.md`

## 2026-06-03 17:52 KST Post Bounded Frontend SSE Primary Evidence Refresh

After commit `4f52269e66c3e1ffdbde9d7936bcd83e4fb4a22c`, the local-sideload
MSIX was rebuilt and installed, then primary-machine evidence was refreshed.

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-173637-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-174002-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-174322-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_173611`
- desktop-open CPU passed for `60.044s`: MUSU `0`, Node `0`,
  WebView2 `0.29`, hot `0`, working set `382.17MB`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_174322`
- matrix max CPU: MUSU `0.03`, Node `0.03`, WebView2 `0.39`
- matrix max working set: `518.26MB`
- go/no-go now sees single-machine true, primary idle CPU `1/2`, and primary
  matrix `1/2`

Packaging note:

- the first generated clean-worktree cert stalled in non-interactive
  `certutil` and was not LocalMachine-trusted for same-version replacement
- the package was repacked with existing trusted cert
  `9048EA2A9C0891A574C62F9DF2C1D0DA873952DE`

Residual hardening note:

- production Next served `http://127.0.0.1:3001/app` for the matrix, but stderr
  logged `ReferenceError: self is not defined` from
  `.next\server\app\m\[id]\workstation\page.js`
- this did not affect the matrix route and is a separate workstation SSR
  boundary issue

Public release remains No-Go until second-PC runtime/multi-device evidence,
hosted relay payload proof, support mailbox evidence, and Store evidence are
complete.
## 2026-06-05 Rendezvous selector candidate metadata hardening

Rust rendezvous selection now consumes the candidate metadata preserved by
`musu.pro` room presence/rendezvous and published by local MUSU programs.

- direct candidates select `public_addr` when present
- selected peer metadata keeps original `candidate_addr`,
  `selected_addr_source`, `public_addr`, `nat_type`, and `nat_observed_by`
- relay descriptors are carried as `relay_candidates` metadata for fallback
  diagnostics
- relay remains fallback-only and is still not selected as the default data path

Validation passed:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu rendezvous -- --nocapture`
  - `6/6`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1 -Json`
  - `ok=true`, `fail_count=0`
- `git diff --check`

Release implication: this is Rust runtime source. Fresh MSIX install,
single-machine smoke, desktop-open idle CPU, and runtime CPU matrix evidence
are required again before current-source local runtime gates can be claimed.

## 2026-06-05 Desktop shell dashboard URL hardening

The desktop shell and `/app` gate now avoid sending users to a fixed workspace
dashboard URL when the packaged local runtime exposes no dashboard.

- `probe_dashboard()` returns no dashboard URL when `3000` and `3001` do not
  answer, instead of fabricating `http://127.0.0.1:3000/app`.
- `Open Dashboard` is disabled unless status reports a reachable dashboard URL.
- The `/app` gate no longer tells users to visit `http://localhost:3001/app`;
  it says MUSU Desktop runs work locally and MUSU.PRO connects to that local
  runtime for web input/control-plane work.

Validation passed:

- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml`
  - `7/7`
- `.\node_modules\.bin\tsc.cmd --noEmit`
- `git diff --check`

Release implication: this is desktop shell/web app source. Fresh MSIX install,
single-machine smoke, desktop-open idle CPU, and runtime CPU matrix evidence
are required again before current-source local runtime gates can be claimed.

## 2026-06-05 Post desktop dashboard URL hardening primary evidence refresh

After desktop dashboard URL hardening, HUGH_SECOND packaged local-runtime
evidence was refreshed for the current source line.

Package/restart state:

- release runtime build, Tauri desktop shell build, MSIX package/signing,
  packaged startup smoke, install, installed package contract, and packaged
  runtime identity checks passed
- PATH alias shadowing remains, so explicit WindowsApps alias invocation was
  used
- packaged runtime repair passed with bridge `http://127.0.0.1:1181`
- `dashboard.required=false`

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-112337-HUGH_SECOND.evidence.json`
- idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-112710-HUGH_SECOND.desktop-open.evidence.json`
- runtime matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-112906-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-112906-HUGH_SECOND.verification.json`

Results:

- single-machine verifier `ok=true`, `fail_count=0`
- idle CPU `git_dirty=false`, `60.055s`, MUSU `0`, Node `0`,
  WebView2 `0.16`, working set `363.72MB`, hot `0`
- runtime matrix verifier `ok=true`, `fail_count=0`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_112906`
- route task `37773a7f-6aa3-4f0c-90d7-0317558d044f`
- matrix max role CPU: MUSU `0.03`, Node `0`, WebView2 `0.1`
- matrix max working set: `366.26MB`

This restores current one-machine packaged evidence only. Public release still
requires second-PC multi-device, second-PC idle CPU, second-PC runtime CPU
matrix, hosted P2P, support mailbox, and Store evidence.

## 2026-06-05 WebSocket proxy loop audit coverage

The runtime/product boundary is unchanged: MUSU Desktop is the local executor,
and MUSU.PRO is the remote input, project/company room, rendezvous,
path-selection, relay-fallback policy, and evidence control plane.

Release verifier coverage was tightened:

- `audit-rust-background-loop-contract.ps1` now explicitly audits
  `musu-rs\src\bridge\handlers\ws_proxy.rs`
- `ws-proxy` checks prove websocket proxy loops are request-upgrade scoped,
  await inbound client/upstream frames, exit on send failure, and close when
  either direction ends
- this is source-contract coverage only; it does not change runtime behavior or
  refresh/replace packaged evidence

Validation passed:

- PowerShell parser check
- Rust background-loop audit `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`
- `ws-proxy` checks `6/6`
- frontend polling audit `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`
- `git diff --check`

Clean go/no-go after `918ac7a6` reports local artifacts and single-machine
evidence still ready, Rust/idle-loop contracts true, `manifest_git_dirty=false`,
and public release still No-Go on second-PC multi-device/CPU/matrix evidence,
hosted P2P proof, support mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_WS_PROXY_LOOP_AUDIT_COVERAGE_2026_06_05.md`

## 2026-06-05 Rust while-let loop audit coverage

The Rust background-loop release verifier now scans for `while let` loops in
addition to the previous `while true` / `loop {` candidates.

This is source-contract coverage only:

- no runtime behavior changed
- the local-executor / MUSU.PRO control-plane product boundary is unchanged
- new `while let` loop files now require explicit allowlisting and named audit
  checks

New audited scopes include audit failure-window pruning, rate-limit pruning,
workflow topological queues, file directory listing, forwarded-task multipart
parsing, WebDAV PROPFIND listing, and WebRTC NAL buffer splitting.

Validation passed:

- PowerShell parser check
- Rust background-loop audit `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`,
  `check_count=152`
- selected scopes: `audit-failure-window 2/2`, `rate-limit-window 2/2`,
  `workflow-executor 6/6`, `workflow-spec 3/3`, `files-api 2/2`,
  `forward-multipart 2/2`, `webdav-propfind 2/2`,
  `webrtc-screen-share 8/8`, `ws-proxy 6/6`
- frontend polling audit `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`
- `git diff --check`

Clean go/no-go after `d1c3361b` reports local artifacts, single-machine, MSIX
install, targeted second-PC route CPU, Rust/idle/frontend contracts, and P2P
store-forward contract true, `manifest_git_dirty=false`, and public release
still No-Go on second-PC multi-device/CPU/matrix evidence, hosted P2P proof,
support mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_WHILE_LET_LOOP_AUDIT_COVERAGE_2026_06_05.md`

## 2026-06-05 Rust spawn/background-task audit coverage

Rust background-task verifier coverage was expanded after the `while let` audit.

`audit-rust-background-loop-contract.ps1` now audits current Rust spawn entry
points:

- `tokio::spawn`
- `tokio::task::spawn_blocking`
- `std::thread::spawn`
- `thread::spawn`

New Rust files using those constructs now fail the audit unless the file is
explicitly allowlisted and has named contract checks.

Covered contracts include planner/cloud heartbeat cancellation watcher tasks,
file-sync configured-root gating, control MCP cancellation, cloud client
timeout, clipboard opt-in blocking poller, relay payload poller spawn, mDNS
blocking receive timeout, indexer `spawn_blocking` await, PTY request-scoped
writes, WebRTC one-shot/request-scoped tasks, writer task registry/callback
bounded retries, Claude stdin writer, company post-create sync, node health
joins, route evidence submit, rendezvous publish/close timeouts, and workflow
execution.

Validation passed:

- PowerShell parser check
- Rust background-loop audit `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `unaudited_spawn_hit_count=0`,
  `telemetry_flush_primitive_hit_count=0`, `check_count=200`
- frontend polling audit `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`
- `git diff --check`

Clean go/no-go after `94a89614` reports local artifacts, single-machine, MSIX
install, targeted second-PC route CPU, Rust/idle/frontend contracts, and P2P
store-forward contract true, `manifest_git_dirty=false`, and public release
still No-Go on second-PC multi-device/CPU/matrix evidence, hosted P2P proof,
support mailbox proof, and Store proof.

Qualitative audit: no high or medium issue was found. This is verifier-only
source hardening; it does not replace runtime CPU evidence and does not change
the MUSU Desktop local-executor / MUSU.PRO web-input control-plane boundary.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_SPAWN_CONTRACT_AUDIT_COVERAGE_2026_06_05.md`

## 2026-06-05 native RPC exec hardening

Native bridge `/api/v1/rpc/exec` is now fail-closed and audit-logged. This
endpoint is part of the local-runtime boundary, so it must never behave as an
unrestricted remote shell from MUSU.PRO or a P2P control peer.

Runtime policy:

- `MUSU_RPC_EXEC_ALLOWLIST` defaults empty and must explicitly name the bare
  command allowed for native RPC exec.
- Paths are rejected even if the basename is allowlisted.
- User-supplied `cwd` is rejected.
- command and args are bounded and reject control characters.
- stdout/stderr are bounded to `64 KiB`.
- `MUSU_RPC_EXEC_TIMEOUT_SECS` defaults to `10` and is clamped to `1..60`.
- child processes use `kill_on_drop(true)`.
- rejected, spawn-failed, timed-out, and completed attempts are audit-logged.

Validation passed:

- Rust RPC exec tests `6/6`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu`
- operator API security audit `ok=true`, `fail_count=0`, `check_count=44`
- local API auth audit `ok=true`, `fail_count=0`, `check_count=39`
- Rust background-loop audit `ok=true`, `fail_count=0`, `check_count=200`
- `git diff --check`

Clean go/no-go after `fe25c5d8` reports `manifest_git.dirty=false`,
`local_artifacts_ready=true`, `msix_install_verified=true`, and all current
hardening/source-contract gates true, but public release remains No-Go:
`single_machine_verified=false`, runtime idle CPU false, runtime matrix false,
targeted second-PC route CPU false, hosted P2P false, support mailbox false,
and Store false. The local evidence reset is expected because native runtime
source changed after the last packaged evidence refresh.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_NATIVE_RPC_EXEC_HARDENING_2026_06_05.md`

## 2026-06-05 post native RPC exec primary evidence, audit, and next steps

Fresh HUGH_SECOND packaged local-runtime evidence was restored after native
RPC exec hardening. This reinforces the product split:

- MUSU Desktop is the local executor and packaged runtime.
- `localhost:3001` is optional developer/workspace dashboard surface, not a
  release requirement.
- MUSU.PRO is remote input, project/company room, meeting, rendezvous,
  path-selection, relay-fallback policy, and evidence control plane.
- Web/P2P input may deliver bounded authenticated work orders to a local MUSU
  program, but work executes on each device.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-230036-HUGH_SECOND.evidence.json`
- idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-230300-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231115-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231836-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- single-machine smoke passed with `single_machine_surface=local-bridge-only`,
  `dashboard_required=false`, bridge `http://127.0.0.1:6540`, and CLI route
  checked
- desktop-open idle CPU passed for `60.032s` with MUSU `0.03`, Node `0`,
  WebView2 `0.16`, working set `361.22MB`, and hot `0`
- five-scenario runtime CPU matrix passed verifier `ok=true`/`fail_count=0`
  with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_231115`
- targeted HUGH-MAIN matrix passed CPU verification with failed route allowed;
  the route timed out to `192.168.1.192:8949`, then post-route CPU stayed
  MUSU `0`, Node `0`, WebView2 `0.05`, hot `0`

Clean go/no-go after `3b09dd73`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_idle_cpu_verified=false`, valid machines `1/2 [HUGH_SECOND]`
- `runtime_cpu_scenario_matrix_verified=false`, valid machines
  `1/2 [HUGH_SECOND]`
- `runtime_cpu_second_pc_route_attempt_verified=true`, valid machines
  `1/1 [HUGH_SECOND]`
- hardening/source-contract gates true
- `multi_device_verified=false`
- `public_metadata_ok=true`
- `support_mailbox_verified=false`
- `store_release_verified=false`
- `p2p_control_plane_verified=false`

Code audit found no high or medium issue in the current code path. The current
unpushed delta adds evidence files only. Validation rerun passed
`cargo test rpc_exec --lib` `6/6` and
`audit-operator-api-security-contract.ps1 -FailOnProblem -Json` with
`ok=true`/`fail_count=0`.

Remaining public release blockers are real second-PC multi-device evidence,
second-PC idle CPU evidence, second-PC runtime CPU matrix evidence, live hosted
`musu.pro` P2P control-plane proof, `musu@musu.pro` support mailbox evidence,
and Partner Center/Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_NATIVE_RPC_EXEC_PRIMARY_EVIDENCE_AUDIT_NEXT_STEPS_2026_06_05.md`

Index refresh:

- MUSU local indexer:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2433 files`, `2705 symbols`, `34984 ms`
- gbrain was not rerun because the active same-session blocker remains missing
  `ZEROENTROPY_API_KEY`, import failures, `sync.last_commit` not advancing,
  and `gstack-brain-sync exited undefined`

## 2026-06-05 relay connect preflight endpoint, audit, and next steps

`/api/v1/relay/connect` is now an authenticated owner-scoped release-connect
preflight endpoint instead of an always-501 placeholder.

Current source state:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=true`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

Behavior:

- `GET /api/v1/relay/connect` requires P2P control auth and returns
  `musu.relay_connect.v1` preflight status.
- `POST /api/v1/relay/connect` requires P2P control auth, validates
  `lease_id`, `session_id`, `source_node_id`, and `target_node_id`, and checks
  an owner-scoped relay lease.
- Lease store failures now return shaped `503 relay_connect_store_failed`.
- A verified lease still returns `409 relay_payload_endpoint_not_wired` until a
  distinct release tunnel payload endpoint and release-grade transport proof
  exist.

Validation passed:

- PowerShell parser checks for the updated status/audit scripts
- `npm run test:p2p` `85/85`
- `npm run test:routes` `19/19`
- `npm run typecheck`
- P2P store-forward relay contract audit `ok=true`, `fail_count=0`
- operator API security contract audit `ok=true`, `fail_count=0`
- `git diff --check`

`show-musu-pro-p2p-env-status.ps1 -Json` now reports connect source blockers
cleared:

- `relay_connect_endpoint_implemented=true`
- `release_connect_fail_closed_placeholder_active=false`

The status correctly remains `ok=false` with blockers for the release payload
endpoint, queue-only payload path, non-release transport kind, missing
KV/Upstash env, live relay transport proof, live relay route proof, and live
payload delivery proof.

Code audit found no high or medium issue. This is a real control-plane
preflight improvement, not relay payload transport completion. Public release
remains No-Go on second-PC multi-device evidence, second-PC CPU/matrix
evidence, live hosted P2P proof, support mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_CONNECT_PREFLIGHT_ENDPOINT_AUDIT_NEXT_STEPS_2026_06_05.md`

## 2026-06-06 release relay payload preflight endpoint

Added a distinct release payload preflight endpoint:

- `GET /api/v1/relay/payload`
- `POST /api/v1/relay/payload`
- schema `musu.relay_payload_preflight.v1`

Current source state:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=true`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `release_payload_preflight_endpoint_implemented=true`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

The new endpoint requires P2P control auth and validates owner-scoped relay
lease metadata, but remains fail-closed:

- `release_payload_accepted=false`
- `payload_stored=false`
- `payload_transported=false`
- `relay_payload_endpoint_not_wired`

It does not call the preview queue storage helpers, so
`/api/v1/p2p/relay/payload` remains a non-release-grade store-forward preview
path. The release payload endpoint marker stays false until real release tunnel
payload transport exists as `quic_relay_tunnel` and can emit
`quic_tls_1_3` proof.

Validation passed:

- PowerShell parser checks for updated P2P status/audit scripts
- `npm run test:p2p` `88/88`
- `npm run typecheck`
- P2P store-forward relay contract audit `ok=true`, `fail_count=0`
- P2P env status recheck
- `git diff --check`

Public release remains No-Go on second-PC evidence, hosted P2P proof, support
mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELEASE_RELAY_PAYLOAD_PREFLIGHT_ENDPOINT_2026_06_06.md`

## 2026-06-06 final operator packet after second-PC CPU subrole gate

The final operator packet and operator action pack were regenerated from clean
HEAD `a45e6a1b75a51cba4276cdf60a452041069fd6c3` after the second-PC runtime CPU
subrole import gate.

Artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260606-020415.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260606-020432.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-020432\partner-center\MUSU-1.15.0-rc.1-store-submission-20260606-020432.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260606-020415`

Validation:

- final operator packet verification: `ok=true`, `fail_count=0`,
  `kit_count=1`
- operator action pack verification: `ok=true`, `fail_count=0`
- clean go/no-go: `ready_for_public_desktop_release=false`,
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `msix_install_verified=true`, `public_metadata_ok=true`,
  `manifest_git.dirty=false`

Release meaning:

- operator handoff artifacts are current after the CPU subrole import gate
- the nested second-PC transfer requires current
  `runtime_cpu_subrole_contract_ok=true` evidence
- stale second-PC returns without subrole fields remain diagnostic only
- public release remains No-Go until real second-PC route/CPU/matrix evidence,
  live hosted MUSU.PRO P2P proof, support mailbox proof, and Store evidence
  are complete

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FINAL_OPERATOR_PACKET_AFTER_SUBROLE_GATE_2026_06_06.md`

Index refresh:

- MUSU local indexer:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2469 files`, `2717 symbols`, `18185 ms`
- release evidence verifier regressions: `ok=true`, `45/45`, failed `0`
- gbrain was not rerun because the same-session blocker remains missing
  `ZEROENTROPY_API_KEY`, generated/evidence import failures,
  `sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`

## 2026-06-06 P2P relay transport kind/encryption split

The hosted relay release contract now separates relay tunnel kind from
encryption/proof:

- release relay tunnel kind: `quic_relay_tunnel`
- release encryption/proof requirement: `quic_tls_1_3`

Current source state:

- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`

API preflight/status responses now expose both
`release_grade_relay_transport_kind` and
`release_grade_transport_required`. Verifiers require
`relay_transport_kind=quic_relay_tunnel` separately from the
`quic_tls_1_3` proof requirement.

Validation passed:

- `npm run test:p2p` `88/88`
- `npm run typecheck`
- P2P store-forward relay contract audit `ok=true`, `fail_count=0`
- P2P env status recheck `ok=false` with expected hosted/source blockers
- release evidence verifier regressions `ok=true`, `45/45`, failed `0`

Code audit found and fixed one medium issue in the audit layer: the P2P relay
contract audit still expected the older verifier wording that treated
`quic_tls_1_3` as the relay kind. The audit now checks
`release_grade_relay_transport_kind=quic_relay_tunnel` and
`release_grade_transport_required=quic_tls_1_3` separately.

Public release remains No-Go. Next steps are to implement the real release
relay payload tunnel, configure production KV/Upstash, capture live MUSU.PRO
owner-scoped relay route and payload delivery proof, and collect current
second-PC route/CPU/matrix evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_TRANSPORT_KIND_ENCRYPTION_SPLIT_2026_06_06.md`

Index refresh:

- MUSU local indexer:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2471 files`, `2717 symbols`, `9797 ms`
- gbrain was not rerun because the same-session blocker remains missing
  `ZEROENTROPY_API_KEY`, generated/evidence import failures,
  `sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`
