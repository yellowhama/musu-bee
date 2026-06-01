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

Multi-device packet:

- script: `scripts\windows\smoke-multidevice-beta.ps1`
- kit builder: `scripts\windows\prepare-multidevice-test-kit.ps1`
- second-PC one-command release check: `scripts\windows\run-second-pc-release-check.ps1`
- second-PC return archive: `.local-build\second-pc-return\*.zip`
- second-PC return importer: `scripts\windows\import-second-pc-return.ps1`
- MSIX install evidence capture: `scripts\windows\capture-msix-install-evidence.ps1`
- runtime idle CPU evidence capture: `scripts\windows\measure-musu-idle-cpu.ps1` is now run by `run-second-pc-release-check.ps1` unless `-SkipRuntimeIdleCpu` is used
- runtime CPU scenario matrix: `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` writes `musu.runtime_cpu_scenario_matrix.v1` for `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route`; `dashboard-open` now launches an explicit dashboard URL or the `reachable_url` from `musu up --json` before sampling, never an unverified `dev_url`/`start_url` fallback, `post-route` requires the exact per-run route token, and `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` rejects no-op dashboard-open matrices while verifying clean/current 60s matrices with a successful post-route probe; this is now bundled into the second-PC kit, captured by `run-second-pc-release-check.ps1` unless `-SkipRuntimeCpuScenarioMatrix` is used, imported by `import-second-pc-return.ps1`, and is a separate go/no-go attribution gate rather than a replacement for the release-grade two-machine `desktop-open` CPU evidence
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
- startup single-instance audit: `scripts\windows\audit-musu-startup-single-instance.ps1`
- public beta target: MUSU packaged desktop open and idle, at least one MUSU runtime process sampled, at least one MUSU-owned WebView2 process attributed, no MUSU/Node.js/WebView2 process above 5% of one logical CPU for a 60s idle sample, owned process count <= 16, owned WebView2 count <= 8, total owned working set <= 1024MB
- process ownership target: one live MUSU runtime, no repo-related orphan Node/WebView2 helpers, and bridge registry PID plus `/health` matching the live runtime
- startup single-instance target: repeated `musu up --json` calls reuse one bridge PID and do not spawn another runtime
- default mDNS: off unless `MUSU_ENABLE_MDNS=1`; IPv6, Tailscale, and common VPN/virtual adapters also require `MUSU_MDNS_ENABLE_IPV6=1`, `MUSU_MDNS_ENABLE_TAILSCALE=1`, and `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`
- default clipboard polling: off unless `MUSU_ENABLE_CLIPBOARD_SYNC=1`
- runtime hardening and relay-control roadmap: `docs/RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md`
- go/no-go preflight now reports `msix_desktop_entrypoint_verified`, `runtime_idle_cpu_verified`, `runtime_cpu_scenario_matrix_verified`, `process_ownership_verified`, and `startup_single_instance_verified`
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
- relay fallback evidence status: failed runtime route evidence now carries a
  `relay_fallback` addendum after direct-route failure and lease evaluation,
  so `musu.pro` can audit whether the lease was requested/issued/skipped
  without claiming relay payload transport
- current state: primary clean packaged desktop-open evidence passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-160102-HUGH_SECOND.desktop-open.evidence.json` with `musu`/`musu-desktop` process count `2`, repo-related Next Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`, `webview2=0.08`, total working set `504.02MB`, and private memory `330.43MB`; current single-machine smoke passes at `docs\evidence\single-machine\1.15.0-rc.1\20260601-155630-HUGH_SECOND.evidence.json`; primary clean 4-state CPU scenario matrix passes at `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-154503-HUGH_SECOND.runtime-cpu-scenario-matrix.json` with repo Node counted and no hot processes; go/no-go reports single-machine verified, runtime idle CPU `1/2`, runtime CPU scenario matrix `1/2`, public metadata ok, MSIX install ok, and MSIX desktop entrypoint ok; second-PC desktop-open CPU evidence and second-PC scenario matrix evidence are still pending; the regenerated Store-reviewed artifact launches `musu-desktop.exe` and contains `musu.exe` plus `musu-startup.exe`; the fixed `local-sideload-manual` package is installed on `HUGH_SECOND` and passes installed desktop-entrypoint audit; Store-reviewed restricted-capability sideload is refused by default and must not be used as ordinary install evidence; local process ownership and repeated startup evidence pass
- frontend polling hardening: `musu-bee/src` currently has no direct
  `setInterval(` matches. Workflow run status, remote screen device refresh,
  agents surface refresh, and onboarding research polling use
  `useLowDutyPolling`; `musu-bee/src/app/runtime-polling-contract.test.ts`
  guards the contract. This reduces known frontend busy-loop candidates but
  does not replace the two-machine 60s CPU evidence gate.

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

- `runtime_package_ready=False`
- `msix_desktop_entrypoint_ready=False`
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
