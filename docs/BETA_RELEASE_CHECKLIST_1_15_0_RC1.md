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

Current machine-readable single-machine evidence was refreshed on 2026-06-02 02:02 KST after a fresh release MSIX build/install:

- evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.evidence.json`
- verification: `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.verification.json`
- summary: `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.summary.md`
- commit: `2e97d135538f063252577c49762f8018bc366843`
- dashboard task id: `3e96b141-6aa5-4d39-a29b-450f15eed8b3`
- bridge: `http://127.0.0.1:6907`
- dashboard output: `MUSU_RELEASE_SMOKE_OK_20260602_015326`
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
- startup single-instance target: repeated `musu up --json` calls reuse one bridge PID and do not spawn another runtime
- default mDNS: off unless `MUSU_ENABLE_MDNS=1`; IPv6, Tailscale, and common VPN/virtual adapters also require `MUSU_MDNS_ENABLE_IPV6=1`, `MUSU_MDNS_ENABLE_TAILSCALE=1`, and `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`
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
  KV provisioning are `missing_kv_rest_api_url`,
  `missing_kv_rest_api_token`, and
  `live_evidence_p2p_relay_lease_kv_not_configured`.
- relay fallback evidence status: failed runtime route evidence now carries a
  `relay_fallback` addendum after direct-route failure and lease evaluation,
  so `musu.pro` can audit whether the lease was requested/issued/skipped
  without claiming relay payload transport
- current state: after the latest desktop single-instance/public-site follow-up, the public site changes are deployed to `musu.pro`, but the installed desktop package still fails repeated Start-menu activation. `audit-musu-desktop-single-instance.ps1 -RequireInstalledPackage -RepeatCount 3` recorded `.local-build\desktop-single-instance\musu-desktop-single-instance-20260602-005439-HUGH_SECOND.json` with `ok=false`: before `1` desktop shell, after `4`, new shells `3`. Source has the Tauri single-instance plugin, but release readiness requires a fresh MSIX build/install and passing `desktop_single_instance_verified=true` evidence before desktop-open CPU/process evidence is trusted again. Public release remains No-Go until second-PC desktop-open CPU evidence, second-PC scenario matrix evidence, release-grade multi-device route proof, live `musu.pro` P2P control-plane auth, support inbox, Store evidence, and packaged desktop single-instance evidence all pass.
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
  hardware capability metadata, but Windows PowerShell/WMIC, macOS `sysctl`, and
  `nvidia-smi` probes in `musu-rs/src/peer/hardware.rs` now run with `stdin`
  closed, stderr discarded, and a 5s timeout. A stuck vendor/system probe should
  degrade to fallback hardware metadata instead of pinning a background worker.

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
- Direct `musu up --json | ConvertFrom-Json` is now hardened in source for
  fresh bridge spawn, but packaged MSIX evidence for that exact CLI pipe is
  now present and passing through the explicit WindowsApps alias. Developer
  PATH shadowing still exists on `HUGH_SECOND` because
  `C:\Users\empty\.cargo\bin\musu.exe` precedes the WindowsApps alias.
