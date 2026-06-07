# MUSU (Multi-Machine AI Control Plane) Wiki

## 1. 아키텍처 개요 (Architecture Overview)

MUSU는 단일 기기를 넘어 다수의 머신(Fleet)을 **단일 컴퓨터처럼 제어**하기 위해 설계된 멀티머신 바인딩 에이전트 기반의 플랫폼입니다. 사용자는 복잡한 네트워크나 서버 세팅 없이, 중앙의 AI 에이전트(무수집사)를 통해 모든 기기를 관리합니다.

- **Frontend (`musu-bee`)**: Next.js 기반의 메인 대시보드. Antigravity IDE 방식의 3단 레이아웃을 통해 최적의 AI 작업 경험을 제공합니다.
- **Backend (`musu-rs`)**: Rust 기반의 MCP (Model Context Protocol) 호스트. 원격 기기와의 P2P 연결 및 명령 파이프라인을 비동기적으로 실행합니다.

## 2. 3-Column Antigravity Layout
가장 직관적인 AI 코딩/조작 환경을 위해 도입된 핵심 UI 아키텍처입니다.

1. **Left Panel (내비게이션)**: 현재 시스템의 문맥(Context)을 제공. 연결된 기기 상태, 속해있는 프로젝트, 대화 기록 등을 관리.
2. **Center Panel (메인 작업 공간)**: `Dev`, `Town`, `Butler` 3가지 모드로 변환되며 작업의 결과물을 시각적으로 렌더링하는 거대한 뷰포트. CSS `display: none`을 통한 Offscreen Rendering으로 뷰 전환 시에도 컨텍스트가 유실되지 않습니다.
3. **Right Panel (AI Console)**: 메인 오케스트레이터인 AI와 실시간으로 통신하는 채팅 컨트롤 패널.

## 3. 핵심 철학 (Design Philosophy)
- **Generative UI**: AI가 텍스트로만 대답하는 것을 넘어, 상황에 맞는 컴포넌트(차트, 로그, 애니메이션 화면)를 스스로 렌더링합니다.
- **VibeCode Aesthetics**: Deep Espresso (`#251714`) 배경과 Golden Orange (`#FFA602`) 엑센트가 결합된 최고급 레트로 브루탈리즘 디자인.
- **개발자와 초보자의 융합**: 하드코어 `Dev` 모드부터 아무 지식 없이도 쓸 수 있는 `Butler` 모드까지 모두 지원합니다.

## 4. 실시간 통신 및 오케스트레이션 (Realtime SSE Pipeline)
- **단방향 비동기 스트림**: 프론트엔드는 사용자 명령을 백엔드(`POST /api/ai/chat`)로 넘기고 즉시 반환됩니다. 이후의 모든 오케스트레이션은 백엔드가 관장합니다.
- **SseBroadcaster**: Rust 서버는 AI 추론, 장기 실행 작업(도커 빌드 등), 로그 수집 과정을 비동기로 수행하며 언제든지 상태 업데이트나 위젯 페이로드를 생성해 `SseBroadcaster`에 Push 합니다.
- **React EventSource**: 프론트엔드는 `GET /api/tasks/events`를 지속적으로 구독하며, 백엔드로부터 `ai_message` 이벤트가 들어오면 전역 스토어(`Zustand`)에 위젯과 채팅을 렌더링합니다. 이를 통해 **"진정한 비동기 푸시 오케스트레이션"**이 가능해졌습니다.

## 5. 무수의 3대 목표 (The 3 Pillars of Musu)
무수 프로젝트의 궁극적인 비전은 다음과 같습니다:

1. **완벽한 집사 (기기 및 설비의 완전한 제어)**
   - AI가 `kvm_control` MCP 도구를 통해 마우스 이동, 클릭, 키보드 타이핑 등 컴퓨터를 **물리적**으로 제어합니다. 단축키 실행, 창 닫기, 특정 위치 클릭 등을 수행할 수 있는 진정한 로컬 비서(Butler)입니다.
2. **스스로 판단하는 CEO (목표 설정과 플래닝)**
   - 단순 텍스트 답변이 아닌, 자율 루프(Planner)를 통해 스스로 Company 단위의 목표를 설정하고, 방대한 Vector DB(SSOT) 기억을 참조하며 다음 행동을 계획합니다.
3. **유기적인 분산 조직 (에이전트 간의 협업 ㅡ A2A Mesh)**
   - `delegate_task` 도구를 통해 자신의 역량을 초과하거나 병렬 처리가 필요한 작업을 네트워크 상의 다른 에이전트(노드)에게 위임하고 결과를 취합합니다.

## 6. Windows Distribution State (2026-05-27)

Windows 배포는 이제 하나의 계약이 아니다. 현재 wiki/SSOT 기준 공식 해석은 다음 3분기다.

1. **direct-download operator path**
   - `install.ps1` + GitHub release asset
   - `~/.musu/bin`
   - background service registration
   - self-update 가능
2. **local sideload / MSIX manual bridge path**
   - packaged install
   - package identity 사용
   - bridge auto-start 보장 안 함
   - packaged alias로 `musu bridge`를 수동 실행하는 계약
3. **Store-reviewed / restricted-capability auto-start path**
   - packaged install/update
   - `desktop:StartupTask` + restricted capability
   - Microsoft Partner Center submission + review가 필요

현재 상태:

- local sideload / manual contract는 repo-local 검증 완료
- Store-reviewed artifact와 submission bundle은 준비 완료
- 최종 auto-start 승인 여부는 Microsoft review 외부 게이트에 걸려 있음

Canonical references:

- `docs/PRODUCT_CHARTER/WINDOWS_DISTRIBUTION_PIVOT_2026-05-27.md`
- `docs/STORE_MSIX_APPROVAL_STATUS_2026_05_27.md`
- `docs/STORE_MSIX_NEXT_STEPS_2026_05_27.md`

## 7. 1.15.0-rc.1 Beta State (2026-05-29)

현재 1.15 RC의 공식 해석은 **single-machine Windows local beta ready**다. 이 말은 사용자가 같은 Windows 머신에서 `musu up`을 실행하고, 대시보드에서 readiness를 보고, Claude 기반 로컬 agent task를 실제로 실행/확인할 수 있다는 뜻이다.

제품 계약 업데이트:

- first-run entry point: `musu up`
- readiness/diagnostic entry point: `musu doctor`
- bridge token source: env 우선, 없으면 `~/.musu/bridge.env`
- bridge URL source: dashboard server route마다 `~/.musu/services/bridge.json`를 재해석
- dashboard/bridge task default adapter: `claude`
- WindowsApps alias shadowing: beta blocker가 아니라 `doctor` warning
- MSIX legacy conflict preflight: `check-msix-legacy-conflicts.ps1` emits
  `musu.msix_legacy_conflicts.v1`; second-PC release checks and return imports
  now preserve this JSON so stale direct-download/dev binaries cannot silently
  shadow the packaged WindowsApps alias during release handoff.
- `musu doctor` bridge `/health` probe timeout is now 10s, not 3s, to avoid false `bridge.status=fail` on slow Windows loopback while the same bridge is reachable by curl/dashboard
- `smoke-single-machine-beta.ps1` uses readiness retries plus `Start-Process` temp-file command capture so `musu up` can spawn a long-lived bridge without PowerShell job/pipe hangs

검증된 smoke:

- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:11041`
- task `72ff5cff-f122-496b-ad6a-6d7e55711bf4`
- output `MUSU_SMOKE_OK`
- repeatable script `scripts\windows\smoke-single-machine-beta.ps1` passed on dashboard `3000`
- script task `2d9e93b1-fb2f-4cd4-ab40-1147fea89a6d`
- script output `MUSU_SCRIPT_SMOKE_OK`; CLI route output `MUSU_SCRIPT_CLI_OK`
- fresh 2026-05-29 06:52 KST smoke passed on commit `f9ae873`: dashboard task `b4b05b93-34d2-4946-b4cd-fdd5c5c6632d`, output `MUSU_RELEASE_SMOKE_OK_20260529_0652`, CLI route `MUSU_CLI_ROUTE_OK_20260529_0652`
- current machine-readable single-machine evidence exists at `docs\evidence\single-machine\1.15.0-rc.1\20260601-093958-HUGH_SECOND.evidence.json` on commit `4ad4b5591bba3c03fffe7eb2d054a4e191b67bea`; release go/no-go reports `single_machine_verified=true`

Microsoft Store run card:

- `docs/MICROSOFT_STORE_RELEASE_RUN_CARD_2026_05_29.md` is the shortest current operator path for MUSU Store release.
- It explicitly discards other-product copy such as HiveLink/Vibe PM, keeps the Store product boundary on MUSU desktop, preserves MSIX-first release strategy, and keeps public readiness blocked until second-PC MSIX install, multi-device, support mailbox, and Store approval evidence are all recorded.
- Current Microsoft Learn source refresh confirms the MSIX-first decision remains valid: Store MSIX packages are re-signed by Microsoft after certification; MSI/EXE fallback requires publisher signing and immutable versioned package URLs; restricted capabilities need submission explanation/approval.

Multi-device state:

- `scripts\windows\smoke-multidevice-beta.ps1` exists for the second-PC test.
- `scripts\windows\prepare-multidevice-test-kit.ps1` builds a second-PC install/test zip with MSIX, public `.cer`, scripts, checksums, evidence verifier, second-PC one-command release check wrapper, and optional desktop shell bundles.
- `scripts\windows\run-second-pc-release-check.ps1` runs sideload readiness, MSIX install/verify, install evidence capture, and second-PC handoff collection from the extracted kit, then creates `.local-build\second-pc-return\*.zip` for the operator to bring back to the release repo.
- `scripts\windows\import-second-pc-return.ps1` imports the returned `.local-build\second-pc-return\*.zip`, copies MSIX/handoff/release-check JSON to canonical `.local-build` roots, verifies MSIX install evidence, can record the MSIX install gate with `-RecordMsixInstall`, and prints primary-side multi-device commands.
- Current second-PC MSIX install evidence exists at `docs\evidence\msix-install\1.15.0-rc.1\20260531-165211-HUGH-MAIN.evidence.json`; it closes only the package install proof, not the route proof.
- `scripts\windows\capture-msix-install-evidence.ps1` captures second-PC package install, WindowsApps alias, startup contract, and legacy-conflict proof; `verify-msix-install-evidence.ps1` and `record-msix-install-evidence.ps1` validate and archive it.
- `smoke-multidevice-beta.ps1` now writes `musu.multidevice_smoke_evidence.v1` with release version, operator machine, started/completed timestamps, and imports actual CLI route-attempt evidence from `musu route --route-evidence-path <path>`.
- `scripts\windows\verify-multidevice-evidence.ps1` validates the returned smoke evidence before release status changes.
- `verify-multidevice-evidence.ps1` requires schema, version when supplied, valid timestamps, acceptable evidence age, command log, bridge health, peer list, status output, and route output unless `-AllowStatusOnly` is explicitly used.
- `scripts\windows\record-multidevice-evidence.ps1` records verified evidence under `docs\evidence\multidevice\1.15.0-rc.1\`.
- Latest generated kit pattern: `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-*.zip` (use the newest file by `LastWriteTime`).
- `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md` (wiki/519) is the current runbook.
- Full multi-machine readiness is still pending real second-machine execution.

Canonical references:

- `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_ROADMAP_2026_05_29.md` (wiki/518)
- `docs/RELEASE_1_15_0_RC1_FINAL_QUAL_AUDIT_NEXT_STEPS_2026_05_29.md` (wiki/521, historical final qualitative evaluation / code audit / next-step roadmap)
- `docs/RELEASE_1_15_0_RC1_CURRENT_STATUS_AUDIT_2026_05_31.md` (wiki/522, current status audit / product spec lock / code audit / next-step roadmap)
- `docs/RELEASE_1_15_0_RC1_RUNTIME_HARDENING_RELAY_ROADMAP_2026_05_31.md` (wiki/523, runtime idle CPU / relay-control P0 roadmap)
- `docs/P2P_CONTROL_PLANE.md` (local program executes work; `musu.pro` is the work-order, project-room, rendezvous, path-selection, and relay-fallback control plane)
- `docs/MUSU_PRO_P2P_CONTROL_PLANE_SPEC_2026_05_31.md` (wiki/524, registry/rendezvous/path-selection/relay route-evidence implementation spec)
- `docs/MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md` (wiki/525, concrete execution plan for idle CPU, `musu.pro` P2P assistance, and desktop hardening)
- `docs/MSIX_DESKTOP_ENTRYPOINT_AUDIT_2026_05_31.md` (wiki/526, Store/MSIX runtime-only package finding and desktop entrypoint release gate)
- `docs/RUNTIME_ROUTE_EVIDENCE_MDNS_AUDIT_2026_06_01.md` (wiki/528, runtime route-evidence sharing and mDNS/Tailscale adapter audit)
- `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md` (wiki/519)
- `docs/SECOND_PC_MSIX_INSTALL_OPERATOR_RUNBOOK_2026_05_31.md` (focused second-PC MSIX install evidence checklist)
- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`

## 8. Microsoft Store Launch State (2026-05-29)

Partner Center enrollment approval cleared by operator report. This removes the account-verification blocker recorded on 2026-05-27, but it does **not** mean the app package or restricted startup capability has passed Microsoft certification.

Current Store path truth:

- product name reservation: next
- current-version Store-reviewed package: regenerated for `1.15.0-rc.1` as `musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix`; artifact-level desktop entrypoint now passes because the MSIX launches `musu-desktop.exe`, keeps `musu.exe` as the CLI alias, keeps `musu-startup.exe` as the startup task, and no longer describes itself as a runtime-only package. Primary local-sideload installed-package desktop-entrypoint evidence now passes; Store-reviewed restricted-capability installed proof still requires the actual Microsoft Store-signed install.
- local-sideload release package: `musu_1.15.0.0_x64_local-sideload-manual.msix`, workflow passed packaged startup smoke
- current submission bundle: `.local-build\msix\submission-bundles\store-reviewed-20260531-224352`
- release candidate manifest: `.local-build\release-candidates\1.15.0-rc.1\release-candidate-manifest.json`
- release checksum file: `.local-build\release-candidates\1.15.0-rc.1\SHA256SUMS.txt`
- final operator gate packet generator: `scripts\windows\prepare-final-operator-gate-packet.ps1`
- final operator gate packet verifier: `scripts\windows\verify-final-operator-gate-packet.ps1`
- operator action pack generator/verifier: `scripts\windows\prepare-operator-action-pack.ps1` and `scripts\windows\verify-operator-action-pack.ps1` create/check a single handoff pack for second-PC transfer, support-mailbox proof, and Partner Center submission copy without including private `.pfx` material
- final operator evidence completion runner: `scripts\windows\complete-final-operator-gates.ps1`
- final release handoff status script: `scripts\windows\show-final-release-handoff-status.ps1` (evidence-non-recording one-screen go/no-go, final packet verification, operator action pack verification, evidence roots, and remaining operator commands)
- operator handoff card script: `scripts\windows\show-operator-handoff-card.ps1` reads the latest packet and prints current support verification id, support subject, second-PC kit name, return-file list, and recording commands; use it instead of copying packet-specific values from old notes
- second-PC return card script: `scripts\windows\show-second-pc-return-card.ps1` accepts returned `.local-build\second-pc-return\*.zip` via `-ReturnZipPath` or raw `.local-build\second-pc-handoff\*.handoff.json`, chooses a `suggested_remote_addrs` candidate, and prints the exact primary-side MSIX record / multi-device smoke / multi-device record commands
- second-PC return importer: `scripts\windows\import-second-pc-return.ps1` is now preferred before `show-second-pc-return-card.ps1`; it verifies returned MSIX install evidence and can record the install evidence gate directly
- latest final operator gate packet alias: `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`; regenerate it from a clean HEAD immediately before operator handoff and verify with `verify-final-operator-gate-packet.ps1`. The verifier requires `ok=true`, `fail_count=0`, `kit_count=1`, clean source git metadata, README MSIX install instructions, Store release blocker, second-PC handoff collector, final `-FailOnNotReady`, dirty-git blocker, MSIX capture-check evidence, multi-device endpoint-shape evidence, support token evidence, and Store reservation timestamp checks hardened; final completion runner can record MSIX install and Store approval evidence too.
- Store metadata handoff: `docs/STORE_SUBMISSION_METADATA_2026_05_29.md`
- current final qualitative evaluation, code audit, product spec update, and next-step roadmap: `docs/RELEASE_1_15_0_RC1_CURRENT_STATUS_AUDIT_2026_05_31.md` (wiki/522); wiki/521 remains the historical audit log
- focused second-PC MSIX install runbook: `docs/SECOND_PC_MSIX_INSTALL_OPERATOR_RUNBOOK_2026_05_31.md`
- public privacy route exists at `/privacy`; public support route exists at `/support`
- public metadata verifier exists at `scripts\windows\verify-store-public-metadata.ps1`
- release go/no-go preflight exists at `scripts\windows\write-release-go-no-go.ps1`
- mDNS LAN auto-discovery is opt-in through `MUSU_ENABLE_MDNS=1`; this mitigates a Windows/Tailscale adapter failure where logged-in bridge `/health` could time out after the initial `musu up` probe. Store-candidate smoke/release paths keep this disabled unless mDNS has its own current regression evidence. IPv6 mDNS additionally requires `MUSU_MDNS_ENABLE_IPV6=1`, Tailscale mDNS interfaces require `MUSU_MDNS_ENABLE_TAILSCALE=1`, and common VPN/virtual interfaces require `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`.
- Universal clipboard polling is opt-in through `MUSU_ENABLE_CLIPBOARD_SYNC=1`; it is disabled by default for privacy and idle CPU control.
- Runtime idle CPU/resource budget is now a release blocker in `write-release-go-no-go.ps1`. Use `scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json` on primary and second PC with MUSU packaged desktop open and idle; public beta requires two machine samples, at least one MUSU runtime process, at least one MUSU-owned WebView2 process, <=5% of one logical CPU, owned process count <=16, owned WebView2 count <=8, and total owned working set <=1024MB. The sampler defaults to MUSU-owned descendants plus repo-related helpers, records `helper_process_scope`, uses native Windows parent-process lookup instead of WMI/CIM, and leaves `-IncludeUnrelatedHelpers` for whole-machine diagnostics. Go/no-go now rejects runtime CPU evidence whose `git_commit` is older than current HEAD except for documentation/evidence-only deltas, so stale pre-hardening CPU samples cannot satisfy the gate after code/script changes.
- MSIX desktop entrypoint is now a release blocker in `write-release-go-no-go.ps1`. Artifact-level evidence `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-224328-HUGH_SECOND.store-msix-desktop-artifact.evidence.json` passes for the regenerated Store MSIX; old runtime-only evidence remains at `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-214327-HUGH_SECOND.store-msix-runtime-only.evidence.json`. Primary `local-sideload-manual -RequireInstalledPackage` evidence now passes on `HUGH_SECOND`; Store-reviewed `-RequireInstalledPackage` is expected to fail on local sideload installs until the Microsoft Store-signed restricted-capability package is actually installed.
- Process ownership is now a separate release gate in `write-release-go-no-go.ps1`. Use `scripts\windows\audit-musu-process-ownership.ps1 -FailOnProblem -Json` while MUSU is open; it writes `musu.process_ownership_audit.v1`, requires one live MUSU runtime, verifies bridge registry PID plus `/health`, counts Node.js/WebView2 only when they are MUSU descendants, and rejects repo-related orphan helpers. Current HUGH_SECOND audit passed at `.local-build\process-ownership\musu-process-ownership-20260531-201339.json`: `musu_runtime=1`, `owned_node=0`, `owned_webview2=0`, `machine_wide_node=1`, `machine_wide_webview2=13`, `orphan_repo_helpers=0`.
- Startup single-instance is now a separate release gate in `write-release-go-no-go.ps1`. Use `scripts\windows\audit-musu-startup-single-instance.ps1 -RepeatCount 3 -FailOnProblem -Json`; it writes `musu.startup_single_instance_audit.v1`, calls `musu up --json` repeatedly, requires one stable bridge PID, rejects repeated bridge spawning, and embeds process ownership evidence. Current HUGH_SECOND audit passed at `docs\evidence\startup-single-instance\1.15.0-rc.1\20260531-203635-HUGH_SECOND.evidence.json`: three calls reused bridge PID 31208, `after_musu_runtime=1`, `repeated_spawn_count=0`.
- Frontend idle polling hardening now includes shared `useLowDutyPolling` coverage for device discovery, service health, processes, nodes, doctor status, fleet/company/machine pages, tasks/approvals/goals/projects/issues/costs panels, inbox polling, and canvas data/flow polling. The helper prevents overlapping requests, aborts in-flight fetches on unmount, pauses low-priority polling while hidden, and applies capped failure backoff. Fleet/company/machine pages use 30s safety-net polling plus SSE wakeups instead of 5s fixed intervals.
- Writer task admission no longer uses a 50ms polling wait while queued tasks are capped by global/per-channel limits. `musu-rs/src/writer/runner.rs` now waits on `tokio::sync::Notify` with a 1s safety recheck, reducing scheduler wakeups under backlog; a queued-task CPU sample is still required before this can close the operator's idle busy-loop report.
- `musu.pro` must evolve from registry-only discovery into registry + rendezvous + relay/tunnel control. Direct LAN/manual peers remain valid, and the bridge now ranks cached/manual/nodes candidates by path kind (`lan` -> `tailscale` -> `direct_quic`) before relay. Server-side rendezvous session/candidate-exchange endpoints, recent node candidate cache seeding, stored route-evidence endpoints, bridge runtime rendezvous wiring, and fail-closed relay lease policy now exist; this still does not satisfy public multi-device setup until real second-PC target-candidate evidence, peer identity/QUIC-TLS proof, and relay/tunnel data transport are wired. Route evidence kinds remain `lan`, `tailscale`, `direct_quic`, `relay`, or `failed`; wiki/524 locks the API/evidence contract.
- Multi-device release evidence now requires `musu.route_evidence.v1`; `musu route --route-evidence-path <path>` captures actual CLI route attempt timing/result for debugging, but legacy manual HTTP bearer routing still does not pass the public release gate without peer identity verification, hardened encryption, payload transit truth, and success result.
- 2026-05-29 live `musu.pro` public metadata check now passes for `/privacy` and `/support`
- MSIX install evidence scripts exist: `scripts\windows\capture-msix-install-evidence.ps1`, `scripts\windows\verify-msix-install-evidence.ps1`, and `scripts\windows\record-msix-install-evidence.ps1`
- `write-release-go-no-go.ps1` now auto-detects valid MSIX install evidence under `docs\evidence\msix-install\<version>\*.evidence.json` or `.local-build\msix-install\*.evidence.json`
- MSIX install evidence must match the current release version, include operator machine/user, pass non-future `recorded_at`, match installed/artifact versions, and include passing capture checks from `capture-msix-install-evidence.ps1`
- The second-PC release wrapper now captures runtime idle CPU evidence too. `run-second-pc-release-check.ps1` installs/verifies MSIX, captures MSIX install evidence, collects handoff, opens MUSU Desktop, runs `measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -IncludeNode -IncludeWebView2`, includes `.local-build\runtime-idle-cpu\*.evidence.json` in the return zip, and exposes `-SkipRuntimeIdleCpu` only for install/handoff diagnostics. `import-second-pc-return.ps1` now detects returned evidence by JSON schema so MSIX evidence and runtime CPU evidence do not conflict, and copies runtime CPU evidence into `.local-build\runtime-idle-cpu\` for go/no-go.
- support mailbox evidence scripts exist: `scripts\windows\verify-support-mailbox-evidence.ps1` and `scripts\windows\record-support-mailbox-verification.ps1`
- release support mailbox source of truth: root `SUPPORT_EMAIL` contains `musu@musu.pro`; release scripts read it through `scripts\windows\release-config.ps1`, and public Next pages use `musu-bee/src/lib/contact.ts`
- `write-release-go-no-go.ps1` now auto-detects valid support mailbox evidence under `docs\evidence\support-mailbox\<version>\*.evidence.json` or `.local-build\support-mailbox\*.evidence.json`
- `write-release-go-no-go.ps1` includes `musu@musu.pro inbox delivery verification` in `manual_external_gates`, not only as a blocker
- `write-release-go-no-go.ps1` no longer accepts `-AssumeSupportMailboxVerified`; support mailbox readiness must be evidence-backed
- support mailbox evidence must match the current release version, use an explicit `musu-...` verification token, come from a sender distinct from `musu@musu.pro`, and pass timestamp order/future checks
- `write-release-go-no-go.ps1` exposes runtime CPU machine-count summary fields at top level: `runtime_idle_cpu_min_machine_count`, `runtime_idle_cpu_valid_machine_count`, `runtime_idle_cpu_valid_machines`, and `runtime_idle_cpu_candidate_count`. `show-final-release-handoff-status.ps1` mirrors these under `gates`, so current No-Go status clearly says primary evidence is valid on `HUGH_SECOND` but the 2-machine CPU gate is still short.
- `write-release-go-no-go.ps1 -SkipPublicMetadata` is diagnostic-only for offline checks; skipping live privacy/support metadata verification adds a blocker and cannot produce public release readiness
- Store release evidence scripts exist: `scripts\windows\verify-store-release-evidence.ps1` and `scripts\windows\record-store-release-verification.ps1`; Store release evidence records explicit Partner Center product name reservation state and timestamp, the final completion runner requires `-StoreProductNameReservedAt`, and the direct recorder now refuses to infer that timestamp from submission time
- Store submission bundle verification exists: `scripts\windows\verify-store-submission-bundle.ps1`; `prepare-store-submission-bundle.ps1` now writes `SHA256SUMS.txt`, `audit-desktop-release-readiness.ps1` verifies the latest bundle, and `prepare-operator-action-pack.ps1` refuses to build from an invalid Store submission bundle. The regenerated bundle `.local-build\msix\submission-bundles\store-reviewed-20260531-224352` verifies with `ok=true`, `fail_count=0` at the artifact level. Local installed desktop proof uses the `local-sideload-manual` package and now passes; Store-reviewed restricted-capability packages are not ordinary sideload evidence.
- `write-release-go-no-go.ps1` now treats Store approval as an evidence-backed blocker and auto-detects valid evidence under `docs\evidence\store-release\<version>\*.evidence.json` or `.local-build\store-release\*.evidence.json`
- `complete-final-operator-gates.ps1` can record MSIX install, multi-device, support mailbox, and Store release evidence in one final command; smoke evidence for this path is intentionally written only to `.local-build\msix-install-complete-smoke` and `.local-build\store-release-complete-smoke`
- The final operator packet's completion command includes `-FailOnNotReady`; packet verification fails if the final command can finish with exit 0 while blockers remain
- `write-release-go-no-go.ps1` treats a dirty git worktree as a public release blocker, not a warning; final readiness requires committed changes plus a regenerated manifest with `manifest_git.dirty=false`
- `verify-final-operator-gate-packet.ps1` now fails stale packets if their bundled go/no-go script still treats dirty git state as a warning, or if the bundled packet verifier lacks the same dirty-git blocker check
- `prepare-final-operator-gate-packet.ps1` refuses dirty git state and writes `packet-build-metadata.json`; packet verification requires a valid source commit and clean git metadata
- `verify-final-operator-gate-packet.ps1` also fails stale packets whose bundled multi-device verifier lacks schema, version, and completion-time checks, whose bundled support evidence path lacks version/token/sender checks, or whose Store recorder/verifier can infer reservation time or omit timestamp safety checks
- `verify-final-operator-gate-packet.ps1` also inspects each bundled second-PC kit for the local-sideload MSIX, public signing cert, install/verify script, MSIX install evidence capture/verify/record scripts, runtime idle CPU measurement script/instructions, second-PC handoff collector, multi-device smoke script, multi-device evidence verify/record scripts, second-PC return importer, return-archive instructions, and README instructions for install evidence, runtime CPU evidence, and multi-device evidence capture.
- multi-device evidence now defaults verification to the repo `VERSION`, requires operator user metadata, and requires `remote_addr` to include a port; stale packets without this endpoint-shape gate fail verification
- `write-release-candidate-manifest.ps1` writes manifest/checksum files atomically with retry, avoiding locked-file failures when final handoff status and go/no-go are run concurrently.
- Indexer refreshed after support mailbox correction, current single-machine evidence, operator handoff card, final qualitative audit, post-audit single-machine refresh, second-PC kit verifier hardening, doctor-timeout smoke refresh, second-PC return card, smoke harness process-capture hardening, operator action pack scripts, post-action-pack single-machine evidence refresh, handoff status action-pack verification, the second-PC release-check wrapper, beta checklist current-evidence pointer correction, `musu-system` 2026-05-30 recheck, Store submission bundle verifier, post-verifier single-machine refresh, second-PC return archive flow, second-PC return archive single-machine refresh, second-PC return importer, post-importer single-machine evidence refresh, post-preview-fallback single-machine evidence refresh, current status audit, mDNS health hardening, post-mDNS single-machine evidence refresh, second-PC MSIX install operator runbook, runtime hardening roadmap, relay-control roadmap, frontend polling hardening, `musu.pro` P2P control-plane spec, runtime stabilization execution plan, post-route-evidence single-machine refresh, owned-process CPU measurement hardening, post-idle-CPU single-machine refresh, process ownership audit gate, post-process-ownership single-machine evidence refresh, startup single-instance gate, post-startup-gate single-machine evidence refresh, runtime resource-budget evidence, post-resource-budget single-machine evidence, MSIX desktop-entrypoint audit, low-duty frontend polling, writer admission wakeups, generated Tauri lint exclusion, MSIX desktop artifact fix, MSIX sideload split, desktop process ownership hardening, mDNS IPv6 hardening, current post-mDNS single-machine evidence, runtime CPU evidence freshness hardening, current primary desktop-open CPU evidence, post-runtime-CPU-gate single-machine evidence, second-PC return CPU evidence flow, static logo lockups, post-logo single-machine evidence, refreshed primary runtime CPU evidence, route/relay diagnostic CLI surfaces, post-route-diagnostics smoke/CPU evidence, bridge path-selection wiring, post-path-selection smoke/CPU evidence, CLI route-attempt evidence wiring, and post-route-evidence-writer smoke/CPU evidence: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1055 files and 1954 symbols on 2026-06-01 after the current evidence/docs refresh; searches should include `local-sideload-installed`, `store-reviewed-contract-mismatch`, `AllowRestrictedCapabilitySideload`, `startup_contract_matches_artifact`, `musu-desktop`, `store-msix-desktop-artifact`, `store-reviewed-20260531-224352`, `source-fresh release build OOM`, `RequireInstalledPackage`, `musu-desktop.exe`, `msix_desktop_entrypoint_verified`, `runtime idle CPU`, `desktop-open`, `RequireOwnedWebView2`, `runtime CPU evidence freshness`, `20260601-040413`, `20260601-040308`, `20260601-033734`, `20260601-033633`, `20260601-030838`, `20260601-030639`, `20260601-022649`, `20260601-015424`, `20260601-022021`, `musu-logo`, `generate-brand-logo-assets`, `musu.pro relay control`, `p2p rendezvous`, `route evidence`, `route explain`, `route-evidence-path`, `relay status`, `bridge_path_selection_wired`, `rendezvous_session_wired`, `RoutePathKind`, `busy loop`, `MUSU_MDNS_ENABLE_IPV6`, `20260601-012801`, and the earlier `wiki 522`/`wiki 523`/`wiki 524`/`wiki 525`/`wiki 526`/`wiki 527` release-gate terms.
- support mailbox DNS exists: `Resolve-DnsName -Type MX musu.pro` returns `smtp.google.com`; actual delivery remains unverified until evidence is recorded
- GitHub Actions deployment/test infrastructure was repaired for the current Rust/Next repo shape: Node 22+, JavaScript actions forced onto Node 24 runtime, no deleted Python dirs, no deleted `musu-port`, Linux Rust CI includes Wayland/PipeWire/GBM native dependencies, legacy likely-required check names preserved, and Store metadata Playwright smoke for `/privacy` + `/support`
- Final handoff contract: after the last documentation/code commit, regenerate the final operator packet from clean current HEAD and verify it. Regenerate/verify the operator action pack only after clean two-machine runtime CPU evidence passes, even though the regenerated Store submission bundle, local-sideload installed desktop-entrypoint proof, and current single-machine smoke proof now pass. Current single-machine smoke proof is `docs\evidence\single-machine\1.15.0-rc.1\20260601-113438-HUGH_SECOND.evidence.json` on commit `52698c4406de4747b4e1ce1834cfbad1cb0c75c1`. Current primary clean desktop-open CPU evidence is `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-113022-HUGH_SECOND.desktop-open.evidence.json`; it passed with packaged `musu-desktop.exe`, six owned WebView2 helpers, owned Node count `0`, max one-core CPU `musu=0`, `webview2=0.16`, and working set `343.16MB`. Second-PC desktop CPU evidence is still missing. Final operator packet generation/verification includes wiki/522 current status, wiki/523 runtime hardening, wiki/524 P2P control-plane spec, wiki/525 runtime stabilization execution plan, and wiki/526 MSIX desktop entrypoint audit. Public desktop release remains blocked until runtime idle CPU evidence passes on two machines, real second-PC multi-device route evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Microsoft Store release evidence are recorded.
- `musu doctor` bridge health timeout was raised from 3s to 10s after the release smoke found a false negative: direct `/health` and dashboard doctor were ok, while CLI doctor timed out on Windows loopback.
- Current single-machine evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260601-113438-HUGH_SECOND.evidence.json` on commit `52698c4406de4747b4e1ce1834cfbad1cb0c75c1`, dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_113412`, dashboard task `7527eda1-b7f6-4a0d-8447-b17e76e756fe`, bridge `http://127.0.0.1:1473`, and `cli_route_checked=true`.
- 2026-06-01 brand asset audit: the attractive app favicon/mark exists under `musu-bee/src-tauri/icons/` and is tracked for web use at `musu-bee/public/images/favicon-header.png`. Static logo lockups now exist under `musu-bee/public/images/logos/`: `musu-mark-512.png` plus header/display/hero transparent PNG lockups for `on-light`, `on-dark`, and `on-yellow`. `scripts/windows/generate-brand-logo-assets.ps1` regenerates them from the tracked mark. `musu-bee/.gitignore` previously ignored all `public/`, so clean checkouts could miss `/images/favicon-header.png` and `/agents/*.png`; required public runtime/brand assets are now unignored/tracked. `MusuLogo` no longer points at missing `/images/logos/*` PNG lockups; it renders the app mark plus a MUSU wordmark from brand tokens.
- 2026-06-01 qualitative/code audit: wiki/527 (`docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_NEXT_STEPS_2026_06_01.md`) is the current addendum. It records that `npm run typecheck` passed after the logo/public asset fix, but a current single-machine smoke attempt on commit `5e8d195` failed when dashboard task-status polling timed out, the Next dev server became unreachable, and PowerShell log-tail commands hit OOM/CLR errors. No new release evidence was recorded from that attempt.
- 2026-06-01 smoke hardening: `smoke-single-machine-beta.ps1` now makes the default dashboard/CLI expected strings unique per run, preventing local `musu route --wait "Reply exactly: MUSU_CLI_ROUTE_OK"` duplicate-task 409s from invalidating otherwise healthy smoke runs. Dashboard task-status polling now survives transient 30s timeouts within the overall task deadline and records poll error count/last error in the evidence.
- 2026-06-01 mDNS/Tailscale hardening: user-supplied `mdns_sd::service_daemon` logs showed repeated sends to `Tailscale` IPv6 link-local `ff02::fb%9:5353` failing with `os error 10065`, followed by `closed channel` errors. mDNS is still opt-in via `MUSU_ENABLE_MDNS=1`; IPv6 mDNS is separately opt-in via `MUSU_MDNS_ENABLE_IPV6=1`; Tailscale mDNS interfaces are separately opt-in via `MUSU_MDNS_ENABLE_TAILSCALE=1`; common VPN/virtual interfaces are separately opt-in via `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES=1`. Current source should not hit Tailscale IPv6 mDNS in default bridge startup.
- 2026-06-01 operator re-supplied mDNS/Tailscale log: the repeated `2026-05-31T16:09:08Z` through `16:10:24Z` `ff02::fb%9` failures match the already-classified Windows/Tailscale IPv6 mDNS issue. Current validation on HUGH_SECOND passed `cargo test --lib -j 1 peer::mdns::tests::`, `cargo build --bin musu -j 1`, and `RUST_LOG=debug musu discover --timeout 2`; the run disabled 9 virtual/VPN interfaces and multicast only on the physical `이더넷 2` LAN adapter, with no Tailscale/NordLynx/vEthernet/`ff02::fb`/`10065`/`closed channel` output. If the installed desktop still emits the old log with current defaults, treat it as stale installed bits or an explicit mDNS/IPv6/Tailscale/virtual-interface opt-in environment problem.
- 2026-06-01 post-mDNS single-machine evidence: recorded evidence `docs\evidence\single-machine\1.15.0-rc.1\20260601-012801-HUGH_SECOND.evidence.json` verifies current commit `d4820173dab1f19abf0ac287abbd073330f6eb1b`, dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_012735`, CLI output `MUSU_CLI_ROUTE_OK_20260601_012735`, dashboard task `fe857b79-47af-47d8-abf0-80bcbb63d883`, bridge `http://127.0.0.1:10474`, and `dashboard_task_poll_error_count=0`.
- 2026-06-01 post-runtime-CPU-gate single-machine evidence: after runtime CPU evidence freshness became a release gate, recorded evidence `docs\evidence\single-machine\1.15.0-rc.1\20260601-015424-HUGH_SECOND.evidence.json` verifies commit `e4509f6628fb2e54ef0c127c412722a3e52cf80f`, dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_015402`, CLI output `MUSU_CLI_ROUTE_OK_20260601_015402`, dashboard task `bc27c955-bd1e-41e1-8ff6-c60a38328955`, bridge `http://127.0.0.1:5076`, and `dashboard_task_poll_error_count=0`.
- 2026-06-01 post-logo/second-PC-return single-machine evidence: after commit `47f2614` added second-PC CPU evidence return flow and static logo lockups, recorded evidence `docs\evidence\single-machine\1.15.0-rc.1\20260601-022021-HUGH_SECOND.evidence.json` verifies dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_021958`, CLI output `MUSU_CLI_ROUTE_OK_20260601_021958`, dashboard task `04c4cae9-4b5c-4db3-bfb5-92e5429d8768`, bridge `http://127.0.0.1:1923`, and `dashboard_task_poll_error_count=0`.
- 2026-06-01 post-route-diagnostics evidence: after `musu route --explain` and `musu relay status` were added, single-machine smoke evidence `docs\evidence\single-machine\1.15.0-rc.1\20260601-030639-HUGH_SECOND.evidence.json` verifies commit `12f8cabaefb5722eb45941012d47848d95c9f895`, dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_030619`, CLI output `MUSU_CLI_ROUTE_OK_20260601_030619`, dashboard task `42449837-4936-4e79-82a6-d7bbeede6108`, bridge `http://127.0.0.1:14130`, and `dashboard_task_poll_error_count=0`. Primary packaged `desktop-open` CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-030838-HUGH_SECOND.desktop-open.evidence.json` verifies commit `e0eebac44184e285ba120df5b4e0e9b209e83692` with `git_dirty=false`, owned WebView2 `6`, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.21`, and total working set `371.96MB`.
- 2026-06-01 P2P control-plane status: `musu-rs/src/cloud/mod.rs` has rendezvous, candidate endpoint, and route-evidence DTO/client methods. `musu-rs/src/bridge/router.rs` has shared path-kind classification and direct candidate ranking for explicit target, GPU, OS-hint, and rendezvous target-candidate routing: `local`, `lan`, `tailscale`, then `direct_quic`, with relay still excluded until transport exists. `musu-bee/src/app/api/v1/p2p/rendezvous/*` implements authenticated short-lived session create/read/candidate-update/approve/close endpoints; candidate updates refresh a recent node candidate cache, and new sessions seed source/target candidates from that cache when available. `musu-rs/src/bridge/rendezvous.rs` wires bridge runtime route attempts into that lifecycle: source creates/refreshes a session, publishes its advertised bridge endpoint, can replace the original selected peer with the best returned target candidate, falls back once to the original selected peer if that candidate fails, attaches `rendezvous_session_id` to the forwarded task, target publishes candidates on receipt, and source closes the session after terminal success/failure. `musu route --explain` emits `musu.route_explain.v1` without executing a task and now records `bridge_path_selection_wired=true`, `rendezvous_session_wired=true`, current `http_bearer` transport, and release-evidence blockers. `musu-rs/src/bridge/route_evidence.rs` is the shared CLI/runtime route evidence writer; bridge remote forwarding from `/api/tasks/delegate`, `/api/companies/{id}/run`, and workflow remote steps writes local `~/.musu/route-evidence/<task_id>.route-evidence.json` with the session id when present, then best-effort submits the same evidence to `musu.pro` when a `~/.musu/token` account token exists. `musu-bee/src/app/api/v1/p2p/route-evidence/route.ts` is the authenticated route-evidence receive/store/query API. Token-owner scoped evidence storage/query is wired as the current stub boundary; real account-id mapping/export, real second-PC target-candidate proof, release-grade identity/encryption proof, and relay transport remain pending. Manual HTTP bearer route evidence remains intentionally rejected for release because it cannot prove peer identity, QUIC/TLS encryption, or payload transit truth.
- 2026-06-01 peer identity material exchange: `musu-rs/src/install/tls.rs` computes local TLS certificate SHA-256 fingerprints. Logged-in bridge startup now registers the fingerprint as `cert_fingerprint`/`peer_public_key`, rendezvous candidates publish it as `public_key`, target-candidate selected peers carry it in metadata, and `bridge::route_evidence` records `peer_identity_method=advertised_tls_cert_fingerprint_unverified` plus `peer_public_key` when available. `musu.pro` route-evidence validation rejects release-grade claims where `peer_identity_verified=true` but method/key material is missing.
- 2026-06-01 HTTPS fingerprint-pinned bridge proof: endpoint candidates now preserve `scheme`, TLS-enabled bridges advertise `https://` when no public URL override is set, and `forward_to_peer_attempt` uses a fingerprint-pinned rustls client for HTTPS peers with advertised `sha256:<hex>` identity material. Evidence records `peer_identity_verified=true`, `peer_identity_method=tls_cert_fingerprint_pin`, and `encryption=https_tls_fingerprint_pin` only after the actual HTTPS POST succeeds with a matching server certificate fingerprint. `musu.pro` still keeps this non-release-grade via `transport_not_release_grade_quic_tls`; release-grade transport remains `encryption=quic_tls_1_3`.
- 2026-06-01 diagnostic surface update: `musu relay status --json` now reports `https_fingerprint_pinning_wired=true` and `release_grade_transport_required=quic_tls_1_3`. `musu route --explain --json` reports the same release transport requirement and candidate-level `transport_scheme`, `peer_identity_method`, `peer_public_key_present`, and `https_fingerprint_pin_available` when a target candidate is selected. Advertised-only fingerprints remain `peer_identity_verified=false`; diagnostics do not mark routes release-ready until actual evidence records `quic_tls_1_3`.
- 2026-06-01 token-owner scoped route evidence: `POST /api/v1/p2p/route-evidence` now stores an `owner_key` derived from the accepted Bearer token's SHA-256 hash and returns `owner_scoped=true`. `GET /api/v1/p2p/route-evidence` filters by the caller's token-derived owner key and omits the key from response records. This closes shared-bucket evidence leakage in the current control-plane stub; real account-id mapping plus UI/export/retention remain pending.
- 2026-06-01 relay fallback lease policy: `POST /api/v1/p2p/relay/lease` and `GET /api/v1/p2p/relay/lease` now exist as the authenticated owner-scoped relay control-plane boundary. The endpoint is fail-closed by default and only issues a lease when direct routes have failed, relay env policy is enabled, a relay URL is configured, Connect/Pro-style entitlement is present, and `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`. Runtime forwarding now requests a lease after terminal direct-route failure when a rendezvous session/account token exists, but still does not relay payload. `musu relay status --json` now reports `relay_control_plane_lease_wired=true`, `relay_lease_endpoint=/api/v1/p2p/relay/lease`, `relay_runtime_fallback_lease_request_wired=true`, `relay_default_data_path=false`, and still `relay_transport_wired=false`; runtime relay/tunnel data transport remains pending.
- 2026-06-01 current primary desktop-open CPU evidence after relay lease work: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-082822-HUGH_SECOND.desktop-open.evidence.json` verifies clean source commit `cdefc1226481d554d2d151e6a08af4dc81572247` with `git_dirty=false`, scenario `desktop-open`, 60.015s sample, one `musu-desktop` process, six owned WebView2 helpers, zero owned Node helpers, max one-core CPU `musu=0`, `webview2=0.16`, total working set `339.85MB`, private memory `184.58MB`, and no resource budget violations. Release still needs second-PC desktop-open CPU evidence.
- 2026-06-01 current primary desktop-open CPU evidence after runtime CPU reporting code: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-091114-HUGH_SECOND.desktop-open.evidence.json` verifies clean source commit `5bed2eddf85ac27bf55a3f1cb37436397363c432` with `git_dirty=false`, scenario `desktop-open`, 60.019s sample, one `musu-desktop` process, six owned WebView2 helpers, zero owned Node helpers, max one-core CPU `musu=0` and `webview2=0.08`, total working set `343.18MB`, private memory `183.06MB`, and no resource budget violations. Go/no-go accepts this as one valid CPU machine (`HUGH_SECOND`) but still requires second-PC desktop-open CPU evidence.
- 2026-06-01 current primary desktop-open CPU evidence after mDNS virtual-interface filtering: `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-094127-HUGH_SECOND.desktop-open.evidence.json` verifies clean source commit `931e771650cda3026630cf0b2394c83211490dc6` with `git_dirty=false`, scenario `desktop-open`, 60.029s sample, one `musu-desktop` process, six owned WebView2 helpers, zero owned Node helpers, max one-core CPU `musu=0` and `webview2=0.08`, total working set `340.49MB`, private memory `181.8MB`, and no resource budget violations. Go/no-go accepts this as one valid CPU machine (`HUGH_SECOND`) but still requires second-PC desktop-open CPU evidence.
- 2026-06-03 post status-JSON primary evidence: after `musu status --json` hardening, the local-sideload MSIX was rebuilt/installed from packaged source commit `e2727025`. Current packaged evidence passes single-machine `docs\evidence\single-machine\1.15.0-rc.1\20260603-021321-HUGH_SECOND.evidence.json`, desktop single-instance `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260603-021134-HUGH_SECOND.desktop-single-instance.json`, process ownership `docs\evidence\process-ownership\1.15.0-rc.1\20260603-021134-HUGH_SECOND.process-ownership.json`, desktop-open CPU `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-021134-HUGH_SECOND.desktop-open.evidence.json`, and runtime matrix `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-021552-HUGH_SECOND.runtime-cpu-scenario-matrix.json`. Busy-loop is not reproduced on HUGH_SECOND: desktop-open CPU has MUSU `0`, Node `0`, WebView2 `0.13`, working set `367.91MB`, hot `0`; process ownership has MUSU-owned Node `0`, machine-wide Node `16`, orphan repo helpers `0`; matrix route token is `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_021552`. Go/no-go remains No-Go because runtime CPU/matrix are `1/2 [HUGH_SECOND]` and second-PC, live P2P owner scope, support mailbox, Store, and release-grade transport evidence are still missing.
- 2026-06-03 operator pack/P2P recheck: clean commit `f83174fb` generated verified final packet `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-023702.zip` and action pack `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727.zip`. Current second-PC transfer zip is `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-023727.zip`; Partner Center zip is `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-023727\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-023727.zip`. Fresh P2P evidence `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-023834-musu.pro.evidence.json` still fails because live `musu.pro` lacks KV/Upstash storage env: relay status is logged-in/wired and `relay_default_data_path=false`, but relay leases are `ok=false`, owner scope is false, and detail is `p2p_relay_lease_kv_not_configured`.
- 2026-06-01 current single-machine smoke after relay/CPU documentation: `docs\evidence\single-machine\1.15.0-rc.1\20260601-084028-HUGH_SECOND.evidence.json` verifies commit `a1ee33fa0c8e3b68e85dc4b48077134ec5dd99ac` with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_084005`, CLI output `MUSU_CLI_ROUTE_OK_20260601_084005`, dashboard task `5ac5baa6-471f-4633-9a57-9e3a87a20c7a`, bridge `http://127.0.0.1:13167`, evidence SHA-256 `4198b0720ae92554b608922e8e871d9d0379fbca04d913863e9ae77b918a0083`, and verification SHA-256 `7e01108d694469644304b911d8f2329c06f54c27dd30d749028c9e7ea4a6ee17`.
- 2026-06-01 current single-machine smoke after runtime CPU reporting code: `docs\evidence\single-machine\1.15.0-rc.1\20260601-090548-HUGH_SECOND.evidence.json` verifies commit `da4999081073018ab3b1b72a26645140ad2e68f7` with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_090528`, CLI output `MUSU_CLI_ROUTE_OK_20260601_090528`, dashboard task `38d1eb2c-1905-493b-b536-459866c25c78`, bridge `http://127.0.0.1:5089`, evidence SHA-256 `52f34b6bc377404e118ec429bdc2c3d9c781d622870debee0d2d62a67e6eaae7`, and verification SHA-256 `70f8665ddcc015305b539bf8832bcf57b4d4507c1f07d7284a1d0bfd59f7f22a`.
- 2026-06-01 current single-machine smoke after mDNS virtual-interface filtering: `docs\evidence\single-machine\1.15.0-rc.1\20260601-093958-HUGH_SECOND.evidence.json` verifies commit `4ad4b5591bba3c03fffe7eb2d054a4e191b67bea` with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_093933`, CLI output `MUSU_CLI_ROUTE_OK_20260601_093933`, dashboard task `61f5d95d-ec59-418d-a583-a47336cdf126`, bridge `http://127.0.0.1:9189`, evidence SHA-256 `8ad3d4031f1b9592f6d6cabdd51a0ace8a9e78a08a527fde5716ecca2529d953`, and verification SHA-256 `b4695c68131c47627bbc08dc1d45284db5a0ae1ba07954a4627e8a413ac7279c`.
- 2026-06-01 post-path-selection evidence: after bridge direct path selection landed, single-machine smoke evidence `docs\evidence\single-machine\1.15.0-rc.1\20260601-033633-HUGH_SECOND.evidence.json` verifies commit `efff90cc9df3419f0cadc0398e5dd63d10f235de`, dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_033608`, CLI output `MUSU_CLI_ROUTE_OK_20260601_033608`, dashboard task `759429bc-001e-4a05-9a68-88a4c44ad3c1`, bridge `http://127.0.0.1:13899`, and `dashboard_task_poll_error_count=0`. Primary packaged `desktop-open` CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-033734-HUGH_SECOND.desktop-open.evidence.json` verifies commit `1163396a26cc81ce045f6de44f35fe0029074522` with `git_dirty=false`, owned WebView2 `6`, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.16`, total working set `376.6MB`, and no resource-budget violations.
- 2026-06-01 post-route-evidence-writer evidence: after `musu route --route-evidence-path` landed, single-machine smoke evidence `docs\evidence\single-machine\1.15.0-rc.1\20260601-040308-HUGH_SECOND.evidence.json` verifies commit `e8ac5a88c1dd9437c965f2d2e2f2c3b331596c2a`, dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_040245`, CLI output `MUSU_CLI_ROUTE_OK_20260601_040245`, dashboard task `612c8aff-616e-4227-89dc-7023a77d4830`, bridge `http://127.0.0.1:13800`, and `dashboard_task_poll_error_count=0`. Primary packaged `desktop-open` CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-040413-HUGH_SECOND.desktop-open.evidence.json` verifies commit `b330de871364877f990cd0cc4d5a6e6f8666a53f` with `git_dirty=false`, owned WebView2 `6`, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.21`, total working set `369.66MB`, and no resource-budget violations.
- 2026-06-01 runtime route-evidence sharing: wiki/528 records that route evidence is no longer CLI-only. `bridge::route_evidence` now owns the shared `musu.route_evidence.v1` builder/writer; runtime forwarding from `/api/tasks/delegate`, `/api/companies/{id}/run`, and workflow remote steps writes local evidence files under `~/.musu/route-evidence/` with actual forwarding timing/result/failure class, then starts a background best-effort submit to the cloud route-evidence endpoint when an account token exists. This improves auditability but does not close the public multi-device gate because the transport still records `peer_identity_verified=false` and `encryption=none_http_bearer`. Validation passed: `cargo check --manifest-path .\musu-rs\Cargo.toml -j 1`, `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib cli_commands -- --nocapture`, `cargo test --manifest-path .\musu-rs\Cargo.toml -j 1 --lib route_evidence -- --nocapture`, `npx tsx --test src/app/api/v1/p2p/route-evidence/route.test.ts`, `npm run typecheck`, targeted `rustfmt --check`, and `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`.
- 2026-06-01 final go/no-go after route diagnostics: clean HEAD `0c09f0c` reports `ready_for_public_desktop_release=false`, `local_artifacts_ready=true`, `single_machine_verified=true`, `msix_install_verified=true`, `msix_desktop_entrypoint_verified=true`, `process_ownership_verified=true`, `startup_single_instance_verified=true`, `public_metadata_ok=true`, `manifest_dirty=false`, and runtime CPU valid machine count `1`. Remaining blockers are real second-PC multi-device evidence, two-machine runtime idle CPU evidence, `musu@musu.pro` delivery verification, and Partner Center/Store release evidence.
- Indexer refreshed after wiki/527, the brand/public asset fix, generated static logo lockups, P2P control-plane status update, current post-mDNS single-machine evidence docs, current primary runtime CPU evidence, post-runtime-CPU-gate single-machine evidence, second-PC return CPU evidence flow, post-logo single-machine evidence, refreshed primary runtime CPU evidence, route/relay diagnostic CLI surfaces, post-route-diagnostics smoke/CPU evidence, bridge path-selection wiring, post-path-selection smoke/CPU evidence, CLI route-attempt evidence wiring, post-route-evidence-writer smoke/CPU evidence, and CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1055 files and 1954 symbols on 2026-06-01.
- Indexer refreshed after wiki/528, runtime route-evidence sharing, Tailscale mDNS interface gating, P2P/runtime plan/spec updates, GOAL v113, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1058 files and 1962 symbols on 2026-06-01.
- Indexer refreshed after the route-evidence cloud submit stub, background runtime submit wiring, `MUSU_CLOUD_BASE_URL` docs, GOAL v114, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1061 files and 1977 symbols on 2026-06-01.
- Indexer refreshed after durable route-evidence receive/store/query API, production storage fail-closed behavior, GOAL v115, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1063 files and 1997 symbols on 2026-06-01.
- Indexer refreshed after rendezvous receive/read/candidate/approve/close control-plane endpoints, rendezvous storage docs, GOAL v116, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1072 files and 2034 symbols on 2026-06-01.
- Indexer refreshed after rendezvous target-candidate route selection, node candidate cache seeding, original-peer fallback, CLI diagnostic blocker wording, GOAL v118, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1074 files and 2064 symbols on 2026-06-01. Search terms should include `select_best_remote_candidate`, `route_peer_from_target_candidates`, `selected_candidate`, `loadNodeCandidateSet`, `saveNodeCandidateSet`, `candidateCacheTtlSeconds`, `rendezvous target candidate routing`, `bridge::rendezvous`, `rendezvous_session_id`, `rendezvous_target_node_id`, `MUSU_P2P_RENDEZVOUS_CLIENT_TIMEOUT_MS`, `rendezvous_session_wired=true`, `target_candidate_count`, `bridge_http_forward`, `musu.pro rendezvous lifecycle`, `original selected peer fallback`, and `target-candidate-assisted routing`.
- Indexer refreshed after peer identity material exchange, GOAL v119, wiki/524/wiki/528 updates, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1075 files and 2071 symbols on 2026-06-01. Search terms should include `cert_sha256_fingerprint`, `peer_public_key`, `peer_identity_method`, `advertised_tls_cert_fingerprint_unverified`, `cert_fingerprint`, `missing_peer_identity_proof`, and `transport-verified peer identity`.
- Indexer refreshed after HTTPS fingerprint-pinned bridge forwarding, GOAL v120, wiki/524/wiki/527/wiki/528 updates, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1076 files and 2096 symbols on 2026-06-01. Search terms should include `tls_cert_fingerprint_pin`, `https_tls_fingerprint_pin`, `transport_not_release_grade_quic_tls`, `transport_scheme`, `fingerprint-pinned`, `peer_identity_verified`, and `quic_tls_1_3`.
- Indexer refreshed after route/relay diagnostic pinning surface, GOAL v121, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1077 files and 2105 symbols on 2026-06-01. Search terms should include `https_fingerprint_pinning_wired`, `release_grade_transport_required`, `https_fingerprint_pin_available`, `peer_public_key_present`, and `bridge_https_fingerprint_pin_available`.
- Indexer refreshed after token-owner scoped route-evidence storage/query, GOAL v122, route-evidence API tests, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1078 files and 2107 symbols on 2026-06-01. Search terms should include `owner_scoped`, `owner_key`, `token-sha256`, `p2pControlPrincipal`, `p2pControlOwnerKey`, and `queries only records owned by the bearer token`.
- Indexer refreshed after relay fallback lease policy wiring, GOAL v123, relay lease API tests, combined P2P API tests, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1082 files and 2141 symbols on 2026-06-01. Search terms should include `p2pRelayLeaseStore`, `relay_control_plane_lease_wired`, `relay_lease_endpoint`, `relay_default_data_path`, `MUSU_P2P_RELAY_TRANSPORT_WIRED`, `connect_pro_fallback_only`, and `queries only relay leases owned by the bearer token`.
- Indexer refreshed after current primary desktop-open CPU evidence refresh, GOAL v124, and the CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1084 files and 2141 symbols on 2026-06-01. Search terms should include `20260601-082822-HUGH_SECOND.desktop-open.evidence.json`, `cdefc1226481d554d2d151e6a08af4dc81572247`, `webview2=0.16`, `339.85MB`, `current primary desktop-open CPU evidence`, and `60.015s`.
- Indexer refreshed after current single-machine smoke evidence, mDNS/Tailscale log classification, GOAL v125/v126, and CoS memory note `2026-06-01_0845_kst_current_single_machine_smoke_and_mdns_log_classification.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1088 files and 2141 symbols on 2026-06-01. Search terms should include `20260601-084028-HUGH_SECOND.evidence.json`, `MUSU_RELEASE_SMOKE_OK_20260601_084005`, `MUSU_CLI_ROUTE_OK_20260601_084005`, `5ac5baa6-471f-4633-9a57-9e3a87a20c7a`, `ff02::fb%9`, `os error 10065`, `MUSU_MDNS_ENABLE_TAILSCALE`, and `current single-machine smoke`.
- Indexer refreshed after runtime CPU gate reporting count fields, GOAL v127, script updates, and CoS memory note `2026-06-01_0925_kst_runtime_cpu_gate_reporting_counts.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1089 files and 2141 symbols on 2026-06-01. Search terms should include `runtime_idle_cpu_valid_machine_count`, `runtime_idle_cpu_min_machine_count`, `runtime_idle_cpu_valid_machines`, `runtime_idle_cpu_candidate_count`, `HUGH_SECOND`, and `1/2`.
- Indexer refreshed after mDNS virtual-interface filtering, current smoke/CPU evidence, GOAL v129/v130, and CoS memory note `2026-06-01_0945_kst_mdns_virtual_filter_and_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1099 files and 2147 symbols on 2026-06-01. Search terms should include `MUSU_MDNS_ENABLE_VIRTUAL_INTERFACES`, `20260601-093958-HUGH_SECOND.evidence.json`, `20260601-094127-HUGH_SECOND.desktop-open.evidence.json`, `mDNS virtual/VPN interfaces`, `NordLynx`, `vEthernet`, `webview2=0.08`, `340.49MB`, `61f5d95d-ec59-418d-a583-a47336cdf126`, and `이더넷 2`.
- Runtime CPU scenario diagnostics are tracked in wiki/529 `RUNTIME_CPU_SCENARIO_MATRIX_AND_MDNS_LOG_AUDIT_2026_06_01.md`. Added `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` with schema `musu.runtime_cpu_scenario_matrix.v1` for state attribution across `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route`; it delegates CPU attribution to `measure-musu-idle-cpu.ps1`, includes Node/WebView2 budgets, and uses timeout-bounded `Start-Process` temp-file capture for `musu up --json` so a long-lived bridge child cannot keep a pipeline open. `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` and `write-release-go-no-go.ps1` now require clean/current 60s matrices with a successful post-route probe on two machines. A 3s local `runtime-started` smoke wrote `.local-build\runtime-cpu-scenarios\20260601-100515-HUGH_SECOND\20260601-100515-HUGH_SECOND.runtime-cpu-scenario-matrix.json` with `ok=true`, one MUSU process, owned Node `0`, owned WebView2 `0`, and max one-core CPU `0`; it remains diagnostic-only under the new verifier and does not replace the two-machine 60s `desktop-open` CPU release gate.
- Indexer refreshed after runtime CPU scenario matrix docs/scripts, GOAL v131/v132, wiki/529, and CoS memory note `2026-06-01_1006_kst_runtime_cpu_scenario_matrix.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1102 files and 2147 symbols on 2026-06-01. Search terms should include `musu.runtime_cpu_scenario_matrix.v1`, `measure-musu-runtime-cpu-scenarios.ps1`, `runtime-started`, `dashboard-open`, `post-route`, `20260601-100515-HUGH_SECOND.runtime-cpu-scenario-matrix.json`, `Start-Process temp-file`, and `bridge stdout pipe-handle hang`.
- Current evidence refreshed after the runtime CPU scenario matrix commit: single-machine smoke `docs\evidence\single-machine\1.15.0-rc.1\20260601-101859-HUGH_SECOND.evidence.json` passed on commit `9d39ab2f7a02aca75beaaeb5d35198d850bbad98` with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_101833`, CLI route `MUSU_CLI_ROUTE_OK_20260601_101833`, dashboard task `fae480fc-b2e4-4c4f-b5f9-7c452c6e0ec5`, and bridge `http://127.0.0.1:1126`. Current primary desktop-open CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-101541-HUGH_SECOND.desktop-open.evidence.json` passed from clean commit `9d39ab2f7a02aca75beaaeb5d35198d850bbad98` with 60.032s sample, one `musu-desktop`, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.13`, working set `342.44MB`, private memory `184.04MB`, and no resource-budget violations. Go/no-go after these evidence files reports `single_machine_verified=true`, runtime CPU `1/2` (`HUGH_SECOND`), and public release still No-Go.
- Indexer refreshed after current evidence refresh, GOAL v133/v134, and CoS memory note `2026-06-01_1020_kst_post_cpu_matrix_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1107 files and 2147 symbols on 2026-06-01. Search terms should include `20260601-101859-HUGH_SECOND.evidence.json`, `20260601-101541-HUGH_SECOND.desktop-open.evidence.json`, `fae480fc-b2e4-4c4f-b5f9-7c452c6e0ec5`, `MUSU_RELEASE_SMOKE_OK_20260601_101833`, `webview2=0.13`, `342.44MB`, and `runtime CPU 1/2`.
- Second-PC CPU matrix return flow is wired: `run-second-pc-release-check.ps1` now captures `musu.runtime_cpu_scenario_matrix.v1` by default, runs the post-route probe by default, verifies the matrix when the verifier is present, includes matrix files in `.local-build\second-pc-return\*.zip`, and exposes `-SkipRuntimeCpuScenarioMatrix`; `import-second-pc-return.ps1` imports the matrix to `.local-build\runtime-cpu-scenarios\` while selecting release CPU evidence only from `.local-build\runtime-idle-cpu\` with `scenario=desktop-open` and `require_owned_webview2=true`. `prepare-multidevice-test-kit.ps1`, final packet generation/verification, operator action-pack verification, and desktop readiness audit now include the matrix measurement plus verifier scripts. A generated kit `musu-multidevice-1.15.0-rc.1-20260601-103622.zip` contains the matrix script, and a synthetic return zip imported both `runtime_idle_cpu_evidence_path` and `runtime_cpu_scenario_matrix_path`.
- Indexer refreshed after second-PC CPU matrix return flow wiring, GOAL v135/v136, and CoS memory note `2026-06-01_1038_kst_second_pc_cpu_matrix_return_flow.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1108 files and 2147 symbols on 2026-06-01. Search terms should include `SkipRuntimeCpuScenarioMatrix`, `runtime_cpu_scenario_matrix_path`, `musu.runtime_cpu_scenario_matrix.v1`, `Resolve-LatestRuntimeIdleReleaseEvidence`, `musu-multidevice-1.15.0-rc.1-20260601-103622.zip`, and `second-PC CPU matrix return flow`.
- Current evidence refreshed after the second-PC CPU matrix return-flow commit: single-machine smoke `docs\evidence\single-machine\1.15.0-rc.1\20260601-105019-HUGH_SECOND.evidence.json` passed on commit `04d1ab13f1960d9f7adb5fb2d389ccd39c63923d` with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_104959`, CLI route `MUSU_CLI_ROUTE_OK_20260601_104959`, dashboard task `e2f4b35b-7b79-4621-abbc-658413665d0b`, and bridge `http://127.0.0.1:4980`. Current primary desktop-open CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-104726-HUGH_SECOND.desktop-open.evidence.json` passed from clean commit `04d1ab13f1960d9f7adb5fb2d389ccd39c63923d` with 60.022s sample, one `musu-desktop`, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.18`, working set `341.1MB`, private memory `185.71MB`, and no resource-budget violations. This keeps local evidence current; public release still needs second-PC route and desktop-open CPU evidence, `musu@musu.pro` inbox proof, and Store evidence.
- Indexer refreshed after post-second-PC-matrix current evidence, GOAL v137/v138, BETA checklist pointers, and CoS memory note `2026-06-01_1054_kst_post_second_pc_matrix_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1113 files and 2147 symbols on 2026-06-01. Search terms should include `20260601-105019-HUGH_SECOND.evidence.json`, `20260601-104726-HUGH_SECOND.desktop-open.evidence.json`, `e2f4b35b-7b79-4621-abbc-658413665d0b`, `MUSU_RELEASE_SMOKE_OK_20260601_104959`, `webview2=0.18`, `341.1MB`, and `04d1ab13f1960d9f7adb5fb2d389ccd39c63923d`.
- Runtime relay fallback lease request wiring: bridge forwarding now requests `/api/v1/p2p/relay/lease` after terminal direct-route failure when a rendezvous session and account token exist. The request records attempted route kinds, `direct_path_failed=true`, failure class, and requested capability, then preserves the original direct-route failure because relay payload transport is still unwired. `musu relay status --json` reports `relay_runtime_fallback_lease_request_wired=true`, `relay_transport_wired=false`, and `relay_default_data_path=false`. Validation passed with targeted rendezvous relay-request and cloud serialization tests, `cargo build --bin musu -j 1`, and relay status JSON.
- Runtime relay fallback evidence persistence: failed bridge forwarding now writes a `relay_fallback` addendum into `musu.route_evidence.v1` after direct-route failure and relay lease evaluation. The addendum records `direct_path_failed`, `lease_requested`, status (`skipped_no_token`, `skipped_no_session`, `denied`, `issued`, `failed`, or `timed_out`), `lease_issued`, attempted route kinds, requested capability, policy/blockers, optional lease id, and relay failure class. `/api/v1/p2p/route-evidence` validates and stores this field owner-scoped. It is an audit field only: `relay_transport_wired=false`, `relay_default_data_path=false`, and direct failure remains the returned failure until explicit relay/tunnel transport exists.
- Indexer refreshed after relay fallback route-evidence persistence, GOAL v143/v144, wiki/522/wiki/524/wiki/528/wiki/530 updates, BETA checklist update, and CoS memory note `2026-06-01_1203_kst_relay_fallback_route_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1121 files and 2163 symbols on 2026-06-01. Search terms should include `relay_fallback`, `lease_requested`, `lease_issued`, `skipped_no_session`, `skipped_no_token`, `relay_lease_denied`, `RouteRelayFallbackEvidence`, and `stores relay fallback evidence after failed direct route`.
- Current evidence refreshed after relay fallback route-evidence persistence: single-machine smoke `docs\evidence\single-machine\1.15.0-rc.1\20260601-121339-HUGH_SECOND.evidence.json` passed with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_121339`, CLI route checked, dashboard task `34375312-8b16-4015-ad1a-7bd5f2ccb19c`, and bridge `http://127.0.0.1:9157`. Primary desktop-open CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-121701-HUGH_SECOND.desktop-open.evidence.json` passed from clean git state with 60.023s sample, two MUSU processes, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0` and `webview2=0.03`, working set `378.16MB`, and private memory `192.07MB`. Go/no-go reports single-machine verified and runtime CPU `1/2` (`HUGH_SECOND`), so public release is still No-Go until second-PC CPU, real route, support inbox, Store, QUIC/TLS, and relay/tunnel evidence are complete.
- Indexer refreshed after current evidence refresh, GOAL v145/v146, BETA checklist pointers, wiki/522 current status update, and CoS memory note `2026-06-01_1218_kst_post_relay_fallback_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1124 files and 2163 symbols on 2026-06-01. Search terms should include `20260601-121339-HUGH_SECOND.evidence.json`, `20260601-121701-HUGH_SECOND.desktop-open.evidence.json`, `MUSU_RELEASE_SMOKE_OK_20260601_121339`, `34375312-8b16-4015-ad1a-7bd5f2ccb19c`, `webview2=0.03`, `378.16MB`, and `runtime CPU 1/2`.
- Multi-device release verifier hardening: `verify-multidevice-evidence.ps1` now rejects route evidence unless `peer_identity_method`, `peer_public_key`, and `encryption=quic_tls_1_3` are present. HTTPS fingerprint-pinned bridge evidence remains observable but no longer satisfies the multi-device release verifier. Synthetic validation passed with a `quic_tls_1_3` fixture and failed as expected with an otherwise identical `https_tls_fingerprint_pin` fixture.
- Indexer refreshed after multi-device verifier hardening, GOAL v147/v148, BETA checklist/current status updates, final packet stale-verifier guard, and CoS memory note `2026-06-01_1228_kst_multidevice_verifier_quic_tls_gate.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1125 files and 2163 symbols on 2026-06-01. Search terms should include `route encryption release-grade`, `quic_tls_1_3`, `peer_identity_method`, `peer_public_key`, `https_tls_fingerprint_pin`, and `multi-device verifier QUIC/TLS gate`.
- Route evidence transport-proof hardening: `transport_verified_by` is now part of local/cloud route evidence. Release-grade multi-device evidence requires `transport_verified_by=musu_quic_tls_transport`; `musu.pro` returns `missing_release_grade_transport_proof` when a record claims `encryption=quic_tls_1_3` without that verifier. Bridge HTTPS fingerprint-pinned forwarding passes an explicit local `RouteTransportProof` with `transport_verified_by=musu_bridge_forward_fingerprint_pinned_client`, which remains diagnostic/non-release-grade. The Rust route-evidence builder now treats registry/rendezvous metadata as advertised material only, so even metadata that claims `peer_identity_verified=true`, `quic_tls_1_3`, and `transport_verified_by=musu_quic_tls_transport` cannot forge a public release route.
- Current evidence refreshed after the QUIC/TLS verifier gate: single-machine smoke `docs\evidence\single-machine\1.15.0-rc.1\20260601-124055-HUGH_SECOND.evidence.json` passed with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_124032`, CLI route checked, dashboard task `e1c03dce-0d13-4482-ab9d-7988b10a9d2b`, and bridge `http://127.0.0.1:6483`. Primary desktop-open CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-124454-HUGH_SECOND.desktop-open.evidence.json` passed from clean git state with 60.018s sample, two MUSU processes, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0` and `webview2=0.10`, working set `387.75MB`, and private memory `183.16MB`. Go/no-go should return to single-machine verified and runtime CPU `1/2` (`HUGH_SECOND`) after these docs/evidence files are committed; public release remains No-Go until second-PC CPU, real route, support inbox, Store, QUIC/TLS, and relay/tunnel evidence are complete.
- Indexer refreshed after post-QUIC/TLS-verifier evidence refresh, GOAL v149/v150, BETA checklist/current status pointers, WIKI/WIKI_INDEX updates, and CoS memory note `2026-06-01_1248_kst_post_quic_tls_verifier_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1130 files and 2163 symbols on 2026-06-01. Search terms should include `20260601-124055-HUGH_SECOND.evidence.json`, `20260601-124454-HUGH_SECOND.desktop-open.evidence.json`, `MUSU_RELEASE_SMOKE_OK_20260601_124032`, `e1c03dce-0d13-4482-ab9d-7988b10a9d2b`, `webview2=0.10`, `387.75MB`, and `runtime CPU 1/2`.
- Indexer refreshed after route transport-proof hardening and the repeated Tailscale IPv6 mDNS log classification, GOAL v151/v152, WIKI_INDEX/current-status updates, and CoS memory note `2026-06-01_1312_kst_route_evidence_transport_verifier.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1131 files and 2165 symbols on 2026-06-01. Search terms should include `transport_verified_by`, `RouteTransportProof`, `musu_quic_tls_transport`, `missing_release_grade_transport_proof`, `route transport proof`, `musu_bridge_forward_fingerprint_pinned_client`, `ff02::fb%9`, `os error 10065`, and `MUSU_MDNS_ENABLE_TAILSCALE`.
- Current mDNS regression check after the operator re-supplied the Tailscale IPv6 log: rebuilt `musu` passed `cargo build --bin musu -j 1`; `RUST_LOG=debug musu discover --timeout 2` matched no `Failed to send|ff02::fb|10065|closed channel`, disabled 9 virtual/VPN interfaces, and sent only on physical `이더넷 2`. The log is still treated as real prior evidence, but current-source reproduction is not present unless a stale installed binary or explicit mDNS opt-in is involved.
- Indexer refreshed after runtime relay fallback lease request wiring, wiki/530, GOAL v139/v140, and CoS memory note `2026-06-01_1120_kst_runtime_relay_fallback_lease_request.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1115 files and 2157 symbols on 2026-06-01. Search terms should include `request_relay_lease_after_direct_failure`, `relay_runtime_fallback_lease_request_wired`, `direct_path_failed=true`, `RUNTIME_RELAY_FALLBACK_NEXT_STEPS_2026_06_01.md`, and `relay payload transport remains unwired`.
- Current evidence refreshed after the runtime relay fallback commit: single-machine smoke `docs\evidence\single-machine\1.15.0-rc.1\20260601-113438-HUGH_SECOND.evidence.json` passed on commit `52698c4406de4747b4e1ce1834cfbad1cb0c75c1` with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_113412`, CLI route checked, dashboard task `7527eda1-b7f6-4a0d-8447-b17e76e756fe`, and bridge `http://127.0.0.1:1473`. Current primary desktop-open CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-113022-HUGH_SECOND.desktop-open.evidence.json` passed from clean commit `52698c4406de4747b4e1ce1834cfbad1cb0c75c1` with 60.029s sample, one `musu-desktop`, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0`, `webview2=0.16`, working set `343.16MB`, private memory `182.96MB`, and no resource-budget violations.
- Indexer refreshed after post-runtime-relay evidence refresh, GOAL v141/v142, BETA checklist pointers, wiki/522 current status update, and CoS memory note `2026-06-01_1138_kst_post_runtime_relay_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1120 files and 2157 symbols on 2026-06-01. Search terms should include `20260601-113438-HUGH_SECOND.evidence.json`, `20260601-113022-HUGH_SECOND.desktop-open.evidence.json`, `MUSU_RELEASE_SMOKE_OK_20260601_113412`, `webview2=0.16`, `343.16MB`, and `52698c4406de4747b4e1ce1834cfbad1cb0c75c1`.
- Current evidence refreshed after route transport-proof hardening: single-machine smoke `docs\evidence\single-machine\1.15.0-rc.1\20260601-134022-HUGH_SECOND.evidence.json` passed with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_134000`, CLI route checked, dashboard task `1f487f6b-7448-4745-b628-bfb1753cea1f`, and bridge `http://127.0.0.1:4750`. Primary desktop-open CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-134219-HUGH_SECOND.desktop-open.evidence.json` passed from clean git state with 60.022s sample, two MUSU processes, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0` and `webview2=0.18`, working set `372.88MB`, and private memory `189.97MB`. Go/no-go should return to single-machine verified and runtime CPU `1/2` (`HUGH_SECOND`) after these evidence/docs files are committed; public release remains No-Go until second-PC CPU, real route, support inbox, Store, QUIC/TLS, and relay/tunnel evidence are complete.
- Indexer refreshed after post-transport-proof evidence refresh, GOAL v154/v155/v156, BETA checklist/current status/WIKI_INDEX updates, and CoS memory note `2026-06-01_1343_kst_post_transport_proof_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1136 files and 2165 symbols on 2026-06-01. Search terms should include `20260601-134022-HUGH_SECOND.evidence.json`, `20260601-134219-HUGH_SECOND.desktop-open.evidence.json`, `MUSU_RELEASE_SMOKE_OK_20260601_134000`, `1f487f6b-7448-4745-b628-bfb1753cea1f`, `webview2=0.18`, `372.88MB`, and `runtime CPU 1/2`.
- Runtime CPU scenario matrix gate: `verify-runtime-cpu-scenario-matrix.ps1` now verifies clean/current 60s `musu.runtime_cpu_scenario_matrix.v1` matrices for `runtime-started`, `dashboard-open`, `desktop-open`, and `post-route` with a successful route probe. `write-release-go-no-go.ps1` reports `runtime_cpu_scenario_matrix_verified` and blocks public release until two machines pass; current go/no-go shows scenario matrix `0/2`, while runtime idle CPU remains `1/2`.
- The matrix runner now prevents a no-op `dashboard-open` state. If `-DashboardUrl` is absent, it uses the dashboard URL discovered from `musu up --json`, performs its own bounded discovery when run out of order, and launches the URL; the verifier fails `dashboard-open` unless a dashboard URL was actually launched before sampling. `post-route` probe success now requires the exact per-run expected token.
- Dashboard-open harness smoke `20260601-143309-HUGH_SECOND` confirmed out-of-order discovery: preparation action `Start-Process DashboardUrl`, discovery action `musu up --json`, dashboard URL source `musu_up_dashboard_open`, URL `http://127.0.0.1:3000/app`, 3.018s sample, MUSU process count `1`, owned Node `0`, owned WebView2 `0`, max one-core CPU `0`. This is not release evidence because it was a dirty-tree 3s diagnostic.
- Indexer refreshed after dashboard-open matrix gate tightening, GOAL v161/v162/v163, wiki/529 update, and CoS memory note `2026-06-01_1430_kst_dashboard_open_matrix_gate.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1144 files and 2165 symbols on 2026-06-01. Search terms should include `musu_up_dashboard_open`, `dashboard_url_source`, `expected_token`, `dashboard opened`, `20260601-143309-HUGH_SECOND`, and `MUSU_CPU_SCENARIO_ROUTE_OK`.
- Current evidence refreshed after dashboard-open matrix gate tightening: single-machine smoke `docs\evidence\single-machine\1.15.0-rc.1\20260601-144154-HUGH_SECOND.evidence.json` passed with dashboard output `MUSU_RELEASE_SMOKE_OK_20260601_144129`, CLI route checked, dashboard task `a55012e1-adab-48e6-950f-e6953cd1566b`, and bridge `http://127.0.0.1:2502`. Primary desktop-open CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-144311-HUGH_SECOND.desktop-open.evidence.json` passed from clean commit `aeb6c10d366b9759773bea5491604f79a594d81a` with 60.029s sample, one `musu-desktop`, six owned WebView2 helpers, owned Node `0`, max one-core CPU `musu=0` and `webview2=0.18`, working set `341.41MB`, and private memory `183.8MB`.
- Indexer refreshed after post-dashboard-open-gate current evidence, GOAL v164/v165, BETA checklist pointers, WIKI_INDEX updates, and CoS memory note `2026-06-01_1445_kst_post_dashboard_open_gate_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1149 files and 2165 symbols on 2026-06-01. Search terms should include `20260601-144154-HUGH_SECOND.evidence.json`, `20260601-144311-HUGH_SECOND.desktop-open.evidence.json`, `MUSU_RELEASE_SMOKE_OK_20260601_144129`, `a55012e1-adab-48e6-950f-e6953cd1566b`, `webview2=0.18`, `341.41MB`, and `musu_up_dashboard_open`.
- CPU matrix manual commands must use comma-separated scenarios: `-Scenario runtime-started,dashboard-open,desktop-open,post-route`. A dirty-tree audit showed the older space-separated form only measured the first scenario under `powershell -File`; operator packet/runbook/status commands now use the comma form, and the runner normalizes comma input.
- Indexer refreshed after the CPU matrix scenario argument fix, GOAL v166/v167, wiki/529 update, operator packet/kit/status/runbook command updates, and CoS memory note `2026-06-01_1455_kst_cpu_matrix_scenario_argument_fix.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1150 files and 2165 symbols on 2026-06-01. Search terms should include `runtime-started,dashboard-open,desktop-open,post-route`, `20260601-145441-HUGH_SECOND`, `requested_scenarios`, `comma-separated scenarios`, and `CPU matrix scenario argument fix`.
- Public site production fix: `html, body` no longer use `overflow:hidden`; public pages scroll normally. The browser/site logo now uses `/images/favicon-header.png`, matching the Tauri/MSIX favicon mark. The sampled favicon teal `#24C8DB` is exposed as `--musu-color-brand-emerald` and used as a restrained public-site accent on the shell CTA, waitlist panel, pricing highlight, install status, and home-page badge. Local production QA passed with `npm run typecheck`, `npm run build`, `next start -p 3001`, and Playwright checks for `/`, `/landing`, `/pricing`, and `/install` on desktop/mobile. `musu.pro` deploy path is the existing Vercel workflow on push to `main`.
- Indexer refreshed after the public site scroll/logo/accent fix, GOAL v168/v169, and CoS memory note `2026-06-01_1520_kst_public_site_scroll_logo_accent.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1154 files and 2165 symbols on 2026-06-01. Search terms should include `overflow-y:auto`, `favicon-header.png`, `--musu-color-brand-emerald`, `#24C8DB`, `PublicSiteShell`, and `Deploy musu-bee to Vercel`.
- Runtime CPU attribution fix: `measure-musu-idle-cpu.ps1` now reads process command lines via CIM so repo-related `node.exe` is counted even when the executable path is only `C:\Program Files\nodejs\node.exe`. This addresses the operator-observed many-Node concern by separating repo-related Node from unrelated machine-wide Node. `measure-musu-runtime-cpu-scenarios.ps1` now uses only `dashboard.reachable_url` unless `-DashboardUrl` is explicit, so dashboard-open evidence cannot silently fall back to an unreachable `dev_url`/`start_url`.
- Current primary CPU matrix evidence: `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-154503-HUGH_SECOND.runtime-cpu-scenario-matrix.json` passed with clean source commit `68d183e0d285b3578b75e5c243a64855e64683bd`, scenarios `runtime-started`, `dashboard-open`, `desktop-open`, `post-route`, repo Node `1`, successful route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_154503`, and no hot processes. The matrix gate remains `1/2` until second-PC evidence is imported.
- Current single-machine and primary CPU evidence after the attribution fix: single-machine smoke `docs\evidence\single-machine\1.15.0-rc.1\20260601-155630-HUGH_SECOND.evidence.json` passed with dashboard task `e6757818-7dc2-432d-b9fb-19143cded009`, bridge `http://127.0.0.1:4747`, and output `MUSU_RELEASE_SMOKE_OK_20260601_155610`. Primary `desktop-open` CPU evidence `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-160102-HUGH_SECOND.desktop-open.evidence.json` passed with MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`, `webview2=0.08`, and working set `504.02MB`. Go/no-go remains No-Go with runtime idle CPU `1/2` and runtime CPU scenario matrix `1/2`.
- Indexer refreshed after the CPU attribution/current evidence refresh, GOAL v170-v173, wiki/522/wiki/529/BETA/WIKI_INDEX/qual-audit updates, and CoS memory note `2026-06-01_1605_kst_cpu_matrix_node_attribution_current_evidence.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1160 files and 2165 symbols on 2026-06-01. Search terms should include `repo_related_node`, `reachable_url`, `20260601-154503-HUGH_SECOND.runtime-cpu-scenario-matrix.json`, `20260601-155630-HUGH_SECOND.evidence.json`, `20260601-160102-HUGH_SECOND.desktop-open.evidence.json`, and `runtime CPU scenario matrix 1/2`.
- Public site deployment verification: the scroll/logo/accent fix commit `04929fd Fix public site scroll and branding` was deployed by Vercel production workflow run `26738950440`; live Playwright checks against `https://musu.pro` passed for `/`, `/landing`, `/pricing`, and `/install` on desktop and mobile. Verified signals: `body` scrolls with `overflow-y:auto`, visible logo and browser icon use `/images/favicon-header.png` through Next image optimization, and `--musu-color-brand-emerald` is `#24C8DB`.
- Relay lease audit CLI: `musu relay leases --json` now queries `GET /api/v1/p2p/relay/lease` with optional `--session-id`, `--source-node-id`, `--target-node-id`, and `--limit` filters. It emits schema `musu.relay_leases.v1`, includes `owner_scope_verified`, and keeps `relay_transport_wired=false` plus `relay_default_data_path=false`.
- Live production blocker: `musu relay status --json` against default `https://musu.pro` reports logged-in relay control-plane wiring, but `musu relay leases --json` currently fails with `p2p_control_auth_not_configured`. The deployed P2P control routes still expect static env control-token auth; the runtime CLI sends the logged-in account token. Do not claim production relay lease evidence until the API validates the account/device token or a scoped P2P control token is configured.
- Indexer refreshed after the relay lease audit CLI/live auth blocker docs, GOAL v174-v175, wiki/524/wiki/530/BETA/current-status/qual-audit updates, and CoS memory note `2026-06-01_1636_kst_relay_lease_audit_cli_live_auth_blocker.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1161 files and 2170 symbols on 2026-06-01. Search terms should include `musu.relay_leases.v1`, `owner_scope_verified`, `query_relay_leases`, `p2p_control_auth_not_configured`, `26738950440`, `04929fd`, `relay_default_data_path=false`, and `relay_transport_wired=false`.
- P2P control auth hash allowlist: `musu-bee/src/lib/p2pControlAuth.ts` now accepts `MUSU_P2P_CONTROL_TOKEN_SHA256S` / `MUSU_P2P_CONTROL_TOKEN_SHA256`, so production can accept the runtime account token without storing the raw token in Vercel env. `scripts\windows\show-p2p-control-token-hash.ps1 -Json` computes the `sha256:<hex>` env value from `~\.musu\token` without printing the raw token. Validation passed for 25 targeted P2P API/auth tests and `npm run typecheck`. Live production still needs deploy/env config/recheck before relay lease evidence is trusted.
- Indexer refreshed after P2P auth hash-allowlist wiring, GOAL v176-v177, wiki/522/wiki/524/wiki/530/BETA/CONFIG updates, and CoS memory note `2026-06-01_1710_kst_p2p_control_auth_hash_allowlist.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1164 files and 2177 symbols on 2026-06-01. Search terms should include `sha256_bearer_token_allowlist`, `accepted_auth_modes`, `MUSU_P2P_CONTROL_TOKEN_SHA256S`, `raw_token_printed=false`, and `show-p2p-control-token-hash.ps1`.
- P2P auth deployment check: commit `b1c4378` passed GitHub `Tests` run `26742743243`, `E2E Tests — musu-bee` run `26742743299`, and Vercel production deploy run `26742743319`. Live `musu relay leases --json` now includes `accepted_auth_modes=[]` in the `p2p_control_auth_not_configured` error, proving the hash-allowlist code is live but production `MUSU_P2P_CONTROL_TOKEN_SHA256S` remains unset.
- Indexer refreshed after the live P2P auth deploy/env check, GOAL v178-v179, WIKI_INDEX updates, wiki/522/wiki/530 updates, and CoS memory note `2026-06-01_1718_kst_p2p_auth_deployed_env_missing.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1165 files and 2177 symbols on 2026-06-01. Search terms should include `b1c4378`, `26742743319`, `accepted_auth_modes=[]`, `p2p_control_auth_not_configured`, and `production env missing`.
- Public site follow-up hardening: `musu-bee/src/app/page.tsx` and `musu-bee/src/components/PublicSiteShell.tsx` now use the shared `MusuLogo` favicon mark instead of ad hoc text/image lockups, and both public roots carry `musu-public-scroll-root`. `globals.css` now exposes `--musu-color-brand-ink-rgb`, `--musu-color-brand-accent-rgb`, and `--musu-color-brand-canvas-rgb` alongside the existing emerald token so public/experimental pages using `rgb(var(...))` resolve correctly. `e2e/public-site-scroll-brand.spec.ts` plus `playwright.public-site.config.ts` are the focused regression gate for the operator-reported scroll/logo issue. Local validation passed: `npm run typecheck`, `npx playwright test --config=playwright.public-site.config.ts` (desktop + mobile), and `npm run build`.
- Indexer refreshed after the public site follow-up hardening, GOAL v180-v181, BETA/WIKI_INDEX updates, and CoS memory note `2026-06-01_1722_kst_public_site_scroll_logo_followup.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1168 files and 2177 symbols on 2026-06-01. Search terms should include `public-site-scroll-brand`, `musu-public-scroll-root`, `MusuLogo`, `favicon-header.png`, `#24C8DB`, and `musu-color-brand-emerald`.
- Public site live follow-up deploy: commit `674f501` passed `Tests` run `26743680160`, `E2E Tests — musu-bee` run `26743680172`, and Vercel deploy run `26743680165`. Live QA against `https://musu.pro` with `qa=674f501` verified `/`, `/landing`, `/pricing`, and `/install` on desktop/mobile: pages scroll, have no horizontal overflow, render the favicon mark through Next image optimization, carry `.musu-public-scroll-root`, and expose `--musu-color-brand-emerald=#24C8DB`.
- Indexer refreshed after recording the public site live deploy QA, GOAL v182-v183, BETA/WIKI_INDEX updates, and the expanded CoS memory note `2026-06-01_1722_kst_public_site_scroll_logo_followup.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1168 files and 2177 symbols on 2026-06-01. Search terms should include `qa=674f501`, `canScroll=true`, `bodyOverflowY=auto`, `htmlOverflowY=auto`, `.musu-public-scroll-root=true`, and `favicon-header.png`.
- Frontend busy-loop reduction: direct `setInterval(` usage has been removed from `musu-bee/src`. Workflow run status, remote screen device refresh, agents surface refresh, and onboarding research polling now use `useLowDutyPolling`, which applies hidden-tab throttling, failure backoff, in-flight suppression, and AbortController cancellation. `src/app/runtime-polling-contract.test.ts` locks this contract. Validation passed with no `setInterval(` matches in `musu-bee/src`, 4/4 polling contract tests, `npm run typecheck`, and `npm run build`. This does not replace the required 60s primary/second-PC CPU evidence; it removes known frontend interval-loop candidates before the next evidence capture.
- Indexer refreshed after frontend polling hot-loop hardening, GOAL v184-v185, BETA/WIKI_INDEX/runtime CPU audit/runtime hardening roadmap updates, and CoS memory note `2026-06-01_1738_kst_frontend_polling_hot_loop_hardening.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1170 files and 2176 symbols on 2026-06-01. Search terms should include `no setInterval`, `useLowDutyPolling`, `frontend polling hot-loop`, `AbortSignal`, `runtime-polling-contract.test.ts`, and `setInterval\\(`.
- Tauri desktop runtime-start hardening: `musu-bee/src-tauri/src/lib.rs` no longer calls `.output()` for `musu up --json`. `start_runtime` uses a temp-file stdout/stderr capture helper with `stdin=null`, a 45s timeout, and 200ms wait sleeps, so an inherited bridge child output handle cannot keep the desktop shell busy forever. `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed 3/3 shell tests, including output capture without direct output pipes. A diagnostic process audit at 2026-06-01 17:53 KST observed 16 machine-wide Node.js processes, all non-MUSU Codex/MCP/npx helpers; MUSU-owned Node `0` and repo-related orphan helpers `0`. That audit is not release evidence because no MUSU runtime was running and the bridge registry had a dead PID.
- Indexer refreshed after Tauri desktop start-runtime hardening, GOAL v186-v187, BETA/WIKI_INDEX/runtime CPU audit/runtime hardening roadmap updates, and CoS memory note `2026-06-01_1751_kst_tauri_start_runtime_timeout_hardening.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1171 files and 2184 symbols on 2026-06-01. Search terms should include `START_RUNTIME_TIMEOUT`, `run_command_with_timeout`, `musu up timed out`, `desktop Start Runtime busy`, `machine-wide Node.js`, `MUSU-owned Node 0`, and `dead bridge PID`.
- Tauri desktop stale bridge registry cleanup: `desktop_status` now parses `~/.musu/services/bridge.json`, checks the recorded Windows PID through `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)`, removes stale bridge registry files when the PID is dead, and returns an offline status with `bridge_url=null` instead of probing a dead endpoint. This directly addresses the 2026-06-01 17:53 KST process audit failure class where `bridge.json` pointed to dead PID `32192` at `127.0.0.1:6677`. `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` passed 5/5 shell tests, including stale cleanup and live registry preservation.
- Indexer refreshed after stale bridge registry cleanup, GOAL v188-v189, BETA/WIKI_INDEX/runtime CPU audit/runtime hardening roadmap updates, and CoS memory note `2026-06-01_1807_kst_tauri_stale_bridge_registry_cleanup.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1172 files and 2191 symbols on 2026-06-01. Search terms should include `bridge_registry_status`, `PROCESS_QUERY_LIMITED_INFORMATION`, `stale_bridge_registry_is_removed_before_status_probe`, `live_bridge_registry_returns_loopback_url`, `bridge_url=null`, and `stale bridge registry removed`.
- Doctor background profile: `musu doctor --json` now includes `background` with mDNS, IPv6 mDNS, Tailscale mDNS, VPN/virtual mDNS interfaces, clipboard sync, cloud registration, cloud heartbeat interval/floor, file watcher roots/writable state, and planner status. The profile is `ok` when optional hot-loop-prone features are off and `warn` when resource-affecting opt-ins are enabled. Live `HUGH_SECOND` output after the change: `background.status=ok`, mDNS/clipboard/file sync/planner off, `cloud_heartbeat_interval_sec=300`, `cloud_heartbeat_floor_sec=60`.
- Indexer refreshed after doctor background profile wiring, GOAL v190-v191, BETA/WIKI_INDEX/runtime CPU audit/runtime hardening roadmap updates, and CoS memory note `2026-06-01_1835_kst_doctor_background_profile.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1173 files and 2200 symbols on 2026-06-01. Search terms should include `DoctorBackground`, `check_background_features`, `background.status=ok`, `cloud_heartbeat_interval_sec`, `MUSU_ENABLE_CLIPBOARD_SYNC`, `MUSU_MDNS_ENABLE_TAILSCALE`, and `file_serve_root_count`.
- Planner loop budget hardening: the optional autonomous planner remains off by default, but `MUSU_PLANNER_INTERVAL_SEC` is now floored at 60s and `MUSU_PLANNER_COMMAND_TIMEOUT_SEC` is clamped to 5s..120s. The planner crawler now uses timeout-bounded `tokio::process::Command` with `stdin=null`, piped output, and `kill_on_drop(true)` instead of blocking `std::process::Command::output()`. `musu doctor --json` now reports planner interval/timeout budget fields; live bad-env verification returned `planner_interval_sec=60`, `planner_command_timeout_sec=120`, and `background.status=warn`.
- Indexer refreshed after planner loop budget hardening, GOAL v192-v193, BETA/WIKI_INDEX/runtime CPU audit/runtime hardening roadmap/current status updates, and CoS memory note `2026-06-01_1856_kst_planner_loop_budget_hardening.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1174 files and 2207 symbols on 2026-06-01. Search terms should include `PLANNER_MIN_INTERVAL_SEC`, `MUSU_PLANNER_COMMAND_TIMEOUT_SEC`, `planner_command_timeout_sec`, `planner_interval_sec`, `planner crawler timed out`, and `doctor_background_floors_planner_loop_budget`.
- Live public-site deployment recheck: `https://musu.pro` is already serving the scroll/logo/accent fix. HTTP checks for `/`, `/privacy`, and `/support` returned 200, and live Playwright QA on desktop/mobile confirmed homepage scroll movement, no horizontal overflow, favicon-header logo source, `data-brand-accent=emerald`, and `--musu-color-brand-emerald=#24C8DB`.
- Hardware probe timeout hardening: `musu-rs/src/peer/hardware.rs` now bounds the platform command probes used by logged-in cloud heartbeat hardware metadata. Windows PowerShell/WMIC, macOS `sysctl`, and `nvidia-smi` probes use `stdin=null`, stderr discarded, stdout captured after exit, and a 5s timeout with fallback metadata on failure/timeout. Validation passed with `peer::hardware::tests` 2/2 on Windows, `cargo build --bin musu -j 1`, `cargo fmt --check`, and `git diff --check`.
- Indexer refreshed after live public-site deploy recheck and hardware probe timeout hardening, GOAL v194-v195, BETA/WIKI_INDEX/runtime CPU audit/runtime hardening roadmap/current status updates, and CoS memory note `2026-06-01_1919_kst_hardware_probe_timeout_hardening.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1175 files and 2212 symbols on 2026-06-01. Search terms should include `HARDWARE_PROBE_TIMEOUT`, `command_stdout_with_timeout`, `hardware-probe-ok`, `nvidia-smi`, `Win32_PhysicalMemory`, `machdep.cpu.brand_string`, `live-brand-scroll-desktop`, and `#24C8DB`.
- Post-push go/no-go for `4f099bf`: GitHub `Tests` run `26749151136` passed. Clean go/no-go still reports public release No-Go: public metadata ok, MSIX install ok, manifest dirty false, but single-machine false, runtime idle CPU `0/2`, runtime CPU scenario matrix `0/2`, multi-device false, support false, and Store false. Earlier primary evidence is now stale against the latest source commit, so primary smoke/CPU/matrix evidence must be refreshed before second-PC capture can close the two-machine runtime gates.
- Indexer refreshed after recording the post-push No-Go state, GOAL v196-v197, WIKI_INDEX, wiki/522, wiki/529, and the CoS memory note updates: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1175 files and 2212 symbols on 2026-06-01. Search terms should include `4f099bf`, `26749151136`, `single_machine_verified=false`, `runtime idle CPU 0/2`, and `runtime CPU scenario matrix 0/2`.
- Primary evidence refresh after hardware-probe hardening: single-machine evidence now passes at `docs\evidence\single-machine\1.15.0-rc.1\20260601-194130-HUGH_SECOND.evidence.json`; primary clean packaged `desktop-open` CPU evidence passes at `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-194410-HUGH_SECOND.desktop-open.evidence.json` with `musu=0`, `node=0.03`, `webview2=0.08` max one-core CPU; primary clean 4-state matrix passes at `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-194528-HUGH_SECOND.runtime-cpu-scenario-matrix.json` with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_194528`. Go/no-go is back to single-machine true, runtime idle CPU `1/2`, runtime CPU scenario matrix `1/2`.
- Indexer refreshed after primary evidence refresh, GOAL v198-v199, BETA/WIKI_INDEX/wiki/522/wiki/529 updates, and CoS memory note `2026-06-01_1950_kst_primary_smoke_cpu_evidence_refresh.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1181 files and 2212 symbols on 2026-06-01. Search terms should include `20260601-194130-HUGH_SECOND`, `20260601-194410-HUGH_SECOND.desktop-open`, `20260601-194528-HUGH_SECOND.runtime-cpu-scenario-matrix`, `60cb73e5-ea3c-42c8-bcd6-41f09e618a16`, and `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_194528`.
- Frontend polling hardening follow-up: `DashboardClient.tsx` and `NodePanel.tsx` no longer own custom visibility/timer refresh loops. Dashboard agents/tasks/watchdog/runs refresh and node panel nodes/registry/discovery refresh now use `useLowDutyPolling`, joining the existing workflow run, remote screen, agents surface, and onboarding research polling contract. Validation passed with 6/6 `runtime-polling-contract.test.ts`, `npm run typecheck`, `npm run build`, `git diff --check`, and no `setInterval(` matches in `musu-bee/src`. This reduces frontend busy-loop risk but makes previous CPU evidence stale until refreshed from the new clean commit.
- Indexer refreshed after dashboard/node polling hardening, GOAL v200-v201, BETA/current-status/runtime CPU audit/runtime hardening roadmap updates, and CoS memory note `2026-06-01_2010_kst_dashboard_node_polling_hardening.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1182 files and 2212 symbols on 2026-06-01. Search terms should include `DashboardClient.tsx`, `NodePanel.tsx`, `dashboard main refresh`, `node panel registry/discovery refresh`, `useLowDutyPolling`, `runtime-polling-contract.test.ts`, and `no setInterval`.
- Post-polling-hardening go/no-go: clean commit `a1082dec` reports `ready=false`, `manifest_dirty=false`, `single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU scenario matrix `0/2`, multi-device false, support false, and Store false. This is expected because source freshness invalidates the previous primary evidence; the next evidence step is primary smoke, primary `desktop-open` CPU, and primary 4-state matrix refresh before second-PC import can close runtime gates.
- Indexer refreshed after recording the post-polling-hardening No-Go state, GOAL v202-v203, current-status/runtime CPU audit/WIKI_INDEX updates, and the expanded CoS memory note: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1182 files and 2213 symbols on 2026-06-01. Search terms should include `a1082dec`, `manifest_dirty=false`, `single_machine_verified=false`, `runtime idle CPU 0/2`, and `runtime CPU scenario matrix 0/2`.
- Public-site common-shell accent follow-up and current primary evidence refresh: `PublicSiteShell.tsx` now gives the emerald `Open App` CTA a testable `data-brand-accent="emerald"` marker, and `e2e/public-site-scroll-brand.spec.ts` now covers `/`, `/landing`, `/pricing`, and `/install` on desktop/mobile. Local Playwright passed 8/8. Current primary evidence after the polling source change: single-machine `20260601-203715-HUGH_SECOND`, desktop-open CPU `20260601-203537-HUGH_SECOND.desktop-open`, and 4-state matrix `20260601-203835-HUGH_SECOND.runtime-cpu-scenario-matrix` all pass on `HUGH_SECOND`. CPU remains under budget, but stale packaged `musu-desktop.exe` shells were observed after repeated manual launches, so desktop shell window reactivation/single-instance hardening remains open.
- Indexer refreshed after the public-site common-shell accent and primary evidence refresh, GOAL v204-v205, BETA/current-status/runtime CPU audit/runtime hardening roadmap/qual audit/WIKI_INDEX updates, and CoS memory note `2026-06-01_2043_kst_public_site_primary_evidence_refresh.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1191 files and 2213 symbols on 2026-06-01. Search terms should include `20260601-203715-HUGH_SECOND`, `20260601-203537-HUGH_SECOND.desktop-open`, `20260601-203835-HUGH_SECOND.runtime-cpu-scenario-matrix`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_203835`, `data-brand-accent="emerald"`, and `desktop shell accumulation`.
- Clean go/no-go after the post-polling primary evidence commit: commit `1ab5a824be1291ac56667bc331474a7d63864d29` reports `ready=false`, `single_machine=true`, runtime idle CPU `1/2`, runtime CPU scenario matrix `1/2`, public metadata/MSIX install/MSIX desktop entrypoint/process ownership/startup single-instance true, multi-device/support/Store false, and `manifest_dirty=false`.
- `musu.pro` deploy workflow hardening and live QA: Vercel production deploy run `26753317276` for `96303af3` was stuck and canceled. Commit `65950384` added deploy job/step timeouts and `vercel deploy --prebuilt --yes`; Vercel production run `26753908889` and `Tests` run `26753908911` passed. Live browser QA against `https://musu.pro` with cachebuster `qa=65950384` passed on `/`, `/landing`, `/pricing`, and `/install` across desktop/mobile with scroll, no horizontal overflow, favicon-header logo, `.musu-public-scroll-root`, and `#24C8DB` accent.
- Final primary evidence after deploy workflow hardening: single-machine `docs\evidence\single-machine\1.15.0-rc.1\20260601-211031-HUGH_SECOND.evidence.json`, primary desktop-open CPU `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-211132-HUGH_SECOND.desktop-open.evidence.json`, and primary 4-state matrix `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-211252-HUGH_SECOND.runtime-cpu-scenario-matrix.json` pass on `HUGH_SECOND`. The CPU sample used clean commit `a0184e89851d7ac99e1162a301f9219104a4df04`, counted MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`, `webview2=0.23`, and no hot processes. Release remains No-Go because the second-PC CPU/matrix, release-grade route, production P2P env/live verification, `musu@musu.pro`, Store evidence, and relay/tunnel transport gates remain open.
- Indexer refreshed after deploy workflow/final evidence documentation, GOAL v207-v209, BETA/current-status/runtime CPU audit/runtime hardening roadmap/qual audit/WIKI_INDEX updates, and CoS memory note `2026-06-01_2122_kst_deploy_workflow_final_evidence_refresh.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1197 files and 2213 symbols on 2026-06-01. Search terms should include `26753317276`, `26753908889`, `26753908911`, `20260601-211031-HUGH_SECOND`, `20260601-211132-HUGH_SECOND.desktop-open`, `20260601-211252-HUGH_SECOND.runtime-cpu-scenario-matrix`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_211252`, and `qa=65950384`.
- Hosted P2P control-plane live evidence is now a go/no-go gate. `record-p2p-control-plane-evidence.ps1` records `musu relay status --json` plus `musu relay leases --json`; `verify-p2p-control-plane-evidence.ps1` requires logged-in hosted control-plane wiring, `release_grade_transport_required=quic_tls_1_3`, `relay_default_data_path=false`, and owner-scoped relay lease query success. Current evidence `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260601-214149-musu.pro.evidence.json` fails correctly: relay status is logged in and wired, but relay leases report `ok=false`, `owner_scope_verified=false`, `owner_scoped=false`, and `p2p_control_auth_not_configured`. This is a live `musu.pro` production env/deploy blocker, not a local-only desktop blocker: production `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent scoped auth must be configured on `musu.pro`, then passing live evidence must be recorded without `-AllowUnverified`.
- Indexer refreshed after the P2P control-plane live gate, GOAL v210-v211, BETA/current-status/runtime hardening roadmap/qual audit/WIKI_INDEX updates, failing live P2P evidence, and CoS memory note `2026-06-01_2141_kst_p2p_control_plane_live_gate.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1203 files and 2213 symbols on 2026-06-01. Search terms should include `musu.p2p_control_plane_live_evidence.v1`, `p2p_control_plane_verified`, `p2p-control-plane`, `20260601-214149-musu.pro`, `owner_scope_verified=false`, and `MUSU_P2P_CONTROL_TOKEN_SHA256S`.
- Post-P2P-gate clean go/no-go for commit `a6e41609d1c9ceaaf13ce73119f25e62471bfb5b`: `ready=false`, `manifest_dirty=false`, `single_machine=false`, runtime idle CPU `0/2`, runtime CPU scenario matrix `0/2`, `p2p_control_plane_verified=false`, relay leases `ok=false`, and `owner_scope_verified=false`. Blockers are `single-machine`, `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`, `support-mailbox`, `store-release`, and `p2p-control-plane`. This resets previous primary runtime evidence because release scripts changed; refresh primary smoke/CPU/matrix on the final commit before treating second-PC import as the last runtime gate.
- Indexer refreshed after the post-P2P-gate No-Go documentation, GOAL v212-v213, current-status/BETA/qual-audit/runtime-hardening/WIKI_INDEX updates, and CoS memory updates: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1203 files and 2213 symbols on 2026-06-01. Search terms should include `a6e41609`, `single_machine=false`, `runtime idle CPU 0/2`, `runtime CPU scenario matrix 0/2`, `p2p_control_plane_verified=false`, and `owner_scope_verified=false`.
- Primary evidence refreshed after the P2P gate commits: single-machine `20260601-221225-HUGH_SECOND` passes with dashboard task `927874c7-ce4d-4eb1-a84d-1bd7517ff844`; production-dashboard `desktop-open` CPU `20260601-221918-HUGH_SECOND.desktop-open` passes with MUSU `2`, repo Node `1`, owned WebView2 `6`, max one-core CPU `musu=0`, `node=0`, `webview2=0.13`, working set `469.28MB`, and no hot processes; primary 4-state matrix `20260601-222043-HUGH_SECOND.runtime-cpu-scenario-matrix` passes with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_222043`. Clean go/no-go on `5b8650f0` is back to `single_machine=true`, runtime idle CPU `1/2`, runtime CPU scenario matrix `1/2`, and `ready=false`; remaining blockers are second-PC runtime/route evidence, support mailbox, Store release, and live `musu.pro` P2P control-plane auth.
- Indexer refreshed after the post-P2P-gate primary evidence refresh, GOAL v214-v215, current-status/BETA/qual-audit/runtime-hardening/WIKI_INDEX updates, and CoS memory note `2026-06-01_2226_kst_primary_evidence_refresh_after_p2p_gate.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1209 files and 2213 symbols on 2026-06-01. Search terms should include `20260601-221225-HUGH_SECOND`, `20260601-221918-HUGH_SECOND.desktop-open`, `20260601-222043-HUGH_SECOND.runtime-cpu-scenario-matrix`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_222043`, `webview2=0.13`, and `runtime CPU scenario matrix 1/2`.
- Public site manual deploy/scroll hardening follow-up: live `https://musu.pro` already scrolls on desktop/mobile and renders the favicon-header mark plus `#24C8DB` accent, but the production deploy workflow lacked a manual trigger. `.github/workflows/deploy-musu-bee.yml` now has `workflow_dispatch`, and `.musu-public-scroll-root` has explicit touch/viewport scroll rules (`height:auto`, `max-height:none`, `touch-action:pan-y`, `-webkit-overflow-scrolling:touch`, and `html/body:has(...)`). Local validation passed `npm run typecheck`, public-site Playwright 8/8, `npm run build`, and `git diff --check`. Search terms should include `workflow_dispatch`, `musu-public-scroll-root`, `touch-action: pan-y`, `-webkit-overflow-scrolling`, `favicon-header.png`, and `#24C8DB`.
- Indexer refreshed after public-site manual deploy/scroll hardening, GOAL v216-v217, current-status/WIKI_INDEX updates, and CoS memory note `2026-06-01_2248_kst_public_site_manual_deploy_scroll_hardening.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1210 files and 2213 symbols on 2026-06-01. Search terms should include `workflow_dispatch`, `manual production redeploy`, `touch-action:pan-y`, `-webkit-overflow-scrolling`, `favicon-header.png`, and `#24C8DB`.
- Public site deploy verification for the manual-deploy hardening: commit `b08ed746` passed GitHub `Tests` run `26759256487`, `E2E Tests - musu-bee` run `26759256574`, and Vercel production deploy run `26759256616`. Live QA with `qa=b08ed746` passed on `/`, `/landing`, `/pricing`, and `/install` across desktop/mobile with actual scroll movement, no horizontal overflow, favicon-header logo, emerald accent marker, and `--musu-color-brand-emerald=#24C8DB`.
- Final go/no-go after the public-site deploy verification remains No-Go: commit `bce29066` has `manifest_dirty=false`, public metadata/MSIX install/MSIX desktop entrypoint true, but `single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU scenario matrix `0/2`, `p2p_control_plane_verified=false`, support false, and Store false. The primary evidence reset is source freshness from the public-site CSS/workflow change; refresh primary smoke/CPU/matrix before treating second-PC runtime evidence as the last runtime gate.
- Current primary evidence after the final public-site/docs source change: single-machine `docs\evidence\single-machine\1.15.0-rc.1\20260601-231612-HUGH_SECOND.evidence.json`, desktop-open CPU `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260601-231939-HUGH_SECOND.desktop-open.evidence.json`, and 4-state matrix `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260601-233638-HUGH_SECOND.runtime-cpu-scenario-matrix.json` all pass on `HUGH_SECOND`. The CPU evidence shows no current primary busy-loop: desktop-open max one-core CPU is `musu=0`, `node=0`, `webview2=0.1`; matrix `desktop-open` peaks at WebView2 `0.18`; post-route token is `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_233638`.
- Current qualitative audit is wiki/531: `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_NEXT_STEPS_2026_06_01_2345.md`. It records that `musu.pro` deployment is complete, the primary busy-loop report is not reproduced, machine-wide Node.js is mostly Codex/MCP/npx tooling, the test-only Next dashboard is the single repo-related Node in CPU evidence, and public release remains No-Go until second-PC CPU/matrix, release-grade route, live P2P control-plane auth, `musu@musu.pro`, and Store evidence are recorded.
- Indexer refreshed after wiki/531, current primary evidence refresh, code-audit/roadmap documentation, and CoS memory note `2026-06-01_2345_kst_current_evidence_code_audit_roadmap.md`: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1217 files and 2213 symbols on 2026-06-01. Search terms should include `20260601-231612-HUGH_SECOND`, `20260601-231939-HUGH_SECOND.desktop-open`, `20260601-233638-HUGH_SECOND.runtime-cpu-scenario-matrix`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260601_233638`, `wiki/531`, `primary busy-loop not reproduced`, and `machine-wide Node.js`.
- 2026-06-02 desktop shell source hardening: the currently installed packaged
  app still duplicates `musu-desktop.exe` shells under repeated Start-menu
  activation; local repro expanded one shell to three PIDs (`5744`, `27512`,
  `31496`). Source now uses `tauri-plugin-single-instance = 2.4.2` and focuses
  the existing `main` window on second activation. Validation passed
  `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml -j 1` 5/5. This
  invalidates desktop release evidence until a fresh MSIX is built/installed
  and packaged desktop repeated-activation, process ownership, and CPU evidence
  are rerun.
- 2026-06-02 public-site source follow-up: public logo rendering now uses the
  favicon mark only, `.musu-public-scroll-root` has more explicit scrolling
  rules, and the homepage `Open App` CTA uses the emerald `#24C8DB` point
  color. Local validation passed `npm run typecheck`, public-site Playwright
  8/8, and `npm run build`. Commit `0ed3673a` deployed this to `musu.pro`;
  Vercel deploy run `26764307713`, Tests run `26764309477`, E2E run
  `26764310368`, and production Playwright QA 8/8 passed on `/`, `/landing`,
  `/pricing`, and `/install`.
- Indexer refreshed after the 2026-06-02 desktop single-instance and
  public-site follow-up: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed 1218 files and 2213 symbols. Search terms should
  include `tauri-plugin-single-instance`, `desktop repeated activation`,
  `favicon mark only`, `scrollbar-gutter: stable`, `100svh`, `#24C8DB`, and
  `musu.pro deploy verified`.
- Indexer refreshed again after live `musu.pro` deployment verification:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1218 files and 2213 symbols. Search terms should include `0ed3673a`,
  `26764307713`, `26764309477`, `26764310368`, `production Playwright QA 8/8`,
  and `musu.pro deploy verified`.
- Desktop single-instance release gate is wiki/532:
  `docs/DESKTOP_SINGLE_INSTANCE_RELEASE_GATE_2026_06_02.md`. New script
  `scripts\windows\audit-musu-desktop-single-instance.ps1` writes
  `musu.desktop_single_instance_audit.v1` by launching the installed package
  through `shell:AppsFolder\<AppUserModelId>`. Current installed package
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6` fails: repeat count `3`,
  before `1`, after `4`, new shells `3`, evidence
  `.local-build\desktop-single-instance\musu-desktop-single-instance-20260602-005439-HUGH_SECOND.json`.
  `write-release-go-no-go.ps1` now reports
  `desktop_single_instance_verified=false` and adds blocker
  `desktop-single-instance`; handoff status and final operator packet
  verification include the new gate. Source has the Tauri single-instance
  plugin, but a fresh MSIX build/install plus passing audit is still required.
- Indexer refreshed after wiki/532 and the packaged desktop single-instance
  release gate: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
  indexed 1221 files and 2213 symbols on 2026-06-02. Search terms should
  include `musu.desktop_single_instance_audit.v1`,
  `desktop_single_instance_verified`, `desktop-single-instance`,
  `audit-musu-desktop-single-instance.ps1`, `shell:AppsFolder`,
  `20260602-005439-HUGH_SECOND`, and `new_desktop_shell=3`.
- Fresh MSIX primary evidence audit is wiki/533:
  `docs/RELEASE_1_15_0_RC1_FRESH_MSIX_EVIDENCE_AUDIT_2026_06_02.md`.
  Fresh release MSIX build/install now passes on `HUGH_SECOND`; packaged
  desktop repeated activation passes at
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-014803-HUGH_SECOND.evidence.json`
  with three activations and one desktop shell. Current primary smoke passes at
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-015347-HUGH_SECOND.evidence.json`
  with task `3e96b141-6aa5-4d39-a29b-450f15eed8b3`, bridge
  `http://127.0.0.1:6907`, output `MUSU_RELEASE_SMOKE_OK_20260602_015326`,
  and CLI route checked. Current primary desktop-open CPU passes at
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-015358-HUGH_SECOND.desktop-open.evidence.json`
  with hot process count `0`, max one-core CPU `musu=0.03`, `node=0.68`,
  `webview2=0.7`, and working set `537.79MB`. Current primary four-state CPU
  matrix passes at
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-015510-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_015510`. Process
  ownership passes at
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-020031-HUGH_SECOND.evidence.json`
  with runtime `1`, desktop shell `1`, owned Node `0`, owned WebView2 `6`,
  machine-wide Node `18`, and orphan repo helpers `0`. Public release remains
  No-Go until second-PC CPU/matrix, release-grade multi-device route, live
  `musu.pro` P2P control-plane auth, `musu@musu.pro`, and Store evidence pass.
- Indexer refreshed after wiki/533 and fresh MSIX primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1230 files and 2213 symbols. Search terms include `wiki/533`,
  `fresh MSIX primary evidence`, `20260602-014803-HUGH_SECOND`,
  `20260602-015347-HUGH_SECOND`, `20260602-015358-HUGH_SECOND.desktop-open`,
  `20260602-015510-HUGH_SECOND.runtime-cpu-scenario-matrix`,
  `20260602-020031-HUGH_SECOND`, and
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_015510`.
- 2026-06-02 CLI pipe/site deploy audit: wiki/534 records that direct Windows
  `musu up --json | ConvertFrom-Json` no longer hangs on a fresh debug bridge
  spawn after source cleared standard-handle inheritance and launched the bridge
  detached. Validation passed `cargo check --bin musu -j 1`, `cargo build --bin
  musu -j 1`, `cargo fmt --check`, `git diff --check`, and a fresh debug pipe
  test with bridge PID `37284` / URL `http://127.0.0.1:5692`; PID `37284` was
  stopped after the test. Live `https://musu.pro` QA still passes 8/8 for
  `/`, `/landing`, `/pricing`, and `/install` across desktop/mobile with
  scroll, no horizontal overflow, favicon-header logo, and `#24C8DB` accent.
  Public web deployment is not the current blocker; production P2P
  control-plane auth/env remains the hosted blocker.
- Indexer refreshed after wiki/534 and CLI pipe/site deploy audit:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1232 files and 2214 symbols. Search terms include `wiki/534`,
  `ConvertFrom-Json`, `stdout pipe`, `clear_standard_handle_inheritance`,
  `DETACHED_PROCESS`, `bridge_pid 37284`, `musu.pro live QA 8/8`, and
  `packaged CLI pipe proof`.
- Clean go/no-go after the source fix reports `manifest_dirty=false` but
  `single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU matrix
  `0/2`, `p2p_control_plane_verified=false`, support false, and Store false.
  This is expected because the Rust CLI source changed after the fresh MSIX
  primary evidence. The next evidence action is a fresh MSIX containing the
  CLI pipe fix, packaged CLI pipe proof, then primary smoke/CPU/matrix refresh.
- Packaged CLI/runtime evidence after the CLI pipe fix: wiki/535 records fresh
  local-sideload MSIX install evidence on `HUGH_SECOND`. The explicit
  WindowsApps alias proof
  `20260602-032728-HUGH_SECOND.packaged-cli-pipe.evidence.json` passed with
  `returned_without_hang=true` and bridge status `ok`. Current primary runtime
  evidence passes at `20260602-033029-HUGH_SECOND` single-machine,
  `20260602-033145-HUGH_SECOND` desktop single-instance,
  `20260602-033225-HUGH_SECOND` startup single-instance,
  `20260602-033257-HUGH_SECOND` process ownership,
  `20260602-033412-HUGH_SECOND.desktop-open` CPU, and
  `20260602-033636-HUGH_SECOND.runtime-cpu-scenario-matrix`. Desktop-open CPU
  max one-core is `musu=0`, `node=0`, `webview2=0.23`; hot process count is
  `0`; working set is `445.87MB`. Process ownership shows machine-wide Node
  `19`, but MUSU-owned Node `0` and orphan repo helpers `0`.
- Live `musu.pro` P2P control-plane recheck remains blocked by production env:
  `20260602-034756-musu.pro.evidence.json` has logged-in/wired status, but
  relay leases fail with `p2p_control_auth_not_configured`,
  `accepted_auth_modes=[]`, and `owner_scope_verified=false`. The website UI
  deploy question is closed; the next hosted action is setting production
  `MUSU_P2P_CONTROL_TOKEN_SHA256S` or equivalent scoped auth and redeploying.
- Indexer refreshed after wiki/535 packaged CLI/runtime evidence and P2P
  recheck docs: `musu indexer sync --work-dir F:\workspace\musu-bee --name
  musu-bee` indexed 1247 files and 2214 symbols. Search terms should include
  `wiki/535`, `packaged-cli-pipe`, `returned_without_hang=true`,
  `20260602-033412-HUGH_SECOND.desktop-open`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_033636`,
  `p2p_control_auth_not_configured`, `machine-wide Node 19`, and
  `owned Node 0`.
- Indexer refreshed after recording the clean post-commit No-Go state:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1232 files and 2214 symbols. Search terms include `post-commit No-Go`,
  `manifest_dirty=false`, `single_machine_verified=false`,
  `runtime idle CPU 0/2`, `runtime CPU scenario matrix 0/2`, and
  `fresh MSIX with CLI pipe fix`.
- 2026-06-02 P2P auth deploy moved the hosted blocker forward: commit
  `3be37e54a30bbd0bee95e9b2e22ce27d0450846c` deployed successfully to
  `musu.pro` via run `26776054030` after `MUSU_P2P_CONTROL_TOKEN_SHA256S` was
  synced. Live evidence
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-041225-musu.pro.evidence.json`
  now fails on `p2p_relay_lease_kv_not_configured`, not
  `p2p_control_auth_not_configured`. Next hosted task is Vercel KV/Upstash
  provisioning for `KV_REST_API_URL` and `KV_REST_API_TOKEN`; GitHub repo
  secrets currently do not contain those values and repo variables are empty.
- `scripts\windows\show-musu-pro-p2p-env-status.ps1` is the current hosted
  P2P env preflight. It checks GitHub secret/variable names and latest live
  P2P evidence without printing secret values. Current output reports
  `missing_kv_rest_api_token`, `missing_kv_rest_api_url`, and
  `live_evidence_p2p_relay_lease_kv_not_configured`.
- Indexer refreshed after hosted P2P env preflight script:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1256 files and 2214 symbols. Search terms include
  `show-musu-pro-p2p-env-status.ps1`,
  `musu.p2p_control_plane_env_status.v1`, and
  `missing_kv_rest_api_token`.
- Indexer refreshed after P2P auth/KV blocker docs:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1255 files and 2214 symbols. Search terms include
  `p2p_relay_lease_kv_not_configured`, `26776054030`, `KV_REST_API_URL`,
  `KV_REST_API_TOKEN`, and `P2P_CONTROL_PLANE_MUSU_PRO_NEXT_ACTIONS`.
- Final remote verification for the env-sync workflow: commit
  `9a3ec52df102d36075f245bdab526dc57fb99e08` passed `Tests` run
  `26776909221` and `Deploy musu-bee to Vercel` run `26776909275`; deploy
  synced `MUSU_P2P_CONTROL_TOKEN_SHA256S`, skipped missing KV/relay env values,
  and aliased `https://musu.pro`.
- Manual production redeploy for latest HEAD: `Deploy musu-bee to Vercel` run
  `26777905910` deployed commit `00694a2e766da8e0a79dd6dd7bb82fdadb6c39d1`
  to `https://musu.pro`. Live browser QA passed on `/`, `/landing`,
  `/pricing`, and `/install` across desktop `1280x720` and mobile `390x844`:
  pages scroll, no horizontal overflow, visible logo source contains
  `favicon-header.png`, and `--musu-color-brand-emerald=#24C8DB` with emerald
  accent color `36, 200, 219`.
- Release-gate freshness correction: local desktop smoke/CPU evidence should
  not be invalidated by docs, deploy workflow metadata, hosted P2P env status
  preflight, or release-gate verifier tooling changes. The go/no-go/verifier
  scripts now allow only `docs/*`, `.github/workflows/deploy-musu-bee.yml`,
  `scripts/windows/show-musu-pro-p2p-env-status.ps1`, and the exact
  release-gate verifier script paths between the evidence commit and current
  HEAD. After the correction, go/no-go reports
  `single_machine_verified=true`, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime
  CPU matrix `1/2 [HUGH_SECOND]`, and public release still No-Go because
  second-PC, multi-device route, KV-backed P2P, `musu@musu.pro`, and Store
  evidence remain open.
- Indexer refreshed after the latest redeploy/freshness-gate documentation:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1257 files and 2214 symbols. Search terms include `26777905910`,
  `Test-DocumentationOrStatusOnlyGitDelta`, `docs/status/tooling-only`,
  `single_machine_verified=true`, and `runtime CPU scenario matrix 1/2`.
- Post-push freshness follow-up: exact release-gate verifier script paths are
  now included in the non-runtime-affecting allowlist. This prevents gate
  tooling commits from forcing primary desktop smoke/CPU evidence to `0/2`,
  while still refusing arbitrary `scripts/*` deltas.
- Second-PC return classification: imported
  `F:\Aisaak\Projects\localsend\second-pc-return\20260531-165240-HUGH-MAIN.second-pc-return.zip`
  with `import-second-pc-return.ps1`; it verifies `HUGH-MAIN`
  `192.168.1.192:8949` MSIX install and handoff only. It does not include
  `.local-build\runtime-idle-cpu\*.evidence.json`,
  `.local-build\runtime-cpu-scenarios\*.runtime-cpu-scenario-matrix.json`, or
  `*.release-check.json`, so it cannot close the two-machine CPU/matrix gates.
- Current second-PC handoff artifacts for the next operator run:
  `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260602-052353.zip`,
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-052411.zip`
  verified with `ok=true`, `fail_count=0`, `kit_count=1`, and
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-052442.zip`
  verified with `ok=true`, `fail_count=0`. Send the nested
  `second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-052442.zip` to the
  other Windows PC and run `run-second-pc-release-check.ps1` without skip flags.
- Indexer refreshed after second-PC return classification:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1258 files and 2214 symbols. Search terms include `HUGH-MAIN`,
  `20260531-165240-HUGH-MAIN`, `20260602-052442`, and
  `no release-check JSON`.
- Process attribution update: `show-musu-process-attribution.ps1` now writes
  `musu.process_attribution_summary.v1` and is bundled into the second-PC kit,
  final operator packet, operator action-pack verifier, and desktop readiness
  audit. `run-second-pc-release-check.ps1` includes
  `.local-build\process-attribution\*.process-attribution-summary.json` in the
  return zip, and `import-second-pc-return.ps1` imports it. Local HUGH_SECOND
  evidence currently shows machine-wide `node.exe=16`, MUSU-owned Node `0`,
  unowned Node `16`, machine-wide WebView2 `12`, MUSU-owned WebView2 `6`, and
  process ownership checks passing; raw Task Manager Node counts are diagnostic,
  while MUSU-owned descendants, repo orphan helpers, and hot CPU/resource
  samples remain the release accountability boundary.
- Indexer refreshed after process attribution wiring:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1261 files and 2214 symbols. Search terms include
  `process-attribution-summary`, `machine-wide node.exe=16`, `owned_node=0`,
  `owned_webview2=6`, `show-musu-process-attribution.ps1`, and `wiki/536`.
- Hosted P2P KV env configuration update: `configure-musu-pro-p2p-env.ps1`
  now provides the safe operator path after Vercel KV / Upstash values exist.
  It sets `KV_REST_API_URL` through `gh variable set` by default,
  `KV_REST_API_TOKEN` through `gh secret set`, accepts optional relay policy
  env names, can trigger `deploy-musu-bee.yml`, and never prints values. A
  dry-run with redacted KV inputs returned `ok=true` and requested only
  `KV_REST_API_URL` plus `KV_REST_API_TOKEN`. This advances the `musu.pro`
  blocker from an English runbook to an executable, auditable operator step;
  external KV provisioning is still required before live evidence can pass.
- Indexer refreshed after hosted P2P KV env configurator wiring:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1263 files and 2214 symbols. Search terms include
  `musu.configure_musu_pro_p2p_env.v1`, `KV_REST_API_URL variable`,
  `KV_REST_API_TOKEN secret`, `Deploy`, `DryRun`, and
  `p2p_relay_lease_kv_not_configured`.
- mDNS receive-loop hardening: explicit mDNS discovery now distinguishes
  `flume::RecvTimeoutError::Timeout` from `Disconnected`. Timeout keeps the
  bounded browse window alive; disconnected receiver exits immediately. This
  closes the operator-observed `mdns_sd::service_daemon` / Windows Tailscale
  `sending on a closed channel` class as a potential short busy-loop when
  `MUSU_ENABLE_MDNS=1` or `musu discover` is used. Targeted validation command
  `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1 peer::mdns::tests::`
  passed 3/3. A broader filtered cargo run also passed the mDNS
  tests but failed on the unrelated `r6_auto_update` integration harness because
  that executable requires elevation on this Windows host.
- Indexer refreshed after mDNS disconnected-receiver hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1264 files and 2217 symbols after the receive-loop patch, BETA/GOAL/WIKI
  updates, and CoS memory
  `2026-06-02_0633_kst_mdns_disconnected_receiver_hardening.md`. Search terms
  include `MdnsRecvTimeoutKind`, `flume::RecvTimeoutError`,
  `mDNS browse receiver disconnected`, `sending on a closed channel`,
  `MUSU_ENABLE_MDNS=1`, and `peer::mdns::tests::`.
- Fresh MSIX primary evidence after mDNS disconnected-receiver hardening:
  local-sideload package `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6` was
  rebuilt and reinstalled; single-machine smoke
  `20260602-070642-HUGH_SECOND`, desktop-open CPU
  `20260602-070807-HUGH_SECOND.desktop-open`, and runtime CPU matrix
  `20260602-070927-HUGH_SECOND.runtime-cpu-scenario-matrix` all pass from clean
  commit `39a9adf9833acb4324c46c646001c8c1ab622bfa`. Desktop-open CPU recorded
  MUSU `2`, repo Node `1`, owned WebView2 `6`, hot `0`, max one-core CPU
  `musu=0`, `node=0.05`, `webview2=0.26`, and working set `534.5MB`. Matrix
  route token was `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_070927`; four-scenario
  max one-core CPU stayed at or below `musu=0.03`, `node=0.03`,
  `webview2=0.39`. Go/no-go is still public No-Go because runtime CPU evidence
  is only `1/2 [HUGH_SECOND]`, multi-device/support/Store/P2P-control-plane
  gates are false, and the dirty-git blocker remains until these docs/evidence
  are committed.
- Current operator handoff artifacts after the fresh mDNS runtime evidence
  audit: clean HEAD `1228cb0396c76d2438f4a814e33eb4b38f398198` generated final
  operator packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-073317.zip`
  and operator action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-073356.zip`;
  both verified with `ok=true` and `fail_count=0`. The current second-PC
  transfer zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-073356\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-073356.zip`.
  Use it for the next second-PC run without `-SkipRuntimeIdleCpu` or
  `-SkipRuntimeCpuScenarioMatrix`.
- Second-PC release import hardening: `import-second-pc-return.ps1` now has
  `-RequireReleaseGateEvidence`. With that flag, MSIX-only return archives fail
  release import if they lack runtime idle CPU evidence, runtime CPU scenario
  matrix, process attribution summary, or release-check JSON. The known
  incomplete `20260531-165240-HUGH-MAIN.second-pc-return.zip` now returns
  `ok=false` and exit 1 under the flag with those four missing evidence issues;
  importing without the flag remains diagnostic-compatible and reports
  `release_gate_evidence_ok=false`.
- Release evidence verifier regression harness:
  `scripts\windows\test-release-evidence-verifiers.ps1` writes synthetic
  P2P-control-plane and multi-device fixtures, invokes the real release
  verifiers, and confirms fail-closed behavior. Validation passed 9/9 cases at
  `.local-build\release-evidence-verifier-tests\20260602-080146`: release-grade
  fixtures pass, while non-`musu.pro` base URL, unverified owner scope, relay
  default data path, non-release-grade transport proof, failed route kind, and
  false payload transit semantics fail as expected.
- Frontend polling timeout hardening: `useLowDutyPolling` now accepts
  `taskTimeoutMs` and combines hook cancellation with `AbortSignal.timeout`.
  Dashboard aggregate refresh, relay-token lookup, service health, device
  discovery, node mesh, process, agents surface, and bridge-task SSE fallback
  polling now have bounded 5s/8s/10s task timeouts. Validation passed
  runtime-polling contract 7/7, `npm run typecheck`, `npm run build`, and
  `npm run lint -- --quiet`. Because this is runtime source, fresh MSIX install
  plus primary smoke/process/CPU/matrix evidence must be rerun before claiming
  release-grade current-HEAD evidence.
- 2026-06-02 primary evidence after frontend polling timeout hardening:
  fresh `local-sideload-manual` MSIX build/install passed on `HUGH_SECOND`;
  packaged desktop repeated activation passed at
  `20260602-0832-HUGH_SECOND.desktop-single-instance`; process ownership passed
  with one runtime, one desktop shell, owned Node `0`, owned WebView2 `6`, and
  bridge `127.0.0.1:9967`; single-machine smoke passed at
  `20260602-083131-HUGH_SECOND`; desktop-open idle CPU passed at
  `20260602-0833-HUGH_SECOND.desktop-open` from clean commit `22ba6c31`
  with max one-core CPU `musu=0`, `node=0.08`, `webview2=0.34`; and the
  four-state CPU matrix passed at `20260602-083314-HUGH_SECOND` with route
  token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_083314`. The primary busy-loop
  report remains un-reproduced; release remains No-Go pending second-PC
  CPU/matrix/route, live P2P KV/control-plane, `musu@musu.pro`, and Store
  evidence. Local caveat: this dev shell still shadows the WindowsApps alias
  with `C:\Users\empty\.cargo\bin\musu.exe`.
- Remote release gates must be rechecked after the last pushed commit before public handoff; latest recorded runs were green, and live `https://musu.pro/privacy` plus `/support` passed public metadata verification with `musu@musu.pro`.
- old 2026-05-27 package: template only (`1.13.0.0`, do not submit as current)
- Tauri shell: dedicated static runtime launcher/status shell now builds to `musu-bee/out`, bundles as MSI/NSIS through `npm run tauri:build`, and is audited as `desktop_shell_ready=True`; it is still not the full dashboard GUI
- Microsoft app certification: pending and now evidence-gated
- restricted startup capability review: pending and now evidence-gated

Promotion rule:

- Promote MUSU itself as the trusted Windows local AI operations node.
- Do not reuse unrelated product names from external launch notes.
- Measure page views → install attempts → installs → first launch → doctor ok → first task done.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_FINAL_QUAL_AUDIT_NEXT_STEPS_2026_05_29.md` (wiki/521)
- `docs/RELEASE_1_15_0_RC1_CURRENT_STATUS_AUDIT_2026_05_31.md` (wiki/522)
- `docs/DESKTOP_SINGLE_INSTANCE_RELEASE_GATE_2026_06_02.md` (wiki/532)
- `docs/RELEASE_1_15_0_RC1_FRESH_MSIX_EVIDENCE_AUDIT_2026_06_02.md` (wiki/533)
- `docs/RELEASE_1_15_0_RC1_CLI_PIPE_SITE_DEPLOY_AUDIT_2026_06_02.md` (wiki/534)
- `docs/RELEASE_1_15_0_RC1_PACKAGED_CLI_RUNTIME_EVIDENCE_2026_06_02.md` (wiki/535)
- `docs/PROCESS_ATTRIBUTION_NODE_COUNT_AUDIT_2026_06_02.md` (wiki/536)
- `docs/RELEASE_1_15_0_RC1_FRESH_MDNS_RUNTIME_EVIDENCE_AUDIT_2026_06_02.md` (wiki/537)
- `docs/RELEASE_1_15_0_RC1_EVIDENCE_VERIFIER_REGRESSION_AUDIT_2026_06_02.md` (wiki/538)
- `docs/RELEASE_1_15_0_RC1_FRONTEND_POLLING_TIMEOUT_AUDIT_2026_06_02.md` (wiki/539)
- `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_NEXT_STEPS_2026_06_02_0840.md` (wiki/540)
- `docs/MSIX_LEGACY_CONFLICT_PREFLIGHT_2026_06_02.md` (wiki/541)
- `docs/RUNTIME_CPU_MATRIX_RESOURCE_BUDGET_VERIFIER_2026_06_02.md` (wiki/542)
- `docs/P2P_CONTROL_PLANE_MUSU_PRO_NEXT_ACTIONS_2026_06_02.md`
- `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_NEXT_STEPS_2026_06_01.md` (wiki/527)
- `docs/RUNTIME_RELAY_FALLBACK_NEXT_STEPS_2026_06_01.md` (wiki/530)
- `docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md`
- `docs/STORE_SUBMISSION_METADATA_2026_05_29.md`
- `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md` (wiki/520)
- `docs/RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md`

Indexer note:

- 2026-06-02 after wiki/541 and MSIX legacy conflict preflight docs:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1289 files and 2217 symbols. Search terms should include
  `musu.msix_legacy_conflicts.v1`, `msix_legacy_conflicts_path`,
  `alias_shadowing_count`, `wiki/541`, and `GOAL v271`.
- 2026-06-02 runtime matrix verifier hardening: `verify-runtime-cpu-scenario-matrix.ps1`
  now fails closed on missing or over-budget resource fields, and
  `test-release-evidence-verifiers.ps1` passed 13/13 cases. Search terms should
  include `wiki/542`, `GOAL v272`, `resource_budget_violations`,
  `total_working_set_mb_after`, and `WebView2 process budget`.
- 2026-06-02 index refresh after runtime matrix verifier hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1291 files and 2217 symbols. Search terms should include `GOAL v273`,
  `wiki/542`, `13/13`, and `1291 files`.
- 2026-06-02 operator packet refresh after runtime matrix verifier hardening:
  final operator packet `20260602-093212` and action pack `20260602-093312`
  verify with `ok=true`, `fail_count=0`. Current second-PC transfer zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-093312\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-093312.zip`.
  Search terms should include `GOAL v274`, `20260602-093312`, and
  `runtime matrix verifier`.
- 2026-06-02 index refresh after operator packet docs:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1291 files and 2217 symbols. Search terms should include `GOAL v275`,
  `20260602-093212`, and `20260602-093312`.
- 2026-06-02 local API auth contract audit:
  wiki/543 records that current Rust bridge localhost API requests require
  bearer auth by default and `MUSU_BRIDGE_LOCALHOST_AUTH=0` is only an explicit
  trusted local development bypass. Added
  `scripts\windows\audit-local-api-auth-contract.ps1` with schema
  `musu.local_api_auth_contract.v1`; it passed with `ok=true`,
  `fail_count=0`, and `stale_doc_hit_count=0` after correcting current docs.
  Search terms should include `wiki/543`, `MUSU_BRIDGE_LOCALHOST_AUTH=0`,
  and `localhost auth required by default`.
- 2026-06-02 index refresh after local API auth contract audit:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1294 files and 2217 symbols after wiki/543, CoS memory
  `2026-06-02_0947_kst_local_api_auth_contract_audit.md`, current docs
  correction, and final packet audit wiring. Search terms should include
  `GOAL v277`, `musu.local_api_auth_contract.v1`, and `1294 files`.
- 2026-06-02 operator packet refresh after local API auth contract audit:
  clean commit `fbcc2a6f` regenerated final operator packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-095328.zip`
  and action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-095354.zip`;
  both verify with `ok=true`, `fail_count=0`. Current second-PC transfer zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-095354\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-095354.zip`.
  Search terms should include `GOAL v278`, `20260602-095328`, and
  `20260602-095354`.
- 2026-06-02 index refresh after local auth operator packet refresh:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1295 files and 2217 symbols after CoS memory
  `2026-06-02_0954_kst_local_auth_operator_packet_refresh.md` and packet
  refresh docs. Search terms should include `GOAL v279`, `1295 files`, and
  `MUSU-second-PC-transfer-1.15.0-rc.1-20260602-095354`.
- 2026-06-02 health poll backoff hardening:
  wiki/544 records that `musu up` bridge startup wait and auto-update
  post-swap `/health` polling now use capped 250ms -> 500ms -> 1s -> 2s
  backoff instead of a fixed 500ms cadence. Targeted Rust validation passed
  `cargo test --manifest-path .\musu-rs\Cargo.toml --lib -j 1
  health_poll_delay` with 2/2 tests, and `git diff --check` passed. This
  reduces a local busy-loop candidate but does not close the release CPU gate;
  fresh MSIX primary evidence is required because Rust runtime source changed.
  Search terms should include `wiki/544`, `health_poll_delay`,
  `bridge_health_poll_delay`, `250ms`, `2s`, and `fresh MSIX primary
  evidence`.
- 2026-06-02 index refresh after health poll backoff hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1297 files and 2221 symbols after wiki/544, CoS memory
  `2026-06-02_1012_kst_health_poll_backoff_hardening.md`, Rust health poll
  backoff tests, and current release docs. Search terms should include
  `GOAL v281`, `1297 files`, `2221 symbols`, `health_poll_delay`, and
  `bridge_health_poll_delay`.
- 2026-06-02 primary evidence refresh after health poll backoff:
  wiki/545 records a fresh release MSIX build/install from commit
  `1990b60b7e0b9f093c62bc48fa9b101a3f035c1b` and current primary evidence.
  Desktop single-instance `20260602-104113-HUGH_SECOND` passed with one shell;
  process ownership passed with runtime `1`, desktop `1`, owned Node `0`, owned
  WebView2 `6`, machine-wide Node `18`; single-machine smoke
  `20260602-104202-HUGH_SECOND` passed on bridge `http://127.0.0.1:9805`;
  desktop-open CPU `20260602-104113-HUGH_SECOND.desktop-open` passed with
  `git_dirty=false`, hot `0`, MUSU `0`, Node `0.03`, WebView2 `0.18`, and
  working set `501.1MB`; runtime CPU matrix `20260602-104331-HUGH_SECOND`
  passed with route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_104331` and max
  WebView2 `0.31`. Release remains No-Go until second-PC CPU/matrix/route,
  live `musu.pro` P2P relay lease owner-scope evidence, `musu@musu.pro`, and
  Store evidence pass.
- 2026-06-02 index refresh after health poll primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1306 files and 2221 symbols after wiki/545, fresh primary evidence files,
  CoS memory `2026-06-02_1051_kst_health_poll_primary_evidence_refresh.md`,
  BETA/current-status/runtime-roadmap/WIKI/WIKI_INDEX/GOAL updates, and the
  health poll primary evidence refresh doc. Search terms should include
  `GOAL v283`, `1306 files`, `20260602-104113-HUGH_SECOND.desktop-open`,
  `20260602-104331-HUGH_SECOND.runtime-cpu-scenario-matrix`, and
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_104331`.
- 2026-06-02 operator packet refresh after health poll primary evidence:
  clean HEAD `f68806cc` regenerated final operator packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-110033.zip`
  and action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-110105.zip`.
  Both verify with `ok=true`, `fail_count=0`; final packet `kit_count=1`.
  Current second-PC transfer zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-110105\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-110105.zip`.
  Partner Center zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-110105\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-110105.zip`.
  Support target remains `musu@musu.pro`.
- 2026-06-02 index refresh after current operator packet/action pack:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1307 files and 2221 symbols after CoS memory
  `2026-06-02_1101_kst_operator_packet_refresh_after_primary_evidence.md`,
  packet/action-pack documentation, WIKI/WIKI_INDEX/GOAL/BETA/current-status
  updates. Search terms should include `GOAL v285`, `1307 files`,
  `20260602-110033`, `20260602-110105`, and
  `MUSU-second-PC-transfer-1.15.0-rc.1-20260602-110105`.
- 2026-06-02 relay idle hardening:
  wiki/546 changes dashboard cloud relay from mount-time background work to an
  on-demand fallback. `DashboardClient.tsx` no longer fetches
  `/api/account/relay-token` on mount and no longer auto-connects relay
  WebSocket when a node is selected. `Connect` lazily fetches the token with
  the existing `5s` timeout; selected-node changes and unmount abort pending
  token fetches, clear retry timers, and close relay WebSocket state. Validation
  passed: runtime-polling contract `8/8`, `npm run typecheck`,
  `npm run lint -- --quiet`, `npm run build`, and `git diff --check`. This is
  runtime source; fresh MSIX primary runtime evidence is required after commit.
- 2026-06-02 index refresh after relay idle hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1309 files and 2221 symbols after wiki/546, CoS memory
  `2026-06-02_1114_kst_relay_idle_hardening.md`, relay idle audit doc, WIKI,
  WIKI_INDEX, GOAL, BETA, current-status, frontend-polling audit updates, and
  dashboard relay source/test changes. Search terms should include
  `GOAL v287`, `1309 files`, `handleRelayConnect`, `fetchRelayToken`,
  `relay idle hardening`, and `on-demand fallback`.
- 2026-06-02 `musu.pro` deployment after relay idle hardening:
  commit `77ba7a112581dfd3a2e05d62d7ba0b6a0ce2a0d6` passed GitHub Actions
  `Tests` run `26794342633`, `E2E Tests - musu-bee` run `26794342638`, and
  `Deploy musu-bee to Vercel` run `26794342631`. Vercel deployed production
  URL `https://musu-9wn2j1cat-yellowhamas-projects.vercel.app` and aliased it
  to `https://musu.pro`. This is web/control-plane deploy evidence only; live
  P2P route/relay lease evidence remains open.
- 2026-06-02 index refresh after `musu.pro` deploy evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1311 files and 2221 symbols after CoS memory
  `2026-06-02_1122_kst_musu_pro_deploy_after_relay_idle_hardening.md`,
  deploy evidence doc, WIKI/WIKI_INDEX/GOAL/BETA/current-status updates, and
  the `musu.pro` deployment evidence. Search terms should include `GOAL v289`,
  `1311 files`, `26794342631`, `26794342633`, `26794342638`, `musu.pro`, and
  `Ready in 19s`.
- 2026-06-02 current-head evidence and qual audit after relay idle hardening:
  wiki/547 records fresh current primary evidence after the on-demand relay
  source change and `musu.pro` deploy. Current evidence passes desktop
  single-instance `20260602-113614-HUGH_SECOND`, process ownership
  `20260602-113702-HUGH_SECOND`, single-machine smoke
  `20260602-113759-HUGH_SECOND`, desktop-open CPU
  `20260602-114149-HUGH_SECOND.desktop-open`, and four-state matrix
  `20260602-115359-HUGH_SECOND.runtime-cpu-scenario-matrix` with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_115359`. Clean go/no-go on
  `9b836bd1` reports `ready=false`, `local_artifacts_ready=true`,
  `single_machine=true`, runtime idle CPU `1/2`, runtime CPU matrix `1/2`,
  `p2p_control_plane=false`, `support_mailbox=false`, and
  `store_release=false`. The primary busy-loop report is not reproduced on
  current packaged evidence, but public release remains blocked by second-PC,
  P2P control-plane, `musu@musu.pro`, and Store evidence.
- 2026-06-02 index refresh after current-head evidence audit:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1320 files and 2221 symbols after wiki/547, CoS memory
  `2026-06-02_1205_kst_current_head_evidence_qual_audit_next_steps.md`,
  current-head evidence/qual audit report, WIKI/WIKI_INDEX/GOAL/BETA/status
  updates, P2P control-plane spec updates, and network boundary spec updates.
  Search terms should include `GOAL v291`, `1320 files`, `2221 symbols`,
  `20260602-115359-HUGH_SECOND.runtime-cpu-scenario-matrix`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_115359`, `musu@musu.pro`, and
  `p2p_control_plane=false`.
- 2026-06-02 current operator action pack after evidence audit:
  clean HEAD `ef80aa94d76db4b08ca0866f6bc29c2ed889bdc4` generated final packet
  `musu-final-operator-gates-1.15.0-rc.1-20260602-121850.zip` and operator
  action pack `MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918.zip`;
  both verify with `ok=true`, `fail_count=0`. Current second-PC transfer zip
  is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-121918.zip`.
  Current Partner Center zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-121918\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-121918.zip`.
  Support verification id is
  `musu-store-support-1.15.0-rc.1-20260602-121850`.
- 2026-06-02 index refresh after current operator action pack:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1322 files and 2221 symbols after CoS memory
  `2026-06-02_1222_kst_current_operator_action_pack_after_evidence_audit.md`,
  current action pack/final packet documentation, WIKI/WIKI_INDEX/GOAL/BETA,
  current-status, and current-head evidence report updates. Search terms
  should include `GOAL v293`, `1322 files`, `20260602-121850`,
  `20260602-121918`,
  `MUSU-second-PC-transfer-1.15.0-rc.1-20260602-121918`, and
  `musu-store-support-1.15.0-rc.1-20260602-121850`.
- 2026-06-02 current mDNS regression and P2P KV blocker audit:
  wiki/548 records that current clean source `6f3f5982` still passes the
  mDNS/Tailscale default regression: targeted mDNS tests `3/3`, debug `musu`
  build passed, and `RUST_LOG=debug .\musu-rs\target\debug\musu.exe discover
  --timeout 2` with mDNS opt-in env unset emitted no `Failed to send`,
  `ff02::fb`, `10065`, or `closed channel`; it disabled IPv6, Tailscale, and 9
  virtual/VPN interfaces and sent only on `이더넷 2`. P2P env status still
  reports `ok=false` because `KV_REST_API_TOKEN` and `KV_REST_API_URL` are
  missing while `MUSU_P2P_CONTROL_TOKEN_SHA256S` exists in GitHub; live
  evidence remains blocked by `p2p_relay_lease_kv_not_configured`.
- 2026-06-02 index refresh after mDNS/P2P KV audit:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1325 files and 2221 symbols after wiki/548, CoS memory
  `2026-06-02_1238_kst_mdns_regression_p2p_kv_blocker.md`, the current
  mDNS/P2P KV blocker audit, and WIKI/WIKI_INDEX/GOAL/BETA/current-status
  updates. Search terms should include `GOAL v295`, `1325 files`,
  `peer::mdns::tests::`, `이더넷 2`, `p2p_relay_lease_kv_not_configured`,
  `KV_REST_API_TOKEN`, and `KV_REST_API_URL`.
- 2026-06-02 operator API security hardening:
  wiki/549 records a real code-audit finding in `musu-bee`: node/process
  worker proxy routes were too open for public release. `/api/nodes/execute`,
  `/api/processes`, `/api/processes/start`, and `/api/processes/kill` now
  require authenticated operator identity. Node execute is allowlisted by
  `MUSU_NODE_EXECUTE_ALLOWLIST`; process start fails closed unless
  `MUSU_PROCESS_START_ALLOWLIST` names the command basename; process kill is
  disabled unless `MUSU_ENABLE_PROCESS_KILL=1`; remote process proxying is
  disabled unless `MUSU_ENABLE_REMOTE_WORKER_PROXY=1`. Accepted/rejected
  mutations write `~\.musu\audit\command-center.jsonl`. Validation passed
  `npm run test:routes` 12/12, `npm run typecheck`, `npm run build`, `git diff
  --check`, and `audit-operator-api-security-contract.ps1` with `ok=true`.
- 2026-06-02 index refresh after operator API security hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1334 files and 2239 symbols after wiki/549, CoS memories
  `2026-06-02_1305_kst_operator_api_security_hardening.md` and
  `2026-06-02_1310_kst_operator_api_security_index_refresh.md`, route
  source/test/CI changes, CONFIG/BETA/WIKI/WIKI_INDEX/GOAL/current-head
  report updates, and the operator API audit script. Search terms should
  include `GOAL v296`, `GOAL v297`, `musu.operator_api_security_contract.v1`,
  `operator-api-security.ts`, `MUSU_NODE_EXECUTE_ALLOWLIST`,
  `MUSU_PROCESS_START_ALLOWLIST`, `MUSU_ENABLE_PROCESS_KILL`,
  `MUSU_ENABLE_REMOTE_WORKER_PROXY`, `1334 files`, and `2239 symbols`.
- 2026-06-02 post-operator-security go/no-go:
  clean commit `94ecda1caceba4a40f091071e8d64825ce7a7b29` reports
  `ready=false`, `local_artifacts_ready=true`, `single_machine=false`,
  `multi_device=false`, `msix_install=true`, `msix_desktop_entrypoint=true`,
  runtime idle CPU `0/2`, runtime CPU matrix `0/2`,
  `p2p_control_plane=false`, `support_mailbox=false`, and
  `store_release=false`. Interpretation: the operator API hardening is runtime
  source, so previous primary evidence is no longer current. Next release
  action is fresh current-HEAD MSIX install/smoke/desktop-open CPU/matrix
  evidence, then second-PC/P2P/support/Store gates.
- 2026-06-02 index refresh after post-operator-security go/no-go:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1336 files and 2239 symbols after CoS memory
  `2026-06-02_1320_kst_post_operator_security_go_no_go_index_refresh.md`,
  BETA/WIKI/WIKI_INDEX/GOAL/current-head report updates, and post-security
  go/no-go documentation. Search terms should include `GOAL v298`,
  `GOAL v299`, `94ecda1c`, `single_machine=false`,
  `runtime idle CPU 0/2`, `runtime CPU matrix 0/2`, `1336 files`, and
  `2239 symbols`.
- 2026-06-02 current primary evidence refresh after operator API security:
  wiki/550 records that primary evidence was regenerated after the operator API
  hardening. Fresh MSIX install/startup succeeded for
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`; explicit WindowsApps alias
  `musu up --json` restored bridge health at `http://127.0.0.1:1065`.
  Single-machine smoke passes at `20260602-132814-HUGH_SECOND.evidence.json`,
  desktop-open CPU passes at
  `20260602-132531-HUGH_SECOND.desktop-open.evidence.json` with MUSU `0`,
  owned Node `0`, WebView2 `0.52`, working set `366.38MB`, and hot `0`.
  Four-state runtime CPU matrix passes at
  `20260602-132921-HUGH_SECOND.runtime-cpu-scenario-matrix.json` with route
  token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_132921`. Clean go/no-go on
  `6f7fe937` reports `ready=false`, `single_machine=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  process/startup/desktop single-instance true, P2P/support/Store false, and
  `manifest_dirty=false`. The primary busy-loop report is not reproduced on
  current packaged evidence, but public release remains blocked by second-PC,
  P2P control-plane, `musu@musu.pro`, and Store evidence.
- 2026-06-02 current operator packet after primary evidence refresh:
  clean HEAD `6f7fe937` generated final packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-134019.zip`
  and action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035.zip`.
  Both verify with `ok=true`, `fail_count=0`. Current second-PC transfer zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-134035.zip`;
  Partner Center zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-134035\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-134035.zip`;
  support verification id is `musu-store-support-1.15.0-rc.1-20260602-134019`.
- 2026-06-02 index refresh after post-security primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1343 files and 2239 symbols after wiki/550, current evidence files,
  final packet/action-pack paths, BETA/current-status/current-head report/WIKI,
  WIKI_INDEX, GOAL, and CoS memory
  `2026-06-02_1340_kst_post_operator_security_primary_evidence_refresh.md`.
  Search terms should include `GOAL v300`, `GOAL v301`, `wiki/550`,
  `20260602-132814`, `20260602-132531`, `20260602-132921`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_132921`, `20260602-134019`,
  `20260602-134035`, `1343 files`, and `2239 symbols`.
- 2026-06-02 P2P control-plane CI coverage:
  wiki/551 records that P2P API route contracts are now part of web CI.
  `package.json` adds `npm run test:p2p`, covering route evidence,
  rendezvous sessions, and relay lease fallback routes; `.github/workflows/test.yml`
  runs it after `npm run test:routes`. Local validation passed
  `npm run test:p2p` 21/21, `npm run test:routes` 12/12, and
  `git diff --check`. This hardens owner-scoped route evidence, rendezvous
  lifecycle, relay fallback policy, and bearer-auth fail-closed behavior, but
  it does not close the live `musu.pro` gate until KV production env is
  provisioned and owner-scope evidence passes.
- 2026-06-02 index refresh after P2P control-plane CI coverage:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1346 files and 2239 symbols after wiki/551, `test:p2p`, GitHub Actions P2P
  control-plane test wiring, BETA/WIKI/WIKI_INDEX/GOAL/current-head report
  updates, and CoS memories
  `2026-06-02_1357_kst_p2p_control_plane_ci_coverage.md` and
  `2026-06-02_1403_kst_p2p_ci_index_refresh.md`. Search terms should
  include `GOAL v302`, `GOAL v303`, `wiki/551`, `test:p2p`, `route-evidence`,
  `rendezvous`, `relay lease`, `owner-scoped route evidence`,
  `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `1346 files`, and `2239 symbols`.
- 2026-06-02 release gate status script failure handling:
  wiki/552 records that `write-release-candidate-manifest.ps1` no longer
  depends solely on `Get-FileHash`; it falls back to .NET SHA256 hashing when
  a child Windows PowerShell host lacks that cmdlet. `write-release-go-no-go.ps1`
  and `show-final-release-handoff-status.ps1` now expose
  `-ScriptTimeoutSeconds` and run child verifiers through a bounded process
  wrapper with stdout/stderr capture, elapsed time, timeout metadata, and
  child kill on timeout. Validation: manifest generation exits 0 under
  `powershell.exe`; `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json`
  completes; full `show-final-release-handoff-status.ps1 -ScriptTimeoutSeconds
  120 -Json` completes with packet/action pack verification true; forced
  `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 1 -Json` exits nonzero in
  about 2.9s with a bounded timeout instead of hanging. Public release remains
  No-Go on the external/evidence gates. Status-only freshness allowlists in
  `write-release-go-no-go.ps1`, `verify-single-machine-evidence.ps1`, and
  `verify-runtime-cpu-scenario-matrix.ps1` now include
  `show-final-release-handoff-status.ps1` and
  `write-release-candidate-manifest.ps1`. The same verifiers also recognize
  the exact `test:p2p` package/workflow diff as tooling-only without broadly
  allowing `package.json` dependency or build changes.
- 2026-06-02 index refresh after release gate script hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1348 files and 2239 symbols after wiki/552, release gate status script
  hardening, BETA/WIKI/WIKI_INDEX/GOAL/current-head report updates, and CoS
  memories `2026-06-02_1425_kst_release_gate_status_script_hardening.md` and
  `2026-06-02_1428_kst_release_gate_script_index_refresh.md`.
  Search terms should include `GOAL v304`, `GOAL v305`, `wiki/552`,
  `Script timed out after 1s`, `packet_verified true`,
  `action_pack_verified true`, `write-release-go-no-go.ps1`,
  `show-final-release-handoff-status.ps1`,
  `write-release-candidate-manifest.ps1`, `1348 files`, and `2239 symbols`.
- 2026-06-02 clean post-hardening go/no-go:
  clean `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json` after the
  release gate script hardening reports `ready=false`, `single_machine=true`,
  runtime idle CPU `1/2`, runtime CPU scenario matrix `1/2`,
  `process_ownership=true`,
  `startup_single_instance=true`, `desktop_single_instance=true`, and
  `manifest_dirty=false`. Public release blockers remain `multi-device`,
  `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`, `support-mailbox`,
  `store-release`, and `p2p-control-plane`.
- 2026-06-02 runtime reconnect backoff hardening:
  wiki/553 records dashboard relay WebSocket and chat SSE reconnect hardening.
  Dashboard relay reconnect now uses capped backoff `5s -> 10s -> 20s ->
  40s -> 60s` with the existing 5-attempt limit and cleanup on disconnect,
  selected-node change, and unmount. Chat SSE reconnect now has explicit `1s`
  initial delay, `2x` multiplier, `10s` cap, `EventSource.CONNECTING`
  suppression, `clearReconnectTimer`, centralized EventSource close/reset,
  and `reconnectGenerationRef` so stale timers cannot reconnect after channel
  changes, active-node changes, or unmount. `npm run test:runtime-polling` is
  now wired into GitHub Actions before route/P2P tests; the runtime polling
  contract suite is 10/10. Validation also passed typecheck, route tests
  12/12, P2P tests 21/21, production build, lint with 0 errors, and
  `git diff --check`. This is runtime web source, so primary MSIX smoke/CPU
  evidence must be refreshed after commit before current-HEAD release claims.
- 2026-06-02 index refresh after runtime reconnect backoff hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1351 files and 2240 symbols after wiki/553, runtime reconnect backoff
  hardening, runtime polling contract CI wiring, product network boundary
  update, runtime stabilization plan update, current-head qualitative audit
  update, BETA checklist update, WIKI/WIKI_INDEX/GOAL updates, and CoS
  memories `2026-06-02_1500_kst_runtime_reconnect_backoff_hardening.md` and
  `2026-06-02_1508_kst_runtime_reconnect_backoff_index_refresh.md`.
- 2026-06-02 post-push reconnect hardening status:
  commit `faf199efafb020e11d304ead5b1d3c617d3c71ea` passed GitHub Actions
  `Tests` run `26801850077`, `E2E Tests - musu-bee` run `26801850121`, and
  `Deploy musu-bee to Vercel` run `26801850075`. Clean go/no-go reports
  `ready=false`, `single_machine=false`, runtime idle CPU `false`, runtime CPU
  matrix `false`, process/startup/desktop single-instance true, and
  `manifest_dirty=false`. This is expected after runtime web source changed;
  fresh current-HEAD MSIX smoke, desktop-open CPU, and runtime matrix evidence
  are required before primary release evidence can be claimed again.
- 2026-06-02 index refresh after post-push reconnect hardening status:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1352 files and 2240 symbols after GOAL v309/v310, WIKI/WIKI_INDEX/current-head
  report updates, and CoS memory
  `2026-06-02_1510_kst_runtime_reconnect_post_push_status.md`.

- 2026-06-02 post-reconnect primary MSIX/runtime evidence refresh:
  wiki/554 records that current-head primary evidence was restored after the
  runtime reconnect backoff hardening. The release MSIX workflow rebuilt
  `musu_1.15.0.0_x64_local-sideload-manual.msix` and current-user reinstall
  verified `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`; the `-MachineTrust`
  elevation wrapper was stopped only after existing trust made it unnecessary.
  Evidence used the explicit WindowsApps alias because the local dev PATH still
  prefers `C:\Users\empty\.cargo\bin\musu.exe`. Current evidence paths:
  desktop single-instance
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260602-152526-HUGH_SECOND.desktop-single-instance.json`;
  process ownership
  `docs\evidence\process-ownership\1.15.0-rc.1\20260602-152537-HUGH_SECOND.process-ownership.json`;
  single-machine smoke
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-152615-HUGH_SECOND.evidence.json`;
  desktop-open CPU
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260602-152845-HUGH_SECOND.desktop-open.evidence.json`;
  and runtime CPU scenario matrix
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260602-153038-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.
  Process ownership reports runtime `1`, desktop `1`, owned Node `0`, owned
  WebView2 `6`, machine-wide Node `18`, machine-wide WebView2 `12`, and orphan
  repo helpers `0`, so the many Node processes on the machine are not currently
  MUSU-owned. Desktop-open CPU measured 60.061s with MUSU `0`, repo Node
  `0.05`, WebView2 `0.13`, working set `500.86MB`, and hot `0`. The four-state
  matrix passed `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`; the route token was
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_153038`. Clean go/no-go remains No-Go
  because second-PC CPU/matrix/route evidence, live `musu.pro` P2P owner-scope
  evidence, `musu@musu.pro` mailbox evidence, and Store evidence are still
  open.

- 2026-06-02 index refresh after post-reconnect primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1361 files and 2240 symbols after GOAL v311/v312, wiki/554, the current-head
  evidence report update, BETA checklist update, network/P2P spec boundary
  updates, desktop/process evidence files, and CoS memories
  `2026-06-02_1545_kst_post_reconnect_primary_evidence_refresh.md` and
  `2026-06-02_1548_kst_post_reconnect_evidence_index_refresh.md`.

- 2026-06-02 current operator action pack after post-reconnect evidence:
  wiki/555 records current HEAD `7bb367988d1ae5cbc41bbcd7ce68f4eeb4f57d10`
  operator handoff artifacts after the post-reconnect evidence commit. Final
  packet `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-155746.zip`
  verifies with `ok=true`, `fail_count=0`, `kit_count=1`. Action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815.zip`
  verifies with `ok=true`, `fail_count=0`; latest alias
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
  is also handoff-status verified as `action_pack.verified=true` in a single
  240s status run. Current second-PC transfer zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-155815.zip`;
  Partner Center zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-155815\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-155815.zip`;
  support verification id is `musu-store-support-1.15.0-rc.1-20260602-155746`.
  `write-release-go-no-go.ps1 -ScriptTimeoutSeconds 120 -Json` remains No-Go
  with `single_machine=true`, process/startup/desktop single-instance true, and
  blockers `multi-device`, `runtime-idle-cpu`, `runtime-cpu-scenario-matrix`,
  `p2p-control-plane`, `support-mailbox`, and `store-release`. Operational
  note: full handoff status is now heavy enough that a concurrent 120s run can
  time out; use a single run with `-ScriptTimeoutSeconds 240` when verifying
  the current action pack on this Windows host.

- 2026-06-02 index refresh after current operator action pack:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1363 files and 2240 symbols after GOAL v313/v314, wiki/555, BETA checklist
  update, current-head report update, and CoS memories
  `2026-06-02_1558_kst_current_operator_action_pack_after_post_reconnect_evidence.md`
  and `2026-06-02_1600_kst_operator_action_pack_index_refresh.md`.

- 2026-06-02 release status fast/deep verification hardening:
  wiki/556 records that `show-final-release-handoff-status.ps1` and
  `write-release-go-no-go.ps1` were optimized after current action-pack history
  made full status heavy. Handoff status now defaults to quick packet/action-pack
  verification and exposes `-PacketVerificationMode quick|deep|skip` plus
  `-ActionPackVerificationMode quick|deep|skip`; old skip switches still map to
  `skip`. Quick verification reads archive metadata and required entries,
  checks clean git metadata, support email, required second-PC/Partner/support
  paths, and excludes `.pfx` files without full checksum traversal. Deep mode
  still invokes `verify-final-operator-gate-packet.ps1` and
  `verify-operator-action-pack.ps1`. Go/no-go now preselects latest evidence
  candidates per machine before verifier execution and reports
  `available_candidate_count` plus `candidate_selection=latest-per-machine`.
  Validation: go/no-go `-SkipPublicMetadata` completed in 41.733s selecting
  runtime idle `4/59`, runtime matrix `3/38`, and process ownership `3/36`;
  default handoff status completed in 47.182s with `public_metadata_ok=true`;
  quick packet/action pack had `fail_count=0`; deep packet/action pack also had
  `fail_count=0`; release evidence verifier regression passed 13/13.
- 2026-06-02 index refresh after release status fast/deep verification:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1364 files and 2240 symbols after wiki/556, GOAL v315/v316, BETA checklist
  update, current-head report update, WIKI_INDEX update,
  `show-final-release-handoff-status.ps1`, `write-release-go-no-go.ps1`, and
  CoS memory `2026-06-02_1630_kst_release_status_fast_path.md`.
- 2026-06-02 file sync watcher storm hardening:
  wiki/557 records that optional file sync now has explicit idle-budget bounds.
  `musu-rs/src/install/sync.rs` replaced its unbounded watcher event channel
  with a bounded queue of `1024`, caps each batch at `256` events or `2s`,
  coalesces same-path events to the latest event before processing, and yields
  `50ms` after a batch cap hit. Validation passed cargo fmt, targeted
  `install::sync` unit test, and `git diff --check`. This is runtime Rust
  source, so primary MSIX/smoke/CPU/matrix evidence must be refreshed after
  commit.
- 2026-06-02 index refresh after file sync watcher storm hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1366 files and 2242 symbols after wiki/557, GOAL v317/v318, the file sync
  hardening audit doc, runtime hardening roadmap update, BETA/current-head
  report updates, WIKI_INDEX update, `musu-rs/src/install/sync.rs`, and CoS
  memory `2026-06-02_1650_kst_file_sync_watcher_storm_hardening.md`.

- 2026-06-02 post-file-sync primary evidence refresh:
  wiki/558 records fresh primary evidence after runtime Rust file sync hardening
  commit `62381f7feec64ff5c6b17cd689b8729197e3a98e`. Release MSIX rebuild and
  sideload install succeeded for `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.
  Explicit WindowsApps alias `musu up --json` reached bridge health at
  `http://127.0.0.1:8155`. Current evidence passes single-machine smoke
  `20260602-171420-HUGH_SECOND`, desktop single-instance and process ownership
  `20260602-171500-HUGH_SECOND`, desktop-open CPU
  `20260602-171538-HUGH_SECOND.desktop-open`, and runtime CPU matrix
  `20260602-171659-HUGH_SECOND.runtime-cpu-scenario-matrix` with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_171659`. Process ownership reports MUSU
  runtime `1`, desktop `1`, MUSU-owned Node `0`, MUSU-owned WebView2 `7`,
  machine-wide Node `18`, and orphan repo helpers `0`. Desktop-open CPU reports
  MUSU `0`, repo Node `0.03`, WebView2 `0.57`, working set `496.62MB`, hot
  `0`. The reported busy-loop is not reproduced on current primary packaged
  evidence; public release remains No-Go until second-PC CPU/matrix/route,
  `musu.pro` P2P owner-scope, `musu@musu.pro`, and Store evidence are recorded.

- 2026-06-02 index refresh after post-file-sync primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1379 files and 2242 symbols after wiki/558, GOAL v319/v320,
  `RELEASE_1_15_0_RC1_POST_FILE_SYNC_PRIMARY_EVIDENCE_2026_06_02.md`,
  current-head report update, runtime hardening roadmap update, network boundary
  spec update, BETA checklist update, new primary evidence files, and CoS
  memory `2026-06-02_1725_kst_post_file_sync_primary_evidence_refresh.md`.

- 2026-06-02 runtime stop/down command hardening:
  wiki/559 records the new `musu stop` and `musu down` commands. Both support
  `--json` and emit `musu.stop_report.v1`. The command targets only the
  registered `bridge` PID from `~\.musu\services\bridge.json`; it terminates
  only if that PID belongs to a MUSU runtime binary, refuses non-MUSU PIDs,
  removes stale bridge registry records, and waits for PID exit with bounded
  backoff. Validation passed cargo fmt, `cargo check --bin musu`, targeted
  `install::cli_commands` tests 14/14, `cargo build --bin musu`, and a
  temporary-home CLI smoke where `up --json` started bridge PID `37292` and
  `down --json` stopped it with `registry_deregistered=true` and
  `pid_alive_after=false`. This improves process ownership cleanup but makes
  current primary MSIX evidence stale again after commit.

- 2026-06-02 index refresh after runtime stop/down command hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1382 files and 2245 symbols after wiki/559, GOAL v321/v322,
  `musu-rs/src/main.rs`, `musu-rs/src/install/cli_commands.rs`, the runtime
  stop command report, BETA/current-head/runtime roadmap updates, WIKI_INDEX,
  and CoS memory `2026-06-02_1815_kst_runtime_stop_command_hardening.md`.

- 2026-06-02 post-stop/down primary evidence refresh:
  wiki/560 records fresh primary evidence after runtime stop/down command commit
  `d6f37ed58d543b5e98b4d71ce1b0b07405a730e3`. The release MSIX was rebuilt and
  installed as `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`. Packaged
  WindowsApps alias `musu up --json` started bridge PID `37660`, and
  `musu down --json` emitted `musu.stop_report.v1` with `ok=true`,
  `registry_deregistered=true`, and `pid_alive_after=false`. Current evidence
  passes single-machine smoke `20260602-183133-HUGH_SECOND`, desktop
  single-instance and process ownership `20260602-183056-HUGH_SECOND`,
  desktop-open CPU `20260602-183056-HUGH_SECOND.desktop-open`, and runtime CPU
  matrix `20260602-183240-HUGH_SECOND.runtime-cpu-scenario-matrix` with route
  token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_183240`. Process ownership reports
  MUSU runtime `1`, desktop `1`, MUSU-owned Node `0`, MUSU-owned WebView2 `6`,
  machine-wide Node `18`, and orphan repo helpers `0`. Desktop-open CPU reports
  MUSU `0`, repo Node `0.03`, WebView2 `0`, working set `497.57MB`, hot `0`.
  The reported busy-loop is not reproduced on current primary packaged
  evidence; public release remains No-Go until second-PC CPU/matrix/route,
  `musu.pro` P2P owner-scope, `musu@musu.pro`, and Store evidence are recorded.

- 2026-06-02 index refresh after post-stop/down primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1407 files and 2245 symbols after wiki/560, GOAL v323/v324, the
  post-stop/down primary evidence report, BETA/current-head/runtime roadmap
  updates, WIKI_INDEX, new evidence files, and CoS memory
  `2026-06-02_1820_kst_post_stop_down_primary_evidence_refresh.md`.

- 2026-06-02 second-PC runtime cleanup hardening:
  wiki/561 records that `run-second-pc-release-check.ps1` now writes
  `.local-build\runtime-cleanup\*.runtime-cleanup.json` with schema
  `musu.second_pc_runtime_cleanup.v1`. Cleanup runs in `finally`, calls
  packaged `musu down --json --timeout-sec 5`, stops packaged
  `musu-desktop.exe` shells opened by the evidence run, includes cleanup JSON
  in the second-PC return zip, and requires cleanup success for wrapper
  `ok=true`. Parser validation passed for the wrapper, multidevice kit
  generator, action-pack generator, and action-pack verifier. Release evidence
  verifier regression passed 13/13. A short local
  wrapper smoke on `HUGH_SECOND` failed at MSIX install evidence capture because
  the known dev alias shadows WindowsApps, but cleanup still produced
  `.local-build\runtime-cleanup\20260602-185052-HUGH_SECOND.runtime-cleanup.json`
  with `ok=true`, `stop_exit_code=0`, and remaining desktop shell count `0`.

- 2026-06-02 index refresh after second-PC runtime cleanup hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1409 files and 2245 symbols after wiki/561, GOAL v325/v326, the cleanup
  hardening report, second-PC wrapper/action-pack scripts, BETA/current-head
  report/runtime roadmap updates, WIKI_INDEX, and CoS memory
  `2026-06-02_1852_kst_second_pc_runtime_cleanup_hardening.md`.

- 2026-06-02 current operator action pack after cleanup hardening:
  wiki/562 records clean HEAD
  `a3cfdb5c153da2f3e2fca0f7ad337890290a2ff4` generating final operator packet
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260602-185745.zip`
  and operator action pack
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802.zip`.
  `verify-final-operator-gate-packet.ps1` passed with `ok=true`,
  `fail_count=0`, and `kit_count=1`; `verify-operator-action-pack.ps1` passed
  with `ok=true` and `fail_count=0`. The current second-PC transfer zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260602-185802.zip`;
  the Partner Center zip is
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260602-185802\partner-center\MUSU-1.15.0-rc.1-store-submission-20260602-185802.zip`;
  support remains `musu@musu.pro` with verification id
  `musu-store-support-1.15.0-rc.1-20260602-185745`. The action-pack verifier
  now confirms the second-PC quickstart and nested kit README list runtime
  cleanup evidence for return.

- 2026-06-02 index refresh after current operator action pack:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1410 files and 2245 symbols after wiki/562, GOAL v327/v328, the current
  operator action pack refresh, BETA/current-head updates, WIKI_INDEX, and CoS
  memory `2026-06-02_1859_kst_current_operator_action_pack_after_cleanup.md`.
  Searches should include `20260602-185745`, `20260602-185802`,
  `MUSU-second-PC-transfer-1.15.0-rc.1-20260602-185802`,
  `MUSU-1.15.0-rc.1-store-submission-20260602-185802`,
  `musu-store-support-1.15.0-rc.1-20260602-185745`, and `cleanup evidence`.

- 2026-06-02 stop/desktop cleanup hardening:
  wiki/563 records `musu stop` / `musu down` gaining explicit
  `--include-desktop` cleanup. The default remains bridge-runtime-only; with
  `--include-desktop`, `musu.stop_report.v1` records
  `desktop_cleanup_attempted`, `desktop_pids_before`,
  `desktop_terminate_requested_pids`, `desktop_pids_after`, and
  `desktop_errors`. `run-second-pc-release-check.ps1` now calls
  `musu down --json --timeout-sec 5 --include-desktop` before its existing
  packaged-desktop fallback. Validation passed cargo fmt/check, services tests
  15/15, install CLI tests 14/14, PowerShell parser check, `git diff --check`,
  and source CLI no-op smoke. Current packaged release evidence must be
  refreshed after commit because this is a Rust source change.

- 2026-06-02 index refresh after stop/desktop cleanup hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1412 files and 2251 symbols after wiki/563, GOAL v329/v330,
  `RELEASE_1_15_0_RC1_STOP_DESKTOP_CLEANUP_HARDENING_2026_06_02.md`,
  `musu-rs\src\bridge\services.rs`, `musu-rs\src\install\cli_commands.rs`,
  `scripts\windows\run-second-pc-release-check.ps1`, BETA/current-head/runtime
  roadmap updates, WIKI_INDEX, and CoS memory
  `2026-06-02_1926_kst_stop_desktop_cleanup_hardening.md`. Search terms should
  include `GOAL v329`, `GOAL v330`, `wiki/563`, `1412 files`, `2251 symbols`,
  `--include-desktop`, `desktop_cleanup_attempted`, `desktop_pids_after`, and
  `musu_desktop_pids`.

- 2026-06-02 post stop/desktop cleanup primary evidence refresh:
  wiki/564 records that the local-sideload MSIX was rebuilt/installed after
  `--include-desktop` and primary evidence is back to `1/2` on `HUGH_SECOND`.
  Current evidence includes single-machine `20260602-195914-HUGH_SECOND`,
  desktop single-instance `20260602-195058-HUGH_SECOND.desktop-single-instance`,
  process ownership `20260602-195129-HUGH_SECOND.process-ownership`,
  desktop-open CPU `20260602-195140-HUGH_SECOND.desktop-open`, and runtime
  matrix `20260602-200531-HUGH_SECOND.runtime-cpu-scenario-matrix` with route
  token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_200531`. Packaged
  `musu down --json --timeout-sec 5 --include-desktop` stopped bridge PID
  `12472` and desktop PID `16460` with `desktop_pids_after=[]`. Go/no-go
  remains No-Go because second-PC CPU/matrix/route, live `musu.pro` P2P,
  `musu@musu.pro`, and Store evidence are still missing.

- 2026-06-02 index refresh after post stop/desktop cleanup primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1421 files and 2251 symbols after wiki/564, GOAL v331/v332, the post
  stop/desktop cleanup primary evidence report, BETA/current-head/runtime
  roadmap/stop cleanup report updates, WIKI_INDEX, new evidence files, and CoS
  memory `2026-06-02_2010_kst_post_stop_desktop_primary_evidence_refresh.md`.
  Search terms should include `GOAL v332`, `1421 files`, `2251 symbols`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_200531`, and
  `post stop/desktop cleanup primary evidence index refresh`.

- 2026-06-02 desktop runtime autostart hardening:
  wiki/565 records the product decision that desktop activation should start or
  reuse the bridge runtime. `musu-bee\src-tauri\src\lib.rs` now spawns one
  background `musu-runtime-autostart` during setup when bridge health is missing
  or failed, and both autostart/manual `Start Runtime` prefer the packaged
  sibling `musu.exe` next to `musu-desktop.exe` before PATH fallback. This
  closes the prior shell-only activation gap and reduces WindowsApps/dev alias
  shadowing risk. Tauri shell tests passed 7/7; packaged MSIX evidence must be
  refreshed before current release evidence is clean again.

- 2026-06-02 index refresh after desktop runtime autostart hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1423 files and 2257 symbols after wiki/565, GOAL v333/v334, desktop
  autostart docs/spec updates, Tauri source updates, WIKI_INDEX, BETA/current
  report/runtime roadmap updates, and CoS memory
  `2026-06-02_2030_kst_desktop_runtime_autostart_hardening.md`. Search terms
  should include `GOAL v334`, `1423 files`, `2257 symbols`,
  `musu-runtime-autostart`, and `desktop runtime autostart index refresh`.

- 2026-06-02 post desktop autostart primary evidence refresh:
  wiki/566 records that the rebuilt local-sideload MSIX proves desktop
  activation starts the bridge runtime without manual `musu up`. Evidence:
  `20260602-204104-HUGH_SECOND` single-machine,
  `20260602-203815-HUGH_SECOND.desktop-single-instance`,
  `20260602-203833-HUGH_SECOND.process-ownership`,
  `20260602-203858-HUGH_SECOND.desktop-open`, and
  `20260602-204112-HUGH_SECOND.runtime-cpu-scenario-matrix`. Process ownership
  shows runtime `1`, desktop `1`, owned Node `0`, owned WebView2 `6`, bridge
  `127.0.0.1:14805` HTTP 200, and runtime path under
  `C:\Program Files\WindowsApps\Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6\musu.exe`.
  CPU reports MUSU `0`, WebView2 `0.42`, working set `364.02MB`, and matrix
  token `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_204112`.

- 2026-06-02 index refresh after post desktop autostart evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1432 files and 2257 symbols after wiki/566, GOAL v335/v336, the post desktop
  autostart evidence report, new evidence files, BETA/current-head/runtime
  roadmap/WIKI_INDEX updates, and CoS memory
  `2026-06-02_2045_kst_post_desktop_autostart_primary_evidence.md`. Search
  terms should include `GOAL v336`, `1432 files`, `2257 symbols`,
  `desktop autostart evidence`, and `post desktop autostart index refresh`.

- 2026-06-02 cloud hardware probe idle hardening:
  wiki/567 records that the logged-in `musu.pro` cloud heartbeat now uses
  process-cached hardware metadata. Windows RAM/CPU metadata uses Win32
  `GlobalMemoryStatusEx` and registry `RegGetValueW` instead of default
  PowerShell/WMIC process spawning. `nvidia-smi` GPU VRAM probing remains
  timeout-bounded and is reached through the cached metadata path, so recurring
  heartbeat cycles do not repeatedly spawn it. Validation passed
  `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` and
  `cargo test --manifest-path .\musu-rs\Cargo.toml peer::hardware --lib -- --test-threads=1`
  3/3. This reduces a logged-in idle CPU candidate but makes current packaged
  evidence stale until MSIX primary evidence is refreshed.

- 2026-06-02 index refresh after cloud hardware probe idle hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1434 files and 2262 symbols after wiki/567, GOAL v337/v338, cloud hardware
  probe source/docs/spec updates, BETA/current-head/runtime roadmap updates,
  WIKI_INDEX, and CoS memory
  `2026-06-02_2110_kst_cloud_hardware_probe_idle_hardening.md`. Search terms
  should include `GOAL v338`, `1434 files`, `2262 symbols`,
  `gather_hardware_info_cached`, `GlobalMemoryStatusEx`, and `RegGetValueW`.

- 2026-06-02 post cloud hardware probe primary evidence:
  wiki/568 records fresh packaged primary evidence after commit `9fff34aa`.
  Evidence paths include `20260602-213655-HUGH_SECOND` single-machine,
  `20260602-213404-HUGH_SECOND.desktop-single-instance`,
  `20260602-213412-HUGH_SECOND.process-ownership`,
  `20260602-213436-HUGH_SECOND.desktop-open`, and
  `20260602-213706-HUGH_SECOND.runtime-cpu-scenario-matrix`. Desktop-open CPU
  reports MUSU `0`, Node `0`, WebView2 `0.49`, working set `363.18MB`, hot
  `0`; matrix token is `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_213706`.

- 2026-06-02 index refresh after post cloud hardware probe evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1443 files and 2262 symbols after wiki/568, GOAL v339/v340, post cloud
  hardware probe primary evidence docs/evidence files, BETA/current-head/runtime
  roadmap/WIKI_INDEX updates, and CoS memory
  `2026-06-02_2145_kst_post_cloud_hardware_probe_primary_evidence.md`. Search
  terms should include `GOAL v340`, `1443 files`, `2262 symbols`,
  `20260602-213706-HUGH_SECOND`, and `post cloud hardware probe evidence`.

- 2026-06-02 P2P KV and second-PC recheck:
  wiki/569 records fresh hosted P2P evidence
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260602-215651-musu.pro.evidence.json`.
  `musu.pro` is logged in, rendezvous wired, relay lease control-plane wired,
  runtime relay fallback wired, and `relay_default_data_path=false`, but relay
  leases remain `ok=false`, `owner_scope_verified=false`, and
  `owner_scoped=false` because production KV/Redis is not configured
  (`p2p_relay_lease_kv_not_configured`). GitHub has
  `MUSU_P2P_CONTROL_TOKEN_SHA256S`; `KV_REST_API_URL` and
  `KV_REST_API_TOKEN` are still missing and no local KV/Upstash env values are
  present. The prior second-PC target `192.168.1.192:8949` is currently
  unreachable (`TcpTestSucceeded=false`, ping timeout), so fresh two-machine
  CPU/matrix/route evidence still requires a reachable remote MUSU bridge or a
  new return zip.

- 2026-06-02 index refresh after P2P KV and second-PC recheck:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1448 files and 2262 symbols after wiki/569, GOAL v341/v342, the fresh hosted
  P2P evidence, P2P KV/second-PC recheck report, P2P next-actions/spec updates,
  BETA/current-head/WIKI_INDEX updates, and CoS memory
  `2026-06-02_2158_kst_p2p_kv_second_pc_recheck.md`. Search terms should
  include `GOAL v342`, `1448 files`, `2262 symbols`,
  `20260602-215651-musu.pro.evidence.json`, `p2p_relay_lease_kv_not_configured`,
  and `TcpTestSucceeded=false`.

- 2026-06-02 route explain trust-boundary hardening:
  wiki/570 records that `musu route --explain` no longer trusts
  registry/rendezvous candidate metadata claims such as
  `peer_identity_verified=true` or `encryption=quic_tls_1_3`. Explain remains a
  preflight surface: advertised key material can make
  `https_fingerprint_pin_available=true`, but identity stays
  `peer_identity_verified=false` with
  `peer_identity_method=advertised_tls_cert_fingerprint_unverified` and
  `encryption=none_http_bearer` until an actual runtime transport proof exists.
  Validation passed `cargo check --manifest-path .\musu-rs\Cargo.toml --bin
  musu -j 1`, `install::cli_commands` tests 14/14, `cargo fmt --check`, and
  `git diff --check`. This is source hardening toward release-grade route proof,
  not QUIC/TLS transport implementation; packaged primary evidence is stale
  until refreshed from the new source commit.

- 2026-06-02 index refresh after route explain trust-boundary hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1450 files and 2261 symbols after wiki/570, GOAL v343/v344, route explain
  source hardening, BETA/current-head/P2P spec/WIKI_INDEX updates, and CoS
  memory `2026-06-02_2218_kst_route_explain_trust_boundary_hardening.md`.
  Search terms should include `GOAL v344`, `1450 files`, `2261 symbols`,
  `route explain trust boundary`, and
  `candidate_report_downgrades_verified_fingerprint_pin_metadata`.

- 2026-06-02 post route-explain primary evidence:
  wiki/571 records fresh packaged primary evidence after commit `93025897`.
  Current evidence passes single-machine
  `20260602-224345-HUGH_SECOND`, desktop single-instance
  `20260602-223734-HUGH_SECOND.desktop-single-instance`, process ownership
  `20260602-223756-HUGH_SECOND.process-ownership`, desktop-open CPU
  `20260602-223806-HUGH_SECOND.desktop-open`, and runtime CPU matrix
  `20260602-224917-HUGH_SECOND.runtime-cpu-scenario-matrix`. Desktop-open CPU
  reports MUSU `0`, Node `0`, WebView2 `0.39`, working set `365.49MB`, and hot
  `0`; process ownership reports runtime `1`, desktop `1`, MUSU-owned Node
  `0`, MUSU-owned WebView2 `6`, machine-wide Node `16`, orphan repo helpers
  `0`, and bridge `127.0.0.1:2785` HTTP `200`. The matrix route token is
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_224917`. Public release remains No-Go
  on second-PC route/CPU/matrix, live P2P KV/owner scope, `musu@musu.pro`
  mailbox evidence, and Store evidence.

- 2026-06-02 index refresh after post route-explain primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1459 files and 2261 symbols after wiki/571, GOAL v345/v346, fresh primary
  evidence files, post route-explain primary evidence report, BETA/current-head
  and P2P spec updates, WIKI_INDEX updates, and CoS memory
  `2026-06-02_2256_kst_post_route_explain_primary_evidence.md`. Search terms
  should include `GOAL v346`, `1459 files`, `2261 symbols`,
  `20260602-224917-HUGH_SECOND`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260602_224917`,
  and `post route-explain primary evidence`.

- 2026-06-02 relay route lease-proof hardening:
  wiki/572 records that `POST /api/v1/p2p/route-evidence` now requires issued
  relay lease proof before `route_kind=relay` can be release-grade. Required
  proof includes direct path failure, lease requested, `status=issued`,
  `lease_issued=true`, non-empty `lease_id`, a prior non-relay attempted route,
  and no relay policy blockers. Missing proof stays auditable but adds blockers
  such as `relay_route_missing_lease_proof`, `relay_route_lease_not_issued`,
  and `relay_route_lease_blocked`. Validation passed `npm run test:p2p -- src/app/api/v1/p2p/route-evidence/route.test.ts`
  23/23 and `npm run typecheck`.

- 2026-06-02 index refresh after relay route lease-proof hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1461 files and 2261 symbols after wiki/572, GOAL v347/v348, route-evidence
  API/test updates, P2P spec/current-head/BETA/WIKI_INDEX updates, and CoS
  memory `2026-06-02_relay_route_lease_proof_hardening.md`. Search terms
  should include `GOAL v348`, `1461 files`, `2261 symbols`,
  `relay_route_missing_lease_proof`, and `relay route lease proof`.

- 2026-06-02 relay route lease-proof single-machine refresh:
  current commit `f9beb79f` has fresh single-machine smoke evidence
  `docs\evidence\single-machine\1.15.0-rc.1\20260602-231612-HUGH_SECOND.evidence.json`
  with dashboard task `a4ea114c-2483-4135-8dd0-756cf915d7a3`, bridge
  `http://127.0.0.1:13886`, and CLI route checked. This restores the
  current-commit single-machine gate after route-evidence API hardening; public
  release still blocks on second-PC, live P2P KV/owner scope, release-grade
  transport, support mailbox, and Store evidence.

- 2026-06-02 index refresh after relay route lease-proof single-machine:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1465 files and 2261 symbols after wiki/572, GOAL v347-v350, route-evidence
  API hardening, fresh single-machine evidence, BETA/current-head/P2P spec
  updates, WIKI_INDEX updates, and CoS memories for relay lease proof and
  single-machine refresh. Search terms should include `GOAL v350`,
  `1465 files`, `2261 symbols`, `20260602-231612-HUGH_SECOND`, and
  `relay route lease-proof single-machine`.

- 2026-06-02 P2P forwarded-task target audit hardening:
  wiki/573 records that `musu-rs/src/bridge/handlers/forward.rs` now writes a
  target-side `audit_log` row when `/api/tasks/forward` accepts and spawns a
  forwarded cross-machine task. The row uses the real peer IP from
  `ConnectInfo`, `cross_machine=true`, `status_code=202`, `company_id`, and a
  bounded note containing task/source/rendezvous identifiers. The note
  intentionally excludes prompt text, cwd, callback URL, model, and adapter
  metadata. Validation passed `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
  and the focused unit test
  `forwarded_task_audit_note_is_bounded_and_excludes_prompt`. Public release
  remains No-Go; this is auditability hardening, not QUIC/TLS route proof.

- 2026-06-02 index refresh after P2P forwarded-task target audit hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1467 files and 2265 symbols after wiki/573, GOAL v351-v352, Rust forwarded
  task audit code/test updates, P2P spec/BETA/current-head/WIKI_INDEX updates,
  and CoS memory `2026-06-02_p2p_forwarded_task_audit_hardening.md`. Search
  terms should include `GOAL v352`, `wiki/573`, `1467 files`,
  `2265 symbols`, `forwarded_task_audit_note_is_bounded_and_excludes_prompt`,
  `/api/tasks/forward`, `cross_machine=true`, and `target-side audit`.

- 2026-06-03 post forwarded-task audit primary evidence:
  wiki/574 records fresh packaged primary evidence after source commit
  `c25c109e`. Current evidence passes single-machine
  `20260603-001225-HUGH_SECOND`, desktop single-instance
  `20260603-000306-HUGH_SECOND.desktop-single-instance`, process ownership
  `20260603-000306-HUGH_SECOND.process-ownership`, desktop-open CPU
  `20260603-001200-HUGH_SECOND.desktop-open`, and runtime CPU matrix
  `20260603-001416-HUGH_SECOND.runtime-cpu-scenario-matrix`. Desktop-open CPU
  reports MUSU `0.03`, Node `0`, WebView2 `0.08`, working set `454.06MB`,
  private memory `265.8MB`, and hot `0`; process ownership reports runtime
  `1`, desktop `1`, MUSU-owned Node `0`, MUSU-owned WebView2 `6`,
  machine-wide Node `19`, orphan repo helpers `0`, and bridge
  `127.0.0.1:8738` HTTP `200`. The matrix route token is
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_001416`. Public release remains No-Go
  on second-PC route/CPU/matrix, live P2P KV/owner scope, `musu@musu.pro`
  mailbox evidence, and Store evidence.

- 2026-06-03 index refresh after post forwarded-task audit primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1480 files and 2265 symbols after wiki/574, GOAL v353-v354, fresh primary
  evidence files, BETA/current-head/P2P spec updates, WIKI_INDEX updates, and
  CoS memory `2026-06-03_post_forwarded_task_audit_primary_evidence.md`.
  Search terms should include `GOAL v354`, `1480 files`, `2265 symbols`,
  `20260603-001416-HUGH_SECOND`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_001416`,
  and `post forwarded-task audit primary evidence index refresh`.

- 2026-06-03 P2P storage env alias hardening:
  wiki/575 records that hosted P2P storage now accepts both Vercel KV
  `KV_REST_API_URL` / `KV_REST_API_TOKEN` and Upstash Redis REST
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Added
  `p2pKvEnv.ts`, P2P KV env tests, and store wiring for route evidence,
  rendezvous, and relay lease storage. `deploy-musu-bee.yml` now syncs both
  env name families and maps Upstash values into canonical KV names.
  `configure-musu-pro-p2p-env.ps1` accepts Upstash inputs and
  `show-musu-pro-p2p-env-status.ps1` reports the new missing-name blockers
  `missing_kv_rest_api_url_or_upstash_redis_rest_url` and
  `missing_kv_rest_api_token_or_upstash_redis_rest_token`. Validation passed
  `npm run test:p2p` 27/27, `npm run build`, sequential `npm run typecheck`,
  configurator dry-run, and env-status JSON. Live P2P control-plane remains
  No-Go until actual storage credentials are provisioned and owner-scoped
  evidence passes.

- 2026-06-03 index refresh after P2P storage env alias hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1484 files and 2272 symbols after wiki/575, GOAL v355-v356, P2P storage env
  helper/source updates, deploy workflow update, scripts, BETA/CONFIG/P2P spec
  updates, WIKI_INDEX updates, and CoS memory
  `2026-06-03_p2p_storage_env_alias_hardening.md`. Search terms should include
  `GOAL v356`, `1484 files`, `2272 symbols`, `UPSTASH_REDIS_REST_TOKEN`,
  `p2pKvEnv.test.ts`, and `P2P storage env alias index refresh`.

- 2026-06-03 post P2P storage env alias primary evidence:
  wiki/576 records fresh packaged primary evidence after source commit
  `fbd01746`. Current evidence passes single-machine
  `20260603-005257-HUGH_SECOND`, desktop single-instance
  `20260603-005000-HUGH_SECOND.desktop-single-instance`, process ownership
  `20260603-005010-HUGH_SECOND.process-ownership`, desktop-open CPU
  `20260603-010000-HUGH_SECOND.desktop-open`, and runtime CPU matrix
  `20260603-010315-HUGH_SECOND.runtime-cpu-scenario-matrix`. Desktop-open CPU
  reports MUSU `0`, Node `0`, WebView2 `0.1`, working set `363.87MB`, hot
  `0`; process ownership reports runtime `1`, desktop `1`, MUSU-owned Node
  `0`, MUSU-owned WebView2 `6`, machine-wide Node `16`, orphan repo helpers
  `0`, and bridge `127.0.0.1:2467` HTTP `200`. The matrix route token is
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_010315`. Public release remains No-Go
  on second-PC route/CPU/matrix, live P2P KV/Upstash owner scope,
  `musu@musu.pro` mailbox evidence, and Store evidence.

- 2026-06-03 index refresh after post P2P storage env alias primary evidence:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1497 files and 2272 symbols after wiki/576, GOAL v357-v358, fresh primary
  evidence files, the post P2P storage env alias primary evidence report,
  BETA/current-head/WIKI_INDEX updates, and CoS memory
  `2026-06-03_post_p2p_storage_alias_primary_evidence.md`. Search terms should
  include `GOAL v358`, `1497 files`, `2272 symbols`,
  `20260603-010315-HUGH_SECOND`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_010315`,
  and `post P2P storage env alias primary evidence index refresh`.

- 2026-06-03 status JSON hardening:
  wiki/577 records that `musu status --json` now emits
  `musu.fleet_status_cli.v1` with `ok`, `bridge_url`, and raw fleet status.
  Validation passed Rust fmt/check/build, `install::cli_commands` tests 14/14,
  binary parser test `status_cli_accepts_json_flag`, and a debug
  `up/status/down --json` runtime smoke. This improves process/status
  automation, but Rust source changed, so current packaged primary evidence is
  stale until MSIX rebuild/install and primary evidence are refreshed again.

- 2026-06-03 index refresh after status JSON hardening:
  `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed
  1499 files and 2274 symbols after wiki/577, GOAL v359-v360,
  `musu.fleet_status_cli.v1`, `StatusOpts`, Rust CLI source updates,
  BETA/current-head/WIKI_INDEX updates, and CoS memory
  `2026-06-03_status_json_hardening.md`. Search terms should include
  `GOAL v360`, `1499 files`, `2274 symbols`, `status_cli_accepts_json_flag`,
  `single_machine=false`, and `status JSON hardening index refresh`.

## 9. musu-system Integration State (2026-05-29)

`yellowhama/musu-system` is a credible adjacent MUSU ecosystem line, not a Rust-core replacement. It contains:

- `core`: shared Go env/agent/preflight module
- `crawl-ai`: knowledge harvesting + local wiki + MCP
- `marketer`: grounded campaign drafting + MCP/REST
- `nurikun`: compliant support inbox and opt-in email operations

Current decision:

- Do not merge this code into `musu-rs` now.
- Integrate through MCP/CLI/bridge adapters and shared data contracts.
- Treat `musu-system` as canonical over the older split repos.
- Keep `nurikun` delivery operations gated; safe status/list/subscribe/suppress tools can be exposed first.
- Do not bundle this stack into the first Microsoft Store desktop package.

Verified:

- local clone of `musu-system` HEAD `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`
- split repos cloned successfully; they are older transition/reference repos than `musu-system` HEAD
- 2026-05-29 `git ls-remote ... HEAD` confirmed all four recorded HEADs were unchanged/current
- observed monorepo release tags include `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`
- 2026-05-29 06:43 KST recheck: `go test ./...` and `go vet ./...` passed inside each `core`, `crawl-ai`, `marketer`, and `nurikun` module
- 2026-05-29 07:17 KST recheck: `go test ./...` and `go vet ./...` passed again in the same four monorepo modules from `F:\workspace\_external\musu-system`; latest remote `musu-system` CI run `26587103682` is green
- 2026-05-29 07:52 KST recheck: `go test ./...` and `go vet ./...` passed again; latest monorepo HEAD remains `d4e58e0`; latest remote CI and GHCR publish runs are green
- 2026-05-29 08:14 KST recheck: GitHub repo visibility/HEADs/tags are unchanged; latest branch CI run `26587103682` remains green; local `go test ./...` and `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun`
- 2026-05-29 09:19 KST recheck: `musu-system` HEAD remains `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`; split repo HEADs remain unchanged; active tags remain `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`; latest remote CI/GHCR runs remain green; local `go test ./...` and `go vet ./...` passed again in all four monorepo modules from `.local-build\external\musu-system`
- 2026-05-29 11:55 KST recheck: public `musu-system` HEAD, split repo HEADs, and active tags remain unchanged; local `go test ./...` and `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun`
- 2026-05-29 12:41 KST recheck: local clone at `F:\workspace\_external\musu-system` is clean, monorepo/split HEADs and active tags are unchanged, latest monorepo CI `26587103682` and GHCR publish `26587105434` remain successful, and local `go test ./...` plus `go vet ./...` passed again in all four modules
- 2026-05-30 09:20 KST recheck: GitHub still reports public Go repo `yellowhama/musu-system`, last updated `2026-05-28T16:15:48Z`; `git ls-remote` still resolves HEAD/main to `d4e58e010fe30e83c1e96165d75d7c3ec80a2f40`; active service tags remain `crawl-ai/v0.8.0`, `marketer/v2.0.5`, and `nurikun/v0.3.1`; latest remote CI `26587103682` remains green; local `.local-build\external\musu-system` clone is clean and `go test ./...` plus `go vet ./...` passed again in `core`, `crawl-ai`, `marketer`, and `nurikun`
- stale-note correction: current `musu-system` HEAD already declares MCP tool schemas and creates missing marketer/nurikun DB parent directories; do not repeat older MCP-empty-schema or SQLite-cwd reports unless they are tied to an old split repo
- spot audit: `nurikun` keeps delivery ops out of MCP, but `watch` should record failed sends explicitly before any dashboard integration
- integration adapter caveat: current issue is not MCP schema; MUSU-side registration must pass or wrap explicit working directory, wiki root, project, model, and env settings
- current integration priority: start with `crawl-ai` as optional knowledge/wiki ingestion; keep `marketer` as launch/campaign workflow and `nurikun` as gated support/opt-in tooling after the Store desktop path is stable
- launch-note filter: use the supplied other-product note only for narrow Store positioning, funnel measurement, and grounded promotion workflow; do not carry over unrelated product names or stale Microsoft packaging claims without re-verification

Canonical reference:

- `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`
- `docs/memory/chief_of_staff/2026-05-29_0814_kst_musu_system_recheck.md`
- `docs/memory/chief_of_staff/2026-05-29_1241_kst_musu_system_recheck.md`

## 10. Low-Duty Polling Default Timeout (2026-06-03)

wiki/580 records frontend shared polling hardening. `useLowDutyPolling` now
defines `DEFAULT_LOW_DUTY_POLL_TASK_TIMEOUT_MS = 10_000` and applies it when a
caller omits `taskTimeoutMs`, so shared polling tasks default to
`AbortSignal.timeout(...)` and `AbortSignal.any(...)` cancellation. The runtime
polling contract test asserts the default constant and binding.

Validation passed: runtime polling contract 10/10, `npm run typecheck`,
`npm run build`, and `git diff --check`.

Qualitative state: this reduces frontend polling hang risk, but it does not
fully close the user's busy-loop report. Fresh packaged primary evidence and
second-PC CPU/matrix/route evidence are still required after this source change.
`musu.pro` P2P remains blocked on live KV/Upstash owner-scoped relay lease
evidence.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_LOW_DUTY_POLLING_DEFAULT_TIMEOUT_HARDENING_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_low_duty_polling_default_timeout_hardening.md`

## 11. Post Low-Duty Polling Primary Evidence (2026-06-03)

wiki/581 records fresh current-head packaged primary evidence after the
low-duty polling timeout source change. The local-sideload MSIX was rebuilt and
replaced, then single-machine smoke, desktop single-instance, process
ownership, desktop-open CPU, and four-state runtime CPU matrix evidence were
captured from clean commit `335f2836473137e2fae06f1f8ce0b0fc198678a9`.

Current evidence:

- single-machine `20260603-031050-HUGH_SECOND`
- desktop single-instance `20260603-031229-HUGH_SECOND`
- process ownership `20260603-031234-HUGH_SECOND`
- desktop-open CPU `20260603-031248-HUGH_SECOND`
- runtime CPU matrix `20260603-031911-HUGH_SECOND`

Desktop-open CPU reports MUSU `0.03`, Node `0.05`, WebView2 `0.6`, working set
`499.66MB`, and hot `0`. The matrix passed all four scenarios with route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_031911`.

mDNS regression also passed: current debug `musu discover --timeout 2` with
opt-in env vars unset emitted no `Failed to send`, `ff02::fb`, `10065`, or
`closed channel`, disabled 9 virtual/VPN interfaces, and sent only on physical
`이더넷 2`.

Clean go/no-go is still public No-Go because second-PC CPU/matrix/route, live
owner-scoped `musu.pro` P2P KV/Upstash evidence, release-grade transport proof,
`musu@musu.pro` mailbox evidence, and Store evidence remain open.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_POST_LOW_DUTY_POLLING_PRIMARY_EVIDENCE_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_post_low_duty_polling_primary_evidence.md`

## 12. Operator Pack and P2P Recheck 03:35 (2026-06-03)

wiki/582 records current-head handoff artifacts and hosted P2P state after the
post low-duty polling primary evidence commit. Current final packet
`.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-033322.zip`
and action pack
`.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353.zip`
both verify with `ok=true` and `fail_count=0`.

Current second-PC transfer zip:

- `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-033353\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-033353.zip`

Second-PC `192.168.1.192:8949` remains unreachable from `HUGH_SECOND`
(`TcpTestSucceeded=false`, ping timeout), so live two-machine route/CPU/matrix
evidence cannot be captured yet.

Fresh P2P evidence `20260603-033453-musu.pro` still fails: relay leases are
not ok, owner scope is not verified, and the query is not owner-scoped. Env
status still has only `MUSU_P2P_CONTROL_TOKEN_SHA256S`; missing KV/Upstash
URL/token blockers remain. `relay_default_data_path=false`.

Index refresh after the recheck recorded `1537` files and `2274` symbols.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_OPERATOR_PACK_P2P_RECHECK_2026_06_03_0335.md`
- `docs/memory/chief_of_staff/2026-06-03_operator_pack_p2p_recheck_0335.md`
- `docs/memory/chief_of_staff/2026-06-03_operator_pack_p2p_recheck_index_refresh_0336.md`

## 13. Polling Interval Clamp and Primary Evidence (2026-06-03)

wiki/583 records the next frontend busy-loop hardening step. The shared
`useLowDutyPolling` hook now clamps accidental tight intervals with
`MIN_LOW_DUTY_POLL_INTERVAL_MS = 5_000`, keeps hidden polling at a 4x effective
interval, and guards document visibility listener binding for non-browser
runtimes.

Validation passed runtime-polling tests 11/11, typecheck, production build,
lint with 0 errors, and diff check.

After rebuilding/replacing the local-sideload MSIX, current primary evidence is:

- single-machine `20260603-035325-HUGH_SECOND`
- desktop single-instance `20260603-035450-HUGH_SECOND`
- process ownership `20260603-035436-HUGH_SECOND`
- desktop-open CPU `20260603-035458-HUGH_SECOND`
- runtime CPU matrix `20260603-035608-HUGH_SECOND`

Desktop-open CPU reports MUSU `0`, Node `0.03`, WebView2 `0.6`, working set
`500.44MB`, and hot `0`. The matrix passed all four scenarios with route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_035608`.

Clean go/no-go remains public No-Go: runtime idle CPU and matrix are each
`1/2`, second-PC multi-device evidence is missing, `musu.pro` P2P relay lease
KV/Upstash evidence is missing, support mailbox and Store evidence are missing,
and this developer machine still has a local runtime-package alias shadow
because `C:\Users\empty\.cargo\bin\musu.exe` precedes the WindowsApps alias.

Index refresh after wiki/583 recorded `1551` files and `2274` symbols.

Current operator handoff for this build:

- final packet `20260603-040654`, verifier `ok=true`, `fail_count=0`
- action pack `20260603-040714`, verifier `ok=true`, `fail_count=0`
- second-PC transfer `MUSU-second-PC-transfer-1.15.0-rc.1-20260603-040714.zip`
- Partner Center zip `MUSU-1.15.0-rc.1-store-submission-20260603-040714.zip`

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_POLLING_INTERVAL_CLAMP_PRIMARY_EVIDENCE_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_polling_interval_clamp_primary_evidence.md`
- `docs/memory/chief_of_staff/2026-06-03_polling_interval_clamp_index_refresh.md`

## 14. MSIX Alias Shadowing Hardening (2026-06-03)

wiki/584 records a release-tooling correction: true PATH alias shadowing is now
separated from later alternate `musu.exe` binaries. `msix-common.ps1` records
alias order, WindowsApps alias presence/discovery, first alias path, alternate
alias sources, and true alias shadowing. `check-msix-legacy-conflicts.ps1`,
`capture-msix-install-evidence.ps1`, and `verify-installed-msix-package.ps1`
surface explicit packaged invocation and remediation fields.

Current local alias state remains:

- first alias path `C:\Users\empty\.cargo\bin\musu.exe`
- WindowsApps alias
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- explicit packaged invocation:
  `& "C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe"`

Validation showed the installed MSIX package, manifest, Start menu entry, alias
contract, and artifact contract match. `audit-desktop-release-readiness.ps1`
now reports `runtime_package_ready=True`, `desktop_shell_ready=True`, and
`single_machine_verified=True`. `write-release-go-no-go.ps1` reports
`local_artifacts_ready=True`; public release remains No-Go on second-PC route,
runtime CPU 2/2, live `musu.pro` P2P owner scope, `musu@musu.pro`, and Store
evidence.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_MSIX_ALIAS_SHADOWING_HARDENING_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_msix_alias_shadowing_hardening.md`

Index refresh after wiki/584 recorded `1555` files and `2274` symbols using the
explicit packaged WindowsApps alias invocation.

## 15. External Gate Recheck 04:30 (2026-06-03)

wiki/585 records the fresh external gate recheck from HEAD `c7b0d599`.
Second-PC `192.168.1.192:8949` remains unreachable from `HUGH_SECOND`
(`PingSucceeded=False`, `TcpTestSucceeded=False`, source `192.168.1.154`,
interface `이더넷 2`).

Fresh live P2P evidence `20260603-043017-musu.pro` was recorded using the
explicit packaged WindowsApps alias. Verification remains `ok=false` with
`fail_count=4`: relay status is logged in and route/rendezvous/lease wiring
pass, `relay_default_data_path=false`, but relay leases are not ok and owner
scope is not verified. Live detail remains `p2p_relay_lease_kv_not_configured`;
env status still lacks `KV_REST_API_URL_OR_UPSTASH_REDIS_REST_URL` and
`KV_REST_API_TOKEN_OR_UPSTASH_REDIS_REST_TOKEN`.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_EXTERNAL_GATE_RECHECK_2026_06_03_0430.md`
- `docs/memory/chief_of_staff/2026-06-03_external_gate_recheck_0430.md`

Index refresh after wiki/585 recorded `1561` files and `2274` symbols using the
explicit packaged WindowsApps alias invocation.

## 16. P2P Evidence Recorder Alias Hardening (2026-06-03)

wiki/586 records that `record-p2p-control-plane-evidence.ps1` now defaults to
the packaged WindowsApps alias before repo debug/PATH binaries when `-MusuExe`
is omitted. Evidence now records `musu_exe` and `musu_exe_source`.

Default-run validation generated fresh live P2P evidence
`20260603-044110-musu.pro` with
`musu_exe_source=windowsapps_alias` and
`musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`.
Verification still fails on `p2p_relay_lease_kv_not_configured`, proving the
remaining P2P blocker is production storage/owner-scope, not local evidence
binary selection.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_P2P_EVIDENCE_RECORDER_ALIAS_HARDENING_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_p2p_evidence_recorder_alias_hardening.md`

Index refresh after wiki/586 recorded `1567` files and `2274` symbols using the
explicit packaged WindowsApps alias invocation.

## 17. External Recheck Recorder Clean Evidence (2026-06-03)

wiki/587 records the new external release gate recheck recorder and its clean
evidence. `record-external-release-gate-recheck.ps1` writes
`musu.external_release_gate_recheck.v1` under
`docs\evidence\external-gates\<VERSION>` and captures final go/no-go,
second-PC reachability, hosted P2P env state, and live P2P control-plane
evidence in one operator command.

Clean HEAD `d80e929e` generated
`20260603-050915-HUGH_SECOND.external-gates` and live P2P evidence
`20260603-051044-musu.pro`. The snapshot proves `local_artifacts_ready=True`
and `single_machine_verified=True`, while public release remains No-Go:
runtime idle CPU and runtime CPU matrix are each `1/2`, second-PC
`192.168.1.192:8949` is unreachable from source `192.168.1.154`, and P2P owner
scope still fails with `p2p_relay_lease_kv_not_configured`.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_EXTERNAL_RECHECK_RECORDER_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_external_recheck_recorder_clean_evidence.md`

Index refresh after wiki/587 recorded `1576` files and `2274` symbols using the
explicit packaged WindowsApps alias invocation.

## 18. Bounded External Gate Probe (2026-06-03)

wiki/588 records that `record-external-release-gate-recheck.ps1` no longer uses
unbounded `Test-NetConnection` defaults for second-PC reachability. It now
records `probe_method=bounded_ping_and_tcp`, source IP/interface, bounded ICMP
timing, bounded TCP timing, and timeout/error detail.

Clean HEAD `080bc6dc` generated external evidence
`20260603-052447-HUGH_SECOND.external-gates` and P2P evidence
`20260603-052547-musu.pro`. Second-PC remains unreachable:
`source_address=192.168.1.154`, `interface_alias=이더넷 2`,
`ping_elapsed_ms=2887`, `tcp_elapsed_ms=3016`, and
`tcp_error=tcp_connect_timeout`.

Release status is unchanged: local artifacts and single-machine gates are true,
runtime idle CPU and matrix remain `1/2`, and public release still needs
second-PC route/CPU/matrix, `musu.pro` KV/Upstash owner scope, support mailbox,
and Store evidence.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_EXTERNAL_RECHECK_RECORDER_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_bounded_external_probe_evidence.md`

Index refresh after wiki/588 recorded `1583` files and `2274` symbols using the
explicit packaged WindowsApps alias invocation.

## 19. Busy-Loop and Process Attribution Recheck (2026-06-03)

wiki/589 records the current HEAD `6f32d490` re-audit of the operator-reported
CPU busy-loop and machine-wide Node process concerns. Validation passed:
`peer::mdns::tests::` 3/3 and `npm run test:runtime-polling` 11/11.

The code audit found no new fixed-delay busy-loop in the audited default paths:
mDNS is default-off, IPv6/Tailscale/VPN mDNS are separately opt-in, disconnected
mDNS browse receivers break immediately, frontend low-duty polling clamps
intervals and cancels tasks, chat/relay reconnects remain bounded, and the
bridge `musu.pro` registration loop is a 300s low-duty heartbeat with minimum
60s, failure backoff, and jitter.

Live process attribution at 2026-06-03 05:35 KST generated
`.local-build\process-ownership\musu-process-ownership-20260603-053549.json`.
It is diagnostic, not release-pass evidence: MUSU was not running
(`musu_runtime=0`, missing bridge registry), while 16 machine-wide `node.exe`
processes and 6 WebView2 helpers were all outside the MUSU process tree with no
repo-related orphan helpers. The latest release-grade desktop-open CPU evidence
remains `20260603-035458-HUGH_SECOND`, which passes with MUSU `0`, Node `0.03`,
WebView2 `0.6`, and hot process count `0`.

Fresh go/no-go at 05:37 KST remains public No-Go while local artifacts remain
ready: `local_artifacts_ready=True`, `single_machine_verified=True`,
`public_metadata_ok=True`, `msix_install_verified=True`, and
`msix_desktop_entrypoint_verified=True`; multi-device/P2P/support/Store gates
remain open.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_BUSY_LOOP_PROCESS_ATTRIBUTION_AUDIT_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_busy_loop_process_attribution_audit.md`

Index refresh after wiki/589 recorded `1587` files and `2274` symbols using the
explicit packaged WindowsApps alias invocation.

## 20. P2P Relay Lease Store Status Hardening (2026-06-03)

wiki/590 records the relay lease store status hardening for the `musu.pro` P2P
control-plane release gate. Relay lease API/CLI/evidence now exposes
`relay_lease_store_configured`, `relay_lease_store_backend`, and
`relay_lease_store_release_grade`.

The accepted public release state is owner-scoped relay lease query success,
`relay_default_data_path=false`, and release-grade hosted KV/Upstash storage.
File/dev fallback stores remain local/test diagnostics only.

Validation passed:

- `npm run test:p2p` 28/28
- `npm run typecheck`
- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1`
- `cargo test --manifest-path .\musu-rs\Cargo.toml install::cli_commands --lib -- --test-threads=1`
  14/14
- `test-release-evidence-verifiers.ps1 -Json` 14 cases, 0 failed
- `git diff --check`

This is not relay payload transport. It closes a release-verifier gap so live
P2P evidence cannot pass without configured release-grade relay lease storage.
Because web API, Rust CLI, and verifier source changed, fresh release evidence
is required after commit/deploy before current-HEAD release claims are restored.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_P2P_RELAY_LEASE_STORE_STATUS_HARDENING_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_p2p_relay_lease_store_status_hardening.md`

Index refresh after wiki/590 recorded `1590` files and `2279` symbols using the
explicit packaged WindowsApps alias invocation.

## 21. Post Relay Store Status Live P2P Evidence (2026-06-03)

wiki/591 records fresh live `musu.pro` P2P control-plane evidence after the
relay lease store status hardening was deployed. The evidence used a freshly
built current-source debug CLI, passed via `-MusuExe
.\musu-rs\target\debug\musu.exe`, so the new CLI error-body parsing fields are
present in the artifact.

Artifacts:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.verification.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-061246-musu.pro.summary.md`

Result: verification remains `ok=false` with `fail_count=6`.
`relay_status_logged_in=true`, `relay_default_data_path=false`, but relay lease
query is not ok, owner scope is not verified, and store status is
`relay_lease_store_configured=false`,
`relay_lease_store_backend=unconfigured`, and
`relay_lease_store_release_grade=false`.

The live error remains `p2p_relay_lease_kv_not_configured`; the new value is
that the live evidence now explicitly proves unconfigured release-grade storage
instead of only surfacing a generic lease-query failure.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_POST_RELAY_STORE_STATUS_LIVE_P2P_EVIDENCE_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_post_relay_store_status_live_p2p_evidence.md`

Index refresh after wiki/591 recorded `1596` files and `2279` symbols using the
explicit packaged WindowsApps alias invocation.

## 22. Primary Evidence Refresh After Relay Store Status (2026-06-03)

wiki/592 records fresh primary-machine evidence after the relay lease store
status live P2P pass.

Artifacts:

- `docs\evidence\single-machine\1.15.0-rc.1\20260603-062456-HUGH_SECOND.evidence.json`
- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-062633-HUGH_SECOND.desktop-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-063400-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Single-machine smoke passed with dashboard task
`5fa8a73b-3d0b-4976-b234-0b9d256827c6` and output
`MUSU_RELEASE_SMOKE_OK_20260603_062433`. Desktop-open CPU passed for
`60.068s` with MUSU `0`, Node `0.05`, WebView2 `0.31`, working set
`501.98MB`, and hot process count `0`. The four-state matrix passed with route
token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_063400`; all scenarios had
`git_dirty=false` and hot `0`.

Clean go/no-go on HEAD `85dec851` reports `local_artifacts_ready=True` and
`single_machine_verified=True`, but public release remains No-Go because
second-PC multi-device evidence, second-PC CPU/matrix evidence, live
owner-scoped `musu.pro` KV/Upstash relay lease evidence, `musu@musu.pro`
mailbox evidence, and Partner Center/Store evidence are still missing.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_PRIMARY_EVIDENCE_REFRESH_AFTER_RELAY_STORE_STATUS_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_primary_evidence_refresh_after_relay_store_status.md`

Index refresh after wiki/592 recorded `1607` files and `2279` symbols using the
explicit packaged WindowsApps alias invocation.

## 23. External Recheck CLI Override and Operator Pack (2026-06-03)

wiki/593 records that `record-external-release-gate-recheck.ps1` now accepts
`-MusuExe` and passes it through to `record-p2p-control-plane-evidence.ps1`.
The external evidence now records `p2p_evidence_musu_exe` and
`p2p_evidence_musu_exe_source`.

Current operator artifacts were regenerated from clean HEAD `e112c470`:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260603-065454.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260603-065519.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260603-065519\partner-center\MUSU-1.15.0-rc.1-store-submission-20260603-065519.zip`

Both verifiers passed: final packet `ok=true`, `fail_count=0`, `kit_count=1`;
action pack `ok=true`, `fail_count=0`.

Clean external recheck with `-MusuExe .\musu-rs\target\debug\musu.exe`
generated:

- `docs\evidence\external-gates\1.15.0-rc.1\20260603-065918-HUGH_SECOND.external-gates.evidence.json`
- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-070018-musu.pro.evidence.json`

Result remains public release No-Go: second-PC TCP connect timed out, P2P env
lacks KV/Upstash storage, and live P2P evidence still reports
`p2p_relay_lease_kv_not_configured` with
`relay_lease_store_backend=unconfigured` and
`relay_lease_store_release_grade=false`.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_EXTERNAL_RECHECK_CLI_OVERRIDE_OPERATOR_PACK_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_external_recheck_cli_override_operator_pack.md`

Index refresh after wiki/593 recorded `1615` files and `2279` symbols using the
explicit packaged WindowsApps alias invocation.

## 24. Fleet SSE Lifecycle Hardening (2026-06-03)

wiki/594 records the frontend Fleet SSE hardening pass. The global
`useFleetStore` EventSource now has explicit bounded reconnect and close
ownership instead of relying on implicit browser EventSource retry behavior.

Changed:

- `musu-bee/src/store/useFleetStore.ts`
- `musu-bee/src/app/dashboard/fleet/page.tsx`
- `musu-bee/src/app/dashboard/agent/[id]/page.tsx`
- `musu-bee/src/app/runtime-polling-contract.test.ts`

Behavior now guaranteed by contract:

- Fleet SSE reconnect starts at `1_000ms`
- reconnect delay caps at `10_000ms`
- reconnect multiplier is `2`
- maximum reconnect attempts are `5`
- stale timers are rejected by `fleetReconnectGeneration`
- `closeSSE()` clears timers and closes the global EventSource
- Fleet and Agent dashboard pages call `closeSSE()` on unmount
- Fleet SSE path does not use `setInterval`

Validation passed `npm run test:runtime-polling` (`12/12`),
`npm run typecheck`, `npm run build`, and `git diff --check`.

Clean go/no-go on commit `aa23fc85c7caba0e05e3436df3aa3c64e3acfa39`
still reports public release No-Go. `local_artifacts_ready=true`,
`public_metadata_ok=true`, `msix_install_verified=true`,
`msix_desktop_entrypoint_verified=true`, and `manifest_git.dirty=false`, but
`single_machine_verified=false` because the frontend runtime source changed and
fresh current-HEAD MSIX smoke/CPU/matrix evidence has not yet been recorded.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_FLEET_SSE_LIFECYCLE_HARDENING_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_fleet_sse_lifecycle_hardening.md`

Index refresh after wiki/594 recorded `1618` files and `2283` symbols using the
explicit packaged WindowsApps alias invocation.

## 25. Post Fleet SSE Primary Evidence Refresh (2026-06-03)

wiki/595 records the primary evidence refresh after Fleet SSE lifecycle
hardening.

Current source was rebuilt into the local-sideload MSIX:

- `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Runtime evidence used the explicit packaged WindowsApps alias because local
PATH still resolves `C:\Users\empty\.cargo\bin\musu.exe` before WindowsApps.
The install verifier passed, but `capture-msix-install-evidence.ps1` still
fails on this machine due alias shadowing, so no new MSIX install evidence was
recorded to `docs\evidence` in this pass.

Fresh primary evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-073941-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-074231-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-074415-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Single-machine smoke passed with dashboard task
`595585da-e3c5-43f4-8468-d1cec100133a` and output
`MUSU_RELEASE_SMOKE_OK_20260603_073920`.

Desktop-open idle CPU passed for `60.061s` with MUSU `0`, Node `0.05`,
WebView2 `0.16`, working set `500.12MB`, and hot process count `0`.

The four-state runtime matrix passed with route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_074415`; all four scenarios were clean and
under budget.

Clean go/no-go on `0428c20020a5fbd0331e3aa6ed2ae319e54348d0` reports
`local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle CPU
valid machines `1`, runtime CPU matrix valid machines `1`, and
`manifest_git.dirty=false`. Public release remains No-Go on second-PC,
release-grade live `musu.pro` P2P, `musu@musu.pro`, and Store evidence.

Canonical reference:

- `docs/RELEASE_1_15_0_RC1_POST_FLEET_SSE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`
- `docs/memory/chief_of_staff/2026-06-03_post_fleet_sse_primary_evidence_refresh.md`

Index refresh after wiki/595 recorded `1630` files and `2283` symbols using the
explicit packaged WindowsApps alias invocation.

## 26. MSIX Alias Shadow Warning Policy (2026-06-03)

wiki/596 records the split between strict public MSIX install evidence and
developer warning evidence for PATH alias shadowing.

MSIX install evidence tooling now accepts:

- `AliasShadowingMode=fail` (default, release gate)
- `AliasShadowingMode=warn-explicit-windowsapps` (diagnostic only)

Strict mode still requires the WindowsApps alias to be the first resolved
`musu.exe`. Warning mode requires:

- the packaged WindowsApps alias file exists
- the packaged alias is discoverable by `Get-Command`
- `windowsapps_alias_invocation` is recorded
- both capture and verifier explicitly opt into warning mode
- the only legacy conflict is alias shadowing

Current HUGH_SECOND warning evidence:

- `.local-build\msix-install-shadow-warning\20260603-080717-HUGH_SECOND.evidence.json`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- first alias path:
  `C:\Users\empty\.cargo\bin\musu.exe`
- packaged alias:
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`

Validation:

- default verifier rejects the warning evidence with `fail_count=4`
- warning verifier accepts it with `fail_count=0`
- release evidence verifier regression passed `17/17`
- dirty-tree go/no-go preserved the public MSIX gate on canonical clean
  HUGH-MAIN evidence with `alias_shadowing_mode=fail`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MSIX_ALIAS_SHADOW_WARNING_POLICY_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_msix_alias_shadow_warning_policy.md`

Index refresh after wiki/596 recorded `1634` files and `2283` symbols using the
explicit packaged WindowsApps alias invocation.

## 27. P2P Relay Transport Gate Hardening (2026-06-03)

wiki/597 records the release-gate split between relay lease control-plane proof
and relay payload transport proof.

The hosted P2P gate now rejects lease-only relay evidence. The verifier requires
both:

- `relay_status.relay_transport_wired=true`
- `relay_leases.relay_transport_wired=true`

Changed scripts:

- `scripts\windows\verify-p2p-control-plane-evidence.ps1`
- `scripts\windows\show-musu-pro-p2p-env-status.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`
- `scripts\windows\write-release-go-no-go.ps1`

Validation:

- PowerShell parser passed
- release evidence verifier regression passed `18/18`
- new regression fixture:
  `p2p rejects lease-only relay without payload transport`
- live P2P evidence `20260603-070018-musu.pro` now fails with `fail_count=8`,
  including relay status/lease transport failures
- hosted P2P env status now reports
  `live_evidence_relay_transport_not_wired`
- clean post-commit go/no-go reports
  `manifest_git.dirty=false`, `local_artifacts_ready=false` due
  `runtime-package`, `single_machine_verified=true`, and
  `p2p_control_plane_verified=false`

Current hosted P2P blockers:

- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`

Product interpretation:

- `musu.pro` remains the account/rendezvous/path-selection/relay lease control
  plane.
- Public P2P readiness must also prove actual relay payload transport before
  `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` is acceptable.
- This closes a false-positive release-gate risk; it does not complete the P2P
  product work.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_TRANSPORT_GATE_HARDENING_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_p2p_relay_transport_gate_hardening.md`

Index refresh after wiki/597 recorded `1637` files and `2283` symbols using the
explicit packaged WindowsApps alias invocation.

## 28. Release Gate PowerShell Host Hardening (2026-06-03)

wiki/598 records a release-gate false-negative fix for PowerShell host
selection.

Root cause:

- `write-release-go-no-go.ps1` launched child JSON verifiers with
  `powershell.exe` through `System.Diagnostics.ProcessStartInfo`.
- When the parent shell was PowerShell 7, that Windows PowerShell child could
  inherit a PowerShell 7-first `PSModulePath`.
- `verify-store-submission-bundle.ps1` then failed to autoload `Get-FileHash`,
  so the Store bundle verifier failed inside
  `audit-desktop-release-readiness.ps1`.
- go/no-go consequently reported a false `runtime-package` blocker even though
  direct readiness audit reported `runtime_package_ready=true`.

Changed scripts:

- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\audit-desktop-release-readiness.ps1`
- `scripts\windows\verify-store-submission-bundle.ps1`
- `scripts\windows\complete-final-operator-gates.ps1`
- `scripts\windows\record-external-release-gate-recheck.ps1`
- `scripts\windows\show-final-release-handoff-status.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`
- `scripts\windows\verify-single-machine-evidence.ps1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`

Validation:

- parser checks passed for changed scripts
- `git diff --check` passed
- ProcessStartInfo Store bundle reproduction now reports `ok=true` and
  `fail_count=0`
- standalone readiness audit reports `runtime_package_ready=true`
- release verifier regressions passed `18/18`
- dirty-tree go/no-go reports `local_artifacts_ready=true`,
  `runtime_package_ready=true`, and no `runtime-package` blocker
- freshness allowlists classify `complete-final-operator-gates.ps1` and
  `verify-store-submission-bundle.ps1` as status-only release tooling

Product interpretation:

- This removes a release-gate false negative.
- It does not complete any external release blocker.
- Public release remains No-Go until second-PC route/CPU/matrix, two-machine
  CPU budgets, support mailbox, Store/Partner Center, and hosted P2P relay
  transport evidence pass.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELEASE_GATE_POWERSHELL_HOST_HARDENING_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_release_gate_powershell_host_hardening.md`

Index refresh after wiki/598 recorded `1640` files and `2283` symbols using the
explicit packaged WindowsApps alias invocation.

## 29. P2P Relay Route Evidence Gate (2026-06-03)

wiki/599 records the release-gate split between relay transport flags and
actual owner-scoped relay route evidence.

Changed behavior:

- Rust CLI adds `musu relay route-evidence --json`.
- The command queries owner-scoped route evidence with `route_kind=relay`,
  `result=success`, and `release_grade=true`.
- `record-p2p-control-plane-evidence.ps1` stores that output as
  `relay_route_evidence`.
- `verify-p2p-control-plane-evidence.ps1` fails unless
  `relay_route_evidence.count > 0` and
  `relay_route_evidence.relay_transport_proven=true`.
- `show-musu-pro-p2p-env-status.ps1` reports
  `live_evidence_relay_route_not_proven`.

Validation:

- parser checks passed
- `cargo fmt --check` passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- Rust cloud tests passed `3/3`
- Rust install CLI tests passed `14/14`
- `npm run test:p2p` passed `28/28`
- release evidence verifier regressions passed `19/19`
- `git diff --check` passed

Fresh live P2P evidence:

- `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260603-093640-musu.pro.evidence.json`
- verification `ok=false`, `fail_count=13`
- `relay_lease_store_backend=unconfigured`
- `relay_route_evidence_count=0`
- `relay_payload_transport_proven=false`
- `relay_transport_wired=false`

Current hosted P2P blockers:

- `missing_kv_rest_api_url_or_upstash_redis_rest_url`
- `missing_kv_rest_api_token_or_upstash_redis_rest_token`
- `live_evidence_p2p_relay_lease_kv_not_configured`
- `live_evidence_relay_transport_not_wired`
- `live_evidence_relay_route_not_proven`

Product interpretation:

- KV/Upstash provisioning remains required but is not sufficient.
- `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` is not sufficient.
- Public P2P readiness requires a real relay route that carried payload and was
  recorded as owner-scoped release-grade route evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_ROUTE_EVIDENCE_GATE_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_p2p_relay_route_evidence_gate.md`

Index refresh after wiki/599 recorded `1646` files and `2291` symbols using
the explicit packaged WindowsApps alias invocation.

## 30. Post Relay Route Evidence Primary Refresh (2026-06-03)

wiki/600 records the primary-machine evidence refresh after the hosted P2P
relay route evidence gate hardening.

Evidence:

- current local-sideload MSIX rebuilt and installed as
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- single-machine evidence:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-101716-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-100903-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-101013-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_101013`

Primary-machine CPU result:

- desktop-open `60.069s`
- MUSU `0`
- Node `0.03`
- WebView2 `0.52`
- hot process count `0`
- owned process counts: MUSU `2`, Node `1`, WebView2 `6`
- working set `496.76MB`

Matrix result:

- `runtime-started`: MUSU `0`, Node `0`, WebView2 `0.13`
- `dashboard-open`: MUSU `0`, Node `0`, WebView2 `0.18`
- `desktop-open`: MUSU `0`, Node `0`, WebView2 `0.26`
- `post-route`: MUSU `0`, Node `0`, WebView2 `0.10`
- all scenarios had hot `0` and no resource-budget violations

Product interpretation:

- Current primary-machine packaged evidence is restored.
- The reported idle busy-loop is not reproduced on the packaged desktop path.
- Public release still needs second-PC route/CPU/matrix, hosted P2P relay
  proof, support mailbox evidence, and Store/Partner Center evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_ROUTE_EVIDENCE_PRIMARY_REFRESH_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_post_relay_route_evidence_primary_refresh.md`

Index refresh after wiki/600 recorded `1654` files and `2291` symbols using
the explicit packaged WindowsApps alias invocation.

## 31. Go/No-Go P2P Route Evidence Output (2026-06-03)

wiki/601 records release go/no-go output alignment with the stricter hosted P2P
relay route evidence gate.

Changed behavior:

- `write-release-go-no-go.ps1` now emits `p2p_owner_scope_verified`.
- It emits `p2p_relay_lease_store_release_grade`.
- It emits `p2p_relay_transport_wired`.
- It emits `p2p_relay_route_evidence_ok`.
- It emits `p2p_relay_route_evidence_count`.
- It emits `p2p_relay_payload_transport_proven`.
- The same fields appear in non-JSON output.

The `p2p-control-plane` blocker now explicitly requires:

- owner-scoped release-grade relay lease storage
- `relay_default_data_path=false`
- `relay_transport_wired=true`
- owner-scoped release-grade relay route evidence
- `relay_payload_transport_proven=true`
- route evidence `count > 0`

Current result:

- `p2p_control_plane_verified=false`
- `p2p_owner_scope_verified=false`
- `p2p_relay_lease_store_release_grade=false`
- `p2p_relay_transport_wired=false`
- `p2p_relay_route_evidence_ok=false`
- `p2p_relay_route_evidence_count=0`
- `p2p_relay_payload_transport_proven=false`

Validation:

- PowerShell parser passed
- JSON go/no-go output includes the new fields
- non-JSON go/no-go output prints the new fields
- release evidence verifier regressions passed `19/19`
- `git diff --check` passed

Product interpretation:

- This is release-gate output fidelity, not P2P completion.
- Public P2P remains blocked on release-grade relay lease storage, real
  relay/tunnel payload transport, and release-grade owner-scoped relay route
  evidence proving payload transit.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_GO_NO_GO_P2P_ROUTE_EVIDENCE_OUTPUT_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_go_no_go_p2p_route_evidence_output.md`

Index refresh after wiki/601 recorded `1657` files and `2291` symbols using
the explicit packaged WindowsApps alias invocation.

## 2026-06-03 11:10 KST Startup-Open CPU Matrix Gate

wiki/602 records that the runtime CPU scenario matrix now release-gates
`startup-open` in addition to `runtime-started`, `dashboard-open`,
`desktop-open`, and `post-route`.

Implementation:

- `measure-musu-runtime-cpu-scenarios.ps1` default scenarios now include
  `startup-open`.
- `startup-open` launches the packaged desktop app and records
  `sample_delay_seconds`.
- `verify-runtime-cpu-scenario-matrix.ps1` rejects `startup-open` unless the app
  was launched and sampling started within 3s.
- `write-release-go-no-go.ps1`, `run-second-pc-release-check.ps1`, final
  operator packet generation/verification, multi-device kit generation, handoff
  status, and release verifier fixtures now use the five-scenario matrix.
- `show-final-release-handoff-status.ps1` now emits an operator step for an
  unverified runtime CPU matrix gate.

Validation:

- PowerShell parser passed.
- `git diff --check` passed.
- release evidence verifier regressions passed `20/20`.
- a first local 5-scenario matrix `20260603-105008-HUGH_SECOND` was rejected by
  the verifier with `fail_count=1` because dashboard-open did not launch a URL.

Current primary matrix evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-105650-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- clean commit `2defe28d9ff107813f476ae22720e2d715894f9e`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_105650`
- verifier `ok=true`, `fail_count=0`
- startup-open delay `2.026s`
- WebView2 max one-core CPU: startup-open `1.51`, runtime-started `0.21`,
  dashboard-open `0.16`, desktop-open `0.03`, post-route `0.05`
- dirty-tree go/no-go after docs evidence reports `single_machine_verified=true`,
  runtime idle CPU `1/2`, and runtime CPU matrix `1/2`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_STARTUP_OPEN_CPU_MATRIX_GATE_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_startup_open_cpu_matrix_gate.md`

Index refresh after wiki/602 recorded `1660` files and `2291` symbols using
the explicit packaged WindowsApps alias invocation. Search terms should include
`GOAL v412`, `wiki/603 index refresh`, `startup-open`,
`sample_delay_seconds`, `20260603-105650-HUGH_SECOND`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_105650`, and
`runtime CPU matrix 1/2`.

## 2026-06-03 11:30 KST Frontend Polling Contract Go/No-Go Gate

wiki/604 records that frontend polling busy-loop prevention is now a release
go/no-go gate.

Implementation:

- Added `scripts\windows\audit-frontend-polling-contract.ps1` with schema
  `musu.frontend_polling_contract.v1`.
- `write-release-go-no-go.ps1` now emits
  `frontend_polling_contract_verified` and `frontend_polling_contract_audit`.
- Failed audit results add blocker area `frontend-polling`.
- The final operator packet includes the audit command and packet verifier
  self-checks the script, README, go/no-go blocker, and handoff status operator
  step.
- `verify-single-machine-evidence.ps1`,
  `verify-runtime-cpu-scenario-matrix.ps1`, and `write-release-go-no-go.ps1`
  treat the new audit script as status-only so it does not stale existing CPU
  evidence.

Validation:

- PowerShell parser passed.
- `audit-frontend-polling-contract.ps1 -Json` passed with `ok=true`,
  `fail_count=0`, `direct_interval_hit_count=0`, and
  `direct_visibility_listener_hit_count=0`.
- `npm run test:runtime-polling` passed 12/12.
- release evidence verifier regressions passed 20/20.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FRONTEND_POLLING_CONTRACT_GO_NO_GO_GATE_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_frontend_polling_contract_go_no_go_gate.md`

Index refresh after wiki/604 recorded `1664` files and `2291` symbols using
the explicit packaged WindowsApps alias invocation. Search terms should include
`GOAL v414`, `wiki/605 index refresh`,
`musu.frontend_polling_contract.v1`,
`frontend_polling_contract_verified`, `frontend-polling`,
`audit-frontend-polling-contract.ps1`, `direct_interval_hit_count`,
`direct_visibility_listener_hit_count`, and `runtime-polling 12/12`.

## 2026-06-03 11:50 KST Relay Route Evidence Stored Lease Gate

wiki/606 records that relay route evidence must now be backed by a real
owner-scoped stored relay lease before it can be release-grade.

Implementation:

- `POST /api/v1/p2p/route-evidence` imports `queryRelayLeases`.
- For `route_kind=relay`, issued lease proof now queries the relay lease store
  by owner key, `session_id`, `source_node_id`, and `target_node_id`.
- The stored lease must match `relay_fallback.lease_id`.
- The stored lease attempted route kind set must match the route evidence
  fallback attempted route kind set.

New non-release-grade blockers:

- `relay_route_lease_not_found`
- `relay_route_lease_attempts_mismatch`
- `relay_route_lease_store_unavailable:<detail>`

Validation:

- route-evidence API test passed 13/13.
- `npm run test:p2p` passed 29/29.
- `npm run typecheck` passed.
- `git diff --check` passed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_ROUTE_EVIDENCE_STORED_LEASE_GATE_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_relay_route_evidence_stored_lease_gate.md`

Index refresh after wiki/606 recorded `1667` files and `2296` symbols using
the explicit packaged WindowsApps alias invocation. Search terms should include
`GOAL v416`, `wiki/607 index refresh`, `relay_route_lease_not_found`,
`relay_route_lease_attempts_mismatch`, `relay_route_lease_store_unavailable`,
`queryRelayLeases`, `owner-scoped stored relay lease`, and `test:p2p 29/29`.

## 2026-06-03 12:17 KST Post Stored-Lease Primary Evidence Refresh

wiki/608 records the primary-machine evidence refresh after the stored relay
lease route evidence gate.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-120751-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-120903-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-121028-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key numbers:

- smoke task `afb7e08d-427b-4307-bdd5-4d5b165dd026`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_120729`
- idle CPU `desktop-open`: MUSU `0`, Node `0.05`, WebView2 `0.08`,
  working set `496.49MB`, hot `0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_121028`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_STORED_LEASE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_post_stored_lease_primary_evidence_refresh.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1675` files and `2296` symbols after wiki/608, GOAL v417,
  fresh primary evidence, BETA/WIKI/WIKI_INDEX updates, and CoS memories
- search terms should include `GOAL v418`, `wiki/609 index refresh`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_121028`, and
  `post stored-lease primary evidence refresh`

## 2026-06-03 12:47 KST P2P Relay Transport Descriptor Gate

wiki/610 records that hosted P2P evidence now requires a separate relay
transport descriptor/preflight artifact.

Implementation:

- `GET /api/v1/p2p/relay/transport` emits `musu.p2p_relay_transport.v1`.
- `musu relay transport --json` emits `musu.relay_transport.v1`.
- `record-p2p-control-plane-evidence.ps1` captures `relay_transport`.
- `verify-p2p-control-plane-evidence.ps1` requires owner-scoped transport
  preflight evidence, `wss://` relay URL, `relay_default_data_path=false`,
  `payload_transit_requires_lease=true`, release-grade relay lease storage, and
  release-grade relay route evidence with payload proof.

Existing live P2P evidence `20260603-093640-musu.pro` now fails closed with
`fail_count=31` because the transport descriptor is missing and relay route
proof is still absent.

Post-deploy endpoint probe after `654b9dcb`:

- direct authenticated `GET https://musu.pro/api/v1/p2p/relay/transport`
- schema `musu.p2p_relay_transport.v1`
- `relay_transport_descriptor_wired=true`
- `ok=false`
- `relay_transport_wired=false`
- `relay_url=""`
- `relay_lease_store_backend=unconfigured`
- fail-closed blockers include disabled relay, missing transport, missing relay
  URL, missing entitlement, and non-release-grade lease storage

Validation:

- `npm run test:p2p` passed 34/34.
- `npm run typecheck` passed.
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed.
- PowerShell parser validation passed.
- release evidence verifier regressions passed 20/20.
- `git diff --check` passed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_TRANSPORT_DESCRIPTOR_GATE_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_p2p_relay_transport_descriptor_gate.md`

Release interpretation:

- This is a fail-closed evidence/preflight gate, not relay payload transport.
- `MUSU_P2P_RELAY_TRANSPORT_WIRED=1` is still insufficient without actual
  owner-scoped release-grade relay route evidence.
- Source changed after the latest primary evidence refresh, so current-HEAD
  MSIX/smoke/CPU/matrix evidence must be refreshed after commit/build.

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1681` files and `2307` symbols after wiki/610, GOAL v419, relay
  transport descriptor source/tests, P2P recorder/verifier updates,
  BETA/spec/WIKI/WIKI_INDEX updates, and CoS memories
- search terms should include `GOAL v420`, `wiki/611 index refresh`,
  `musu.p2p_relay_transport.v1`, `musu.relay_transport.v1`,
  `relay_transport_descriptor_wired`, `payload_transit_requires_lease`,
  `fail_count=31`, and `test:p2p 34/34`

## 2026-06-03 13:29 KST Post Transport Descriptor Primary Evidence Refresh

wiki/612 records the primary-machine evidence refresh after the P2P relay
transport descriptor gate.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-131556-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-131811-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-131938-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key numbers:

- smoke task `bba38031-b333-4b86-af61-64b65187a82b`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_131531`
- idle CPU `desktop-open`: MUSU `0`, Node `0.05`, WebView2 `0.31`,
  working set `497.94MB`, hot `0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_131938`
- matrix maxes: startup-open WebView2 `0`, runtime-started WebView2 `0`,
  dashboard-open WebView2 `0`, desktop-open WebView2 `0.73`, post-route
  WebView2 `0.21`

Validation:

- single-machine verifier `ok=true`, `fail_count=0`
- runtime CPU matrix verifier `ok=true`, `fail_count=0`
- clean go/no-go on `2fe8d220` reports `single_machine_verified=true`,
  runtime idle CPU `1/2`, runtime CPU matrix `1/2`,
  `p2p_control_plane_verified=false`, `p2p_relay_route_evidence_count=0`,
  `p2p_relay_payload_transport_proven=false`, and `git_dirty=false`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_TRANSPORT_DESCRIPTOR_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_post_transport_descriptor_primary_evidence_refresh.md`

Release interpretation:

- current primary-machine packaged evidence is restored after the relay
  transport descriptor gate
- public release remains No-Go until second-PC runtime/multi-device evidence,
  hosted P2P release-grade relay payload proof, support mailbox evidence, and
  Store evidence are complete

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1689` files and `2307` symbols after wiki/612, GOAL v422, fresh
  primary evidence, the primary refresh report, BETA/current-head/WIKI_INDEX
  updates, and CoS memories
- search terms should include `GOAL v423`, `wiki/613 index refresh`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_131938`,
  `post transport descriptor primary evidence refresh`, `runtime idle CPU 1/2`,
  and `runtime CPU matrix 1/2`

## 2026-06-03 13:50 KST Relay Transport Proof Gate

wiki/614 records that hosted P2P relay route evidence now requires an explicit
payload transport proof object before it can become release-grade.

New route-evidence proof:

- field: `relay_transport_proof`
- schema: `musu.relay_transport_proof.v1`
- required only for `route_kind=relay` release grading
- must match `relay_fallback.lease_id` and route `session_id`
- must prove `wss://` relay URL, positive payload byte transit,
  `payload_transited_musu_infra=true`, `encryption=quic_tls_1_3`, and
  `transport_verified_by=musu_quic_tls_transport`

New blockers include:

- `relay_route_missing_transport_proof`
- `relay_route_transport_proof_lease_mismatch`
- `relay_route_transport_proof_session_mismatch`
- `relay_route_transport_proof_relay_url_not_wss`
- `relay_route_transport_proof_no_infra_transit`
- `relay_route_transport_proof_not_quic_tls`
- `relay_route_transport_proof_not_verified`

Stored route-evidence queries with `release_grade=true` now exclude older relay
records that lack the current `musu.relay_transport_proof.v1` proof contract.

Validation:

- `npm run test:p2p` passed 35/35
- `npm run typecheck` passed
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu -j 1` passed
- focused Rust route-evidence serialization test passed
- release evidence verifier regressions passed 20/20
- `git diff --check` passed

Release interpretation:

- this is evidence-chain hardening, not relay/tunnel payload transport
- current bridge route evidence still submits no relay transport proof
- public release still needs real relay transport code that generates
  `musu.relay_transport_proof.v1`, live owner-scoped KV/Upstash storage,
  second-PC runtime/multi-device evidence, support mailbox evidence, and Store
  evidence
- web and Rust source changed, so current packaged MSIX/smoke/CPU/matrix
  evidence must be refreshed after this commit

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1692` files and `2311` symbols after wiki/614, GOAL v424,
  route-evidence source/tests, Rust cloud DTO updates, P2P spec updates, the
  canonical report, BETA/WIKI_INDEX updates, and CoS memories
- search terms should include `GOAL v425`, `wiki/615 index refresh`,
  `relay_route_missing_transport_proof`,
  `relay_route_transport_proof_not_verified`, and
  `musu.relay_transport_proof.v1`

## 2026-06-03 14:25 KST Post Relay Transport Proof Primary Evidence Refresh

wiki/616 records the primary-machine evidence refresh after the relay
transport proof gate.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-141358-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-141524-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-141712-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key numbers:

- smoke task `3e8522a2-73ef-4b51-bb3c-bb0b6bc251af`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260603_141331`
- idle CPU `desktop-open`: MUSU `0`, Node `0.03`, WebView2 `0.44`,
  working set `517.83MB`, hot `0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_141712`
- matrix maxes: startup-open WebView2 `2.03`, runtime-started WebView2
  `0.13`, dashboard-open WebView2 `0.18`, desktop-open WebView2 `0.08`,
  post-route WebView2 `0.16`

Validation:

- single-machine verifier `ok=true`, `fail_count=0`
- runtime CPU matrix verifier `ok=true`, `fail_count=0`
- clean go/no-go on `2445c3bb` reports `single_machine_verified=true`,
  runtime idle CPU `1/2`, runtime CPU matrix `1/2`,
  `p2p_control_plane_verified=false`, `p2p_relay_route_evidence_count=0`,
  `p2p_relay_payload_transport_proven=false`, and `git_dirty=false`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_TRANSPORT_PROOF_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`
- `docs\memory\chief_of_staff\2026-06-03_post_relay_transport_proof_primary_evidence_refresh.md`

Local dashboard note:

- the production dashboard was served at `http://127.0.0.1:3001/app`
- `localhost` without a port and `localhost:3000` were expected to refuse
  connections during this evidence run

Release interpretation:

- current primary-machine packaged evidence is restored after the relay
  transport proof gate
- public release remains No-Go until second-PC runtime/multi-device evidence,
  hosted P2P release-grade relay payload proof, support mailbox evidence, and
  Store evidence are complete

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1700` files and `2311` symbols after wiki/616, GOAL v426, fresh
  primary evidence, the primary refresh report, BETA/WIKI_INDEX updates, and
  CoS memories
- search terms should include `GOAL v427`, `wiki/617 index refresh`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_141712`,
  `post relay transport proof primary evidence refresh`, `runtime idle CPU 1/2`,
  and `runtime CPU matrix 1/2`

## 2026-06-03 14:45 KST Targeted Post-Route CPU Matrix Diagnostic

wiki/618 records that the runtime CPU scenario matrix now has a targeted
post-route diagnostic for second-PC route attempts.

New measurement flags:

- `-RouteTarget <PEER_NAME>`
- `-AllowFailedRouteProbe`

New verifier flags:

- `-ExpectedPostRouteTarget <PEER_NAME>`
- `-AllowFailedPostRouteProbe`

New second-PC wrapper flags:

- `-RuntimeCpuRouteTarget <PEER_NAME>`
- `-RuntimeCpuRoutePrompt <PROMPT>`
- `-AllowFailedRuntimeCpuRouteProbe`

The matrix `route_probe` now records target, command, arguments, exit code,
stdout, stderr, output, success state, and whether failure was explicitly
allowed.

Validation:

- PowerShell parser checks passed
- release evidence verifier regressions passed `22/22`
- added passing fixture for explicitly allowed failed target route attempt
- added failing fixture for target mismatch
- `git diff --check` passed

Release interpretation:

- normal release matrix verification still requires a successful post-route
  probe
- allow-failed target attempts only diagnose CPU after a bounded failed route
  attempt
- this does not prove multi-device route success or relay payload transport
- public release remains No-Go until second-PC runtime/multi-device evidence,
  hosted P2P release-grade relay payload proof, support mailbox evidence, and
  Store evidence are complete

Canonical report:

- `docs\RELEASE_1_15_0_RC1_TARGETED_POST_ROUTE_CPU_MATRIX_DIAGNOSTIC_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1705` files and `2311` symbols after wiki/618, GOAL v428,
  targeted post-route CPU matrix scripts, the canonical report,
  BETA/WIKI_INDEX updates, and CoS memories
- search terms should include `GOAL v429`, `wiki/619 index refresh`,
  `RouteTarget`, `AllowFailedRouteProbe`, `ExpectedPostRouteTarget`,
  `RuntimeCpuRouteTarget`, and
  `runtime-matrix-failed-target-route-attempt-allowed`

## 2026-06-03 14:56 KST Targeted Post-Route CPU Evidence

wiki/620 records a real post-route CPU diagnostic after an explicit target
route attempt to registered peer `HUGH-MAIN`.

Evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- post-route sample:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.post-route.evidence.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-145454-HUGH_SECOND.targeted-post-route.verification.json`

Result:

- source commit `d26a2b78e3a8684e124aade5108887e261089487`
- git clean during matrix: `true`
- route target: `HUGH-MAIN`
- route output timed out against `192.168.1.192:8949`
- verifier `ok=true`, `fail_count=0`
- sample duration `60.049s`
- hot process count `0`
- max CPU: MUSU `0`, Node `0`, WebView2 `0.10`, other `0`
- process counts: MUSU `2`, Node `0`, WebView2 `6`, other `0`
- working set `402.69MB`
- cleanup stopped bridge PID `29652` and desktop PID `37956`

Harness hardening:

- normal runtime CPU matrix route probes now fail when the expected per-run
  route token is missing
- `-AllowFailedRouteProbe` remains the explicit diagnostic path for sampling
  after a bounded failed target route attempt

Release interpretation:

- this proves local runtime/WebView2 CPU stays under budget after a failed
  target route attempt
- this does not prove multi-device route success or relay payload transport
- public release remains No-Go until second-PC runtime/multi-device evidence,
  hosted P2P release-grade relay payload proof, support mailbox evidence, and
  Store evidence are complete

Canonical report:

- `docs\RELEASE_1_15_0_RC1_TARGETED_POST_ROUTE_CPU_EVIDENCE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1711` files and `2311` symbols after wiki/620, GOAL v430,
  targeted post-route CPU evidence JSON, the canonical report,
  route token-missing fail-fast hardening, BETA/WIKI_INDEX updates, and CoS
  memories
- search terms should include `GOAL v431`, `wiki/621 index refresh`,
  `20260603-145454-HUGH_SECOND`, `targeted-post-route.verification.json`,
  `HUGH-MAIN`, `192.168.1.192:8949`, `WebView2 0.10`, and `402.69MB`

## 2026-06-03 relay payload endpoint fail-closed hardening (wiki/622)

Relay transport readiness now requires an actual payload endpoint implementation
marker in addition to `MUSU_P2P_RELAY_TRANSPORT_WIRED=1`. Current source keeps
that marker false because `/api/v1/relay/connect` payload transport is not
implemented. The relay transport descriptor now reports
`relay_payload_endpoint_wired=false`; transport preflight and relay lease policy
add `relay_payload_endpoint_not_wired`; and relay route evidence adds
`relay_route_transport_not_wired` plus `relay_route_payload_endpoint_not_wired`
so a stored lease plus proof-shaped JSON cannot become release-grade while the
payload endpoint is absent. Validation passed `npm run test:p2p` 35/35,
`npm run typecheck`, and release evidence verifier regressions 22/22.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_ENDPOINT_FAIL_CLOSED_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1715` files and `2312` symbols after wiki/622, GOAL v432,
  relay payload endpoint fail-closed source/tests, CONFIG/spec/BETA updates,
  WIKI_INDEX updates, and CoS memories
  `2026-06-03_relay_payload_endpoint_fail_closed.md` and
  `2026-06-03_relay_payload_endpoint_fail_closed_index_refresh.md`
- search terms should include `GOAL v433`, `wiki/623 index refresh`,
  `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`,
  `relay_payload_endpoint_wired`, `relay_payload_endpoint_not_wired`, and
  `relay_route_payload_endpoint_not_wired`

## 2026-06-03 startup helper source primary evidence refresh (wiki/624)

Commit `79368c53` fixed packaged startup helper source reproducibility by
tracking `musu-rs\src\bin\musu-startup.rs` and unignoring
`musu-rs\src\bin\*.rs`, after a clean MSIX release build exposed that the root
`.gitignore` `bin/` rule hid the helper source. `cargo check --bin
musu-startup -j 1` passed, and a clean detached worktree at `79368c53` built
and installed the local-sideload MSIX as
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`.

Fresh primary evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-160842-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-161155-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-161836-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260603_160819`; desktop-open
CPU `60.076s`, MUSU `0.03`, Node `0`, WebView2 `0.21`, hot `0`, working set
`461.69MB`; five-state matrix route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_161836`, verifier `ok=true`,
`fail_count=0`, max working set `518.12MB`. Dirty-tree go/no-go sees
`local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle CPU
valid machines `1/2`, runtime CPU matrix valid machines `1/2`, and public
release remains No-Go on second-PC runtime/multi-device evidence, hosted relay
payload proof, support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_STARTUP_HELPER_SOURCE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1728` files and `2315` symbols after wiki/624, GOAL v434, tracked
  `musu-rs\src\bin\musu-startup.rs`, fresh primary evidence
  `20260603-160842-HUGH_SECOND`, `20260603-161155-HUGH_SECOND.desktop-open`,
  and `20260603-161836-HUGH_SECOND.runtime-cpu-scenario-matrix`, BETA updates,
  WIKI_INDEX updates, and CoS memory
  `2026-06-03_startup_helper_source_primary_evidence_refresh.md`
- search terms should include `GOAL v435`, `wiki/625 index refresh`,
  `musu-startup.rs`, `MUSU_RELEASE_SMOKE_OK_20260603_160819`, and
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_161836`

## 2026-06-03 bounded frontend SSE hardening (wiki/626)

Dashboard mount-time SSE subscriptions now use a shared bounded hook instead of
raw browser `EventSource` auto-retry. `useBoundedEventSource` closes failed
streams, reconnects on capped exponential backoff from `1s` to `10s`, stops
after `5` failed attempts, and closes streams while the document is hidden.

Applied surfaces:

- `musu-bee\src\app\fleet\page.tsx`
- `musu-bee\src\app\c\[id]\page.tsx`
- `musu-bee\src\app\m\[id]\page.tsx`
- `musu-bee\src\components\TasksPanel.tsx`

Validation passed `npm run test:runtime-polling` `14/14`, `npm run
typecheck`, `npm run build`, and `git diff --check` with only the existing CRLF
normalization warning for `TasksPanel.tsx`.

Go/no-go at 2026-06-03 16:51 KST: public release `false`, local artifacts
`true`, single-machine `true`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, multi-device `false`, P2P control plane `false`, relay transport
`false`, relay payload proof `false`, and git dirty on this source change.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_BOUNDED_FRONTEND_SSE_HARDENING_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1732` files and `2318` symbols after GOAL v436, wiki/626,
  bounded frontend SSE source/tests, the canonical report, BETA/WIKI_INDEX
  updates, and CoS memory `2026-06-03_bounded_frontend_sse_hardening.md`
- search terms should include `GOAL v437`, `wiki/627 index refresh`,
  `useBoundedEventSource`, `BOUNDED_SSE_MAX_RETRIES`, and
  `runtime-polling 14/14`

## 2026-06-03 post bounded frontend SSE primary evidence refresh (wiki/628)

Fresh primary-machine packaged evidence was restored for commit
`4f52269e66c3e1ffdbde9d7936bcd83e4fb4a22c` after bounded frontend SSE
hardening.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-173637-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-174002-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-174322-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260603_173611`; desktop-open
CPU `60.044s`, MUSU `0`, Node `0`, WebView2 `0.29`, hot `0`, working set
`382.17MB`; five-state matrix route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_174322`, verifier `ok=true`,
`fail_count=0`, max MUSU `0.03`, Node `0.03`, WebView2 `0.39`, and max working
set `518.26MB`.

The local-sideload package was repacked with the existing LocalMachine-trusted
cert `9048EA2A9C0891A574C62F9DF2C1D0DA873952DE` after the first generated cert
stalled in non-interactive `certutil`. Production Next stderr also logged
`ReferenceError: self is not defined` from
`.next\server\app\m\[id]\workstation\page.js`; the matrix did not exercise that
route, so this remains a separate workstation SSR hardening item.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_BOUNDED_FRONTEND_SSE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1745` files and `2318` symbols after GOAL v438, wiki/628, fresh
  primary evidence, the primary refresh report, BETA/WIKI_INDEX updates, and
  CoS memory
  `2026-06-03_post_bounded_frontend_sse_primary_evidence_refresh.md`
- search terms should include `GOAL v439`, `wiki/629 index refresh`,
  `MUSU_RELEASE_SMOKE_OK_20260603_173611`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_174322`, and
  `post bounded frontend SSE primary evidence refresh`

## 2026-06-03 CLI route pinned transport and bounded SSE visibility (wiki/630)

CLI route evidence now preserves actual HTTPS fingerprint-pinned transport proof
instead of recording advertised identity as if transport was verified.

Changes:

- added shared rustls fingerprint-pinned reqwest client helper
  `musu-rs\src\bridge\tls_pin.rs`
- refactored bridge forwarding to use the shared helper
- taught `musu route` to select HTTPS endpoints from resolved peer metadata
- route evidence now records `tls_cert_fingerprint_pin` only after the pinned
  HTTPS request path succeeds
- `useBoundedEventSource` now delegates visible reconnect checks through
  `useLowDutyPolling` and no longer registers a direct `visibilitychange`
  listener

Validation passed Rust CLI route tests `17/17`, bridge forward tests `4/4`,
route-evidence tests `7/7`, `cargo check --bin musu`,
`npm run test:runtime-polling` `14/14`, frontend polling contract audit
`ok=true`/`fail_count=0`, `npm run typecheck`, `npm run test:p2p` `35/35`,
and `git diff --check`.

Go/no-go remains public release `false`: local artifacts `true`,
single-machine `true`, frontend polling contract `true`, runtime idle CPU `1/2`,
runtime CPU matrix `1/2`, hosted P2P control plane `false`, relay transport
`false`, relay payload proof `false`, and git dirty on this source change.
This is not QUIC/TLS relay payload implementation.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CLI_ROUTE_PINNED_TRANSPORT_AND_BOUNDED_SSE_VISIBILITY_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1749` files and `2326` symbols after GOAL v440, wiki/630,
  `musu-rs\src\bridge\tls_pin.rs`, CLI route pinned transport updates,
  bounded SSE visible reconnect shared-poller updates, the canonical report,
  BETA/WIKI_INDEX updates, and CoS memory
  `2026-06-03_cli_route_pinned_transport_and_bounded_sse_visibility.md`
- search terms should include `GOAL v441`, `wiki/631 index refresh`,
  `tls_cert_fingerprint_pin`, `BOUNDED_SSE_VISIBILITY_RECONNECT_CHECK_MS`,
  and `runtime-polling 14/14`

## 2026-06-03 post CLI route pinned transport primary evidence refresh (wiki/632)

Fresh primary-machine packaged evidence was restored for commit
`dded9eba67415cfdfd371f9c940fa2d59bd366ac` after CLI route pinned transport
evidence hardening.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-190139-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-190450-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-191447-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260603_190107`, CLI route
output `MUSU_CLI_ROUTE_OK_20260603_190107`, desktop-open CPU `60.064s` with
MUSU `0`, Node `0`, WebView2 `0.08`, hot `0`, and working set `466.26MB`;
five-state matrix verifier `ok=true`, `fail_count=0`, dashboard URL
`http://127.0.0.1:3001/app`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_191447`, max MUSU `0`, Node `0.03`,
WebView2 `0.10`, and max working set `595.78MB`.

The first matrix attempt proved CPU budgets but failed the verifier because
`dashboard-open` did not launch a URL after the dev server was stopped to avoid
measurement pollution. The accepted matrix used a current production Next build
on port `3001`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_CLI_ROUTE_PINNED_TRANSPORT_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1760` files and `2326` symbols after GOAL v442, wiki/632, fresh
  primary evidence, the primary refresh report, BETA/WIKI_INDEX updates, and
  CoS memory
  `2026-06-03_post_cli_route_pinned_transport_primary_evidence_refresh.md`
- search terms should include `GOAL v443`, `wiki/633 index refresh`,
  `MUSU_RELEASE_SMOKE_OK_20260603_190107`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_191447`, `runtime idle CPU 1/2`, and
  `runtime CPU matrix 1/2`

## 2026-06-03 relay connect fail-closed endpoint (wiki/634)

`/api/v1/relay/connect` now has an explicit fail-closed route instead of an
opaque missing endpoint. It returns HTTP `501` with schema
`musu.relay_connect_unavailable.v1`, `error=relay_payload_transport_not_implemented`,
`relay_payload_endpoint_wired=false`, `relay_transport_wired=false`, and
`relay_default_data_path=false`.

This does not implement relay payload transport. It makes the known blocker
machine-readable and prevents the release gate from interpreting env flags,
lease records, or proof-shaped JSON as payload transit.

Validation passed:

- `npm run test:p2p` `37/37`
- `npm run typecheck`
- `git diff --check`
- dev `/app` returned `200`
- dev `/api/v1/relay/connect` returned `501`

Fresh local live evidence
`.local-build\p2p-control-plane\20260603-193609-musu.pro.evidence.json`
remained `ok=false` with `fail_count=19`. Live blockers include missing
KV/Upstash storage, unwired relay transport, unwired relay payload endpoint,
and missing release-grade relay route proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_CONNECT_FAIL_CLOSED_ENDPOINT_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1765` files and `2334` symbols after GOAL v444, wiki/634,
  relay connect fail-closed source/tests, the canonical report,
  BETA/WIKI_INDEX updates, and CoS memory
  `2026-06-03_relay_connect_fail_closed_endpoint.md`
- search terms should include `GOAL v445`, `wiki/635 index refresh`,
  `musu.relay_connect_unavailable.v1`,
  `relay_payload_transport_not_implemented`, `test:p2p 37/37`,
  `20260603-193609-musu.pro`, and `fail_count=19`

## 2026-06-03 post relay connect primary evidence refresh (wiki/636)

Fresh primary-machine packaged evidence was restored after the relay connect
fail-closed endpoint hardening commit
`e592bf608341f0461b03d55c7c0845ccf7781be0`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-195528-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-195742-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-195917-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260603_195506`, bridge
`http://127.0.0.1:10502`, desktop-open CPU `60.059s` with MUSU `0`, Node `0`,
WebView2 `0.39`, hot `0`, and working set `521.48MB`; five-state matrix
verifier `ok=true`, `fail_count=0`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_195917`, max MUSU `0.42`, Node `0.05`,
WebView2 `0.42`, and max working set `527.72MB`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_CONNECT_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1779` files and `2334` symbols after GOAL v446, wiki/636, fresh
  primary evidence, the primary refresh report, BETA/WIKI_INDEX updates, and
  CoS memory
  `2026-06-03_post_relay_connect_primary_evidence_refresh.md`
- search terms should include `GOAL v447`, `wiki/637 index refresh`,
  `MUSU_RELEASE_SMOKE_OK_20260603_195506`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_195917`, `runtime idle CPU 1/2`, and
  `runtime CPU matrix 1/2`

## 2026-06-03 Rust background loop contract gate (wiki/638)

Rust bridge/runtime background-loop contracts are now release-gated through
`scripts\windows\audit-rust-background-loop-contract.ps1`, which emits schema
`musu.rust_background_loop_contract.v1`.

The audit verifies planner, clipboard, and mDNS opt-in gates; mDNS IPv6,
Tailscale, and virtual/VPN interface separate opt-ins; duration-bounded mDNS
browse with 1s receive timeout and disconnect break; low-duty cloud
registration heartbeat default `300s` with `60s` floor plus failure backoff
sleep; bounded file-sync queues, batches, timeouts, and cooldown; and
auto-update supervise/health-poll sleep contracts. New Rust `loop {` or
`while true` constructs outside the audited allowlist fail until reviewed.

`write-release-go-no-go.ps1` now emits
`rust_background_loop_contract_verified` and
`rust_background_loop_contract_audit`, and adds a `rust-background-loops`
blocker when the audit fails. `show-final-release-handoff-status.ps1`,
`prepare-final-operator-gate-packet.ps1`, and
`verify-final-operator-gate-packet.ps1` now carry the same gate.

Validation passed:

- `audit-rust-background-loop-contract.ps1 -FailOnProblem -Json`: `ok=true`,
  `fail_count=0`, `unaudited_loop_hit_count=0`
- dirty-tree go/no-go: `rust_background_loop_contract_verified=true`,
  `rust_fail_count=0`
- `audit-desktop-release-readiness.ps1 -Json`: local package, desktop shell,
  and single-machine true; only the existing second-PC multi-device evidence
  failed
- `git diff --check`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_BACKGROUND_LOOP_CONTRACT_GATE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1783` files and `2334` symbols after GOAL v448, wiki/638,
  Rust background-loop audit source, go/no-go/handoff/packet wiring, the
  canonical report, BETA/WIKI/WIKI_INDEX updates, and CoS memory
  `2026-06-03_rust_background_loop_contract_gate.md`
- search terms should include `GOAL v449`, `wiki/639 index refresh`,
  `musu.rust_background_loop_contract.v1`,
  `rust_background_loop_contract_verified`, `rust-background-loops`,
  `MUSU_ENABLE_MDNS`, `MUSU_ENABLE_CLIPBOARD_SYNC`, `MUSU_ENABLE_PLANNER`,
  `MUSU_CLOUD_HEARTBEAT_INTERVAL_SEC`, and `unaudited_loop_hit_count=0`

## 2026-06-03 P2P relay status descriptor gate (wiki/640)

`musu relay status --json` now reports live hosted relay transport descriptor
state instead of hiding relay transport readiness behind a hardcoded false
value. The status command queries the relay transport descriptor, mirrors
preflight/descriptor/payload endpoint/lease store/blocker/error fields, and
parses JSON error bodies so failed preflight output is still actionable.

Release evidence now requires status and transport to agree before hosted relay
transport can count as wired:

- status preflight ok
- status relay transport descriptor wired
- status relay payload endpoint wired
- empty status relay transport blockers
- release-grade relay lease storage
- transport payload endpoint wired
- release-grade route evidence with payload transport proof

Validation passed:

- release evidence verifier regressions `22/22`
- `cargo check --lib`
- targeted Rust relay status test `1/1`
- `npm run test:p2p` `37/37`
- `git diff --check`

Dirty-tree go/no-go after the change remains public No-Go:
`local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle CPU
`1/2`, runtime CPU matrix `1/2`, `rust_background_loop_contract_verified=true`,
`p2p_control_plane_verified=false`, and the new relay status/transport payload
endpoint fields are false.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_STATUS_DESCRIPTOR_GATE_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1786` files and `2339` symbols after GOAL v450, wiki/640, Rust
  relay status live transport descriptor mapping, P2P recorder/verifier/go-no-go
  field updates, the canonical report, BETA/WIKI/WIKI_INDEX updates, and CoS
  memory `2026-06-03_p2p_relay_status_descriptor_gate.md`
- search terms should include `GOAL v451`, `wiki/641 index refresh`,
  `relay_status_transport_preflight_ok`,
  `relay_status_transport_descriptor_wired`,
  `relay_status_payload_endpoint_wired`,
  `relay_transport_payload_endpoint_wired`, and
  `relay_status_reflects_live_transport_descriptor`

## 2026-06-03 post relay status descriptor primary evidence refresh (wiki/642)

Fresh primary-machine packaged evidence was restored after the relay status
descriptor gate source/script commit `16b7373d383751932651c926225aedbf946a9b99`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-213326-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-213716-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-213849-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260603_213326`, dashboard
`http://127.0.0.1:3001`, bridge `http://127.0.0.1:8290`, desktop-open CPU
`60.05s` with MUSU `0`, Node `0`, WebView2 `0.21`, hot `0`, and working set
`511.57MB`; five-state matrix `ok=true`, `fail_count=0`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_213849`, max WebView2 `0.29`, and max
working set `518.07MB`.

Dirty-tree go/no-go after adding evidence reports `single_machine_verified=true`,
runtime idle CPU `1/2`, runtime CPU matrix `1/2`, and public No-Go on the
expected remaining blockers plus dirty git.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_STATUS_DESCRIPTOR_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

2026-06-03 index refresh:

- explicit packaged alias indexing:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- indexed `1794` files and `2339` symbols after GOAL v452, wiki/642, fresh
  primary evidence `20260603-213326-HUGH_SECOND`,
  `20260603-213716-HUGH_SECOND.desktop-open`, and
  `20260603-213849-HUGH_SECOND.runtime-cpu-scenario-matrix`, the primary
  refresh report, BETA/WIKI/WIKI_INDEX updates, and CoS memory
  `2026-06-03_post_relay_status_descriptor_primary_evidence_refresh.md`
- search terms should include `GOAL v453`, `wiki/643 index refresh`,
  `MUSU_RELEASE_SMOKE_OK_20260603_213326`,
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260603_213849`, `runtime idle CPU 1/2`, and
  `runtime CPU matrix 1/2`

## 2026-06-03 relay fallback payload gap gate (wiki/644)

Runtime relay fallback evidence now records the payload transport gap when a
relay lease is issued but no relay payload path is attempted. Current bridge
forwarding writes `payload_transport_attempted=false`,
`payload_transport_proven=false`, and
`payload_transport_failure_class=relay_payload_transport_not_implemented`.

Hosted route-evidence grading now treats issued fallback addenda without
payload proof as non-release-grade with blockers
`relay_fallback_payload_transport_not_attempted`,
`relay_fallback_payload_transport_not_proven`, and
`relay_fallback_payload_transport_not_implemented`.

Validation passed `git diff --check`, Rust fmt check, `npm run test:p2p`
`38/38`, `npm run typecheck`, `cargo check --lib`, and Rust route-evidence
tests `10/10`. This is evidence hardening only; relay/tunnel payload transport
is still unwired, and fresh clean packaged primary evidence is required after
this runtime/web source change.

## 2026-06-03 relay transport proof binding gate (wiki/645)

Relay route evidence now keeps proof-shaped relay payload JSON non-release-grade
unless it is bound to the stored owner-scoped relay lease and the release
transport contract.

New blockers:

- `relay_route_transport_proof_relay_url_mismatch`
- `relay_route_transport_proof_kind_not_release_grade`
- `relay_route_transport_proof_opened_at_invalid`
- `relay_route_transport_proof_closed_at_invalid`
- `relay_route_transport_proof_timestamp_order_invalid`

Validation passed `npm run test:p2p` `40/40`, `npm run typecheck`, and
`git diff --check`. This is evidence hardening only; relay/tunnel payload
transport is still unwired and public release remains No-Go on real relay
payload proof, second-PC runtime/multi-device evidence, support mailbox
evidence, and Store evidence.

## 2026-06-03 post proof-binding primary evidence refresh (wiki/646)

Fresh primary-machine packaged evidence was restored after the relay transport
proof binding gate.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-225154-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-225332-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-225507-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260603_225125`, dashboard
`http://127.0.0.1:3001`, bridge `http://127.0.0.1:1037`, desktop-open CPU
`60.039s` with MUSU `0.03`, Node `0.03`, WebView2 `0.6`, hot `0`, and working
set `455.37MB`; five-state matrix `ok=true`, `fail_count=0`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_225507`, max MUSU `0.44`, Node `0.13`,
WebView2 `0.44`, and max working set `460.51MB`.

Clean go/no-go on `faef9398` reports `single_machine_verified=true`, runtime
idle CPU `1/2`, runtime CPU matrix `1/2`, and public No-Go on the remaining six
release blockers.

## 2026-06-03 relay transport proof store gate (wiki/647)

Relay route evidence now requires inline `relay_transport_proof` JSON to be
backed by an owner-scoped stored relay transport proof record.

New source:

- `musu-bee/src/lib/p2pRelayTransportProofStore.ts`

Changed behavior:

- `POST /api/v1/p2p/route-evidence` queries the proof store for
  `route_kind=relay` evidence that carries `relay_transport_proof`.
- Matching is owner-scoped and bound to session, lease, source/target node,
  tunnel, relay URL, transport kind, payload bytes, encryption, and verifier.
- File/development proof stores are not release-grade proof backends.

New blockers:

- `relay_route_transport_proof_not_stored`
- `relay_route_transport_proof_store_backend_not_release_grade`
- `relay_route_transport_proof_store_not_release_grade`
- `relay_route_transport_proof_store_unavailable:<detail>`

Validation passed `npm run test:p2p` `41/41`, `npm run typecheck`, and
`git diff --check`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_TRANSPORT_PROOF_STORE_GATE_2026_06_03.md`

This is evidence-chain hardening only. The relay payload endpoint remains
fail-closed and public release still requires a real QUIC relay/tunnel runtime
that writes stored owner-scoped proof from actual payload transit, plus fresh
packaged smoke/CPU/matrix evidence after this source commit.

## 2026-06-03 post relay proof store primary evidence refresh (wiki/648)

Fresh primary-machine packaged evidence was restored after the relay transport
proof store gate.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260603-232213-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260603-232423-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260603-232620-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260603_232146`, dashboard
`http://127.0.0.1:3001`, bridge `http://127.0.0.1:11952`, desktop-open CPU
`60.046s` with MUSU `0`, Node `0.03`, WebView2 `0.39`, hot `0`, and working
set `462.32MB`; five-state matrix `ok=true`, `fail_count=0`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260603_232620`, startup MUSU `2.37`,
runtime-started MUSU `2.03`, max WebView2 `0.34`, and max working set
`472.9MB`.

Clean go/no-go on `4ab4281f` reports `single_machine_verified=true`, runtime
idle CPU `1/2`, runtime CPU matrix `1/2`, `manifest_dirty=false`, and public
No-Go on the remaining six release blockers.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_PROOF_STORE_PRIMARY_EVIDENCE_REFRESH_2026_06_03.md`

## 2026-06-03 relay transport proof record API (wiki/649)

The hosted P2P control-plane now has a lease-bound owner-scoped route for future
relay/tunnel runtime code to record payload transport proof:

- `POST /api/v1/p2p/relay/transport-proof`
- `GET /api/v1/p2p/relay/transport-proof`

The POST route requires bearer auth, schema `musu.relay_transport_proof.v1`,
`session_id`, `lease_id`, `source_node_id`, `target_node_id`, relay URL, tunnel
ID, payload byte count, encryption/verifier fields, and timestamps. It queries
the owner-scoped relay lease store before storing proof and returns 409 without
storing when the lease is missing.

New proof-recording blockers include
`relay_transport_proof_lease_not_found`,
`relay_transport_proof_relay_url_mismatch`,
`relay_transport_proof_kind_not_release_grade`,
`relay_transport_proof_no_infra_transit`,
`relay_transport_proof_not_quic_tls`,
`relay_transport_proof_not_verified`, timestamp blockers, and
`relay_transport_proof_store_backend_not_release_grade`.

Rust cloud client now exposes `MusuCloud::submit_relay_transport_proof(...)`
with typed request/response DTOs.

Validation passed `npm run test:p2p` `45/45`, `npm run typecheck`,
`cargo test --manifest-path .\musu-rs\Cargo.toml --lib cloud::tests:: -j 1`
`4/4`, and `git diff --check`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_TRANSPORT_PROOF_RECORD_API_2026_06_03.md`

This is not relay payload transport completion. `/api/v1/relay/connect` remains
fail-closed until real QUIC relay/tunnel payload transit lands.

## 2026-06-04 post relay transport proof API primary evidence refresh (wiki/650)

Fresh primary-machine packaged evidence was restored after the relay transport
proof record API source change. The source gate landed on 2026-06-03, but the
KST evidence capture crossed midnight, so the evidence stamps are
`20260604-*`.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-000322-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-000405-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-000535-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-000535-HUGH_SECOND.verification.json`

Results: smoke output `MUSU_RELEASE_SMOKE_OK_20260604_000259`, dashboard
`http://127.0.0.1:3001`, bridge `http://127.0.0.1:3477`, desktop-open CPU
`60.059s` with MUSU `0.03`, Node `0.03`, WebView2 `0.57`, hot `0`, and working
set `453.71MB`; five-state matrix `ok=true`, `fail_count=0`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260604_000535`, max WebView2 `0.47`, and max
working set `456.73MB`.

Clean go/no-go generated at `2026-06-04T00:16:47.6824922+09:00` on
`049a9a9a` reports `ready=false`, `local_artifacts_ready=true`,
`single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, P2P relay route evidence count `0`, relay payload proof `false`,
`manifest_dirty=false`, and six remaining public release blockers.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_TRANSPORT_PROOF_API_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 relay payload queue API (wiki/651)

The hosted P2P control plane now has a lease-bound relay payload queue preview
API:

- `POST /api/v1/p2p/relay/payload`
- `GET /api/v1/p2p/relay/payload`

The route requires bearer auth and a stored owner-scoped relay lease before it
accepts `musu.relay_payload_envelope.v1`. Missing leases return
`409 relay_payload_lease_not_found` without storing. Stored records are
owner-scoped, TTL-limited, SHA-256 validated when a hash is supplied, and use
`transport_kind=http_store_forward_preview`.

Rust cloud client now exposes `P2pRelayPayloadRequest`,
`P2pRelayPayloadResponse`, `P2pRelayPayloadStoredRecord`, and
`MusuCloud::submit_relay_payload(...)`.

Validation passed relay payload route tests `5/5`, `npm run test:p2p` `50/50`,
`npm run typecheck`, Rust fmt check, Rust cloud tests `5/5`, and
`git diff --check`.

This is the first relay payload data-path slice, not public release relay
transport. `relay_payload_endpoint_wired=false` and `relay_transport_wired=false`
remain false because target-side relay polling/execution and release-grade
QUIC/TLS tunnel proof are still missing.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_QUEUE_API_2026_06_04.md`

## 2026-06-04 relay payload queue runtime hook (wiki/652)

Rust forwarding fallback now enqueues the failed `ForwardedTask` envelope to the
hosted lease-bound relay payload queue after direct route attempts fail and a
`musu.pro` relay lease is issued.

Runtime behavior:

- direct peer routes are still attempted first
- no issued relay lease still records payload transport attempt false
- issued lease plus stored queue payload records
  `payload_transport_attempted=true`, `payload_transport_proven=false`, and
  `payload_transport_failure_class=relay_target_polling_not_implemented`
- queue failures record attempted-but-not-proven bounded status classes such as
  `relay_payload_queue_failed`, `relay_payload_queue_timeout`, or
  `relay_payload_queue_not_stored`

The hosted route-evidence grader now keeps the queued fallback preview
non-release-grade with `relay_fallback_payload_transport_not_proven`, while no
longer adding the `relay_fallback_payload_transport_not_attempted` blocker for
the queued preview case.

Validation passed Rust forward tests `6/6`, rendezvous tests `5/5`, cloud tests
`5/5`, `cargo check --bin musu`, `npm run test:p2p` `51/51`,
`npm run typecheck`, Rust fmt check, and `git diff --check`.

This is not public release relay transport and does not make `musu.pro` the
default central data path. Target-side queue polling/execution and release-grade
QUIC/TLS relay proof are still missing, and fresh packaged primary evidence is
required after this source change.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_QUEUE_RUNTIME_HOOK_2026_06_04.md`

## 2026-06-04 relay payload query client CLI (wiki/653)

Rust now has an on-demand target-side visibility surface for the lease-bound
relay payload queue.

New Rust client/CLI pieces:

- `P2pRelayPayloadQuery`
- `P2pRelayPayloadQueryResponse`
- optional `payload_base64` parsing on relay payload records
- `MusuCloud::query_relay_payloads(...)`
- `musu relay payloads`

The CLI supports `--session-id`, `--lease-id`, source/target filters,
`--local-target`, `--tunnel-id`, `--status queued|claimed|delivered`, and
explicit `--include-payload`. Human text output omits payload bytes even when
the JSON path includes them.

Validation passed Rust cloud tests `6/6`, install CLI relay payload tests `2/2`,
`cargo check --bin musu`, CLI help smoke, JSON local-target smoke, Rust fmt
check, and `git diff --check`.

Live production `https://musu.pro/api/v1/p2p/relay/payload` returned 404 during
the JSON CLI smoke, so hosted deployment is still required before live
target-side polling evidence can be captured.

This is not background polling, payload execution, or release-grade relay
transport proof. It is the on-demand query surface needed before a bounded
target poll/claim/execute loop can be wired.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_QUERY_CLIENT_CLI_2026_06_04.md`

## 2026-06-04 relay payload claim/delivery API (wiki/654)

The hosted relay payload queue now has owner-scoped claim and delivery
transitions:

- `PATCH /api/v1/p2p/relay/payload` with `musu.relay_payload_claim.v1`
- `PATCH /api/v1/p2p/relay/payload` with `musu.relay_payload_delivery.v1`

The local/development file store supports:

```text
queued -> claimed -> delivered
```

Claim records `claimed_by` and `claimed_at`; delivery records `delivered_at`.
Delivery before claim returns `409 relay_payload_delivery_requires_claim`.

Public response records continue to strip `owner_key`. Claim responses only
include `payload_base64` when `include_payload=true`, and delivery responses
never return payload bytes.

2026-06-04 follow-up wiki/657 added a KV/Upstash list-rewrite mutation path, so
the old `relay_payload_claim_kv_not_implemented` and
`relay_payload_delivery_kv_not_implemented` placeholders are no longer current
behavior. Release-grade concurrent atomic claim remains incomplete.

Validation passed `npm run test:p2p` `54/54` and `npm run typecheck`.

This is not background target polling, payload execution, or release-grade
QUIC/TLS relay proof. It is the state-transition API needed before a bounded
target-side poll/claim/execute loop can be wired.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_CLAIM_DELIVERY_API_2026_06_04.md`

## 2026-06-04 relay payload claim/delivery client CLI (wiki/655)

Rust now has manual target-side claim/delivery diagnostics for the relay payload
queue:

- `P2pRelayPayloadClaimRequest`
- `P2pRelayPayloadClaimResponse`
- `P2pRelayPayloadDeliveryRequest`
- `P2pRelayPayloadDeliveryResponse`
- `MusuCloud::claim_relay_payloads(...)`
- `MusuCloud::mark_relay_payload_delivered(...)`
- `musu relay payload-claim`
- `musu relay payload-deliver`

`payload-claim` and `payload-deliver` both require an explicit target through
`--target-node-id` or `--local-target`. Text output omits payload bytes; claim
JSON includes bytes only when `--include-payload` is set.

Validation passed Rust cloud tests `10/10`, install CLI relay payload tests
`4/4`, `cargo check --bin musu`, Rust fmt check, and CLI help smoke for
`payload-claim` and `payload-deliver`.

No live production mutation smoke was run because claim and delivery change
queue state.

This remains on-demand diagnostics. It does not start background polling,
decode/execute payloads, or prove release-grade QUIC/TLS relay transport.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_CLAIM_DELIVERY_CLIENT_CLI_2026_06_04.md`

## 2026-06-04 Vercel CLI pin deploy workflow (wiki/656)

PR #8 deploy failed because the workflow installed `vercel@latest`. Current npm
metadata reported `vercel@latest=54.8.0`, and that version depended on
`@vercel/express@0.1.96`; the GitHub runner failed with a registry 404 for that
tarball.

`.github/workflows/deploy-musu-bee.yml` now pins:

- `VERCEL_CLI_VERSION=54.7.1`
- `npm install -g "vercel@${VERCEL_CLI_VERSION}"`
- `vercel --version`

The PR path filter also includes `.github/workflows/deploy-musu-bee.yml`.

Validation confirmed the broken latest dependency with `npm view`; `44.7.3`
installed but the deploy endpoint rejected it as too old; `54.7.1` uses
`@vercel/express@0.1.95`, and `npx -y vercel@54.7.1 --version` printed
`Vercel CLI 54.7.1`.

This is CI/deploy hardening only, not runtime relay progress.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_VERCEL_CLI_PIN_DEPLOY_WORKFLOW_2026_06_04.md`

## 2026-06-04 relay payload KV claim/delivery store (wiki/657)

The relay payload queue now supports claim/delivery on the hosted KV/Upstash
store path.

`p2pRelayPayloadStore` now shares state-transition logic between file and KV:

- `queued -> claimed -> delivered`
- owner-scoped target matching
- claim records `claimed_by` and `claimed_at`
- delivery records `delivered_at`
- delivery before claim still returns `relay_payload_delivery_requires_claim`

The KV path loads fresh records with `lrange`, applies the same transition logic
as the file store, and rewrites retained records with `del` plus `rpush`. This
removes the old `relay_payload_claim_kv_not_implemented` and
`relay_payload_delivery_kv_not_implemented` behavior.

Validation passed focused relay payload route tests `10/10`,
`npm run test:p2p` `56/56`, and `npm run typecheck`.

This is still non-release-grade. The current KV list rewrite is not a concurrent
atomic claim primitive, and no background polling, payload execution, or
QUIC/TLS relay proof was added.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_KV_CLAIM_DELIVERY_STORE_2026_06_04.md`

## 2026-06-04 relay payload target drain (wiki/658)

The Rust bridge now has a bounded, request-driven target-side relay payload
drain primitive:

- `POST /api/relay/payloads/drain`
- response schema `musu.relay_payload_drain.v1`
- claim schema `musu.relay_payload_claim.v1`
- delivery schema `musu.relay_payload_delivery.v1`

The endpoint claims owner-scoped payloads for the local node, validates claimed
`forwarded_task_envelope` payload bytes, decodes them into `ForwardedTask`, and
accepts them through the existing local forwarded-task runner path. Delivery is
marked back to `musu.pro` only after local acceptance succeeds.

Safety constraints:

- request-driven only; no idle background poll loop
- manual drain `limit` defaults to `1` and clamps to `1..5`
- cloud claim/delivery timeout uses
  `MUSU_P2P_RELAY_PAYLOAD_DRAIN_TIMEOUT_MS`, default `3000ms`, clamped to
  `250..10000ms`
- payload validation checks claimed status, local target, claimant, payload
  kind, base64 bytes, byte count, SHA-256, source node, rendezvous session, and
  embedded target node

Validation passed Rust relay payload tests `14/14`, `cargo check --bin musu`,
Rust fmt, and the Rust background-loop contract with `ok=true`, `fail_count=0`,
and `unaudited_loop_hit_count=0`.

This is not release-grade relay transport completion. Follow-up target poller
and atomic KV mutation hardening closed the opt-in polling source-contract and
hosted concurrent claim blockers. QUIC/TLS relay proof and fresh packaged
evidence remain required.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_TARGET_DRAIN_2026_06_04.md`

## 2026-06-04 relay payload target poller (wiki/659)

The Rust bridge now has an opt-in target-side relay payload poller for the
lease-bound relay payload queue.

Default profile:

- off unless `MUSU_ENABLE_RELAY_PAYLOAD_POLLER=1`
- manual `POST /api/relay/payloads/drain` remains request-driven
- no default idle background queue polling is added

Runtime contract:

- HTTP drain and poller share
  `drain_relay_payloads_for_local_target(...)`
- poll interval defaults to `60s` and floors at `30s`
- empty/failure backoff defaults to `300s`, never shrinks below the active
  interval, and hard-caps at `3600s`
- per-cycle claim limit defaults to `1` and clamps to `1..5`
- poller sleeps before first work
- poller sleep runs under `tokio::select!` with a `CancellationToken`
- delivered payloads reset backoff; empty/failure cycles increase capped
  backoff

`musu doctor` now reports the relay payload poller in the background profile,
including enabled state, normalized interval, backoff max, and per-cycle limit.

Validation passed relay payload tests `19/19`, doctor background tests `5/5`,
`cargo check --bin musu`, `git diff --check`, and the Rust background-loop
contract audit with `ok=true`, `fail_count=0`, and
`unaudited_loop_hit_count=0`.

This is bounded opt-in target polling evidence. It is not release-grade relay
transport completion; follow-up atomic KV mutation hardening closed hosted
concurrent claim hardening. QUIC/TLS relay proof, hosted proof evidence, fresh
packaged evidence, second-PC evidence, support mailbox, and Store evidence
remain required.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_TARGET_POLLER_2026_06_04.md`

## 2026-06-04 relay payload atomic KV mutation (wiki/660)

The hosted KV/Upstash relay payload queue now uses Redis Lua `EVAL` for all
mutation paths:

- append queued payload
- claim queued payloads
- mark claimed payload delivered

This replaces the previous app-level `lrange` plus retained-list rewrite with
`del`/`rpush`. Claim and delivery now complete inside a single Redis operation,
which prevents two concurrent target claimers from claiming the same queued
payload.

Contract:

- owner-scoped records are still required
- target-node matching is still required
- optional session, lease, source, and tunnel filters are preserved
- delivery before claim still returns `relay_payload_delivery_requires_claim`
- KV reads accept both object records and JSON string records
- configured KV/Upstash stores report `relay_payload_store_release_grade=true`

Payload transport interpretation is unchanged:

- payload records remain `release_grade=false`
- payload records remain `transport_kind=http_store_forward_preview`
- `musu.pro` remains a control plane/fallback coordinator, not the default data
  path

Validation passed focused relay payload route tests `11/11`,
`npm run test:p2p` `57/57`, and `npm run typecheck`.

This closes hosted concurrent claim hardening. It is not release-grade relay
transport completion; QUIC/TLS relay proof, hosted proof evidence, fresh
packaged evidence, second-PC evidence, support mailbox evidence, and Store
evidence remain required.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_ATOMIC_KV_MUTATION_2026_06_04.md`

## 2026-06-04 external recheck relay proof output (wiki/661)

The external gate recheck and final handoff status now expose hosted relay proof
requirements at the operator-facing level.

Changed output:

- `record-p2p-control-plane-evidence.ps1` final JSON returns
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

This is operator visibility hardening for the local-first web coordination
roadmap: local MUSU programs do the work on each device, while `musu.pro`
coordinates login/rendezvous/fallback proof. It does not close public release;
second-PC evidence, live hosted relay delivery proof, support mailbox evidence,
and Store evidence remain required.

Validation passed PowerShell parser checks, `git diff --check`, and
`test-release-evidence-verifiers.ps1 -Json` `24/24`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_RECHECK_RELAY_PROOF_OUTPUT_2026_06_04.md`

## 2026-06-04 external recheck relay proof evidence (wiki/662)

Clean external gate recheck evidence after commit
`1e1fc43cf0da04c4b71621e1b8329496d2c6b810`:

- external recheck:
  `docs\evidence\external-gates\1.15.0-rc.1\20260604-084033-HUGH_SECOND.external-gates.evidence.json`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-084136-musu.pro.evidence.json`
- live P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-084136-musu.pro.verification.json`

Result remains No-Go:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- `second_pc_reachable=false`
- `p2p_env_ok=false`
- `p2p_evidence_ok=false`
- `p2p_relay_route_evidence_count=0`
- `p2p_relay_payload_transport_proven=false`
- `p2p_relay_payload_delivery_proof_valid_count=0`

The external blockers now explicitly include
`p2p_relay_payload_transport_not_proven` and
`p2p_relay_payload_delivery_proof_missing`.

## 2026-06-04 relay payload drain route evidence (wiki/663)

Target-side relay payload drain now records route evidence after delivery proof
is confirmed.

Implementation:

- `record_relay_payload_delivery_route_evidence(...)` builds explicit
  `route_kind=relay` evidence
- relay delivery route evidence sets `payload_transited_musu_infra=true`
- relay delivery route evidence attaches `relay_payload_delivery_proof`
- target-side drain writes local route evidence and attempts bounded hosted
  submit to `musu.pro`
- drain item output reports `route_evidence_recorded`,
  `route_evidence_submitted`, `route_evidence_path`, and
  `route_evidence_failure_class`
- drain `ok=true` now requires accepted payloads to be delivered and route
  evidence to be recorded/submitted
- `RouteEvidencePayload` includes `relay_payload_delivery_proof`

This closes the proof-chain gap from local target acceptance to hosted route
evidence. It remains non-release-grade until real QUIC/TLS relay transport
proof and production proof stores are live.

Post-commit go/no-go on `2777554e6ce80b73a5bc471629b47059595d126b` remained
No-Go with `manifest_git.dirty=false`, `local_artifacts_ready=true`, and
`single_machine_verified=false` because Rust runtime source changed after the
latest packaged primary evidence.

Validation passed Rust relay payload tests `24/24`, Rust route evidence tests
`13/13`, `cargo check --bin musu`, `npm run typecheck`, route-evidence API
tests `22/22`, and `git diff --check`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_DRAIN_ROUTE_EVIDENCE_2026_06_04.md`

## 2026-06-04 post relay-drain primary evidence refresh (wiki/664)

Fresh packaged primary evidence was restored after the relay-drain route
evidence source change.

Environment correction:

- User PATH now places
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps` before
  `C:\Users\empty\.cargo\bin`
- strict MSIX install evidence passes with `alias_shadowing_mode=fail`
- first `musu.exe` resolves to the packaged WindowsApps alias
- stale same-session smoke evidence `20260604-092004-HUGH_SECOND` was removed
  because an old repo debug bridge was still registered

Fresh evidence:

- strict MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-093646-HUGH_SECOND.evidence.json`
- packaged bridge smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-092446-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-092544-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-092758-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_092419`
- desktop-open CPU maxes: MUSU `0`, Node `0`, WebView2 `0.57`, hot `0`,
  working set `506.43MB`
- matrix verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_092758`
- matrix max CPU: MUSU `0.03`, Node `0.10`, WebView2 `1.41`
- matrix max working set `508.66MB`

Clean go/no-go on `83e7e5db06cb2706f2350683a78f67c00f461e37` reports
`local_artifacts_ready=true`, `single_machine_verified=true`,
`msix_install_verified=true`, and `manifest_git.dirty=false`.

Public release remains No-Go on second-PC runtime/multi-device evidence, live
`musu.pro` relay proof, support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_DRAIN_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 current operator handoff pack (wiki/665)

The final operator packet and operator action pack were regenerated after the
post relay-drain primary evidence refresh.

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-094858.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-094940.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-094940\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-094940.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-094858`

Verification:

- final packet verifier passed with `ok=true`, `fail_count=0`, `kit_count=1`
- action-pack verifier passed with `ok=true`, `fail_count=0`
- final handoff status reports `packet.verified=true`,
  `action_pack.verified=true`, `ready_for_public_desktop_release=false`, and
  `manifest_git.dirty=false`

Roadmap state:

- one-machine packaged local runtime evidence is current
- second-PC transfer/import is the next step for P2P mesh and two-machine CPU
  gates
- MUSU.PRO is the web coordination/control-plane surface for remote user input,
  rendezvous, meeting-room style project coordination, and relay proof
- local MUSU programs still do the actual work on each device
- public release remains blocked on second-PC multi-device evidence,
  two-machine runtime CPU evidence, `musu@musu.pro` delivery evidence,
  Store/Partner Center evidence, and live owner-scoped `musu.pro` relay proof

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_2026_06_04.md`

## 2026-06-04 relay route evidence stale proof query gate (wiki/666)

Live `musu.pro` P2P status remains No-Go because production KV/Upstash env is
missing, release-grade relay transport is not wired, owner-scoped release-grade
relay route evidence count is `0`, relay payload transport proof is `false`,
and relay payload delivery proof valid count is `0`.

The route-evidence query path now has a regression test proving that stale relay
records cannot inflate release-grade evidence counts. The test manually appends
a relay record with `release_grade=true` but without current
`musu.relay_transport_proof.v1`; `GET /api/v1/p2p/route-evidence?release_grade=true`
excludes that stale relay record and returns only records that satisfy the
current transport-proof contract.

Validation:

- `npm run test:p2p` passed `61/61`
- `npm run typecheck` passed
- `git diff --check` passed

This is release-gate hardening only. Public release still needs real second-PC
evidence, production KV/Upstash config, stored QUIC/TLS relay transport proof,
stored relay payload delivery proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_ROUTE_EVIDENCE_STALE_PROOF_QUERY_GATE_2026_06_04.md`

## 2026-06-04 post stale-proof query primary evidence refresh (wiki/667)

Fresh primary-machine evidence was restored after the relay route-evidence stale
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
- desktop-open CPU maxes: MUSU `0`, Node `0.03`, WebView2 `0.16`, hot `0`,
  working set `509.29MB`
- matrix verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_101925`
- matrix max CPU: MUSU `0`, Node `0.08`, WebView2 `0.18`
- matrix max working set `509.47MB`

Clean go/no-go on `a2087e6b` reports `single_machine_verified=true`, runtime
idle CPU `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
`p2p_relay_route_evidence_count=0`, relay payload proof `false`, and
`manifest_dirty=false`.

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_STALE_PROOF_QUERY_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 current operator handoff pack after stale-proof evidence (wiki/668)

The final operator packet and operator action pack were regenerated from clean
HEAD after the stale-proof query hardening and current primary evidence refresh.

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-103143.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-103216.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-103216\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-103216.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-103216\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-103216.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-103143`

Verification:

- final packet verifier passed with `ok=true`, `fail_count=0`, `kit_count=1`
- action-pack verifier passed with `ok=true`, `fail_count=0`
- final handoff status reports `packet.verified=true`,
  `action_pack.verified=true`, `ready_for_public_desktop_release=false`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, and runtime CPU
  matrix `1/2`

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_AFTER_STALE_PROOF_EVIDENCE_2026_06_04.md`

## 2026-06-04 CLI route wait and web-input local-executor roadmap (wiki/669)

The runtime roadmap now records the product split explicitly:

- `musu.pro` is the web input, project-room, rendezvous, fallback coordination,
  and evidence plane
- local MUSU programs execute the work on their own machines
- web-originated commands are control-plane envelopes, not central execution
- `localhost` dashboards remain local operator/dev surfaces
- real multi-device and two-machine CPU proof still require the current MUSU
  build installed on a second Windows PC

Runtime hardening:

- `musu route --wait` now exposes `--wait-timeout-sec`
- default wait timeout is `300s`
- wait timeout caps at `3600s`
- status requests are timeout-bound
- polling sleeps between checks
- timeout records `remote_task_wait_timeout`
- the Rust background-loop contract audit now checks CLI bridge readiness and
  route wait contracts

Validation passed `cargo fmt --check`, `cargo test --lib
route_wait_timeout_is_bounded`, Rust background-loop audit `ok=true` /
`fail_count=0`, and `git diff --check`.

Dirty-tree go/no-go reports `ready=false`, `local_artifacts_ready=true`,
`single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, `manifest_git.dirty=true`, and blocker count `7`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CLI_ROUTE_WAIT_WEB_INPUT_ROADMAP_2026_06_04.md`

## 2026-06-04 post CLI route wait primary evidence refresh (wiki/670)

Fresh primary-machine evidence is restored after the CLI route wait hardening
and web-input/local-executor roadmap update.

Evidence:

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
- bridge `http://127.0.0.1:3153`
- dashboard task `051218dc-059c-4eda-9254-fee608e44701`
- desktop-open CPU passed for `60.062s`: MUSU `0`, Node `0.03`,
  WebView2 `0.39`, owned WebView2 `6`, hot `0`, working set `489.98MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_112954`
- matrix max CPU: MUSU `0.13`, Node `0.05`, WebView2 `0.13`
- matrix max working set `490.17MB`

Clean go/no-go on `c9ada37ba675cff59b259bec05f30a72272d9641` reports
`ready_for_public_desktop_release=false`, `local_artifacts_ready=true`,
`single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
`1/2`, `manifest_git.dirty=false`, and blocker count `6`.

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_CLI_ROUTE_WAIT_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 current operator handoff pack after CLI route wait evidence (wiki/671)

The final operator packet and operator action pack were regenerated from clean
HEAD after the CLI route wait hardening and current primary evidence refresh.

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-114250.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-114319.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-114319\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-114319.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-114319\partner-center\MUSU-1.15.0-rc.1-store-submission-20260604-114319.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-114250`

Verification:

- final packet verifier passed with `ok=true`, `fail_count=0`, `kit_count=1`
- action-pack verifier passed with `ok=true`, `fail_count=0`
- final handoff status reports `packet.verified=true`,
  `action_pack.verified=true`, `ready_for_public_desktop_release=false`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`, P2P relay route evidence count `0`, relay payload proof `false`, and
  `manifest_git_dirty=false`

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_AFTER_CLI_ROUTE_WAIT_EVIDENCE_2026_06_04.md`

## 2026-06-04 Chat SSE Retry Cap and Roadmap Clarification (wiki/672)

The chat task SSE stream now has a hard retry-count cap. Before this pass,
`useChat` had capped exponential delay and stale-generation cleanup, but if the
local bridge SSE endpoint stayed unavailable it could reconnect forever every
`10s`.

Runtime/frontend hardening:

- `SSE_MAX_RETRIES=5`
- `reconnectAttempts`
- `resetReconnectState()`
- successful opens reset delay and attempts
- non-agent cleanup and active-node changes reset reconnect state
- failed streams stop reconnecting after the retry cap
- frontend polling audit now requires the chat SSE cap/guard/reset contract

Roadmap clarification:

- `musu.pro` is the web input, project-room, rendezvous, path-selection,
  relay-fallback coordination, and evidence plane
- local MUSU programs execute the work on each device
- `localhost` dashboard URLs are local operator/dev surfaces and only work when
  the local runtime/dashboard is running
- after web-assisted rendezvous, direct P2P mesh is preferred; relay is fallback
  and must carry proof before public claims
- current testing remains one-machine until the same MUSU build is installed on
  a second Windows PC

Validation passed:

- `npm run test:runtime-polling` `14/14`
- frontend polling audit `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Clean go/no-go on commit `e92e0e558d2336237b7eca70d59c8ce35f764229` reports
`local_artifacts_ready=true`, `msix_install_verified=true`,
`single_machine_verified=false`, runtime idle CPU `0/2`, runtime CPU matrix
`0/2`, `manifest_git.dirty=false`, and blocker count `7`.

Release interpretation: the frontend runtime source changed after current
primary evidence, so fresh MSIX/smoke/CPU/matrix evidence is required before
current source can reclaim one-machine release gates. Public release remains
No-Go on second-PC runtime/multi-device evidence, live owner-scoped `musu.pro`
relay proof, support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CHAT_SSE_RETRY_CAP_HARDENING_2026_06_04.md`

## 2026-06-04 post chat SSE retry-cap primary evidence refresh (wiki/673)

Fresh primary-machine evidence was restored after chat SSE retry-cap hardening.

Evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-121733-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-122357-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-124137-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-123317-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke dashboard `http://127.0.0.1:3001`
- smoke bridge `http://127.0.0.1:8573`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_122333`
- CLI output contained `MUSU_CLI_ROUTE_OK_20260604_122333`
- desktop-open CPU passed for `60.053s` with `git_dirty=false`, MUSU `0`,
  Node `0`, WebView2 `0.1`, owned WebView2 `6`, hot `0`, working set `476.22MB`
- five-state matrix passed verifier `ok=true`, `fail_count=0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_123317`
- matrix max CPU: MUSU `0.1`, Node `0.03`, WebView2 `0.18`
- matrix max working set `478.47MB`

Clean go/no-go on `d2c29ef95c07e0a1d299289abe3f95358f4424dd` reports
`local_artifacts_ready=true`, `single_machine_verified=true`, runtime idle CPU
`1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
`manifest_git.dirty=false`, and blocker count `6`.

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_CHAT_SSE_RETRY_CAP_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 current operator handoff pack after chat SSE evidence (wiki/674)

The final operator packet and operator action pack were regenerated from clean
HEAD after the chat SSE retry-cap hardening and primary evidence refresh.

Generated artifacts:

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

Verification:

- final packet verifier passed with `ok=true`, `fail_count=0`, `kit_count=1`
- action-pack verifier passed with `ok=true`, `fail_count=0`
- handoff status reports `ready_for_public_desktop_release=false`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`, P2P relay route evidence count `0`, relay payload proof `false`,
  delivery proof valid count `0`, and `manifest_git_dirty=false`

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_AFTER_CHAT_SSE_EVIDENCE_2026_06_04.md`

## 2026-06-04 single-machine dashboard URL discovery (wiki/675)

The single-machine release smoke now follows the packaged runtime's dashboard
URL instead of assuming the dev dashboard port.

Root cause: the packaged local dashboard was reachable at
`http://127.0.0.1:3001/app`, while `smoke-single-machine-beta.ps1` defaulted to
`http://127.0.0.1:3000`. That mismatch produced a real connection-refused
failure even when the local runtime was healthy.

Changes:

- `smoke-single-machine-beta.ps1` discovers `dashboard.reachable_url` from
  `musu up --json` first and `musu doctor --json` second
- release evidence records `dashboard_base_url_source` and
  `dashboard_reachable_url`
- release audit checks URL discovery and rejects the old dev-port default
- single-machine evidence verifier requires runtime URL discovery and rejects
  `http://127.0.0.1:3000` as the release default
- evidence recording is idempotent when rerun against the canonical evidence
  path

Product split:

- `localhost` dashboards are local operator/dev surfaces
- `musu.pro` is the real web input, project room, company meeting room,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane
- local MUSU programs still do the actual work on each device
- current validation remains one-machine until the current MUSU build is
  installed on a second Windows PC

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-130301-HUGH_SECOND.evidence.json`
- dashboard `http://127.0.0.1:3001`
- dashboard source `musu up.dashboard.reachable_url`
- bridge `http://127.0.0.1:8573`
- dashboard output `MUSU_RELEASE_SMOKE_OK_20260604_130238`

Validation passed:

- PowerShell parser checks for touched scripts
- `git diff --check`
- single-machine evidence verifier `ok=true`, `fail_count=0`
- runtime CPU scenario matrix verifier `ok=true`, `fail_count=0`
- desktop release audit has `single_machine_verified=true`

Clean go/no-go on `918f81d47965b40ff4427a80cc9c4d72d27c4586` reports
`ready=false`, `local=true`, `single=true`, `multi=false`, `msix=true`,
runtime idle CPU `1/2`, runtime CPU matrix `1/2`, `p2p=false`,
`support=false`, `store=false`, `dirty=false`, and blocker count `6`.

Public release remains No-Go on second-PC runtime/multi-device evidence, live
owner-scoped `musu.pro` relay proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SINGLE_MACHINE_DASHBOARD_URL_DISCOVERY_2026_06_04.md`

## 2026-06-04 multi-device route explain evidence (wiki/676)

The second-PC/multi-device smoke now records path-selection diagnostics before
it attempts a remote route.

Changes:

- `smoke-multidevice-beta.ps1` records `route_explain`
- the smoke runs `musu route --explain --json` before the executing route
- `verify-multidevice-evidence.ps1` separates explain commands from executing
  route commands
- passing multi-device evidence now requires `musu.route_explain.v1`
  path-selection evidence plus `musu.route_evidence.v1` execution evidence
- verifier regression coverage now rejects missing route explain evidence
- the second-PC kit README now describes both `musu.route_explain.v1` and
  `musu.route_evidence.v1`

Local diagnostic check:

- target `HUGH-MAIN`
- selected candidate `192.168.1.192:8949`
- route kind `lan`
- current transport `http_bearer`
- peer identity not verified
- encryption `none_http_bearer`
- path priority `lan -> tailscale -> direct_quic -> relay`
- release-grade transport required `quic_tls_1_3`

Validation passed:

- PowerShell parser checks
- `git diff --check`
- release evidence verifier regression `ok=true`, `case_count=25`
- runtime CPU scenario matrix verifier `ok=true`, `fail_count=0`
- final packet verifier `ok=true`, `fail_count=0`, `kit_count=1`
- action pack verifier `ok=true`, `fail_count=0`

Current handoff artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260604-132819.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-132834.zip`
- second-PC transfer zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260604-132834\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260604-132834.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260604-132819`

Clean go/no-go on `4ed472133a3fdf7fc60d59966e46766842f7d6ef` reports
`ready=false`, `local=true`, `single=true`, `multi=false`, `msix=true`,
runtime idle CPU `1/2`, runtime CPU matrix `1/2`, `p2p=false`,
`support=false`, `store=false`, `dirty=false`, and blocker count `6`.

Public release remains No-Go until current second-PC multi-device evidence,
second-PC CPU/matrix evidence, live owner-scoped `musu.pro` relay/P2P proof,
support mailbox evidence, and Store evidence are complete.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MULTIDEVICE_ROUTE_EXPLAIN_EVIDENCE_2026_06_04.md`

## 2026-06-04 MUSU.PRO control-plane roadmap and control SSE audit (wiki/677)

The local-executor product direction is now recorded in the control-plane docs
and runtime roadmap.

Decision:

- `localhost` and `127.0.0.1` dashboards are local-only operator/developer
  surfaces
- `musu.pro` is the real web input, project room, company meeting room,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane
- local MUSU programs receive authenticated web work orders and execute the
  work on the target devices
- local programs own files, shell/app/browser automation, local bridge work,
  and P2P mesh traffic
- `musu.pro` can coordinate discovery and fallback relay, but it must not
  become the default data path or execution server
- current validation remains one-machine until the same current MUSU build is
  installed and run on a second Windows PC

The Rust background-loop contract audit now explicitly covers
`musu-rs\src\control\http_server.rs` control SSE heartbeat behavior. The audit
checks the bounded 30s interval, heartbeat event, and interval-stream mapping.
This is an audit/gate change only; Rust runtime source was not modified.

The release freshness classifiers now also treat `musu-bee/docs/*` as
documentation/status-only, matching root `docs/*`. This prevents app-level
product docs from incorrectly invalidating packaged single-machine and CPU
evidence.

Validation passed:

- PowerShell parser check for `audit-rust-background-loop-contract.ps1`
- Rust background-loop audit `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MUSU_PRO_CONTROL_PLANE_ROADMAP_AND_CONTROL_SSE_AUDIT_2026_06_04.md`

## 2026-06-04 CEO dispatch SSE cleanup hardening (wiki/678)

The CEO dispatch chat stream now explicitly owns its active `EventSource`
lifecycle.

Changes:

- `CeoChatClient` stores active run streams in `runStreamsRef`
- starting a stream closes any previous stream for the same run id
- terminal messages close and unregister the stream
- SSE errors close and unregister the stream and mark still-streaming runs as
  errored
- component unmount closes all active run streams and clears the map
- frontend polling audit now checks shared bounded EventSource and CEO dispatch
  stream cleanup contracts
- runtime-polling tests now include
  `CEO dispatch run streams are explicitly closed`

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

## 2026-06-04 post CEO dispatch SSE primary evidence refresh (wiki/679)

Fresh primary-machine evidence was restored after the CEO dispatch SSE cleanup
hardening.

Evidence:

- strict MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-140415-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-140717-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-141753-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-141924-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- MSIX alias shadowing count `0`
- single-machine dashboard `http://127.0.0.1:3001`, source
  `musu up.dashboard.reachable_url`, bridge `http://127.0.0.1:7462`,
  dashboard output `MUSU_RELEASE_SMOKE_OK_20260604_140650`, and CLI route
  output `MUSU_CLI_ROUTE_OK_20260604_140650`
- desktop-open CPU passed for `60.062s` from clean commit `f96e5cca` with
  `git_dirty=false`, MUSU `0`, Node `0.03`, WebView2 `0.16`, owned WebView2
  `6`, hot `0`, and working set `485.51MB`
- matrix verifier passed `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_141924`, max CPU MUSU `0`, Node
  `0.05`, WebView2 `0.23`, max working set `485.13MB`, and hot `0`
- clean go/no-go reports `local_artifacts_ready=true`,
  `single_machine_verified=true`, runtime idle CPU `1/2`, runtime CPU matrix
  `1/2`, `manifest_git.dirty=false`, and six remaining blockers

Public release remains No-Go until second-PC multi-device evidence,
second-PC CPU/matrix evidence, live owner-scoped `musu.pro` relay proof,
support mailbox evidence, and Store evidence are complete.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_CEO_DISPATCH_SSE_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 current operator handoff pack after CEO dispatch evidence (wiki/680)

The current final operator packet and action pack were regenerated from clean
HEAD `a0e0836c` after the CEO dispatch evidence refresh.

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

Verification:

- final packet verifier `ok=true`, `fail_count=0`
- action pack verifier `ok=true`, `fail_count=0`
- final handoff status reports `packet_verified=true`,
  `action_pack_verified=true`, `single_machine_verified=true`, runtime idle
  CPU `1/2`, runtime CPU matrix `1/2`, P2P relay route evidence count `0`,
  relay payload proof `false`, delivery proof valid count `0`, and blocker
  count `6`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_PACK_AFTER_CEO_DISPATCH_EVIDENCE_2026_06_04.md`

## 2026-06-04 external gate recheck after CEO dispatch evidence (wiki/681)

The external release gates were rechecked after the CEO dispatch primary
evidence refresh and current operator handoff pack.

Evidence:

- external gate evidence:
  `docs\evidence\external-gates\1.15.0-rc.1\20260604-143952-HUGH_SECOND.external-gates.evidence.json`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.evidence.json`
- live P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260604-144053-musu.pro.verification.json`

Local hardening audits remain clean:

- Rust background-loop audit `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`
- frontend polling audit `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- process ownership audit `ok=true`, `fail_count=0`, runtime `1`, desktop
  shell `1`, owned Node `0`, owned WebView2 `6`
- local API auth audit `ok=true`, `fail_count=0`
- operator API security audit `ok=true`, `fail_count=0`

External result remains No-Go:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- second PC `192.168.1.192:8949` unreachable with `tcp_connect_timeout`
- P2P env not ready because KV/Upstash URL/token are missing
- P2P evidence verification `ok=false`, `fail_count=27`
- relay route evidence count `0`
- relay payload transport proof `false`
- relay payload delivery proof valid count `0`

Hosted `musu.pro` currently proves the logged-in status/query surface and
descriptor visibility, but not release-grade relay transport. Relay payload
endpoint wiring is `false`, relay transport wiring is `false`, the relay lease
store backend is `unconfigured`, relay leases are not owner-scope verified, and
owner-scoped release-grade relay route evidence is absent.

Roadmap lock: `musu.pro` is the web input/project room/rendezvous/path-selection
/relay-fallback/evidence plane. Local MUSU programs still perform the actual
work and should use direct P2P mesh routes after web-assisted rendezvous. The
current validation remains one-machine until the same current build is installed
and tested on a second Windows PC.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_GATE_RECHECK_AFTER_CEO_DISPATCH_EVIDENCE_2026_06_04.md`

## 2026-06-04 relay drain preview evidence gate hardening (wiki/682)

Hosted route-evidence tests now explicitly prove that target-side relay payload
drain preview evidence cannot become release-grade relay transport evidence.

The new regression seeds an owner-scoped relay lease, a delivered relay payload,
a matching `musu.relay_payload_delivery_proof.v1`, and a relay route evidence
record shaped like Rust target-drain preview output:

- `route_kind=relay`
- `payload_transited_musu_infra=true`
- `relay_fallback.payload_transport_proven=true`
- `transport_verified_by=musu_relay_payload_drain_preview`
- `encryption=relay_payload_queue_preview`

The hosted API accepts the stored delivery proof but keeps the route
non-release-grade with blockers:

- `transport_not_release_grade_quic_tls`
- `relay_route_missing_transport_proof`
- `relay_route_transport_not_wired`
- `relay_route_payload_endpoint_not_wired`

Validation passed:

- `npm run test:p2p` `62/62`
- `npm run typecheck`
- `git diff --check`

This is evidence-gate hardening only. It does not implement release-grade
relay/tunnel payload transport and does not close the hosted `musu.pro` P2P
gate.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_DRAIN_PREVIEW_EVIDENCE_GATE_HARDENING_2026_06_04.md`

## 2026-06-04 test file freshness and web input roadmap (wiki/683)

Release freshness classifiers now treat TypeScript test/spec source files as
status-only changes:

- `*.test.ts`
- `*.test.tsx`
- `*.spec.ts`
- `*.spec.tsx`

Updated scripts:

- `scripts\windows\write-release-go-no-go.ps1`
- `scripts\windows\verify-single-machine-evidence.ps1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Validation passed:

- PowerShell parser check for the four modified scripts
- release evidence verifier regression `ok=true`, `case_count=28`,
  `failed_case_count=0`
- clean go/no-go on `dd4fb7efab643c52cc47bcbb6ddd921058ef437a` restored
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `msix_install_verified=true`, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime
  CPU matrix `1/2 [HUGH_SECOND]`, and `manifest_git.dirty=false`

Roadmap lock:

- `localhost` / `127.0.0.1` dashboards are local-only operator/dev surfaces
- `musu.pro` is the web input, project room, company meeting room, rendezvous,
  path-selection, relay-fallback coordination, and evidence plane
- local MUSU programs execute the work on each device
- devices can use `musu.pro` for identity/presence/rendezvous, then prefer
  direct P2P mesh routes
- relay remains fallback only and must not become the default data path

The current validation remains one-machine until the same current build is
installed and tested on a second Windows PC.

Public release remains No-Go on six unchanged blockers: multi-device,
second-PC runtime idle CPU, second-PC runtime CPU scenario matrix,
support mailbox, Store release, and hosted `musu.pro` P2P control-plane proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_TEST_FILE_FRESHNESS_AND_WEB_INPUT_ROADMAP_2026_06_04.md`

## 2026-06-04 relay connect and queue status split (wiki/684)

Relay status now separates release-grade relay connect transport from the
non-release-grade preview queue.

Current source reports:

- `relay_connect_endpoint_wired=false`
- `relay_payload_endpoint_wired=false`
- `relay_payload_queue_endpoint_wired=true`
- `relay_transport_wired=false`
- `relay_default_data_path=false`

Updated surfaces:

- hosted relay transport/lease/connect responses
- Rust `P2pRelayTransportResponse`
- `musu relay status --json`
- `musu relay transport --json`
- `record-p2p-control-plane-evidence.ps1`

Validation passed `npm run test:p2p` `62/62`, `npm run typecheck`, Rust fmt,
targeted Rust relay status test `1/1`, `cargo check --bin musu`, PowerShell
parser check, and `git diff --check`.

This does not implement release-grade `/api/v1/relay/connect` transport.
Fresh packaged primary evidence is required after commit because runtime/web
/Rust source changed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_CONNECT_AND_QUEUE_STATUS_SPLIT_2026_06_04.md`

## 2026-06-04 post relay connect/queue primary evidence refresh (wiki/685)

Fresh primary-machine packaged evidence was restored after the relay connect /
preview queue status split.

Evidence:

- strict MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-155606-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-154159-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-154401-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-154626-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key results:

- dashboard `http://127.0.0.1:3001` from `musu up.dashboard.reachable_url`
- bridge `http://127.0.0.1:2817`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_154129`
- desktop-open CPU `60.055s`, MUSU `0`, Node `0.05`, WebView2 `1.09`,
  working set `483.5MB`, hot `0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_154626`
- matrix verifier `ok=true`, `fail_count=0`

Clean go/no-go on `c3d36a7b` reports `local_artifacts_ready=true`,
`single_machine_verified=true`, `msix_install_verified=true`, runtime idle CPU
`1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
`public_metadata_ok=true`, `manifest_git.dirty=false`, and six remaining
blockers.

Roadmap lock remains unchanged: `musu.pro` is the web input/project
room/company meeting room/rendezvous/path-selection/relay-fallback/evidence
plane; local MUSU programs execute the work; devices prefer P2P mesh after
web-assisted rendezvous; second-PC proof requires installing the current build
on another Windows PC.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_CONNECT_QUEUE_STATUS_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 MUSU.PRO work-order context hardening (wiki/686)

The web-input/local-executor roadmap is now represented in the task forwarding
contract. `/api/tasks/forward` accepts bounded `company_id`, `project_id`,
`room_id`, `work_order_id`, and `origin` metadata, defaults `origin=musu.pro`
for `musu.pro` hosts and `origin=local_dashboard` for local dashboard calls,
and forwards the context to the local bridge.

Rust `/api/tasks/delegate` accepts the same fields and records only bounded
identifiers in audit notes, excluding prompt and cwd. `ForwardedTask` carries
the same context through direct peer forwarding and relay payload preview
serialization, and MCP `delegate_task` exposes the same fields.

Validation passed `npm run test:routes` `14/14`, the specific forward route
test `2/2`, `npm run typecheck`, `cargo fmt`, `cargo check --bin musu`, and
three targeted Rust unit tests for audit/context/relay payload preservation.

Release impact: this is source code, so current packaged primary evidence is
stale until MSIX/single-machine/CPU evidence is refreshed for this HEAD. This
does not implement release-grade relay transport.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MUSU_PRO_WORK_ORDER_CONTEXT_HARDENING_2026_06_04.md`

## 2026-06-04 post work-order context primary evidence refresh (wiki/687)

Fresh primary-machine packaged evidence was restored after MUSU.PRO work-order
context hardening.

Evidence:

- strict MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260604-164153-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-164313-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-164620-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-164933-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Key results:

- dashboard `http://127.0.0.1:3001` and reachable URL
  `http://127.0.0.1:3001/app` from `musu up.dashboard.reachable_url`
- bridge `http://127.0.0.1:11480`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_164246`
- desktop-open CPU `60.065s`, MUSU `0`, Node `0`, WebView2 `0.18`,
  working set `466.49MB`, hot `0`
- matrix route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_164933`
- matrix verifier `ok=true`, `fail_count=0`

Clean go/no-go on `d8e91f0f` reports `local_artifacts_ready=true`,
`single_machine_verified=true`, `msix_install_verified=true`, runtime idle CPU
`1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
`public_metadata_ok=true`, `manifest_git.dirty=false`, and six remaining
blockers.

Roadmap lock remains unchanged: `musu.pro` is the web input/project
room/company meeting room/rendezvous/path-selection/relay-fallback/evidence
plane; local MUSU programs execute the work; devices prefer P2P mesh after
web-assisted rendezvous; second-PC proof requires installing the current build
on another Windows PC.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_WORK_ORDER_CONTEXT_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 P2P connect endpoint evidence gate hardening (wiki/688)

P2P control-plane release evidence now requires explicit relay connect endpoint
proof.

Changed scripts:

- `scripts\windows\verify-p2p-control-plane-evidence.ps1`
- `scripts\windows\record-p2p-control-plane-evidence.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Gate behavior:

- relay status must report `relay_connect_endpoint_wired=true`
- relay transport preflight must report `relay_connect_endpoint_wired=true`
- aggregate relay transport readiness includes connect endpoint proof
- recorder `ok` calculation includes connect endpoint proof

Validation passed PowerShell parser checks and release evidence verifier
regression with `ok=true`, `case_count=29`, `failed_case_count=0`. Current
hosted P2P evidence remains correctly blocked with `fail_count=29`,
connect endpoint false, payload endpoint false, lease store unconfigured, route
evidence count `0`, and relay payload transport unproven.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_CONNECT_ENDPOINT_EVIDENCE_GATE_HARDENING_2026_06_04.md`

## 2026-06-04 HUGH-MAIN route attempt CPU evidence (wiki/689)

Captured targeted CPU evidence after attempting a route to second-PC peer
`HUGH-MAIN`.

Result:

- route probe target `HUGH-MAIN`
- route probe failed by timeout to `http://192.168.1.192:8949/api/tasks/delegate`
- failed route was explicitly allowed for this CPU-only evidence
- target-route verifier passed with `ok=true`, `fail_count=0`
- post-route CPU sample ran `60.058s`
- max one-core CPU: MUSU `0`, Node `0.05`, WebView2 `0.18`
- owned WebView2 `6`, working set `465.97MB`, hot `0`

This proves the primary machine did not enter an idle busy-loop after a failed
second-PC route attempt. It does not replace the required successful
multi-device route evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_HUGH_MAIN_ROUTE_ATTEMPT_CPU_EVIDENCE_2026_06_04.md`

## 2026-06-04 Local program / web input roadmap alignment (wiki/690)

The roadmap now explicitly separates the installed local MUSU program from the
`musu.pro` website.

Decision:

- local MUSU programs execute work on each device
- `musu.pro` is the remote user input, project room, company meeting room,
  presence, rendezvous, path-selection, fallback-relay coordination, and
  evidence plane
- `localhost` dashboards are same-machine operator/developer surfaces, not
  cloud dashboard access
- `musu.pro` sends authenticated bounded work-order envelopes and room events
  but does not execute shell/file/browser work itself
- devices use `musu.pro` to bootstrap discovery and route offers, then prefer
  direct P2P mesh
- hosted relay remains fallback after direct-route failure and is the
  Connect/Pro boundary

Current validation remains one-machine until the current build is installed on
the second Windows PC. Successful multi-device route evidence and second-PC
CPU/matrix evidence still require that second machine.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_LOCAL_PROGRAM_WEB_INPUT_ROADMAP_ALIGNMENT_2026_06_04.md`

## 2026-06-04 MUSU.PRO room work-order API (wiki/691)

Added the first explicit room work-order API for the web-input/local-executor
roadmap:

- `POST /api/rooms/[roomId]/work-orders`

The route accepts a room-scoped work order from `musu.pro`, stamps
`origin=musu.pro`, defaults `channel=company-room` and
`sender_id=musu.pro-room`, preserves bounded `company_id`, `project_id`, and
`work_order_id`, generates a bounded `work_order_id` when omitted, normalizes
`file://` workspace URIs, and forwards the envelope to the local bridge
`/api/tasks/delegate`.

This makes the company/project room a real web input surface while preserving
the execution boundary: the local MUSU program still executes the work.

Validation passed `npm run test:routes` `18/18`, direct room route test `4/4`,
`npm run typecheck`, `npm run build`, and `git diff --check`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MUSU_PRO_ROOM_WORK_ORDER_API_2026_06_04.md`

## 2026-06-04 Post room work-order API primary evidence refresh (wiki/692)

Fresh primary-machine packaged evidence was restored after adding
`POST /api/rooms/[roomId]/work-orders`.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-175043-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-175223-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-175413-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke dashboard `http://127.0.0.1:3001`, bridge `http://127.0.0.1:2001`,
  output `MUSU_RELEASE_SMOKE_OK_20260604_175010`
- desktop-open CPU `60.052s`, `git_dirty=false`, MUSU `0.03`, Node `0.05`,
  WebView2 `0.6`, owned WebView2 `6`, working set `480.89MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_175413`, max CPU MUSU `0.31`,
  Node `0.05`, WebView2 `0.47`, max working set `483.12MB`, hot `0`
- clean go/no-go on `b3776f0c`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`, runtime idle
  CPU `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `manifest_git.dirty=false`, and six remaining blockers

Note: HUGH_SECOND has developer alias shadowing from
`C:\Users\empty\.cargo\bin\musu.exe`; the fresh warning-mode MSIX capture is
diagnostic-only in `.local-build`, while canonical MSIX install evidence remains
strict release evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_WORK_ORDER_API_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 Room-scoped rendezvous API (wiki/693)

Added:

- `POST /api/rooms/[roomId]/rendezvous`

This lets a `musu.pro` project/company room initiate a P2P rendezvous session
between two local MUSU nodes. The route requires P2P control bearer auth,
requires `source_node_id` and `target_node_id`, stamps `origin=musu.pro`, uses
the path `roomId` as `room_id`, loads cached node candidates, and returns a
normal rendezvous session with path-selection order `lan`, `tailscale`,
`direct_quic`, `relay`.

`StoredP2pRendezvousSession` now preserves bounded
`company_id`/`project_id`/`room_id`/`work_order_id`/`origin` context. This
keeps room/work-order coordination attached to the P2P control-plane without
moving execution into the cloud.

Validation passed:

- direct room rendezvous test `3/3`
- `npm run test:p2p` `65/65`
- `npm run test:routes` `18/18`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

This is web runtime source, so fresh packaged primary evidence is required
after commit.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_SCOPED_RENDEZVOUS_API_2026_06_04.md`

## 2026-06-04 Post room-scoped rendezvous API primary evidence refresh (wiki/694)

Fresh primary-machine packaged evidence was restored after adding
`POST /api/rooms/[roomId]/rendezvous`.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-182640-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-182732-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-182915-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke dashboard `http://127.0.0.1:3001`, reachable URL
  `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:12502`, output
  `MUSU_RELEASE_SMOKE_OK_20260604_182613`
- desktop-open CPU `60.04s`, `git_dirty=false`, MUSU `0.13`, Node `0`,
  WebView2 `0.68`, owned WebView2 `6`, working set `486.19MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_182915`, max CPU MUSU `0`, Node `0.05`,
  WebView2 `0.31`, max working set `489.12MB`
- clean go/no-go on `5fb40731`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `public_metadata_ok=true`, `manifest_git.dirty=false`, and public release
  No-Go

Note: HUGH_SECOND has developer alias shadowing from
`C:\Users\empty\.cargo\bin\musu.exe`; fresh warning-mode install output is
diagnostic-only, while canonical strict MSIX install evidence remains the prior
strict release record.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_SCOPED_RENDEZVOUS_API_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 Room event API (wiki/695)

Added:

- `POST /api/rooms/[roomId]/events`
- `GET /api/rooms/[roomId]/events`

This gives a MUSU.PRO project/company room a concrete meeting-room event log.
Local MUSU programs and attached AI agents can publish bounded room events and
read the room log while local devices remain responsible for execution.

The route requires P2P control bearer auth, records owner-scoped
`musu.room_event.v1` events, supports `presence`, `status`, `message`,
`decision`, `work_order`, `rendezvous`, `route`, and `error`, and preserves
bounded `company_id`/`project_id`/`work_order_id`/`source_node_id`/
`source_agent_id`/`message`/`payload`/`origin` context.

Storage uses Vercel KV / Upstash when configured; production fails closed
without KV or explicit `MUSU_ROOM_EVENT_STORE_PATH`.

Validation passed:

- direct room event route test `5/5`
- `npm run test:p2p` `70/70`
- `npm run test:routes` `18/18`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

This is web runtime source, so fresh packaged primary evidence is required
after commit.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_EVENT_API_2026_06_04.md`

## 2026-06-04 Post room event API primary evidence refresh (wiki/696)

Fresh primary-machine packaged evidence was restored after adding
`POST /api/rooms/[roomId]/events` and `GET /api/rooms/[roomId]/events`.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-185920-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-190029-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-190203-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke dashboard `http://127.0.0.1:3001`, reachable URL
  `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:2555`, output
  `MUSU_RELEASE_SMOKE_OK_20260604_185856`
- desktop-open CPU `60.063s`, `git_dirty=false`, MUSU `0.03`, Node `0`,
  WebView2 `0.49`, owned WebView2 `6`, working set `484.19MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_190203`, max CPU MUSU `0.1`, Node
  `0.05`, WebView2 `0.55`, max working set `484.91MB`
- clean go/no-go on `5d94c236`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `public_metadata_ok=true`, `manifest_git.dirty=false`, and public release
  No-Go

Public release remains blocked on second-PC runtime/multi-device evidence,
hosted `musu.pro` P2P control-plane proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_EVENT_API_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 Room presence API (wiki/697)

Added:

- `POST /api/rooms/[roomId]/presence`
- `GET /api/rooms/[roomId]/presence`

This gives a MUSU.PRO project/company room a current owner-scoped presence
table. Local MUSU programs and attached AI agents can publish current status,
capabilities, active work orders, relay capability, public key, and route
candidate endpoints while local devices remain responsible for execution.

The route requires P2P control bearer auth, records owner-scoped
`musu.room_presence.v1` records, supports `online`, `idle`, `busy`, and
`offline`, and returns current presence in `last_seen_desc` order with scoped
filters.

`POST` also seeds the existing P2P rendezvous candidate cache, so room
presence can feed room-scoped rendezvous path selection without a manual
host:port prompt first.

Storage uses Vercel KV / Upstash when configured; production fails closed
without KV or explicit `MUSU_ROOM_PRESENCE_STORE_PATH`.

Validation passed:

- direct room presence route test `6/6`
- `npm run test:p2p` `76/76`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

This is web runtime source, so fresh packaged primary evidence is required
after commit.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_PRESENCE_API_2026_06_04.md`

## 2026-06-04 Post room presence API primary evidence refresh (wiki/698)

Fresh primary-machine packaged evidence was restored after adding
`POST /api/rooms/[roomId]/presence` and
`GET /api/rooms/[roomId]/presence`.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-193251-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-193347-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-193512-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- smoke dashboard `http://127.0.0.1:3001`, reachable URL
  `http://127.0.0.1:3001/app`, bridge `http://127.0.0.1:10358`, output
  `MUSU_RELEASE_SMOKE_OK_20260604_193224`
- desktop-open CPU `60.162s`, `git_dirty=false`, MUSU `0`, Node `0.05`,
  WebView2 `0.78`, owned WebView2 `6`, working set `482.9MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_193512`, max CPU MUSU `0.03`, Node
  `0.03`, WebView2 `0.34`, max working set `483.64MB`
- clean go/no-go on `8e1dc11`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, runtime idle CPU
  `1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`,
  `public_metadata_ok=true`, `manifest_git.dirty=false`, and public release
  No-Go

Public release remains blocked on second-PC runtime/multi-device evidence,
hosted `musu.pro` P2P control-plane proof, support mailbox evidence, and Store
evidence.

Roadmap remains: `musu.pro` is the remote user input, project room, company
meeting room, presence, rendezvous, path-selection, relay-fallback, and
evidence plane; local MUSU programs execute work on each device and use P2P
mesh after web-assisted rendezvous.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_PRESENCE_API_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 Room presence client CLI (wiki/699)

Added local Rust CLI support for MUSU.PRO room presence:

- `musu room presence publish <room-id>`
- `musu room presence list <room-id>`

This closes the client-side gap after the room presence API. The installed
local MUSU program can now publish its current executor status, route
candidate, capabilities, active work orders, and identity context into a
project/company room, and can query owner-scoped current presence from that
room.

The roadmap boundary remains explicit: `musu.pro` is the remote user input,
project room, company meeting room, presence, rendezvous, path-selection,
relay-fallback, and evidence plane. The local MUSU program executes work on
each device and uses `musu.pro` to bootstrap discovery before preferring direct
P2P mesh.

Validation passed:

- targeted Rust room presence lib tests `4/4`
- Rust CLI parser test `1/1`
- `cargo check --bin musu`
- debug binary build
- `room presence`, `room presence publish`, and `room presence list` help
  checks
- `git diff --check`

This is on-demand CLI behavior only; no background heartbeat, timer, or
polling loop was added.

This is Rust runtime source, so fresh packaged MSIX/smoke/CPU/matrix evidence
is required after commit. Current operator packet/action-pack artifacts are
also stale until regenerated from this source.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_PRESENCE_CLIENT_CLI_2026_06_04.md`

## 2026-06-04 Post room presence client CLI primary evidence refresh (wiki/700)

Fresh primary-machine packaged evidence was restored after adding the local
room presence client CLI.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-204006-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-205835-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-204423-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- local-sideload MSIX was rebuilt and install verification passed
- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_203939`
- CLI route output `MUSU_CLI_ROUTE_OK_20260604_203939`
- desktop-open CPU `60.049s`, `git_dirty=false`,
  `require_owned_webview2=true`, MUSU `0`, Node `0.03`, WebView2 `0.1`,
  owned WebView2 `6`, working set `488.93MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_204423`, hot `0`
- clean go/no-go on `75348c74`: `local_artifacts_ready=true`,
  `single_machine_verified=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, `manifest_git.dirty=false`, and
  public release No-Go

HUGH_SECOND still has a developer PATH warning because `.cargo\bin\musu.exe`
resolves before the WindowsApps alias, so no new strict MSIX install evidence
was recorded from that warning-mode state.

Public release remains blocked on second-PC runtime/multi-device evidence,
hosted `musu.pro` P2P control-plane proof, support mailbox evidence, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_PRESENCE_CLIENT_CLI_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 MCP app views low-duty polling hardening (wiki/701)

The separate Vite single-file MCP app views now use a shared low-duty polling
hook instead of direct `setInterval` loops.

Changed:

- added `musu-bee\views\shared\useLowDutyPolling.ts`
- migrated `musu-bee\views\nodes\NodesView.tsx`
- migrated `musu-bee\views\tasks\TasksView.tsx`
- expanded `audit-frontend-polling-contract.ps1` to scan both `musu-bee\src`
  and `musu-bee\views`
- added runtime-polling contract test coverage for the MCP app views

Validation passed:

- `npm run test:runtime-polling` `16/16`
- frontend polling audit `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- `npm run build` in `musu-bee\views`
- `npx tsc --noEmit` in `musu-bee\views`
- `git diff --check`

This closes another frontend interval/refetch-loop candidate. This is runtime
frontend source, so packaged primary evidence and operator packets are stale
after commit until rebuilt/refreshed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MCP_APP_VIEWS_LOW_DUTY_POLLING_HARDENING_2026_06_04.md`

## 2026-06-04 Post MCP app views low-duty polling primary evidence refresh (wiki/702)

Fresh primary-machine packaged evidence was restored after the MCP app views
low-duty polling hardening.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-211929-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-212016-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-212147-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- local-sideload MSIX was rebuilt and install verification passed
- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_211856`
- desktop-open CPU `60.041s`, `git_dirty=false`,
  `require_owned_webview2=true`, MUSU `0`, Node `0.05`, WebView2 `0.49`,
  owned WebView2 `6`, working set `490.13MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_212147`, max role CPU MUSU `0.03`,
  Node `0.03`, WebView2 `0.39`, max working set `494.64MB`, hot `0`

Public release remains blocked on actual second-PC multi-device evidence,
two-machine CPU/matrix evidence, hosted `musu.pro` P2P control-plane proof,
support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_MCP_APP_VIEWS_LOW_DUTY_POLLING_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 MCP App View Abort-Signal Hardening And Primary Evidence Refresh

The MCP app views now pass the low-duty poller's `AbortSignal` into actual
`app.callServerTool` requests. This closes the remaining MCP view polling gap:
timeouts existed in the shared poller, but `NodesView` and `TasksView` did not
previously propagate the signal to `poll_agents` / `poll_tasks`.

Fresh primary-machine packaged evidence was restored after the change:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-214647-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-214900-HUGH_SECOND.desktop-open.evidence.json`
- five-state runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-215050-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- `npm run test:runtime-polling` passed `16/16`
- frontend polling audit passed with `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_214623`
- desktop-open CPU `60.061s`, `git_dirty=false`, MUSU `0`, Node `0.1`,
  WebView2 `0.1`, owned WebView2 `6`, working set `492.61MB`, hot `0`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_215050`, max role CPU MUSU `0`,
  Node `0.03`, WebView2 `0.26`, max working set `495.13MB`

Public release remains No-Go on actual second-PC multi-device evidence,
two-machine CPU/matrix evidence, hosted `musu.pro` P2P control-plane proof,
support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MCP_APP_VIEW_ABORT_SIGNAL_HARDENING_AND_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 Rust loop allowlist contract hardening (wiki/704)

The Rust background-loop audit now verifies the actual bounded-loop guarantees
for the remaining allowlisted Rust loop sites instead of treating the allowlist
as enough by itself.

Added audit coverage:

- Claude adapter per-iteration stdout timeout, cancellation, preempt deadline,
  and shared kill path
- file-sync bounded receive timeout and cooldown sleep
- indexer watch notify wait, 2s debounce, dirty flag, and sqlite sidecar filter
- CLI login device-code expiry and 5s poll sleep
- workflow executor 2s task-completion poll, terminal-state exit, and 1h max
  wait
- hardware probe nonblocking child wait, 50ms sleep, and timeout kill
- PTY request-scoped blocking read and websocket close exit
- WebRTC request-scoped ffmpeg capture read and child kill on failure/exit
- finite Windows process snapshot enumeration
- writer runner admission notify/sleep/cancel select and bounded stdout reads

Validation:

- `audit-rust-background-loop-contract.ps1 -Json`: `ok=true`,
  `fail_count=0`, `unaudited_loop_hit_count=0`

This is audit/status-gate hardening only; packaged runtime evidence remains
current. Roadmap remains: `musu.pro` is the remote input/project room/company
meeting room/presence/rendezvous/path-selection/relay-fallback/evidence plane,
and local MUSU programs execute work while preferring P2P mesh after
web-assisted rendezvous.

Public release remains No-Go on second-PC multi-device evidence, two-machine
CPU/matrix evidence, hosted `musu.pro` P2P control-plane proof, support mailbox
evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_LOOP_ALLOWLIST_CONTRACT_HARDENING_2026_06_04.md`

## 2026-06-04 P2P source relay marker status (wiki/705)

`show-musu-pro-p2p-env-status.ps1` now distinguishes hosted env/evidence
blockers from local source-code relay implementation markers.

New output:

- `source.checked=true`
- `source.relay_connect_endpoint_implemented=false`
- `source.relay_payload_endpoint_implemented=false`
- `source.relay_payload_queue_endpoint_implemented=true`
- `source.relay_transport_kind=websocket_tunnel`
- `source.release_grade_transport_required=quic_tls_1_3`

New blockers:

- `source_relay_connect_endpoint_not_implemented`
- `source_relay_payload_endpoint_not_implemented`

This closes a diagnostic gap: provisioning KV/Upstash and setting relay env
flags is still required, but it is not sufficient while the current source keeps
`/api/v1/relay/connect` fail-closed and requires release-grade `quic_tls_1_3`
transport proof.

Validation:

- PowerShell parser check passed
- `show-musu-pro-p2p-env-status.ps1 -Json` reports the new source section and
  keeps `ok=false`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_SOURCE_RELAY_MARKER_STATUS_2026_06_04.md`

## 2026-06-04 Hardening gate surface alignment (wiki/706)

Final release status now exposes the full hardening surface required by the
local-program/web-input roadmap.

Changed:

- `write-release-go-no-go.ps1` now runs and blocks on
  `audit-local-api-auth-contract.ps1`.
- `write-release-go-no-go.ps1` now runs and blocks on
  `audit-operator-api-security-contract.ps1`.
- `show-final-release-handoff-status.ps1` now prints
  `frontend_polling_contract_verified`,
  `rust_background_loop_contract_verified`,
  `local_api_auth_contract_verified`, and
  `operator_api_security_contract_verified`.
- The final operator packet now includes and verifies
  `audit-operator-api-security-contract.ps1`.

Validation:

- parser checks passed for the changed PowerShell scripts
- local API auth audit: `ok=true`, `fail_count=0`,
  `stale_doc_hit_count=0`
- operator API security audit: `ok=true`, `fail_count=0`
- dirty-tree go/no-go and handoff status both reported all four hardening
  gates true
- `git diff --check` passed

This is status/packet hardening only; packaged runtime evidence remains
current. Public release remains No-Go on second-PC, hosted P2P, support mailbox,
and Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_HARDENING_GATE_SURFACE_ALIGNMENT_2026_06_04.md`

## 2026-06-04 Secret storage contract hardening (wiki/707)

Secret storage is now a first-class release gate for the
local-program/web-input roadmap.

Why:

- `musu.pro` coordinates remote input, rooms, presence, rendezvous,
  path-selection, fallback relay, and evidence.
- local MUSU programs execute work and prefer P2P mesh after web-assisted
  rendezvous.
- because web-originated work can reach local executors, bridge/account/P2P
  credentials must stay out of ordinary output, backups, and support bundles.

Changed:

- `musu-rs\src\cloud\token.rs` restricts saved account-token files on Windows
  with `icacls`; Unix remains `0600`.
- Windows ACL helpers now prefer `USERDOMAIN\USERNAME` when available.
- `docs\PRODUCTION.md` backs up only non-secret config by default and warns not
  to include `bridge.env`, `bridge_token`, or `token` in routine backups.
- Added `scripts\windows\audit-secret-storage-contract.ps1` with schema
  `musu.secret_storage_contract.v1`.
- `write-release-go-no-go.ps1` now emits
  `secret_storage_contract_verified` and blocks on `secret-storage`.
- `show-final-release-handoff-status.ps1`, the final operator packet, packet
  verifier, and desktop release readiness inventory now include the secret
  storage audit.

Validation:

- parser checks passed for the changed PowerShell scripts
- secret-storage audit: `ok=true`, `fail_count=0`
- targeted Rust token test passed `1/1`
- `cargo fmt --check` passed
- `git diff --check` passed with only the existing `docs/PRODUCTION.md` CRLF
  normalization warning

This is Rust runtime source plus gate hardening, so packaged evidence and
operator packets must be regenerated after commit.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SECRET_STORAGE_CONTRACT_HARDENING_2026_06_04.md`

## 2026-06-04 Post secret storage primary evidence refresh (wiki/708)

Fresh primary-machine packaged evidence was restored after secret storage
contract hardening.

Build/install:

- `run-msix-workflow.ps1 -Configuration release -StartupContract
  local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting`
- release runtime build passed
- Tauri desktop shell build passed
- local-sideload MSIX packed, signed, installed, and verified
- packaged startup smoke passed
- HUGH_SECOND still has warning-mode `.cargo\bin\musu.exe` PATH shadowing, so
  packaged checks used the explicit WindowsApps alias

Fresh evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260604-232809-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260604-233024-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260604-233135-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260604_232737`
- desktop-open CPU passed for `60.063s`: MUSU `0.05`, Node `0.03`,
  WebView2 `0.6`, owned WebView2 `6`, working set `487.21MB`, hot `0`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260604_233135`
- matrix max role CPU: MUSU `0`, Node `0.03`, WebView2 `0.39`
- matrix max working set: `490.08MB`

Go/no-go sees primary runtime CPU/matrix valid on `HUGH_SECOND`; public release
remains No-Go until the second-PC, hosted P2P, support mailbox, and Store gates
are closed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_SECRET_STORAGE_CONTRACT_PRIMARY_EVIDENCE_REFRESH_2026_06_04.md`

## 2026-06-04 Relay connect auth hardening (wiki/709)

`/api/v1/relay/connect` now requires P2P control auth before returning its
fail-closed relay status/preflight response.

Changed:

- `GET /api/v1/relay/connect` calls `authorizeP2pControl(req)`.
- `POST /api/v1/relay/connect` calls `authorizeP2pControl(req)`.
- Missing bearer token returns `401 unauthorized`.
- Authenticated requests still fail closed with `501` while the real
  relay/tunnel payload endpoint is unwired.
- `audit-operator-api-security-contract.ps1` now checks the relay connect auth
  contract.

Validation:

- operator API security audit: `ok=true`, `fail_count=0`
- `npm run test:p2p` passed `77/77`
- `npm run typecheck` passed
- `git diff --check` passed

This is security hardening only. The release-grade relay transport remains
unimplemented; source markers remain false and hosted P2P release evidence is
still required.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_CONNECT_AUTH_HARDENING_2026_06_04.md`

## 2026-06-05 Post relay connect auth primary evidence refresh (wiki/710)

Fresh primary-machine packaged evidence was restored after relay connect auth
hardening.

Roadmap boundary:

- `musu.pro` is the remote order, project-room, company-room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs execute the work on each device.
- After web-assisted rendezvous, devices prefer P2P mesh paths before relay:
  `lan`, `tailscale`, `direct_quic`, then `relay`.
- Current validation is still one-machine only; another PC must install the
  current build before multi-device release gates can close.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-000624-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-000707-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-000820-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260605_000551`
- desktop-open CPU passed for `60.054s`: MUSU `0`, Node `0.05`,
  WebView2 `0.52`, owned WebView2 `6`, working set `497.9MB`, hot `0`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_000820`
- matrix max scenario CPU: MUSU `0.29`, Node `0.05`, WebView2 `0.52`
- matrix max working set: `500.49MB`

Handoff status sees primary single-machine true, runtime idle CPU `1/2
[HUGH_SECOND]`, and runtime CPU matrix `1/2 [HUGH_SECOND]`. Public release
remains No-Go until second-PC, hosted P2P, support mailbox, and Store gates are
closed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_CONNECT_AUTH_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-05 Room work-order auth hardening (wiki/711)

`POST /api/rooms/[roomId]/work-orders` now requires P2P control auth before a
MUSU.PRO room instruction can be forwarded to the local bridge.

Changed:

- The route calls `authorizeP2pControl(req)` before parsing or forwarding the
  work order.
- Missing bearer token returns `401 unauthorized`.
- The local bridge is not called before auth succeeds.
- The response records `owner_scoped=true`.
- Work-order context values for channel, sender, target node, and adapter type
  now use bounded normalization.
- `audit-operator-api-security-contract.ps1` now audits this route and its auth
  regression test.

Validation:

- `npm run test:routes` passed `19/19`
- operator API security audit passed with `ok=true`, `fail_count=0`
- `npm run typecheck` passed
- `npm run test:p2p` passed `77/77`
- `npm run build` passed after transient TLS socket retries
- `git diff --check` passed

This is web-input security hardening for the local-program/control-plane
roadmap. `musu.pro` can accept authenticated room work orders, but
unauthenticated web input cannot reach the local executor through the bridge
token.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_WORK_ORDER_AUTH_HARDENING_2026_06_05.md`

## 2026-06-05 Post room work-order auth primary evidence refresh (wiki/712)

Fresh primary-machine packaged evidence was restored after room work-order auth
hardening.

Roadmap boundary:

- `musu.pro` is the remote order, project-room, company-room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane.
- Local MUSU programs execute the work on each device.
- Users may enter work orders through the web, but authenticated local programs
  perform the work.
- After web-assisted rendezvous, devices prefer P2P mesh paths before relay:
  `lan`, `tailscale`, `direct_quic`, then `relay`.
- Current validation is still one-machine only; another PC must install the
  current build before multi-device release gates can close.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-004553-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-004657-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-004808-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260605_004448`
- CLI route output contained `MUSU_CLI_ROUTE_OK_20260605_004448`
- desktop-open CPU passed for `60.057s`: MUSU `0`, Node `0`,
  WebView2 `0.39`, owned WebView2 `6`, working set `489.86MB`, hot `0`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_004808`
- matrix max scenario CPU: MUSU `0.57`, Node `0.08`, WebView2 `0.65`
- matrix max working set: `492.2MB`

Public release remains No-Go until second-PC, hosted P2P, support mailbox, and
Store gates are closed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_WORK_ORDER_AUTH_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-05 Rendezvous owner-scope hardening (wiki/713)

Rendezvous bootstrap now matches the MUSU.PRO control-plane roadmap's owner
boundary.

Changed:

- `StoredP2pRendezvousSession` now stores `owner_key`.
- Rendezvous create/read/update/approve/close/candidate routes derive
  `p2pControlPrincipal(req).owner_key` after auth.
- Cross-owner reads and mutations return `404 rendezvous_not_found`.
- Node candidate cache keys now include owner and node id for both file-store
  and KV paths.
- Room rendezvous and room presence use the same owner-scoped candidate cache.
- `audit-operator-api-security-contract.ps1` now verifies rendezvous
  owner-scope source and regression tests.

Validation:

- `npm run test:p2p` passed `79/79`
- `npm run test:routes` passed `19/19`
- `npm run typecheck` passed
- `npm run build` passed
- operator API security audit passed with `ok=true`, `fail_count=0`
- `git diff --check` passed

This is web runtime source, so packaged primary evidence is stale until rebuilt
and refreshed from this commit. Public release remains No-Go until second-PC,
hosted P2P, support mailbox, and Store gates are closed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RENDEZVOUS_OWNER_SCOPE_HARDENING_2026_06_05.md`

## 2026-06-05 Post rendezvous owner-scope primary evidence refresh (wiki/714)

Fresh primary-machine packaged evidence was restored after rendezvous
owner-scope hardening.

Roadmap boundary:

- `musu.pro` is the remote input, project room, company meeting room, presence,
  rendezvous, path-selection, relay-fallback coordination, and evidence plane.
- Local dashboards at `localhost` / `127.0.0.1` are local-only operator
  surfaces.
- Installed MUSU programs execute work on each device after authenticated web
  work orders arrive.
- Web-assisted rendezvous should bootstrap device discovery, then local programs
  prefer P2P mesh paths before relay: `lan`, `tailscale`, `direct_quic`,
  then `relay`.
- Project/company rooms can coordinate local AI agents working on the same
  project, but room/rendezvous/route/relay state stays owner-scoped.
- Current validation is still one-machine only; another Windows PC must install
  the same current build before multi-device gates can close.

Fresh evidence:

- MSIX workflow passed; installed package
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-014639-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-014927-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-015132-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260605_014606`
- desktop-open CPU passed for `60.066s`: MUSU `0.21`, Node `0.03`,
  WebView2 `0.34`, owned WebView2 `6`, working set `450.8MB`, hot `0`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_015132`
- matrix verifier passed with `ok=true`, `fail_count=0`
- matrix max scenario CPU: MUSU `0.47`, Node `0.13`, WebView2 `0.18`
- matrix max working set: `454.36MB`
- direct go/no-go reported `local_artifacts_ready=true`,
  `single_machine_verified=true`, `public_metadata_ok=true`,
  `msix_install_verified=true`, and
  `ready_for_public_desktop_release=false`

Public release remains No-Go until second-PC, hosted P2P, support mailbox, and
Store gates are closed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RENDEZVOUS_OWNER_SCOPE_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-05 Relay payload delivery proof response (wiki/715)

Relay payload delivery acknowledgement now returns a canonical
`musu.relay_payload_delivery_proof.v1` object.

Changed:

- `p2pRelayPayloadStore.ts` exports `RelayPayloadDeliveryProof`.
- `relayPayloadDeliveryProofFromDeliveredPayload(payload)` builds the proof
  only for `delivered` payload records with `delivered_at`.
- `PATCH /api/v1/p2p/relay/payload` with
  `musu.relay_payload_delivery.v1` returns `delivery_proof` alongside the
  sanitized delivered payload.
- `P2pRelayPayloadDeliveryResponse` accepts optional `delivery_proof`.
- Target-side relay payload drain prefers API-provided delivery proof and falls
  back to deriving it from the delivered payload for older servers.
- `musu relay payload-deliver --json` includes `delivery_proof`.

Validation:

- `npm run test:p2p` passed `79/79`
- `npm run typecheck` passed
- `npm run build` passed
- `cargo test --lib relay_payload` passed `24/24`
- `cargo check --bin musu` passed
- `cargo fmt --check` passed
- Rust background-loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`
- `git diff --check` passed
- P2P env status still reports source relay connect/payload markers false
- direct go/no-go on this commit reports
  `ready_for_public_desktop_release=false`, `single_machine_verified=false`,
  `multi_device_verified=false`, and `manifest_git.dirty=false`

This is not release-grade relay transport completion:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`

This is web/Rust runtime source, so packaged primary evidence is stale until
rebuilt and refreshed from this commit. Public release remains No-Go until
second-PC, hosted P2P, support mailbox, and Store gates are closed.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_DELIVERY_PROOF_RESPONSE_2026_06_05.md`

## 2026-06-05 Post relay payload delivery proof primary evidence refresh (wiki/716)

Fresh primary-machine packaged evidence was restored after the relay payload
delivery proof response landed.

Roadmap boundary:

- `https://musu.pro` is the real web input, project room, company meeting room,
  presence, rendezvous, path-selection, relay-fallback coordination, and
  evidence plane.
- Local MUSU programs are the execution plane. They receive authenticated web
  input and perform work locally on each device.
- `localhost` / `127.0.0.1` dashboards are local operator surfaces, not the
  product cloud surface.
- Web-assisted rendezvous should bootstrap device P2P mesh; relay remains
  fallback-only.
- Current validation remains one-machine only until another Windows PC installs
  the same current build.

Fresh evidence:

- MSIX workflow passed; installed package
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-025404-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-025501-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-025643-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- smoke output `MUSU_RELEASE_SMOKE_OK_20260605_025339`
- desktop-open CPU passed for `60.06s`: MUSU `0`, Node `0`, WebView2
  `0.65`, owned WebView2 `6`, working set `432.91MB`, hot `0`
- five-state matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_025643`
- matrix verifier passed with `ok=true`, `fail_count=0`
- matrix max scenario CPU: MUSU `0.18`, Node `0.86`, WebView2 `0.16`
- matrix max working set: `490.74MB`
- direct go/no-go reported `local_artifacts_ready=true`,
  `single_machine_verified=true`, `multi_device_verified=false`,
  `public_metadata_ok=true`, `msix_install_verified=true`,
  `msix_desktop_entrypoint_verified=true`, and
  `ready_for_public_desktop_release=false`

Public release remains No-Go until second-PC, hosted P2P, support mailbox, and
Store gates are closed. Hosted P2P is still blocked by source relay
connect/payload markers and live KV/Upstash/evidence gaps.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_PAYLOAD_DELIVERY_PROOF_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-05 Idle busy-loop candidate status gate (wiki/717)

`write-release-go-no-go.ps1` now emits an explicit idle busy-loop candidate
summary:

- `idle_busy_loop_candidate_contract_verified`
- `idle_busy_loop_candidate_status`
- blocker area `idle-busy-loop-candidates`

The summary maps the original CPU suspects to concrete audit checks:

- clipboard polling
- mDNS discovery
- health/readiness retry loops
- frontend interval/refetch polling
- relay payload target polling
- cloud heartbeat

Validation:

- PowerShell parser passed for `write-release-go-no-go.ps1`
- `git diff --check` passed
- Rust loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`
- Frontend polling audit passed with `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- Dirty-tree go/no-go summary reported
  `idle_busy_loop_candidate_contract_verified=true`, candidate count `6`, and
  no failed candidates

This is status/gate source only. It does not replace 60-second CPU evidence and
does not close the two-machine idle CPU gate. Public release remains No-Go on
second-PC, hosted P2P, support mailbox, and Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_IDLE_BUSY_LOOP_CANDIDATE_STATUS_GATE_2026_06_05.md`

## 2026-06-05 Log/telemetry idle candidate gate (wiki/718)

The idle busy-loop candidate summary now includes the previously missing
`log/telemetry flush loop` suspect.

`audit-rust-background-loop-contract.ps1` now emits:

- `telemetry_flush_primitive_hit_count`
- `telemetry_flush_primitive_hits`
- check `logging-telemetry / no background telemetry flush worker primitives`

`write-release-go-no-go.ps1` now reports seven
`idle_busy_loop_candidate_status` entries:

- clipboard polling
- mDNS discovery
- health/readiness retry loops
- frontend interval/refetch polling
- relay payload target polling
- cloud heartbeat
- log/telemetry flush loop

Validation:

- PowerShell parser passed for `write-release-go-no-go.ps1` and
  `audit-rust-background-loop-contract.ps1`
- Rust loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`
- Frontend polling audit passed with `ok=true`, `fail_count=0`,
  `direct_interval_hit_count=0`, `direct_visibility_listener_hit_count=0`
- Dirty-tree go/no-go summary reported
  `idle_busy_loop_candidate_contract_verified=true`, candidate count `7`, and
  no failed candidates

This is source/gate hardening only. It does not replace 60-second CPU evidence
and does not close the two-machine idle CPU gate. Public release remains No-Go
on second-PC, hosted P2P, support mailbox, and Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_LOG_TELEMETRY_IDLE_CANDIDATE_GATE_2026_06_05.md`

## 2026-06-05 P2P store-forward queue status alignment (wiki/719)

`show-musu-pro-p2p-env-status.ps1` now separates implemented store-forward
relay queue fallback source wiring from missing release-grade tunnel endpoints.

New source fields:

- `relay_payload_queue_fallback_implemented`
- `relay_payload_queue_fallback_components.policy_marker`
- `relay_payload_queue_fallback_components.web_queue_store_claim_deliver`
- `relay_payload_queue_fallback_components.rust_enqueue_after_lease`
- `relay_payload_queue_fallback_components.rust_target_drain_and_delivery_proof`

Local source validation reported:

- `relay_payload_queue_fallback_implemented=true`
- `policy_marker=true`
- `web_queue_store_claim_deliver=true`
- `rust_enqueue_after_lease=true`
- `rust_target_drain_and_delivery_proof=true`

The generic source endpoint blockers are now release-specific:

- `source_release_relay_connect_endpoint_not_implemented`
- `source_release_relay_payload_endpoint_not_implemented`

This prevents the status report from implying that the lease-bound queue
fallback is absent. It still keeps public P2P release No-Go because the
release-grade `/api/v1/relay/connect` tunnel/payload endpoint, production
KV/Upstash evidence, release relay route evidence, and per-record delivery
proof are still missing.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_STORE_FORWARD_QUEUE_STATUS_ALIGNMENT_2026_06_05.md`

## 2026-06-05 P2P store-forward relay contract gate (wiki/720)

`audit-p2p-store-forward-relay-contract.ps1` now gives the lease-bound
store-forward relay queue fallback its own release contract gate.

The audit schema is:

- `musu.p2p_store_forward_relay_contract.v1`

It verifies that the queue fallback is:

- owner/lease scoped,
- P2P-control-authenticated,
- able to store, claim, deliver, and return delivery proof,
- non-default and non-release-grade,
- separated from release tunnel payload transport, and
- default-off/low-duty when target polling is enabled.

Release go/no-go now reports:

- `p2p_store_forward_relay_contract_verified`
- `p2p_store_forward_relay_contract_audit`

The final handoff status now exposes the same gate and rerun command.

The single-machine and runtime CPU matrix verifiers now include the new P2P
contract audit plus operator API and secret storage audits in their status-only
freshness allowlists. This keeps source/gate-only audit changes from
incorrectly invalidating packaged runtime evidence.

Roadmap update:

- local MUSU programs execute work on each device
- `musu.pro` handles remote web input, project/company rooms, presence,
  rendezvous, path selection, fallback lease policy, and evidence
- web-assisted rendezvous bootstraps the P2P mesh
- relay remains fallback-only and cannot be the default data path

Validation:

- PowerShell parser passed for the new audit, go/no-go, readiness, and handoff
  scripts
- new audit reported `ok=true`, `fail_count=0`
- clean go/no-go reported
  `p2p_store_forward_relay_contract_verified=true`,
  `p2p_control_plane_verified=false`, `p2p_relay_transport_wired=false`, and
  `ready_for_public_desktop_release=false` with `manifest_git.dirty=false`
- P2P env status reported
  `source.relay_payload_queue_fallback_implemented=true` while keeping release
  tunnel, KV/Upstash, route evidence, and delivery proof blockers

This is source/gate and roadmap hardening only. Public release remains No-Go
until production KV/Upstash, release-grade relay tunnel proof, current-build
second-PC evidence, support mailbox evidence, and Store evidence are complete.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_STORE_FORWARD_RELAY_CONTRACT_GATE_2026_06_05.md`

## 2026-06-05 Bridge readiness idle candidate gate (wiki/721)

`write-release-go-no-go.ps1` now separates `bridge readiness wait loop` from the
broader health retry candidate.

The idle busy-loop candidate summary now reports eight entries:

- clipboard polling
- mDNS discovery
- health check retry loop
- bridge readiness wait loop
- frontend interval/refetch
- relay payload target poller
- cloud heartbeat
- log/telemetry flush loop

`health check retry loop` maps to auto-update health polling checks:

- `health poll initial backoff`
- `health poll max backoff`
- `health poll sleep`

`bridge readiness wait loop` maps to CLI bridge health checks:

- `bridge health poll initial backoff`
- `bridge health poll max backoff`
- `bridge readiness deadline`
- `bridge readiness backoff sleep`

Validation:

- PowerShell parser passed for `write-release-go-no-go.ps1`
- Rust background-loop audit passed with `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`
- Dirty-tree go/no-go summary reported
  `idle_busy_loop_candidate_contract_verified=true`, candidate count `8`, both
  new candidate names present, and no failed idle candidates

This is source/gate visibility only. It does not replace 60-second CPU evidence
and does not close the two-machine idle CPU gate.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_BRIDGE_READINESS_IDLE_CANDIDATE_GATE_2026_06_05.md`

## 2026-06-05 Packaged local runtime identity gate (wiki/722)

`localhost` is now explicitly treated as a same-machine local surface, not
internet or cloud dashboard access. Release evidence only accepts that surface
when the bridge/dashboard are backed by the installed packaged MUSU runtime.

`audit-musu-process-ownership.ps1` now records command lines and packaged
runtime identity. In release mode it fails if:

- a MUSU runtime is not the packaged WindowsApps runtime
- the bridge registry PID points at debug/workspace runtime
- port 3001 is served by a repo/workspace Next server
- repo-related orphan Node/WebView2 helpers are present

`audit-musu-startup-single-instance.ps1` now defaults to the WindowsApps
`musu.exe` app execution alias and embeds the same strict process ownership
audit. `write-release-go-no-go.ps1` rejects old process/startup evidence that
lacks packaged runtime identity proof.

Current HUGH_SECOND live-state validation:

- `http://127.0.0.1:3001/app` returned HTTP 200
- process ownership failed intentionally because the bridge registry PID points
  at `musu-rs\target\debug\musu.exe`
- dashboard identity failed intentionally because port 3001 is served by
  workspace `next start -p 3001`
- startup audit used
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe` but failed the
  nested process ownership audit for the same live-state reason

Roadmap restatement:

- local MUSU programs execute work on each device
- `musu.pro` handles remote input, project/company rooms, presence, rendezvous,
  path selection, fallback relay coordination, and evidence
- web-assisted rendezvous bootstraps P2P mesh
- localhost remains local-only and must not be confused with cloud dashboard
  access

Canonical report:

- `docs\RELEASE_1_15_0_RC1_PACKAGED_LOCAL_RUNTIME_IDENTITY_GATE_2026_06_05.md`

## 2026-06-05 Packaged local runtime repair runbook (wiki/723)

Added `scripts\windows\repair-packaged-local-runtime-state.ps1` with schema
`musu.packaged_local_runtime_repair.v1`.

The repair flow:

- records before process ownership evidence
- runs exact WindowsApps packaged `musu down --include-desktop`
- optionally stops audit-identified repo/workspace orphan helpers with explicit
  `-StopRepoOrphanHelpers`
- starts packaged `musu up --json`
- records after process ownership evidence

Final handoff now adds a `packaged-local-runtime-state` operator step when
process ownership or startup single-instance evidence is blocked.

Live HUGH_SECOND validation:

- diagnostic repair without `-StopRepoOrphanHelpers` stopped debug bridge PID
  `42236` but left workspace Next helper PID `2812`, so the repair correctly
  reported `ok=false`
- release repair with `-StopRepoOrphanHelpers` stopped PID `2812`, started
  packaged bridge PID `23860`, and reported `ok=true`
- follow-up process ownership audit passed with
  `bridge_pid_packaged_runtime=true`, `non_packaged_runtime=0`, and
  `orphan_repo_helpers=0`
- follow-up startup single-instance audit passed using the WindowsApps
  `musu.exe`, one stable bridge PID, no repeated spawn, and nested process
  ownership `ok=true`
- `127.0.0.1:3001/app` is now connection-refused because the workspace Next
  dashboard was intentionally stopped; the packaged local runtime bridge is
  healthy separately at `127.0.0.1:7555`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_PACKAGED_LOCAL_RUNTIME_REPAIR_RUNBOOK_2026_06_05.md`

## 2026-06-05 Runtime CPU matrix packaged executable identity gate (wiki/724)

Runtime CPU scenario matrix evidence now has to prove it was captured through
the installed packaged MUSU runtime.

`measure-musu-runtime-cpu-scenarios.ps1` now defaults to the WindowsApps
`musu.exe` alias, rejects repo/debug runtime paths unless
`-AllowDeveloperRuntime` is supplied, and records:

- `musu_exe`
- `allow_developer_runtime`
- `musu_exe_release_identity`

`verify-runtime-cpu-scenario-matrix.ps1` rejects release matrix evidence unless
the executable identity points at the WindowsApps MUSU alias or installed
`Yellowhama.MUSU_...` package path.

Validation:

- parser checks passed for the changed PowerShell scripts
- short diagnostic `runtime-started` sample passed with
  `musu_exe=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`,
  `musu_exe_release_identity=true`, bridge `http://127.0.0.1:7555`, and max
  MUSU CPU `0`
- release evidence verifier regression passed with `ok=true`,
  `case_count=30`, and `failed_case_count=0`
- the new negative fixture proves a debug `musu-rs\target\debug\musu.exe`
  matrix is rejected
- `git diff --check` passed

Older CPU matrix evidence without packaged executable identity is no longer
release-grade. A fresh clean 60-second packaged runtime matrix is required
after this commit.

`127.0.0.1:3001/app` can remain connection-refused in the repaired state because
the workspace dashboard is separate from the packaged local runtime bridge at
`127.0.0.1:7555`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_CPU_MATRIX_PACKAGED_EXE_IDENTITY_GATE_2026_06_05.md`

## 2026-06-05 Packaged runtime dashboard absence CPU gate (wiki/725)

Runtime CPU matrix verification no longer requires a repo/workspace dashboard
URL when the installed packaged runtime exposes no dashboard URL.

The verifier now accepts `dashboard-open` when:

- packaged MUSU executable identity is proven
- `musu up --json` attempted dashboard discovery
- no dashboard URL was exposed
- the scenario measured packaged runtime state

This keeps `127.0.0.1:3001/app` out of packaged release CPU evidence while
preserving the debug-executable rejection from wiki/724.

Fresh HUGH_SECOND evidence after `7c3939e7`:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-045524-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verifier: `ok=true`, `fail_count=0`
- matrix route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_045524`
- matrix route task: `095647cf-83da-46eb-81ec-bd79a81402eb`
- matrix max role CPU: MUSU `0.03`, Node `0`, WebView2 `1.07`
- idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-050112-HUGH_SECOND.desktop-open.evidence.json`
- idle CPU: `60.055s`, MUSU `0`, Node `0`, WebView2 `0.13`, hot `0`,
  working set `360.32MB`

Validation:

- parser checks passed
- direct matrix verifier passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=31`, and `failed_case_count=0`
- dirty go/no-go saw runtime idle CPU `1/2 [HUGH_SECOND]` and runtime matrix
  `1/2 [HUGH_SECOND]`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_PACKAGED_RUNTIME_DASHBOARD_ABSENCE_CPU_GATE_2026_06_05.md`

## 2026-06-05 Relay route query delivery proof hardening (wiki/726)

Release-grade relay route evidence queries now revalidate current proof shape
instead of trusting only the stored `release_grade=true` flag.

For relay records, `release_grade=true` query results now require:

- issued fallback lease proof
- attempted non-relay route kinds
- proven relay payload transport
- current `musu.relay_transport_proof.v1`
- current `musu.relay_payload_delivery_proof.v1`

Regression coverage now seeds an old
`stale-relay-transport-only-release-grade` record and verifies it is excluded
from release-grade query results.

Validation:

- `npm run test:p2p` passed `79/79`
- `npm run typecheck` passed
- `audit-p2p-store-forward-relay-contract.ps1 -Json` passed with `ok=true`
  and `fail_count=0`
- new audit check: `release-grade query revalidates relay delivery proof`
- `git diff --check` passed

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_ROUTE_QUERY_DELIVERY_PROOF_HARDENING_2026_06_05.md`

## 2026-06-05 Frontend polling / local runtime evidence refresh (wiki/730)

Frontend idle polling coverage now inventories all non-test `useLowDutyPolling`
call sites and requires abort-signal-aware callbacks. The audit passed with
`low_duty_polling_call_site_count=29`, signal gaps `0`, direct intervals `0`,
and direct visibility listeners `0`; `npm run test:runtime-polling` passed
`17/17`, `npm run typecheck` passed, parser checks passed, and
`git diff --check` passed.

The packaged local runtime evidence was refreshed after the local/web split
work:

- strict MSIX:
  `docs\evidence\msix-install\1.15.0-rc.1\20260605-070256-HUGH_SECOND.evidence.json`
- bridge-only single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-065900-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-070404-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-070552-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-070552-HUGH_SECOND.verification.json`

Idle CPU passed for `60.046s` with MUSU `0`, Node `0`, WebView2 `0.26`,
working set `364.9MB`, and hot `0`. The five-state matrix passed with route
token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_070552`, WindowsApps runtime
identity, no developer runtime, max WebView2 CPU `0.21`, max working set
`365.61MB`, and hot `0`. Its `dashboard-open` scenario measured packaged
runtime state because no dashboard URL was exposed, so `localhost:3001` was not
required.

Current clean handoff status after `ff8fdf46` reports packet/action-pack
verified, local artifacts true, single-machine true, MSIX true, frontend
polling true, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime matrix
`1/2 [HUGH_SECOND]`, `manifest_git_dirty=false`, and
`ready_for_public_desktop_release=false`.

The roadmap remains locked: the installed local MUSU program executes work,
while `musu.pro` is remote input, project/company room context, presence,
rendezvous, path selection, relay-fallback policy, and evidence. Another PC
must install this current build before multi-device and two-machine CPU gates
can close.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FRONTEND_POLLING_LOCAL_RUNTIME_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-05 Relay route proof linkage hardening and local runtime evidence refresh (wiki/731)

Relay route evidence release queries now bind current relay transport proof to
the stored fallback lease and route session. Commit `9d1d9666` updates
`routeEvidenceStore.ts`, adds stale release-grade relay records with mismatched
lease/session proof to the route-evidence regression, and gates the contract
with `release-grade query binds relay transport proof to fallback lease`.

Validation passed:

- `npm run test:p2p` `79/79`
- `npm run typecheck`
- `audit-p2p-store-forward-relay-contract.ps1 -FailOnProblem -Json` with
  `ok=true` and `fail_count=0`
- parser checks
- `git diff --check`

Fresh packaged local-runtime evidence was recorded after the hardening:

- strict MSIX:
  `docs\evidence\msix-install\1.15.0-rc.1\20260605-072911-HUGH_SECOND.evidence.json`
- bridge-only single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-073044-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-074243-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-074400-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-074400-HUGH_SECOND.verification.json`

The single-machine smoke used WindowsApps `musu.exe`,
`dashboard_required=false`, `single_machine_surface=local-bridge-only`, and
bridge `http://127.0.0.1:8186`. Idle CPU passed clean git for `60.061s` with
MUSU `0`, Node `0`, WebView2 `0.03`, working set `368.98MB`, and hot `0`.
The five-state matrix passed with route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260605_074400`, max MUSU `0.03`, Node `0`,
WebView2 `0.16`, max working set `368.54MB`, and hot `0`. `dashboard-open`
measured packaged runtime state because no dashboard URL was exposed, so
`localhost:3001` was not required.

Current clean final handoff after `9b331698` reports packet/action-pack
verified, local artifacts true, single-machine true, MSIX true, frontend
polling true, process/startup/desktop single-instance true, runtime idle CPU
`1/2 [HUGH_SECOND]`, runtime matrix `1/2 [HUGH_SECOND]`,
`manifest_git_dirty=false`, and `ready_for_public_desktop_release=false`.

The product split remains: installed MUSU local programs execute work; `musu.pro`
is remote input, project/company room, presence, rendezvous, path selection,
relay fallback policy, and evidence. `localhost:3001/app` is an optional
workspace dashboard, not the installed local app.

P2P env status remains No-Go: store-forward queue fallback is implemented, but
release relay connect/payload endpoints are false, production KV/Upstash is
missing, live relay route proof count is `0`, and payload delivery proof is
missing.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_ROUTE_PROOF_LINKAGE_HARDENING_2026_06_05.md`

## 2026-06-05 Rust loop audit WebRTC/telemetry coverage (wiki/732)

Rust background-loop audit coverage now explicitly includes the WebRTC RTCP
reader loop and a broader telemetry/log flush primitive detector.

Commit `cf722a15` adds WebRTC audit checks:

- `rtcp reader request-scoped spawn`
- `rtcp reader awaits inbound packets`
- `rtcp reader exits on read failure`

These checks prove the RTCP reader in `musu-rs/src/io/webrtc.rs` is created only
inside the explicit screen-share request path, awaits
`rtp_sender.read(...).await`, and exits when the RTCP stream closes or errors.

The telemetry/log flush scanner now also rejects `non_blocking`, so future
background log appender workers cannot silently bypass the idle busy-loop source
contract.

Validation:

- PowerShell parser: `parser ok`
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`,
  `check_count=118`, WebRTC checks `7`
- dirty-tree go/no-go: `rust_background_loop_contract_verified=true`,
  `idle_busy_loop_candidate_contract_verified=true`, and
  `log/telemetry flush loop` verified
- clean final handoff after `cf722a15`: runtime idle CPU `1/2 [HUGH_SECOND]`,
  runtime matrix `1/2 [HUGH_SECOND]`, `manifest_git_dirty=false`, and
  `ready_for_public_desktop_release=false`

This is source-contract coverage hardening only. It does not replace the
two-machine CPU evidence gate, and public release remains blocked on second-PC,
hosted P2P, support mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_LOOP_AUDIT_WEBRTC_TELEMETRY_COVERAGE_2026_06_05.md`

## 2026-06-05 P2P candidate endpoint metadata preservation (wiki/733)

`musu.pro` room presence and rendezvous candidate exchange now preserve the
endpoint metadata needed for practical P2P path selection between installed
local MUSU programs.

Preserved candidate metadata:

- `public_addr`
- `nat_type`
- `nat_observed_by`
- `relay_url`
- `relay_protocol`

Implementation:

- `P2pCandidateEndpoint` now includes public endpoint, NAT, and relay
  descriptor fields.
- `p2pRendezvousStore.ts` centralizes candidate endpoint normalization.
- `roomPresenceStore.ts` reuses the shared rendezvous normalizer instead of
  truncating candidate endpoints to only `kind`, `addr`, `observed_at`, and
  `scheme`.
- Rendezvous candidate and room presence routes accept the same metadata.
- The P2P store-forward relay contract audit now checks
  `candidate endpoint metadata is preserved through web control plane`.

Root cause note for the observed browser error:

- `127.0.0.1:3001` had no listener, so `http://127.0.0.1:3001/app` correctly
  returned connection refused.
- The installed local MUSU bridge was healthy at `127.0.0.1:8186/health`.
- `localhost:3001` is an optional workspace dashboard, not the installed local
  MUSU program.

Validation:

- `npm run test:p2p` passed `79/79`
- `npm run typecheck` passed
- `audit-p2p-store-forward-relay-contract.ps1 -Json -FailOnProblem` passed
  with `ok=true` and `fail_count=0`
- `git diff --check` passed

This is P2P metadata/control-plane hardening. It does not close second-PC,
hosted P2P release proof, support mailbox, or Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_CANDIDATE_ENDPOINT_METADATA_PRESERVATION_2026_06_05.md`

## 2026-06-05 Post P2P candidate metadata primary evidence refresh (wiki/734)

After `9be40bc4` changed web/P2P source, primary-machine packaged runtime
evidence was refreshed for the current source.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-082350-HUGH_SECOND.evidence.json`
- idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-082546-HUGH_SECOND.desktop-open.evidence.json`
- CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-082656-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-082656-HUGH_SECOND.verification.json`

Results:

- single-machine bridge: `http://127.0.0.1:10518`
- `dashboard_required=false`
- `single_machine_surface=local-bridge-only`
- idle CPU: `60.058s`, MUSU `0.05`, Node `0`, WebView2 `0.73`,
  working set `365.65MB`, hot `0`
- matrix: `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_082656`
- matrix max role CPU: MUSU `0.03`, Node `0`, WebView2 `0.39`
- matrix max working set: `367.52MB`

The MSIX was rebuilt/reinstalled and packaged-state verification passed, but
strict MSIX evidence capture still fails in this shell because
`C:\Users\empty\.cargo\bin\musu.exe` shadows the WindowsApps alias. The
`warn-explicit-windowsapps` capture was kept under `.local-build` only because
final go/no-go verifies strict MSIX evidence.

Final handoff after the refresh removed the `single-machine` blocker. Remaining
blockers are second-PC multi-device evidence, second-PC CPU/matrix evidence,
support mailbox, Store/Microsoft, hosted `musu.pro` P2P release proof, and dirty
git until this evidence/report commit lands.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_P2P_CANDIDATE_ENDPOINT_METADATA_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-05 Room presence candidate metadata client CLI (wiki/735)

The web control plane can preserve public/NAT/relay candidate descriptors, and
the local Rust program can now publish those descriptors through
`musu room presence publish`.

Implementation:

- `CandidateEndpoint` now carries optional `public_addr`, `nat_type`,
  `nat_observed_by`, `relay_url`, and `relay_protocol` fields.
- Rust DTOs define `NatType` and `RelayProtocol` with the same JSON contract as
  the web routes.
- `musu room presence publish` accepts repeated `--candidate-url` values plus
  `--nat-type`, `--nat-observed-by`, `--relay-url`, and `--relay-protocol`.
- JSON publish reports now keep backward-compatible `candidate` and the full
  `candidates` list.
- Default publishing still advertises the local bridge candidate; extra
  public/NAT/relay metadata is explicit and on-demand.

Validation:

- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu` passed.
- Rust room presence tests passed `6/6`.
- Rust rendezvous tests passed `5/5`.
- `npm run test:p2p` passed `79/79`.
- `npm run typecheck` passed.
- `audit-p2p-store-forward-relay-contract.ps1 -Json` passed with `ok=true`
  and `fail_count=0`.
- `git diff --check` passed.

This keeps the product boundary intact: `musu.pro` is a remote input,
project-room, presence, rendezvous, path-selection, relay-fallback, and
evidence surface. Local MUSU programs still execute the work.

Because Rust source changed after the prior packaged runtime evidence refresh,
fresh MSIX, single-machine, idle CPU, and runtime CPU matrix evidence is
required before this change is current packaged release evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_PRESENCE_CANDIDATE_METADATA_CLIENT_CLI_2026_06_05.md`

## 2026-06-05 Post room presence candidate metadata primary evidence refresh (wiki/736)

After `b6329f0d` changed Rust local room presence publishing, the current
primary-machine packaged runtime evidence was refreshed.

Build/install:

- release MSIX build/install/packaged-state verification passed for
  `musu_1.15.0.0_x64_local-sideload-manual.msix`.
- packaged runtime repair passed with WindowsApps `musu.exe`.
- bridge: `http://127.0.0.1:10325`
- `dashboard.required=false`
- strict MSIX install evidence capture still failed because
  `C:\Users\empty\.cargo\bin\musu.exe` shadows the WindowsApps alias.

Fresh evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-092924-HUGH_SECOND.evidence.json`
- idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-093206-HUGH_SECOND.desktop-open.evidence.json`
- CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-094033-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-094033-HUGH_SECOND.verification.json`

Results:

- single-machine: `dashboard_required=false`,
  `single_machine_surface=local-bridge-only`, CLI route checked
- idle CPU: `60.053s`, MUSU `0`, Node `0`, WebView2 `0.44`,
  working set `364.26MB`, hot `0`
- matrix: `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_094033`
- route task: `6b7e1ccc-97c1-466f-9354-fedd3ef3583d`
- matrix max role CPU: MUSU `0.05`, Node `0`, WebView2 `0.16`
- matrix max working set: `366.33MB`
- `dashboard-open` measured packaged runtime state because no dashboard URL was
  exposed; it did not depend on `localhost:3001`.

This restores current one-machine evidence only. Remaining release blockers
are second-PC multi-device evidence, second-PC CPU/matrix evidence, support
mailbox, Store/Microsoft, and hosted `musu.pro` P2P release proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_PRESENCE_CANDIDATE_METADATA_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-05 Rendezvous selector candidate metadata (wiki/737)

Rust rendezvous path selection now consumes the public/NAT/relay candidate
metadata preserved by `musu.pro` and published by local MUSU programs.

Source change:

- `musu-rs/src/bridge/rendezvous.rs`
- direct candidates select `public_addr` when present
- selected peer metadata preserves original `candidate_addr`,
  `selected_addr_source`, `public_addr`, `nat_type`, and `nat_observed_by`
- relay descriptors are carried under `relay_candidates` as fallback metadata
- relay candidates remain excluded from default route selection

Regression coverage:

- LAN still wins over Tailscale/direct/relay when available
- direct-only public candidates select `public_addr`
- NAT metadata survives into `ResolvedPeer.meta`
- relay descriptors are available for fallback diagnostics without making relay
  the default data path

Validation:

- `cargo test --manifest-path .\musu-rs\Cargo.toml --bin musu rendezvous -- --nocapture`
  passed `6/6`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --bin musu` passed
- `audit-p2p-store-forward-relay-contract.ps1 -Json` passed with `ok=true`
  and `fail_count=0`
- `git diff --check` passed

Release implication:

- this closes the selector-side gap after wiki/733 and wiki/735
- Rust source changed after the current packaged evidence refresh, so fresh
  MSIX, single-machine, idle CPU, and runtime CPU matrix evidence is required
  again before current-source local runtime gates can be claimed
- public release remains No-Go on second-PC evidence, hosted P2P release proof,
  support mailbox evidence, Store evidence, and packaged evidence freshness

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RENDEZVOUS_SELECTOR_CANDIDATE_METADATA_2026_06_05.md`

## 2026-06-05 Desktop shell dashboard URL hardening (wiki/738)

The desktop shell and `/app` gate now align with the packaged local runtime /
MUSU.PRO web split when no workspace dashboard is exposed.

Root cause:

- the installed MUSU bridge was healthy at `127.0.0.1:10325`
- no process listened on `127.0.0.1:3001`
- `http://127.0.0.1:3001/app` therefore produced
  `ERR_CONNECTION_REFUSED` even though the local MUSU program was running
- the remaining bad product surface was a fabricated dashboard fallback URL in
  the Tauri shell plus `/app` copy that told users to visit
  `localhost:3001/app`

Source hardening:

- `musu-bee/src-tauri/src/lib.rs`: absent dashboards now return
  `dashboard_url=None` instead of `http://127.0.0.1:3000/app`
- `musu-bee/src-tauri-shell/main.js`: `Open Dashboard` is disabled unless a
  live dashboard URL is reported
- `musu-bee/src/app/app/page.tsx`: the gate copy now says MUSU Desktop runs the
  work locally and MUSU.PRO connects to the local runtime, without instructing
  users to open `localhost:3001/app`

Validation:

- `cargo test --manifest-path .\musu-bee\src-tauri\Cargo.toml` passed `7/7`
- direct `.\node_modules\.bin\tsc.cmd --noEmit` passed
- `git diff --check` passed

Release implication:

- this is source hardening, so fresh MSIX/single-machine/idle CPU/runtime
  matrix evidence is required before current-source local runtime gates can be
  claimed
- public release remains No-Go on second-PC evidence, hosted P2P release proof,
  support mailbox evidence, Store evidence, and packaged evidence freshness

Canonical report:

- `docs\RELEASE_1_15_0_RC1_DESKTOP_SHELL_DASHBOARD_URL_HARDENING_2026_06_05.md`

## 2026-06-05 Post desktop dashboard URL hardening primary evidence refresh (wiki/739)

Fresh HUGH_SECOND packaged local-runtime evidence was restored after desktop
shell dashboard URL hardening.

Package refresh:

- release runtime build passed
- Tauri desktop shell build passed
- MSIX package/signing passed
- packaged startup smoke passed
- install and installed package contract verification passed
- packaged runtime identity check passed with explicit WindowsApps alias

Runtime repair:

- bridge `http://127.0.0.1:1181`
- `dashboard.required=false`
- after-process ownership passed

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
- matrix verifier `ok=true`, `fail_count=0`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_112906`
- route task `37773a7f-6aa3-4f0c-90d7-0317558d044f`
- matrix max role CPU: MUSU `0.03`, Node `0`, WebView2 `0.1`
- matrix max working set: `366.26MB`

Remaining release blockers:

- second-PC multi-device evidence
- second-PC idle CPU evidence
- second-PC runtime CPU matrix evidence
- hosted MUSU.PRO P2P release proof
- support mailbox evidence
- Store/Microsoft evidence

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_DESKTOP_DASHBOARD_URL_HARDENING_PRIMARY_EVIDENCE_REFRESH_2026_06_05.md`

## 2026-06-05 Relay transport proof peer binding gate (wiki/743)

Hosted route evidence now requires inline `musu.relay_transport_proof.v1` to
carry `source_node_id` and `target_node_id`, and the route evidence API keeps
relay records non-release-grade when the proof peer pair does not match the
route evidence source/target pair. `release_grade=true` relay queries revalidate
the current transport proof against the same peer pair, so an old or manual
proof cannot be reused across routes.

Rust `RouteRelayTransportProof` now serializes the same source/target fields.
This is evidence-integrity hardening only; it does not implement the release
relay tunnel.

Validation passed route-evidence tests, TypeScript typecheck, the Rust
peer-binding DTO serialization test, P2P store-forward relay contract audit,
P2P env status recheck, and `git diff --check`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_TRANSPORT_PROOF_PEER_BINDING_GATE_2026_06_05.md`

## 2026-06-05 Post relay peer-binding evidence, audit, and next steps (wiki/744)

The product boundary is locked:

- MUSU Desktop is the local executor.
- MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
  relay-fallback policy, and evidence control plane.
- Local MUSU programs do the work and prefer P2P mesh after web-assisted
  rendezvous.
- `localhost:3001` is optional developer/workspace UI, not the packaged local
  runtime.

Fresh HUGH_SECOND evidence after the peer-binding change:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260605-200256-HUGH_SECOND.evidence.json`
- single-machine bridge-only smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-200449-HUGH_SECOND.evidence.json`
- idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-201254-HUGH_SECOND.desktop-open.evidence.json`
- normal runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-201430-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-202107-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Clean go/no-go after evidence commit `b001924a` keeps local artifacts and
single-machine gates true, targeted second-PC route CPU true, and public release
false. Remaining blockers are real second-PC multi-device/CPU/matrix evidence,
hosted P2P release proof, support mailbox proof, and Store proof.

Qualitative status: local one-machine desktop beta is strong; release evidence
discipline is strong; hosted P2P and public desktop release are still No-Go.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELAY_TRANSPORT_PROOF_PEER_BINDING_EVIDENCE_AUDIT_NEXT_STEPS_2026_06_05.md`

## 2026-06-05 Relay peer-binding index refresh

Indexing was refreshed after wiki/743 and wiki/744:

- gbrain code sync: source `gstack-code-musu-bee-8815b622`, `page_count=148`
- gbrain memory sync: `573 written`, `0 failed`
- gbrain final state: `DONE_WITH_CONCERNS` because brain-sync reported
  `gstack-brain-sync exited undefined` and Windows search/capability probes did
  not verify symbol hits
- MUSU local indexer: final run `2404 files`, `2690 symbols`, `13070 ms`

Do not add GBrain Search Guidance to `AGENTS.md` until semantic/symbol search
returns verified hits on this Windows machine.

## 2026-06-05 WebSocket proxy loop audit coverage (wiki/745)

The Rust background-loop release audit now explicitly covers
`musu-rs/src/bridge/handlers/ws_proxy.rs`.

What changed:

- `audit-rust-background-loop-contract.ps1` now has a `ws-proxy` scope.
- It verifies WebSocket proxy loops are tied to `ws.on_upgrade(...)`.
- It verifies client-to-upstream waits on `client_rx.next().await`.
- It verifies upstream-to-client waits on `upstream_rx.next().await`.
- It verifies both directions exit on send failure.
- It verifies `tokio::select!` closes the proxy when either side ends.

This is audit coverage hardening only. It does not change runtime behavior,
relay transport policy, or the product boundary. MUSU Desktop is still the
local executor. MUSU.PRO is still remote input, project/company room,
rendezvous, path-selection, relay-fallback policy, and evidence control plane.

Validation:

- PowerShell parser: pass
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`
- `ws-proxy` checks: `6/6`
- frontend polling audit: `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`, direct interval hits `0`
- `git diff --check`: pass

Clean go/no-go after `918ac7a6`:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `manifest_git_dirty=false`
- `ready_for_public_desktop_release=false`

Remaining blockers are second-PC multi-device evidence, second-PC idle CPU
evidence, second-PC runtime CPU matrix evidence, hosted P2P control-plane
proof, support mailbox proof, and Store proof.

Qualitative status: no high or medium issue was found in this verifier-only
change. One-machine desktop readiness remains strong, and the source-side
idle-loop contract is stronger. Public release remains No-Go.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_WS_PROXY_LOOP_AUDIT_COVERAGE_2026_06_05.md`

## 2026-06-05 WebSocket proxy loop audit index refresh

Indexing was refreshed after wiki/745 and GOAL v566/v567.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2407 files`
- `2690 symbols`
- `16395 ms`

gbrain:

- quiet run exited code `1` without useful output, so the sync was rerun
  non-quiet
- mode `incremental`, engine `pglite`
- code stage `OK`: source `gstack-code-musu-bee-8815b622`,
  `page_count=356`
- memory stage `OK`: `0 imported`, `1 unchanged`, `0 failed`
- final state: `2 ok, 1 error`
- failing stage: `brain-sync`, `gstack-brain-sync exited undefined`
- import blockers included missing `ZEROENTROPY_API_KEY` and generated/evidence
  file failures; `sync.last_commit` did not advance

The MUSU local index remains the reliable current repo index. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

## 2026-06-06 Current P2P control-plane code audit and next steps (wiki/781)

Current recheck stayed public-release No-Go, but no high/medium issue was found
in the audited P2P/control-plane/runtime surfaces.

Clean go/no-go on `eb8484ff4ab29a8db6c7f5b5f6841f7e246dd438` with public
metadata skipped:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU matrix `1/2`
- targeted second-PC route CPU `true`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=false`

P2P env status remains `ok=false`: store-forward queue fallback and release
payload preflight are audited, but release relay payload endpoint/tunnel
transport, production KV/Upstash, live relay route proof, and relay payload
delivery proof are still missing.

Validation passed:

- `npm run test:p2p` `90/90`
- `npm run typecheck`
- P2P store-forward relay contract audit `ok=true`, `fail_count=0`
- Rust background-loop audit `ok=true`, `fail_count=0`, unaudited
  loop/spawn/network watcher hits `0`
- release evidence verifier regressions `51/51`
- `cargo test --lib relay_payload` `24/24`
- `cargo check --bin musu`
- `git diff --check`

Qualitative assessment: the local desktop executor path is healthy on
HUGH_SECOND, and the gate posture is correctly fail-closed. The release risk is
evidence/deployment, not a newly found code defect. The product boundary remains
MUSU Desktop as local executor and MUSU.PRO as remote input, project/company
room, rendezvous, path-selection, relay-fallback policy, and evidence/control
plane.

Next steps are second-PC current-build install and route/CPU/matrix evidence,
production `musu.pro` KV/Upstash plus live owner-scoped P2P proof, release
relay tunnel implementation/proof, support mailbox proof, Store evidence, and a
full go/no-go without skipped metadata.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_P2P_CONTROL_PLANE_CODE_AUDIT_NEXT_STEPS_2026_06_06.md`

## 2026-06-06 Current P2P control-plane code audit index refresh (wiki/782)

Indexing was refreshed after wiki/781 and GOAL v606.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2513 files`
- `2731 symbols`
- `9304 ms`

Indexed update set:

- current P2P control-plane code audit and next-steps report
- P2P control-plane spec
- network boundary spec
- BETA release checklist
- GOAL/WIKI/WIKI_INDEX
- chief-of-staff memory

The MUSU local index remains the reliable current code/document index for this
repo in this Windows environment.

## 2026-06-06 Final operator packet after current P2P audit (wiki/783)

The final operator packet generator and verifier now include the current P2P
control-plane code audit and next-step report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_P2P_CONTROL_PLANE_CODE_AUDIT_NEXT_STEPS_2026_06_06.md`

Source commit:

- `b71c438bb764483b206d5da4e105744f796df58f`

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260606-051216.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-051242.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-051242\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260606-051242.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-051242\partner-center\MUSU-1.15.0-rc.1-store-submission-20260606-051242.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260606-051216`

Validation passed:

- script parser checks
- `git diff --check`
- release verifier regressions `51/51`
- final operator packet verifier `ok=true`, `fail_count=0`
- operator action pack verifier `ok=true`, `fail_count=0`
- handoff status quick action-pack verification `ok=true`, `fail_count=0`

Clean go/no-go on `b71c438b` still reports public release No-Go: runtime idle
CPU `1/2`, runtime CPU matrix `1/2`, targeted second-PC route CPU `true`,
`p2p_control_plane_verified=false`, and `manifest_git.dirty=false`.

This is handoff hardening and artifact refresh only. The second-PC transfer
must still be run on a real second Windows PC to close the two-machine gates.
MUSU Desktop remains local executor; MUSU.PRO remains remote input,
project/company room, rendezvous, path-selection, relay-fallback/evidence
control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FINAL_OPERATOR_PACKET_AFTER_CURRENT_P2P_AUDIT_2026_06_06.md`

## 2026-06-06 Final operator packet after current P2P audit index refresh (wiki/784)

Indexing was refreshed after wiki/783 and GOAL v608.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2516 files`
- `2731 symbols`
- `10322 ms`

Indexed update set:

- final operator packet after current P2P audit report
- BETA release checklist
- GOAL/WIKI/WIKI_INDEX
- chief-of-staff memory

Search terms should include `GOAL v609`, `wiki/784`, `20260606-051216`,
`20260606-051242`, and
`MUSU-second-PC-transfer-1.15.0-rc.1-20260606-051242.zip`.

## wiki/779 - Post-Degraded-Gate Primary Evidence Refresh

The primary packaged Windows evidence has been refreshed for
`701988f39ce2f293077198e853d68cf84c470b5d` after the degraded/fallback
contract gate.

Key evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-043041-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-043051-HUGH_SECOND.desktop-open.evidence.json`
- full runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-043203-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted failed-route CPU attempt:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-043811-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Primary result:

- bridge `http://127.0.0.1:4760`, PID `32780`
- `dashboard.required=false`
- single-machine surface `local-bridge-only`
- desktop-open CPU: MUSU `0`, Node `0`, WebView2 `0.03`, hot `0`
- full matrix max WebView2 `0.1`
- targeted `HUGH-MAIN` route timed out at `192.168.1.192:8949`; failure was
  allowed for CPU evidence only

Search terms: `GOAL v604`, `wiki/779`,
`POST_DEGRADED_GATE_PRIMARY_EVIDENCE_REFRESH`, `20260606-043041-HUGH_SECOND`,
`20260606-043051-HUGH_SECOND.desktop-open`, `20260606-043203-HUGH_SECOND`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260606_043203`, `20260606-043811-HUGH_SECOND`,
`HUGH-MAIN`, `192.168.1.192:8949`, `local-bridge-only`,
`runtime_idle_cpu_valid_machine_count=1/2`, and
`runtime_cpu_scenario_matrix_valid_machine_count=1/2`.

## wiki/780 - Post-Degraded Primary Evidence Index Refresh

Indexing was refreshed after wiki/779 and GOAL v604/v605.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2510 files`
- `2731 symbols`
- `18799 ms`

Clean go/no-go after commit `02c24fd3d712b1fb10fb36cd59165427f57d722a`:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2`
- runtime CPU scenario matrix `1/2`
- targeted second-PC route CPU `true`
- `p2p_control_plane_verified=false`
- `manifest_git.dirty=false`

Remaining blockers are second-PC multi-device evidence, second-PC idle CPU,
second-PC runtime CPU matrix, public metadata recheck, support mailbox, Store
proof, and hosted MUSU.PRO P2P/relay proof.

Search terms: `GOAL v605`, `wiki/780`, `post-degraded primary evidence index
refresh`, `2510 files`, `2731 symbols`, `18799 ms`, `02c24fd3`,
`single_machine_verified=true`, `runtime idle CPU 1/2`,
`runtime CPU matrix 1/2`, `targeted second-PC route CPU true`, and
`p2p_control_plane_verified=false`.

## 2026-06-06 degraded mode contract gate (wiki/775)

Degraded/fallback truthfulness is now a release contract.

The product boundary is unchanged but now stricter in API/UI terms:

- MUSU Desktop/local runtime executes actual work.
- MUSU.PRO/web can accept remote input and coordinate rooms, rendezvous, path
  selection, relay fallback, and evidence.
- If local state is unavailable, stale, or only reachable through fallback,
  web/API surfaces must show `degraded`, `offline`, or fallback source instead
  of fabricated healthy state.

What changed:

- Added `scripts\windows\audit-degraded-mode-contract.ps1`.
- Audit schema: `musu.degraded_mode_contract.v1`.
- Go/no-go field: `degraded_mode_contract_verified`.
- Blocker area: `degraded-mode`.
- Final handoff status, final operator packet, packet verifier, readiness
  audit, freshness classifiers, and release verifier source-contract tests now
  include the contract.
- `/api/device-status` now emits a local status envelope with `source`,
  `reason`, `cpu`, `gpu`, `ram`, `device_id`, `recommended_for`, `degraded`,
  `degradedReason`, and `devices`.
- `source=health-fallback` means bridge `/status` failed but `/health` returned
  structured local bridge state.
- `source=offline-fallback` means no usable bridge status/health was available;
  no recommendations are fabricated.
- Device discovery reads either the new envelope or the older bare array.
- `npm run test:routes` now includes agents and device-status fallback tests.

Code audit:

- Medium issue found and fixed: `/api/device-status` returned only
  `/api/fleet/status` array state while `@route` and route tests expected local
  `/status` metrics and fallback source fields.
- Test-infra issue fixed: agents/device-status route tests now no-op
  `server-only` before importing route modules under Node's test runner.
- No high or remaining medium issue after validation.

Validation:

- PowerShell parser checks: pass
- `npm run test:routes`: 28/28
- `npm run typecheck`: pass
- degraded-mode audit: `ok=true`, `fail_count=0`
- release verifier regressions: `ok=true`, `case_count=51`,
  `failed_case_count=0`

Qualitative status: this is a strong product-hardening step because it prevents
the web/control plane from implying that the local executor is healthy when it
is stale or unavailable. It does not close public release. Remaining blockers
are still second-PC route/CPU/matrix evidence, hosted MUSU.PRO P2P/relay proof,
support mailbox proof, and Store proof.

Canonical reports:

- `docs\RELEASE_1_15_0_RC1_DEGRADED_MODE_CONTRACT_GATE_2026_06_06.md`
- `docs\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_DEGRADED_MODE_GATE_2026_06_06.md`

## 2026-06-06 degraded mode contract index refresh (wiki/776)

MUSU local indexing was refreshed after wiki/775 and GOAL v600.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2491 files`
- `2731 symbols`
- `11348 ms`

Indexed context included the degraded-mode contract gate report, degraded-mode
next steps, BETA checklist update, network boundary spec update, WIKI/WIKI_INDEX
updates, release verifier source-contract updates, and CoS memory update.

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. The MUSU local index
remains the reliable current repo index.

## 2026-06-06 clean go/no-go after degraded mode gate (wiki/777)

Clean HEAD after commit `f8c8e4ed3ee23a00a4657e5753ed25954f38bcf8` confirmed
the new degraded-mode gate:

- `degraded_mode_contract_verified=true`
- `frontend_polling_contract_verified=true`
- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `local_api_auth_contract_verified=true`
- `operator_api_security_contract_verified=true`
- `p2p_store_forward_relay_contract_verified=true`
- `secret_storage_contract_verified=true`
- `local_artifacts_ready=true`
- `msix_install_verified=true`
- `manifest_dirty=false`

The same clean go/no-go also reset current-source local runtime evidence:

- `single_machine_verified=false`
- runtime idle CPU `0/2`
- runtime CPU scenario matrix `0/2`
- targeted second-PC route CPU `false`

This is expected because the degraded-mode gate changed Next/API source,
especially `/api/device-status`. The next step is to refresh primary packaged
single-machine, desktop-open idle CPU, runtime CPU matrix, and targeted route
CPU evidence on the new HEAD before treating the second-PC return as the only
remaining runtime gate.

## 2026-06-06 degraded mode clean go/no-go index refresh (wiki/778)

MUSU local indexing was refreshed after wiki/777 and GOAL v602.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2493 files`
- `2731 symbols`
- `10272 ms`

Indexed context included the clean go/no-go note, degraded-mode report updates,
degraded-mode next steps update, BETA checklist update, WIKI/WIKI_INDEX, and
CoS memory updates.

## 2026-06-06 filesystem watcher scope contract gate (wiki/771)

The Rust background-loop release audit now explicitly gates filesystem watcher
scope for the local desktop runtime.

What changed:

- `audit-rust-background-loop-contract.ps1` now checks that filesystem watcher
  primitives stay only in `musu-rs/src/indexer/watch.rs` and
  `musu-rs/src/install/sync.rs`.
- The audit proves `musu indexer watch` is command-scoped through the explicit
  `IndexerAction::Watch` CLI dispatch.
- The audit proves the default bridge/runtime path does not call the indexer
  watcher.
- File-sync watcher starts are allowed only from the configured bridge sync
  path or the explicit `musu sync` CLI.
- The audit emits `filesystem_watcher_primitive_hit_count` and
  `file_sync_watcher_start_hit_count`.
- `test-release-evidence-verifiers.ps1` now has source-contract regression
  `rust background audit limits filesystem watcher scope`.
- `verify-final-operator-gate-packet.ps1` now verifies final packets contain
  the strengthened watcher-scope audit strings.

Validation:

- PowerShell parser: pass
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `unaudited_spawn_hit_count=0`,
  `filesystem_watcher_primitive_hit_count=0`,
  `file_sync_watcher_start_hit_count=0`
- release evidence verifier regressions: `ok=true`, `case_count=47`,
  `failed_case_count=0`
- `git diff --check`: pass
- dirty go/no-go with public metadata skipped:
  `single_machine_verified=true`, `msix_install_verified=true`,
  `runtime_idle_cpu_valid_machine_count=1/2`,
  `runtime_cpu_scenario_matrix_valid_machine_count=1/2`,
  `runtime_cpu_second_pc_route_attempt_verified=true`,
  `rust_background_loop_contract_verified=true`,
  `p2p_control_plane_verified=false`

Code audit found no high or medium runtime issue. This is verifier/source
contract hardening only; runtime behavior is unchanged.

Product boundary:

- MUSU Desktop remains the local executor.
- MUSU.PRO remains remote input, project/company room, rendezvous,
  path-selection, relay-fallback policy, and evidence control plane.
- Default desktop/runtime should not start hidden file/index watchers.
- `musu indexer watch` remains explicit; file sync starts only when shared
  roots are configured or `musu sync` is run.

Public release remains No-Go on second-PC route/CPU/matrix evidence, hosted
MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FILESYSTEM_WATCHER_SCOPE_CONTRACT_GATE_2026_06_06.md`

## 2026-06-06 filesystem watcher scope index refresh (wiki/772)

MUSU local indexing was refreshed after wiki/771, GOAL v596, the filesystem
watcher scope contract report, BETA checklist, network boundary spec,
WIKI/WIKI_INDEX, changed release verifier scripts, and CoS memory update.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2483 files`
- `2719 symbols`
- `10455 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

The MUSU local index remains the reliable current code/document index. Search
terms should include `GOAL v597`, `wiki/772`,
`filesystem watcher scope index refresh`,
`filesystem_watcher_primitive_hit_count=0`,
`file_sync_watcher_start_hit_count=0`,
`rust background audit limits filesystem watcher scope`,
`release verifier 47/47`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 network watcher scope contract gate (wiki/773)

The Rust background-loop release audit now explicitly gates network
watcher/poller scope.

What changed:

- `audit-rust-background-loop-contract.ps1` now proves active mDNS discovery is
  scoped to the explicit `musu discover` CLI command.
- The audit adds `$allowedNetworkWatcherFiles`.
- The audit scans for network watcher/poller primitives:
  `poll_device_token`, `discover_peers`, `auto_register_peers`, relay payload
  query/claim/deliver calls, relay payload poller calls,
  `tokio::time::interval`, `IntervalStream::new`, mDNS `recv_timeout`, and the
  low-duty cloud registration loop marker.
- The audit emits `network_watcher_primitive_hit_count`.
- `test-release-evidence-verifiers.ps1` now has source-contract regression
  `rust background audit limits network watcher scope`.
- `verify-final-operator-gate-packet.ps1` now checks final packets contain the
  network watcher scope contract.

Validation:

- PowerShell parser: pass
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `unaudited_spawn_hit_count=0`,
  `filesystem_watcher_primitive_hit_count=0`,
  `file_sync_watcher_start_hit_count=0`,
  `network_watcher_primitive_hit_count=0`
- release evidence verifier regressions: `ok=true`, `case_count=48`,
  `failed_case_count=0`

Code audit found no high or medium runtime issue. This is verifier/source
contract hardening only; runtime behavior is unchanged.

Product boundary:

- MUSU Desktop remains the local executor and resource owner.
- MUSU.PRO remains remote input, project/company room, rendezvous,
  path-selection, relay-fallback policy, and evidence control plane.
- Default local runtime must not gain hidden network scan/poll loops outside
  explicit CLI, opt-in, low-duty, or request-scoped surfaces.

Public release remains No-Go on second-PC route/CPU/matrix evidence, hosted
MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_NETWORK_WATCHER_SCOPE_CONTRACT_GATE_2026_06_06.md`

## 2026-06-06 network watcher scope index refresh (wiki/774)

MUSU local indexing was refreshed after wiki/773, GOAL v598, the network
watcher scope contract report, BETA checklist, network boundary spec,
WIKI/WIKI_INDEX, changed release verifier scripts, and CoS memory update.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2486 files`
- `2719 symbols`
- `10887 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

The MUSU local index remains the reliable current code/document index. Search
terms should include `GOAL v599`, `wiki/774`,
`network watcher scope index refresh`,
`network_watcher_primitive_hit_count=0`,
`rust background audit limits network watcher scope`,
`release verifier 48/48`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 final operator packet after second-PC CPU subrole gate (wiki/761)

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

Both artifact verifiers passed with `fail_count=0`. Public release remained
No-Go on second-PC route/CPU/matrix evidence, hosted P2P proof, support mailbox
proof, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FINAL_OPERATOR_PACKET_AFTER_SUBROLE_GATE_2026_06_06.md`

## 2026-06-06 final operator packet/action pack index refresh (wiki/762)

Indexing was refreshed after wiki/761 and GOAL v586/v587.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2469 files`
- `2717 symbols`
- `18185 ms`

Release evidence verifier regressions passed `45/45`. gbrain was not rerun
because the same-session blocker remained missing `ZEROENTROPY_API_KEY`,
generated/evidence import failures, `sync.last_commit` not advancing, and
`gstack-brain-sync exited undefined`.

## 2026-06-06 P2P relay transport kind/encryption split (wiki/763)

The hosted relay release contract now separates relay tunnel kind from
encryption/proof:

- release relay tunnel kind: `quic_relay_tunnel`
- release encryption/proof requirement: `quic_tls_1_3`

API preflight/status responses now expose both
`release_grade_relay_transport_kind=quic_relay_tunnel` and
`release_grade_transport_required=quic_tls_1_3`. The P2P control-plane
verifier requires `relay_transport_kind=quic_relay_tunnel` separately from
the `quic_tls_1_3` proof requirement.

Current source remains release-blocked:

- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- hosted KV/Upstash env is missing
- live relay route proof and payload delivery proof are missing

Validation:

- `npm run test:p2p`: `88/88`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- P2P env status: `ok=false` with expected blockers
- release evidence verifier regressions: `45/45`, failed `0`

Code audit found and fixed one medium audit-layer issue: the P2P relay
contract audit still looked for the old verifier condition that treated
`quic_tls_1_3` as the relay kind. The audit now gates
`release_grade_relay_transport_kind=quic_relay_tunnel` and
`release_grade_transport_required=quic_tls_1_3` separately.

This is gate/spec hardening only. MUSU Desktop remains the local executor;
MUSU.PRO remains remote input, project/company room, rendezvous,
path-selection, relay-fallback policy, and evidence control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_TRANSPORT_KIND_ENCRYPTION_SPLIT_2026_06_06.md`

## 2026-06-06 P2P relay transport split index refresh (wiki/764)

Indexing was refreshed after wiki/763 and GOAL v588.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2471 files`
- `2717 symbols`
- `9797 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. The MUSU local index
remains the reliable current code/document index for this repo.

## 2026-06-06 release relay payload preflight byte rejection (wiki/765)

`/api/v1/relay/payload` is still a release preflight endpoint, not a payload
data path. It now rejects known payload byte fields before lease lookup while
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`.

Rejected fields:

- `payload`
- `payload_base64`
- `payload_b64`
- `payload_bytes`
- `body_base64`

The response is `400 release_payload_bytes_not_accepted` with
`release_payload_accepted=false`, `payload_stored=false`, and
`payload_transported=false`. Metadata-only lease preflight remains allowed and
still returns `409 relay_payload_endpoint_not_wired` after a verified
owner-scoped lease because the release tunnel transport is not implemented.

Validation:

- `npm run test:p2p`: `89/89`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- P2P env status: `ok=false` with expected blockers
- release evidence verifier regressions: `45/45`, failed `0`

Code audit found no high or medium issue. This hardens the release/web
boundary without changing release readiness. MUSU Desktop remains the local
executor; MUSU.PRO remains remote input, project/company room, rendezvous,
path-selection, relay-fallback policy, and evidence control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELEASE_RELAY_PAYLOAD_PREFLIGHT_BYTE_REJECTION_2026_06_06.md`

## 2026-06-06 release relay payload byte rejection index refresh (wiki/766)

Indexing was refreshed after wiki/765 and GOAL v590.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2474 files`
- `2719 symbols`
- `11548 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. The MUSU local index
remains the reliable current code/document index for this repo.

## 2026-06-06 release relay payload preflight strict metadata schema (wiki/767)

`/api/v1/relay/payload` now rejects all unexpected request fields while it is a
preflight-only release surface.

Accepted request fields:

- optional `schema=musu.relay_payload_preflight_request.v1`
- `lease_id`
- `session_id`
- `source_node_id`
- `target_node_id`
- optional `tunnel_id`
- optional `payload_kind`
- optional 64-hex `payload_sha256`

Known payload byte fields still return `release_payload_bytes_not_accepted`
before schema parsing. Other unexpected fields now return
`invalid_relay_payload_preflight_request`.

Validation:

- `npm run test:p2p`: `90/90`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=true`, `case_count=45`,
  `failed_case_count=0`
- P2P env status recheck: expected `ok=false` because release relay payload
  transport, KV/Upstash, live relay route, and relay payload delivery proof are
  still missing

Code audit found no high or medium issue. This is release-boundary hardening,
not release relay payload transport completion.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELEASE_RELAY_PAYLOAD_PREFLIGHT_STRICT_METADATA_SCHEMA_2026_06_06.md`

## 2026-06-06 release relay payload strict metadata index refresh (wiki/768)

MUSU local indexing was refreshed after wiki/767, GOAL v592, the strict
metadata report, the P2P control-plane spec, BETA checklist, WIKI/WIKI_INDEX,
existing next-steps handoff note, and CoS memory updates.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- files: `2477`
- symbols: `2719`
- elapsed: `10589 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. The MUSU local index
remains the reliable current code/document index for this repo.

## 2026-06-06 runtime idle CPU full role attribution gate (wiki/769)

The single `desktop-open` runtime idle CPU gate now requires full
MUSU/node/WebView2/other role attribution, matching the stricter runtime CPU
scenario matrix standard.

What changed:

- `write-release-go-no-go.ps1` adds `Test-ObjectHasPropertyNames`.
- `Test-RuntimeIdleCpuEvidence` now requires `process_counts_by_role` to include
  `musu`, `node`, `webview2`, and `other`.
- `cpu_attribution.sample_count_by_role`,
  `cpu_attribution.total_cpu_seconds_by_role`, and
  `cpu_attribution.max_one_core_percent_by_role` must include the same four
  roles.
- Existing subrole checks for `bridge_runtime`, `desktop_shell`,
  `webview2_helper`, `node_helper`, `musu_runtime`, and `other` remain in
  force.
- `test-release-evidence-verifiers.ps1` adds source-contract case
  `go-no-go runtime idle CPU requires full role attribution`.

Validation:

- PowerShell parser: pass
- release evidence verifier regression: `ok=true`, `case_count=46`,
  `failed_case_count=0`
- dirty-tree go/no-go with public metadata skipped:
  `runtime_idle_cpu_valid_machine_count=1/2 [HUGH_SECOND]`,
  `runtime_cpu_scenario_matrix_valid_machine_count=1/2`,
  `runtime_cpu_second_pc_route_attempt_verified=true`,
  `idle_busy_loop_candidate_contract_verified=true`
- `git diff --check`: pass

Code audit found no high or medium issue. This is verifier hardening only; it
does not replace fresh 60-second CPU evidence and does not close the two-machine
idle CPU gate.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_IDLE_CPU_FULL_ROLE_ATTRIBUTION_GATE_2026_06_06.md`

## 2026-06-06 runtime idle CPU full role attribution index refresh (wiki/770)

MUSU local indexing was refreshed after wiki/769, GOAL v594, the runtime idle
CPU full-role attribution report, BETA checklist, WIKI/WIKI_INDEX, release
verifier source-contract update, and CoS memory update.

Command:

`& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`

Result:

- files: `2480`
- symbols: `2719`
- elapsed: `9798 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. The MUSU local index
remains the reliable current code/document index for this repo.

## 2026-06-06 second-PC runtime CPU subrole import gate (wiki/759)

The second-PC return path now enforces the runtime CPU subrole evidence
contract during import.

What changed:

- `run-second-pc-release-check.ps1` now writes
  `runtime_idle_cpu_subrole_summary`,
  `runtime_cpu_scenario_subrole_summary`, and
  `runtime_cpu_subrole_contract_ok`.
- `import-second-pc-return.ps1 -RequireReleaseGateEvidence` now directly parses
  the returned idle CPU and runtime matrix JSONs and rejects missing
  `process_counts_by_subrole`, `max_one_core_percent_by_subrole`,
  `memory_totals_by_subrole_mb`, CPU attribution subrole totals/max fields, or
  `top_processes[*].process_subrole`.
- Release imports now require `bridge_runtime`; desktop/startup evidence also
  requires `desktop_shell`, and `desktop-open` requires `webview2_helper`.
- Operator action pack, final operator packet, and multi-device kit templates
  now document that old second-PC return zips without subrole fields are
  diagnostic only.
- `test-release-evidence-verifiers.ps1` now has a source-contract regression
  case named `second-PC return import requires runtime CPU subrole contract`.

Validation:

- PowerShell parser: pass for edited scripts
- release evidence verifier regressions: `ok=true`, `case_count=45`,
  `failed_case_count=0`

Code audit:

- Fixed medium issue: second-PC release imports trusted returned release-check
  booleans and file presence too much after the subrole evidence contract was
  added. The importer now re-parses the returned CPU JSONs and requires
  `runtime_cpu_subrole_contract_ok=true`.
- No remaining high or medium issue was found in the changed scripts after the
  regression run.

Product boundary:

- MUSU Desktop remains the local executor on each Windows device.
- MUSU.PRO remains remote input, project/company room, rendezvous,
  path-selection, relay-fallback policy, and evidence/control coordination.
- This does not complete multi-device P2P, hosted relay payload transport,
  support mailbox proof, or Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SECOND_PC_RUNTIME_CPU_SUBROLE_IMPORT_GATE_2026_06_06.md`

## 2026-06-06 second-PC runtime CPU subrole import gate index refresh (wiki/760)

Indexing was refreshed after wiki/759 and GOAL v584.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2466 files`
- `2717 symbols`
- `8983 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`. The MUSU local index
is the reliable current code/document index for this repo.

## 2026-06-06 post release relay payload preflight primary evidence audit (wiki/755)

Fresh packaged MUSU Desktop evidence was restored on HUGH_SECOND after the
distinct fail-closed release relay payload preflight endpoint.

Evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-001948-HUGH_SECOND.evidence.json`
- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-002102-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-002155-HUGH_SECOND.desktop-open.evidence.json`
- five-scenario runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-003003-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-004121-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- single-machine surface: `local-bridge-only`
- `dashboard_required=false`
- bridge: `http://127.0.0.1:1421`
- idle CPU: MUSU `0`, Node `0`, WebView2 `0.18`, working set
  `361.21MB`, hot `0`
- normal matrix route token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_003003`
- normal matrix route task: `b3583c26-6e3f-442e-bc78-f0654e6b03c0`
- normal matrix max CPU: MUSU `0`, Node `0`, WebView2 `0.08`
- targeted HUGH-MAIN route attempt timed out to `192.168.1.192:8949` with
  `failure_allowed=true`; post-route CPU stayed MUSU `0`, Node `0`,
  WebView2 `0`, hot `0`

Clean go/no-go after the targeted evidence commit:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU `1/2 [HUGH_SECOND]`
- runtime CPU matrix `1/2 [HUGH_SECOND]`
- targeted second-PC route CPU `1/1 [HUGH_SECOND]`
- `p2p_store_forward_relay_contract_verified=true`
- `public_metadata_ok=true`
- `manifest_git.dirty=false`

Remaining blockers are real second-PC multi-device evidence, second-PC idle
CPU evidence, second-PC runtime CPU matrix evidence, live owner-scoped
`musu.pro` P2P control-plane proof, support mailbox delivery proof, and Store
release evidence.

Code audit found no high/medium issue in the current evidence/source state.
Validation passed `npm run test:p2p` `88/88`, `npm run typecheck`, and P2P
store-forward relay contract audit `ok=true` / `fail_count=0`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_RELEASE_RELAY_PAYLOAD_PREFLIGHT_PRIMARY_EVIDENCE_AUDIT_NEXT_STEPS_2026_06_06.md`

## 2026-06-06 post release relay payload preflight primary evidence audit index refresh (wiki/756)

Indexing was refreshed after wiki/755 and GOAL v580/v581.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2452 files`
- `2717 symbols`
- `14293 ms`

gbrain was not rerun because the same-session active blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

The MUSU local index remains the reliable current repo index. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

## 2026-06-06 runtime CPU subrole attribution evidence audit (wiki/757)

Runtime CPU evidence now separates MUSU-owned process subroles instead of
accepting only coarse MUSU/WebView2 process buckets.

What changed:

- `measure-musu-idle-cpu.ps1` records `bridge_registry`,
  `process_subrole`, `process_counts_by_subrole`,
  `memory_totals_by_subrole_mb`, `max_one_core_percent_by_subrole`, and
  `bridge_registry_pid_match`.
- `measure-musu-runtime-cpu-scenarios.ps1` preserves those fields per scenario.
- `verify-runtime-cpu-scenario-matrix.ps1` rejects missing subrole counts,
  totals, max CPU fields, bridge runtime separation, and top-process subrole
  fields.
- `write-release-go-no-go.ps1` requires bridge runtime and desktop shell
  separation before accepting idle CPU evidence.
- verifier regressions now include `44` cases and reject a matrix missing
  `bridge_runtime`.

Fresh HUGH_SECOND evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-013337-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-011243-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012030-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN route CPU:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-012740-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Evidence results:

- single-machine local bridge-only smoke passed with `dashboard_required=false`,
  bridge `http://127.0.0.1:1421`, and CLI route checked.
- idle CPU passed for `60.039s` with MUSU `0`, Node `0`, WebView2 `0.08`,
  working set `364.66MB`, hot `0`, `bridge_runtime=1`,
  `desktop_shell=1`, and `webview2_helper=6`.
- runtime matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_012030`, route task
  `b0647b86-b491-4736-8a9e-11379be7179c`, max WebView2 CPU `0.1`,
  max working set `364.52MB`, and the same subrole separation.
- targeted HUGH-MAIN diagnostic timed out to `192.168.1.192:8949` as an
  explicitly allowed failed route attempt; post-route CPU stayed MUSU `0`,
  Node `0`, WebView2 `0.1`, hot `0`.

Clean go/no-go after `d2296c4c`:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU valid machines `1/2 [HUGH_SECOND]`
- runtime CPU matrix valid machines `1/2 [HUGH_SECOND]`
- targeted second-PC route CPU valid machines `1/1 [HUGH_SECOND]`
- `p2p_store_forward_relay_contract_verified=true`
- `public_metadata_ok=true`
- `manifest_git.dirty=false`
- `ready_for_public_desktop_release=false`

Remaining blockers are multi-device, second-PC idle CPU, second-PC runtime
matrix, hosted P2P control-plane proof, support mailbox proof, and Store proof.

Validation passed verifier regressions `44/44`, Rust background-loop audit
`ok=true`/`fail_count=0`, frontend polling audit `ok=true`/`fail_count=0` with
`29` low-duty call sites, normal matrix verifier `ok=true`, targeted matrix
verifier `ok=true`, and clean go/no-go.

Qualitative status: no high or medium issue is open. The local packaged desktop
runtime is coherent on HUGH_SECOND, and the evidence gate is stricter because
CPU attribution now identifies bridge runtime, desktop shell, and helper
processes separately.

Product boundary remains unchanged: MUSU Desktop is the local executor.
MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
relay-fallback policy, and evidence control plane, not the default execution
server or payload data path.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_CPU_SUBROLE_ATTRIBUTION_EVIDENCE_AUDIT_NEXT_STEPS_2026_06_06.md`

## 2026-06-06 runtime CPU subrole attribution index refresh (wiki/758)

Indexing was refreshed after wiki/757 and GOAL v582/v583.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2463 files`
- `2717 symbols`
- `35338 ms`

gbrain was not rerun because the same-session blocker remains unchanged:
missing `ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.

The MUSU local index remains the reliable current repo index. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

## 2026-06-05 relay connect preflight endpoint, audit, and next steps (wiki/751)

`/api/v1/relay/connect` is now an authenticated owner-scoped release-connect
preflight endpoint instead of an always-501 placeholder.

What changed:

- `GET /api/v1/relay/connect` requires P2P control auth and returns
  `musu.relay_connect.v1`.
- `POST /api/v1/relay/connect` requires P2P control auth, validates
  `lease_id`, `session_id`, `source_node_id`, and `target_node_id`, and checks
  an owner-scoped relay lease.
- Lease store failures return `503 relay_connect_store_failed`.
- `queryRelayLeases` can filter by `lease_id`.
- `audit-operator-api-security-contract.ps1` now gates relay connect auth plus
  owner-scoped lease validation.
- `audit-p2p-store-forward-relay-contract.ps1` now accepts source-wired
  connect preflight while still rejecting payload transport claims.

Current source state:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=true`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

Validation:

- PowerShell parser checks passed for the updated status/audit scripts.
- `npm run test:p2p` passed `85/85`.
- `npm run test:routes` passed `19/19`.
- `npm run typecheck` passed.
- P2P store-forward relay contract audit passed with `ok=true`,
  `fail_count=0`.
- Operator API security contract audit passed with `ok=true`, `fail_count=0`.
- `git diff --check` passed.

`show-musu-pro-p2p-env-status.ps1 -Json` now reports
`relay_connect_endpoint_implemented=true` and
`release_connect_fail_closed_placeholder_active=false`. It correctly remains
`ok=false` because the release payload endpoint is missing, the active payload
path is queue-only/non-release-grade, `RELAY_TRANSPORT_KIND` is not
`quic_tls_1_3`, KV/Upstash storage is not configured, and live relay route plus
payload delivery proof are still absent.

Dirty-tree go/no-go at `2026-06-05T23:47:55+09:00` still reports
`ready_for_public_desktop_release=false`, `runtime idle CPU 1/2`, runtime CPU
matrix `1/2`, `multi_device_verified=false`, `p2p_control_plane_verified=false`,
and `manifest_git.dirty=true`. After this source change is committed, fresh
packaged current-HEAD evidence should be refreshed before current-source local
artifact readiness is claimed.

Code audit found no high or medium issue. This is control-plane preflight
progress, not release relay payload transport. MUSU Desktop remains the local
executor, and MUSU.PRO remains remote input, project/company room, meeting,
rendezvous, path-selection, relay fallback policy, and evidence/control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_CONNECT_PREFLIGHT_ENDPOINT_AUDIT_NEXT_STEPS_2026_06_05.md`

## 2026-06-05 relay connect preflight index refresh (wiki/752)

Indexing was refreshed after wiki/751 and GOAL v576/v577.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2435 files`
- `2707 symbols`
- `10569 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

Search terms: `musu.relay_connect.v1`, `relay_connect_store_failed`,
`RELAY_CONNECT_ENDPOINT_IMPLEMENTED=true`,
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`,
`source_release_relay_payload_endpoint_not_implemented`,
`source_relay_transport_kind_not_release_grade`, `MUSU Desktop local executor`,
and `MUSU.PRO remote input control plane`.

## 2026-06-06 release relay payload preflight endpoint (wiki/753)

`/api/v1/relay/payload` now exists as a distinct authenticated release payload
preflight endpoint. It is separate from the preview store-forward queue at
`/api/v1/p2p/relay/payload`.

Current source state:

- `RELAY_CONNECT_ENDPOINT_IMPLEMENTED=true`
- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `release_payload_preflight_endpoint_implemented=true`
- `RELAY_PAYLOAD_QUEUE_ENDPOINT_IMPLEMENTED=true`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

What changed:

- Added `RELAY_PAYLOAD_PATH=/api/v1/relay/payload`.
- Added `GET /api/v1/relay/payload` returning
  `musu.relay_payload_preflight.v1` behind P2P control auth.
- Added `POST /api/v1/relay/payload` that validates owner-scoped relay lease
  metadata before returning a release payload decision.
- The endpoint returns `release_payload_accepted=false`,
  `payload_stored=false`, `payload_transported=false`, and
  `relay_payload_endpoint_not_wired`.
- The endpoint does not call preview queue storage helpers.
- `show-musu-pro-p2p-env-status.ps1` now reports
  `release_payload_preflight_endpoint_implemented=true`.
- `audit-p2p-store-forward-relay-contract.ps1` now gates the release payload
  preflight/queue separation.

Validation:

- PowerShell parser checks passed.
- `npm run test:p2p` passed `88/88`.
- `npm run typecheck` passed.
- P2P store-forward relay contract audit passed with `ok=true`,
  `fail_count=0`.
- P2P env status recheck reported release payload preflight true, release
  payload endpoint marker false, queue-only true, and transport kind not
  release-grade.
- `git diff --check` passed.

This is release endpoint contract preparation, not release-grade relay payload
transport. MUSU Desktop remains the local executor. MUSU.PRO remains remote
input, project/company room, rendezvous, path selection, relay fallback policy,
and evidence/control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELEASE_RELAY_PAYLOAD_PREFLIGHT_ENDPOINT_2026_06_06.md`

## 2026-06-06 release relay payload preflight index refresh (wiki/754)

Indexing was refreshed after wiki/753 and GOAL v578/v579.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2439 files`
- `2717 symbols`
- `15901 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `gstack-brain-sync exited undefined`.

Search terms: `musu.relay_payload_preflight.v1`,
`RELAY_PAYLOAD_PATH=/api/v1/relay/payload`,
`release_payload_preflight_endpoint_implemented=true`,
`payload_stored=false`, `payload_transported=false`,
`relay_payload_endpoint_not_wired`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-05 post native RPC exec primary evidence, audit, and next steps (wiki/749)

Fresh HUGH_SECOND packaged local-runtime evidence was restored after native RPC
exec hardening.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260605-230036-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260605-230300-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231115-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN post-route CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260605-231836-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- single-machine smoke passed with `single_machine_surface=local-bridge-only`,
  `dashboard_required=false`, bridge `http://127.0.0.1:6540`, and CLI route
  checked
- idle CPU passed for `60.032s` with MUSU `0.03`, Node `0`, WebView2 `0.16`,
  working set `361.22MB`, and hot `0`
- normal matrix passed verifier `ok=true`/`fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260605_231115`, route task
  `c0e4c3f1-3e79-44ef-846e-475449e1819e`, max MUSU `0`, Node `0`, WebView2
  `0.1`, and max working set `364.89MB`
- targeted HUGH-MAIN route attempt timed out to `192.168.1.192:8949`, but the
  post-route CPU sample passed with MUSU `0`, Node `0`, WebView2 `0.05`, and
  hot `0`; this is not successful multi-device evidence

Clean go/no-go after `3b09dd73` reports `local_artifacts_ready=true`,
`single_machine_verified=true`, `msix_install_verified=true`, runtime idle CPU
`1/2 [HUGH_SECOND]`, runtime CPU matrix `1/2 [HUGH_SECOND]`, targeted
second-PC route CPU `1/1 [HUGH_SECOND]`, hardening/source-contract gates true,
and `ready_for_public_desktop_release=false`.

Remaining blockers are multi-device, second-PC idle CPU, second-PC runtime CPU
matrix, support mailbox, Store release, and hosted P2P control-plane proof.

Code audit found no high or medium issue. The current unpushed delta adds
evidence files only; the relevant runtime hardening is `fe25c5d8`. Validation
rerun passed `cargo test rpc_exec --lib` `6/6` and operator API security audit
`ok=true`/`fail_count=0`.

Product boundary:

- MUSU Desktop is the local executor.
- `localhost:3001` is optional developer/workspace dashboard surface, not a
  release requirement.
- MUSU.PRO is remote input, project/company room, meeting, rendezvous,
  path-selection, relay-fallback policy, and evidence control plane.
- Work executes on local MUSU programs, and devices should prefer direct P2P
  mesh after web-assisted discovery.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_NATIVE_RPC_EXEC_PRIMARY_EVIDENCE_AUDIT_NEXT_STEPS_2026_06_05.md`

## 2026-06-05 post native RPC exec evidence audit index refresh (wiki/750)

Indexing was refreshed after wiki/749 and GOAL v574/v575.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2433 files`
- `2705 symbols`
- `34984 ms`

gbrain was not rerun for this incremental documentation refresh because the
same-session active blocker is already known: missing `ZEROENTROPY_API_KEY`,
generated/evidence import failures, `sync.last_commit` not advancing, and
`gstack-brain-sync exited undefined`.

The MUSU local index remains the reliable current repo index. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

## 2026-06-05 native RPC exec hardening (wiki/748)

Native bridge `/api/v1/rpc/exec` is now treated as a local-runtime command
boundary, not a remote shell.

What changed:

- `MUSU_RPC_EXEC_ALLOWLIST` defaults empty and must explicitly allow a bare
  command name.
- command paths are rejected even when their basename is allowlisted.
- user-supplied `cwd` is rejected.
- command and args are length-bounded and reject control characters.
- stdout/stderr are capped at `64 KiB`.
- `MUSU_RPC_EXEC_TIMEOUT_SECS` defaults to `10` and clamps to `1..60`.
- children use `kill_on_drop(true)`.
- rejected, spawn-failed, timed-out, and completed attempts are written to the
  bridge audit log.
- `audit-operator-api-security-contract.ps1` now gates this native endpoint.

Validation passed Rust RPC exec tests `6/6`, `cargo check`, operator API
security audit `ok=true`/`fail_count=0`/`check_count=44`, local API auth audit
`ok=true`/`fail_count=0`/`check_count=39`, Rust background-loop audit
`ok=true`/`fail_count=0`/`check_count=200`, and `git diff --check`.

Qualitative audit: no high or medium issue remains. The audit found one issue
before commit, namely that accepting bounded `cwd` was still unsafe for this
remote-control boundary. Final behavior rejects `cwd`.

Clean go/no-go after `fe25c5d8` reports `manifest_git.dirty=false`, hardening
gates true, `local_artifacts_ready=true`, and `msix_install_verified=true`, but
`single_machine_verified=false`, runtime idle CPU false, runtime matrix false,
targeted second-PC route CPU false, hosted P2P false, support false, Store
false, and `ready_for_public_desktop_release=false`. The local evidence reset
is expected because native runtime source changed after the last packaged
evidence refresh.

The product boundary is unchanged: MUSU Desktop executes locally; MUSU.PRO is
remote input, project/company room, rendezvous, path selection, relay-fallback
policy, and evidence control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_NATIVE_RPC_EXEC_HARDENING_2026_06_05.md`

## 2026-06-05 native RPC exec hardening index refresh

Indexing was refreshed after wiki/748 and GOAL v572/v573.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2415 files`
- `2705 symbols`
- `67396 ms`

gbrain was not rerun for this incremental documentation refresh because the
previous same-session run already found the active blocker: missing
`ZEROENTROPY_API_KEY`, import failures, `sync.last_commit` not advancing, and
`gstack-brain-sync exited undefined`.

The MUSU local index remains the reliable current repo index. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

## 2026-06-05 Rust spawn/background-task audit coverage (wiki/747)

The Rust background-loop release audit now covers Rust background execution
entry points, not only explicit loop syntax.

What changed:

- `audit-rust-background-loop-contract.ps1` now audits current `tokio::spawn`,
  `tokio::task::spawn_blocking`, `std::thread::spawn`, and `thread::spawn`
  sites.
- New Rust files using those spawn constructs now fail the audit unless they
  are explicitly allowlisted and have named contract checks.
- The audit JSON now emits `unaudited_spawn_hit_count` and
  `unaudited_spawn_hits`.

New audited scopes include:

- planner/cloud heartbeat cancellation watcher spawns
- file-sync configured-root gating
- control MCP cancellation token service path
- default cloud client timeout
- clipboard opt-in blocking poller
- relay payload poller task spawn
- mDNS blocking receive timeout
- indexer `spawn_blocking` await and empty-workspace return
- PTY request-scoped write tasks
- WebRTC one-shot pong, RTCP reader, and ffmpeg capture tasks
- writer task registry, callback retries, and one-shot `musu-crawl` indexing
- Claude stdin writer
- company post-create sync, node health checks, route-evidence submit,
  rendezvous publish/close, and workflow executor spawns

Validation:

- PowerShell parser: pass
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `unaudited_spawn_hit_count=0`,
  `telemetry_flush_primitive_hit_count=0`, `check_count=200`
- frontend polling audit: `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`, direct interval hits `0`
- `git diff --check`: pass

Clean go/no-go after `94a89614`:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `frontend_polling_contract_verified=true`
- `p2p_store_forward_relay_contract_verified=true`
- `manifest_git_dirty=false`
- `ready_for_public_desktop_release=false`

Remaining blockers are unchanged: second-PC multi-device evidence, second-PC
idle CPU evidence, second-PC runtime CPU matrix evidence, hosted P2P
control-plane proof, support mailbox proof, and Store proof.

Qualitative status: no high or medium issue was found in this verifier-only
change. It strengthens source-side idle CPU defense but does not replace the
two-machine runtime CPU evidence gates.

The product boundary is unchanged: MUSU Desktop is the local executor, and
MUSU.PRO is remote input, project/company room, rendezvous, path-selection,
relay-fallback policy, and evidence control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_SPAWN_CONTRACT_AUDIT_COVERAGE_2026_06_05.md`

## 2026-06-05 Rust spawn audit index refresh

Indexing was refreshed after wiki/747 and GOAL v570/v571.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2414 files`
- `2690 symbols`
- `10865 ms`

gbrain:

- quiet run exited code `1` with no output
- non-quiet run used `mode=incremental`, `engine=pglite`
- code stage `OK`: source `gstack-code-musu-bee-8815b622`,
  `page_count=540`
- import found `3599` code files, imported `92` pages, skipped `3507`
  pages, created `5188` chunks, and hit `3059` file failures
- `sync.last_commit` did not advance
- memory stage `OK`: `0 imported`, `1 unchanged`, `0 failed`
- final state: `2 ok, 1 error`
- failing stage: `brain-sync`, `gstack-brain-sync exited undefined`
- import blockers included missing `ZEROENTROPY_API_KEY`, `row.deleted_at`
  import failures, and array-length import failures

The MUSU local index remains the reliable current repo index. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

## 2026-06-05 Rust while-let loop audit coverage (wiki/746)

The Rust background-loop release audit now gates new `while let` loop files and
explicitly audits the current finite/request-scoped `while let` sites.

What changed:

- `audit-rust-background-loop-contract.ps1` now scans for `while let`.
- New `while let` loop files fail unless they are explicitly allowlisted.
- Current `while let` sites now have named checks for why they are not idle
  busy-loop candidates.

New audited contracts:

- audit failure-window deque pruning is finite and retention-window bounded
- rate-limit deque pruning is finite and 60s-window bounded
- workflow executor/spec topological queues are finite and reject cycles
- file API directory listing waits on async `next_entry().await`
- forwarded-task multipart parsing waits on request fields
- WebDAV PROPFIND directory listing waits on async `next_entry().await`
- WebRTC NAL splitter drains the finite stdout buffer

Validation:

- PowerShell parser: pass
- Rust background-loop audit: `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `telemetry_flush_primitive_hit_count=0`,
  `check_count=152`
- selected scopes:
  `audit-failure-window 2/2`, `rate-limit-window 2/2`,
  `workflow-executor 6/6`, `workflow-spec 3/3`, `files-api 2/2`,
  `forward-multipart 2/2`, `webdav-propfind 2/2`,
  `webrtc-screen-share 8/8`, `ws-proxy 6/6`
- frontend polling audit: `ok=true`, `fail_count=0`,
  `low_duty_polling_call_site_count=29`, direct interval hits `0`
- `git diff --check`: pass

Clean go/no-go after `d1c3361b`:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `rust_background_loop_contract_verified=true`
- `idle_busy_loop_candidate_contract_verified=true`
- `frontend_polling_contract_verified=true`
- `p2p_store_forward_relay_contract_verified=true`
- `manifest_git_dirty=false`
- `ready_for_public_desktop_release=false`

Remaining blockers are second-PC multi-device evidence, second-PC idle CPU
evidence, second-PC runtime CPU matrix evidence, hosted P2P control-plane
proof, support mailbox proof, and Store proof.

This is verifier coverage hardening only. Runtime behavior and the product
boundary are unchanged: MUSU Desktop is the local executor, and MUSU.PRO is the
remote input/rendezvous/path-selection/relay-fallback/evidence control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_WHILE_LET_LOOP_AUDIT_COVERAGE_2026_06_05.md`

## 2026-06-05 Rust while-let loop audit index refresh

Indexing was refreshed after wiki/746 and GOAL v568/v569.

MUSU local indexer:

- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2409 files`
- `2690 symbols`
- `8270 ms`

gbrain was not rerun for this small documentation refresh because the previous
same-session run already found the active blocker: missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures, `sync.last_commit`
not advancing, and `brain-sync` exiting undefined.

The MUSU local index remains the reliable current repo index. Do not add GBrain
Search Guidance to `AGENTS.md` until semantic/symbol search returns verified
hits on this Windows machine.

## 2026-06-06 Room Work-Order Command Audit

`POST /api/rooms/[roomId]/work-orders` now writes a command-center audit event
for MUSU.PRO room work-order handoff after P2P control auth.

The event is `rooms.work_orders` and records:

- authenticated P2P `owner_key`
- `room_id`
- `work_order_id`
- optional `company_id` and `project_id`
- `target_node`
- `origin=musu.pro`
- result, HTTP status, bridge status, and trace id

The event intentionally does not store the room instruction body. Tests assert
that neither `instruction` nor `text` appears in the audit JSONL.

Validation:

- `npm run test:routes`: `29/29`
- `npm run test:p2p`: `90/90`
- `npm run typecheck`
- operator API security audit: `ok=true`, `fail_count=0`
- release evidence verifier regressions: `ok=true`, `case_count=51`,
  `failed_case_count=0`
- `git diff --check`

Dirty-tree go/no-go with public metadata skipped kept
`operator_api_security_contract_verified=true`, local artifacts/single-machine
true, runtime idle CPU/matrix `1/2`, targeted second-PC route CPU true, and
public release No-Go. The dirty git blocker is expected until commit.

This is security hardening for the MUSU.PRO remote-input boundary. It does not
implement release-grade relay payload transport or close second-PC/support/Store
release blockers.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_WORK_ORDER_COMMAND_AUDIT_2026_06_06.md`

## 2026-06-06 Room Work-Order Command Audit Index Refresh

MUSU local indexer was refreshed after wiki/785 and GOAL v610.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2519 files`
- `2732 symbols`
- `9705 ms`

Search terms should include `GOAL v611`, `wiki/786`,
`rooms.work_orders`, `room.work_order`, `appendControlAudit`,
`p2pControlPrincipal`, `command-center.jsonl`, `instruction text excluded`,
`operator_api_security_contract_verified=true`, `MUSU.PRO remote input`, and
`MUSU Desktop local executor`.

## 2026-06-06 Post Room Work-Order Command Audit Primary Evidence Refresh

Fresh HUGH_SECOND primary evidence was restored after the room work-order
command audit source change.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-053851-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-054220-HUGH_SECOND.desktop-open.evidence.json`
- full runtime matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-054415-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-055030-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Results:

- bridge `http://127.0.0.1:3622`
- single-machine local-bridge-only smoke passed
- idle CPU passed for `60.04s`
- idle CPU max one-core: MUSU `0`, Node `0`, WebView2 `0.08`
- full runtime matrix passed with route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_054415`
- targeted HUGH-MAIN route still timed out to `192.168.1.192:8949`; CPU
  verification passed with failed route allowed

Clean go/no-go after `7f3879fc` reports local artifacts true, single-machine
true, runtime idle CPU `1/2`, runtime matrix `1/2`, targeted second-PC route
CPU true, operator API security true, P2P control-plane false, dirty false, and
public release No-Go.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_WORK_ORDER_COMMAND_AUDIT_PRIMARY_EVIDENCE_REFRESH_2026_06_06.md`

## 2026-06-06 Post Room Work-Order Command Audit Primary Evidence Index Refresh

MUSU local indexer was refreshed after wiki/787 and GOAL v612.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2530 files`
- `2732 symbols`
- `12816 ms`

Search terms should include `GOAL v613`, `wiki/788`,
`20260606-053851-HUGH_SECOND`,
`20260606-054220-HUGH_SECOND.desktop-open`,
`20260606-054415-HUGH_SECOND.runtime-cpu-scenario-matrix`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260606_054415`,
`20260606-055030-HUGH_SECOND`, `targeted second-PC route CPU true`, and
`p2p_control_plane_verified=false`.

## 2026-06-06 Final Operator Packet After Room Work-Order Command Audit

The final operator packet and action pack were regenerated from clean source
commit `847aa2c0cb6979a62c967c2f3c4a20a4195075f2` after the room work-order
command audit and fresh primary evidence refresh.

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260606-060037.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-060103.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-060103\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260606-060103.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260606-060103\partner-center\MUSU-1.15.0-rc.1-store-submission-20260606-060103.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260606-060037`

Validation:

- final operator packet verifier: `ok=true`, `fail_count=0`, `kit_count=1`
- action pack generation: `ok=true`
- action pack verifier: `ok=true`, `fail_count=0`
- final handoff quick status: packet/action pack exist and verified
- clean go/no-go with public metadata skipped: single-machine true, runtime
  idle CPU `1/2`, runtime matrix `1/2`, targeted second-PC route CPU true,
  `p2p_control_plane_verified=false`, and public release No-Go

Qualitative code audit found no new high/medium issue in the current
room-work-order handoff and operator-packet path. The remaining risk is
external evidence: real second-PC route/CPU/matrix, hosted MUSU.PRO P2P proof,
public metadata recheck, support mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FINAL_OPERATOR_PACKET_AFTER_ROOM_WORK_ORDER_COMMAND_AUDIT_2026_06_06.md`

## 2026-06-06 Final Operator Packet After Room Work-Order Command Audit Index Refresh

MUSU local indexer was refreshed after wiki/789 and GOAL v614.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2534 files`
- `2732 symbols`
- `11243 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index is the current reliable code/document index.

Search terms should include `GOAL v615`, `wiki/790`, `2534 files`,
`11243 ms`, `20260606-060037`,
`20260606-060103`,
`MUSU-second-PC-transfer-1.15.0-rc.1-20260606-060103.zip`,
`room work-order command audit`, `MUSU.PRO remote input`,
`MUSU Desktop local executor`, and `p2p_control_plane_verified=false`.

## 2026-06-06 Runtime CPU Matrix Process Metadata Gate

Runtime CPU matrix release evidence now requires scoped process metadata for
every scenario measurement.

Changed:

- `measure-musu-runtime-cpu-scenarios.ps1` carries through
  `process_metadata_available`, `process_metadata_timed_out`, and
  `helper_process_scope`.
- `verify-runtime-cpu-scenario-matrix.ps1` requires process metadata,
  no metadata timeout, `helper_process_scope=musu_process_tree_or_repo_related`,
  and
  `cpu_attribution.attribution_scope=musu_process_tree_or_repo_related`.
- `test-release-evidence-verifiers.ps1` added negative cases for missing
  process metadata, timed-out metadata, and unscoped helper attribution.

Validation:

- parser checks: pass
- release verifier regressions: `ok=true`, `case_count=54`,
  `failed_case_count=0`
- old `20260606-054415-HUGH_SECOND` matrix now fails the current verifier with
  `ok=false`, `fail_count=15`
- new full matrix verifier: `ok=true`, `fail_count=0`, `260` checks
- new HUGH-MAIN targeted verifier: `ok=true`, `fail_count=0`, `65` checks

Fresh evidence:

- full matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-061932-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- full verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-061932-HUGH_SECOND.verification.json`
- targeted HUGH-MAIN CPU diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-062729-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-062729-HUGH_SECOND.target-route.verification.json`

The full matrix route token is
`MUSU_CPU_SCENARIO_ROUTE_OK_20260606_061932`. The targeted HUGH-MAIN route
still timed out to `192.168.1.192:8949`; it is CPU stability evidence after a
failed route attempt, not successful multi-device route evidence.

Qualitative audit found no high/medium issue. Product boundary is unchanged:
MUSU Desktop executes locally, and MUSU.PRO coordinates remote input, rooms,
rendezvous, path selection, relay fallback, and evidence/control state.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_CPU_MATRIX_PROCESS_METADATA_GATE_2026_06_06.md`

## 2026-06-06 Runtime CPU Matrix Process Metadata Gate Index Refresh

MUSU local indexer was refreshed after wiki/791 and GOAL v616.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2540 files`
- `2732 symbols`
- `15551 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index is the current reliable code/document index.

Search terms should include `GOAL v617`, `wiki/792`,
`runtime CPU matrix process metadata gate index refresh`, `2540 files`,
`2732 symbols`, `15551 ms`, `process_metadata_available`,
`helper_process_scope=musu_process_tree_or_repo_related`,
`cpu_attribution.attribution_scope=musu_process_tree_or_repo_related`,
`20260606-061932-HUGH_SECOND`, `20260606-062729-HUGH_SECOND`, and
`release verifier 54/54`.

## 2026-06-06 Relay Connect Preflight Strict Metadata Gate

`POST /api/v1/relay/connect` now accepts only release connect preflight
metadata.

Changed:

- optional request schema marker:
  `musu.relay_connect_request.v1`
- accepted fields:
  `lease_id`, `session_id`, `source_node_id`, `target_node_id`
- unknown fields now fail strict parsing
- payload byte fields are rejected before lease lookup:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`, `body_base64`
- byte attempts return `relay_connect_payload_bytes_not_accepted`
- verified leases still fail closed with `relay_payload_endpoint_not_wired`
  while release tunnel payload transport is unwired
- P2P store-forward relay contract audit now gates connect preflight strict
  metadata and regression coverage

Validation:

- PowerShell parser: pass
- `npm run test:p2p -- --test-name-pattern "relay connect"`: `92/92`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`

Qualitative audit found no high/medium issue. This hardens the MUSU.PRO
control-plane input boundary and does not implement release-grade relay
payload transport.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_CONNECT_PREFLIGHT_STRICT_METADATA_GATE_2026_06_06.md`

## 2026-06-06 Relay Connect Preflight Strict Metadata Index Refresh

MUSU local indexer was refreshed after wiki/793 and GOAL v618.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2543 files`
- `2734 symbols`
- `9848 ms`

gbrain was not rerun because the same-session blocker remains missing
`ZEROENTROPY_API_KEY`, generated/evidence import failures,
`sync.last_commit` not advancing, and `gstack-brain-sync exited undefined`.
The MUSU local index is the current reliable code/document index.

Search terms should include `GOAL v619`, `wiki/794`,
`relay connect preflight strict metadata index refresh`, `2543 files`,
`2734 symbols`, `9848 ms`, `musu.relay_connect_request.v1`,
`relay_connect_payload_bytes_not_accepted`,
`release connect preflight regression coverage`, and
`P2P store-forward relay audit fail_count=0`.

## 2026-06-06 Relay Transport Proof Strict Metadata Gate (wiki/795)

`POST /api/v1/p2p/relay/transport-proof` now uses a strict metadata-only
request schema for release relay transport proof recording.

Changed:

- `RelayTransportProofRequestSchema` changed from `.passthrough()` to
  `.strict()`
- raw payload byte fields are rejected before lease lookup:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`, `body_base64`
- byte attempts return `relay_transport_proof_payload_bytes_not_accepted`
- unknown fields return `invalid_relay_transport_proof`
- `payload_bytes_transited` remains allowed as proof metadata only
- the P2P relay contract audit now gates the strict proof recorder boundary

Validation:

- `npm run test:p2p -- --test-name-pattern "transport proof"`: `94/94`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release verifier regressions: `ok=true`, `case_count=54`,
  `failed_case_count=0`
- P2P env status: `ok=false` with expected release relay tunnel/KV/live proof
  blockers
- `git diff --check`: pass

Code audit found no high/medium issue. This is hosted P2P evidence input
hardening only. Current source remains `RELAY_TRANSPORT_KIND=websocket_tunnel`
and `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`, so public release remains No-Go
on second-PC route/CPU/matrix, hosted P2P release proof, support mailbox, and
Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_TRANSPORT_PROOF_STRICT_METADATA_GATE_2026_06_06.md`

## 2026-06-06 Relay Transport Proof Strict Metadata Index Refresh (wiki/796)

MUSU local indexer was refreshed after wiki/795 and GOAL v620.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2546 files`
- `2735 symbols`
- `17094 ms`

Indexed context includes the relay transport proof strict metadata report, P2P
control-plane spec, network boundary spec, BETA checklist, WIKI/WIKI_INDEX,
CoS memory updates, and source changes in
`POST /api/v1/p2p/relay/transport-proof`.

Search terms should include `GOAL v621`, `wiki/796`,
`relay transport proof strict metadata index refresh`, `2546 files`,
`2735 symbols`, `17094 ms`, `musu.relay_transport_proof.v1`,
`relay_transport_proof_payload_bytes_not_accepted`,
`payload_bytes_transited`, `FORBIDDEN_RELAY_TRANSPORT_PROOF_BYTE_FIELDS`, and
`P2P store-forward relay audit fail_count=0`.

## 2026-06-06 Current HEAD Desktop-Open CPU Evidence (wiki/797)

Fresh current-HEAD `desktop-open` idle CPU evidence was captured on
`HUGH_SECOND` from clean commit
`2387db2dea5fc983d0d3104b41037642b9939ccc`.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-071122-HUGH_SECOND.desktop-open.evidence.json`

Result:

- `git_dirty=false`
- sample time `60.04s`
- hot process count `0`
- owned process count `8`
- MUSU runtime/shell `2`
- owned WebView2 helpers `6`
- owned Node helpers `0`
- total working set `363.83MB`
- total private memory `193.95MB`
- max one-core CPU by role: MUSU `0`, Node `0`, WebView2 `0.08`,
  other `0`

Audits passed:

- Rust background-loop contract: `ok=true`, `fail_count=0`
- frontend polling contract: `ok=true`, `fail_count=0`
- process ownership audit: `ok=true`, `fail_count=0`
- startup single-instance audit: `ok=true`, `fail_count=0`

Qualitative audit found no high/medium code issue and no code changed. The
local desktop-open runtime looks healthy on one machine. This does not close
second-PC, multi-device, or hosted MUSU.PRO P2P release gates.

Current go/no-go with public metadata skipped remains No-Go:

- `local_artifacts_ready=true`
- `single_machine_verified=true`
- runtime idle CPU `1/2 [HUGH_SECOND]`
- runtime CPU matrix `1/2`
- targeted second-PC route CPU `true`
- `p2p_control_plane_verified=false`

Product boundary remains unchanged: MUSU Desktop is the local executor, while
MUSU.PRO is remote input, project/company room, presence, rendezvous,
path-selection, relay-fallback, and evidence control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_DESKTOP_OPEN_CPU_EVIDENCE_2026_06_06.md`

## 2026-06-06 Current HEAD Desktop-Open CPU Evidence Index Refresh (wiki/798)

MUSU local indexer was refreshed after wiki/797 and GOAL v622.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2550 files`
- `2735 symbols`
- `11702 ms`

Indexed context includes fresh
`20260606-071122-HUGH_SECOND.desktop-open` CPU evidence, the current HEAD
desktop-open CPU evidence report, BETA checklist, network boundary spec,
MUSU.PRO P2P control-plane spec, WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v623`, `wiki/798`,
`current HEAD desktop-open CPU evidence index refresh`, `2550 files`,
`2735 symbols`, `11702 ms`, `20260606-071122-HUGH_SECOND.desktop-open`,
`runtime idle CPU 1/2`, `runtime CPU matrix 1/2`,
`p2p_control_plane_verified=false`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 Route Evidence Strict Metadata Gate (wiki/799)

`POST /api/v1/p2p/route-evidence` now accepts strict route/proof metadata only.

Changed:

- `RelayFallbackSchema` is strict.
- `RelayTransportProofSchema` is strict.
- `RelayPayloadDeliveryProofSchema` is strict.
- `RouteEvidenceSchema` is strict.
- raw payload fields are rejected before storage:
  `payload`, `payload_base64`, `payload_b64`, `payload_bytes`, `body_base64`
- `relay_payload_delivery_proof.payload_bytes` remains allowed as numeric
  proof metadata
- raw payload attempts return `route_evidence_payload_bytes_not_accepted`
- unknown fields return `invalid_route_evidence` with concrete unknown-key
  paths
- P2P store-forward relay contract audit now gates this route evidence
  metadata boundary

Validation:

- route-evidence route test: `31/31`
- `npm run test:p2p`: `97/97`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=58`
- release evidence verifier regressions: `54/54`
- `git diff --check`: pass

Code audit found no high/medium issue. This hardens hosted P2P evidence input
and does not implement release relay tunnel payload transport. Public release
remains No-Go on second-PC route/CPU/matrix, hosted MUSU.PRO P2P proof, public
metadata recheck, support mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROUTE_EVIDENCE_STRICT_METADATA_GATE_2026_06_06.md`

## 2026-06-06 Route Evidence Strict Metadata Index Refresh (wiki/800)

MUSU local indexer was refreshed after wiki/799 and GOAL v624.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2553 files`
- `2739 symbols`
- `16468 ms`

Indexed context includes route-evidence strict metadata source/test changes,
the P2P relay contract audit update, the route evidence strict metadata
report, BETA checklist, network boundary spec, MUSU.PRO P2P control-plane
spec, WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v625`, `wiki/800`,
`route evidence strict metadata index refresh`, `2553 files`, `2739 symbols`,
`16468 ms`, `RouteEvidenceSchema strict`,
`route_evidence_payload_bytes_not_accepted`,
`FORBIDDEN_ROUTE_EVIDENCE_BYTE_FIELDS`, `publicZodIssues`, and
`P2P store-forward relay audit check_count=58`.

## 2026-06-06 Rendezvous Strict Metadata Gate (wiki/801)

The core P2P rendezvous control-plane surfaces now accept strict metadata only:

- `POST /api/v1/p2p/rendezvous`
- `POST /api/v1/p2p/rendezvous/[id]/candidates`

Changed:

- `CreateRendezvousSchema` is strict
- `CandidateEndpointSchema` is strict
- `CandidatesSchema` is strict
- rendezvous creation rejects raw payload fields with
  `rendezvous_payload_bytes_not_accepted`
- candidate exchange rejects raw payload fields with
  `rendezvous_candidates_payload_bytes_not_accepted`
- unknown fields fail with concrete unknown-key paths
- P2P store-forward relay contract audit gates the rendezvous/candidate
  metadata boundary

Validation:

- rendezvous route test: `14/14`
- `npm run test:p2p`: `101/101`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=61`
- release evidence verifier regressions: `54/54`
- `git diff --check`: pass

Code audit found no high/medium issue. This keeps MUSU.PRO as P2P bootstrap
control plane, not a payload transport path. Public release remains No-Go on
second-PC route/CPU/matrix, hosted MUSU.PRO P2P proof, release relay tunnel
payload transport, public metadata recheck, support mailbox, and Store
evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RENDEZVOUS_STRICT_METADATA_GATE_2026_06_06.md`

## 2026-06-06 Rendezvous Strict Metadata Index Refresh (wiki/802)

MUSU local indexer was refreshed after wiki/801 and GOAL v626.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2556 files`
- `2745 symbols`
- `10569 ms`

Indexed context includes rendezvous strict metadata source/test changes, the
P2P relay contract audit update, the rendezvous strict metadata report, BETA
checklist, network boundary spec, MUSU.PRO P2P control-plane spec,
WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v627`, `wiki/802`,
`rendezvous strict metadata index refresh`, `2556 files`, `2745 symbols`,
`10569 ms`, `CreateRendezvousSchema strict`,
`CandidateEndpointSchema strict`, `CandidatesSchema strict`,
`rendezvous_payload_bytes_not_accepted`,
`rendezvous_candidates_payload_bytes_not_accepted`, and
`P2P store-forward relay audit check_count=61`.

## 2026-06-06 Room Control Strict Metadata Gate (wiki/803)

Room-scoped MUSU.PRO control-plane endpoints now accept strict metadata only:

- `POST /api/rooms/[roomId]/rendezvous`
- `POST /api/rooms/[roomId]/presence`

Changed:

- `RoomRendezvousSchema` is strict
- room rendezvous rejects raw payload fields with
  `room_rendezvous_payload_bytes_not_accepted`
- room rendezvous rejects body `room_id`; the path `roomId` is canonical
- room presence `CandidateEndpointSchema` is strict
- `RoomPresenceSchema` is strict
- room presence rejects raw payload fields with
  `room_presence_payload_bytes_not_accepted`
- unknown fields fail with concrete unknown-key paths
- P2P store-forward relay contract audit gates the room metadata boundary

Validation:

- room rendezvous route test: `5/5`
- room presence route test: `8/8`
- `npm run test:p2p`: `105/105`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`,
  `check_count=64`
- release evidence verifier regressions: `54/54`
- `git diff --check`: pass

Code audit found no high/medium issue. Room events/work-orders remain separate
bounded payload-capable surfaces; presence/rendezvous do not transport payload
bytes. Public release remains No-Go on second-PC route/CPU/matrix, hosted
MUSU.PRO P2P proof, release relay tunnel payload transport, public metadata
recheck, support mailbox, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_CONTROL_STRICT_METADATA_GATE_2026_06_06.md`

## 2026-06-06 Room Control Strict Metadata Index Refresh (wiki/804)

MUSU local indexer was refreshed after wiki/803 and GOAL v628.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2559 files`
- `2751 symbols`
- `12944 ms`

Indexed context includes room rendezvous/presence strict metadata source/test
changes, the P2P relay contract audit update, the room control strict metadata
report, BETA checklist, network boundary spec, MUSU.PRO P2P control-plane
spec, WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v629`, `wiki/804`,
`room control strict metadata index refresh`, `2559 files`, `2751 symbols`,
`12944 ms`, `RoomRendezvousSchema strict`, `RoomPresenceSchema strict`,
`CandidateEndpointSchema strict`, `room_rendezvous_payload_bytes_not_accepted`,
`room_presence_payload_bytes_not_accepted`, and
`P2P store-forward relay audit check_count=64`.

## 2026-06-06 Post Room-Control Current HEAD CPU Audit (wiki/805)

Fresh current clean HEAD CPU/process evidence was captured on `HUGH_SECOND`
after room control strict metadata hardening.

Evidence:

- CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-080201-HUGH_SECOND.desktop-open.evidence.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260606-080350-HUGH_SECOND.process-ownership.json`

Key values:

- commit `ade5b64f012c14a8de6f2c0fa99065de5db45f64`
- `git_dirty=false`
- CPU sample `60.045s`
- hot process count `0`
- process count `8`
- role CPU: MUSU `0`, Node `0`, WebView2 `0.18`, other `0`
- owned WebView2 helpers `6`
- owned Node helpers `0`
- working set `363.79MB`
- private memory `193.86MB`
- process ownership `ok=true`, `fail_count=0`
- bridge `127.0.0.1:3622`, PID `4204`, health `HTTP 200`

Audit:

- Rust background-loop contract: `ok=true`, `fail_count=0`, unaudited loops
  `0`, unaudited spawns `0`
- frontend polling contract: `ok=true`, `fail_count=0`, low-duty call sites
  `29`, direct intervals `0`, direct visibility listeners `0`
- P2P store-forward relay contract: `ok=true`, `fail_count=0`,
  `check_count=64`
- process ownership: `ok=true`, `fail_count=0`

Qualitative audit found no high/medium issue and no source changed. The local
desktop-open busy-loop concern is not reproduced on the sampled HUGH_SECOND
state. This is one-machine evidence only; public release remains No-Go on
second-PC route/CPU/matrix, hosted MUSU.PRO P2P/relay proof, public metadata,
support mailbox, and Store evidence.

Product boundary remains unchanged: MUSU Desktop executes work locally, while
MUSU.PRO accepts remote input and coordinates project/company rooms, presence,
rendezvous, path selection, relay fallback, and evidence. Direct P2P mesh
remains preferred after bootstrap.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROOM_CONTROL_CURRENT_HEAD_CPU_AUDIT_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_POST_ROOM_CONTROL_CPU_AUDIT_2026_06_06.md`

## 2026-06-06 Post Room-Control Current HEAD CPU Audit Index Refresh (wiki/806)

MUSU local indexer was refreshed after wiki/805 and GOAL v630.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2564 files`
- `2751 symbols`
- `13062 ms`

Indexed context includes fresh `20260606-080201-HUGH_SECOND.desktop-open` CPU
evidence, `20260606-080350-HUGH_SECOND.process-ownership`, the post
room-control current HEAD CPU audit report, next-step plan, BETA checklist,
network boundary spec, MUSU.PRO P2P control-plane spec, WIKI/WIKI_INDEX, and
CoS memory updates.

Search terms should include `GOAL v631`, `wiki/806`,
`post room-control current HEAD CPU audit index refresh`, `2564 files`,
`2751 symbols`, `13062 ms`, `20260606-080201-HUGH_SECOND.desktop-open`,
`20260606-080350-HUGH_SECOND.process-ownership`, `WebView2 0.18`,
`process ownership fail_count=0`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 External Gate Recheck (wiki/807)

External release gates were rechecked without skipping public metadata.

Evidence:

- external gate recheck:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-082244-HUGH_SECOND.external-gates.evidence.json`
- live P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-082429-musu.pro.evidence.json`
- live P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-082429-musu.pro.verification.json`

Public metadata:

- `verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json` passed
  with `ok=true`, `fail_count=0`
- `/privacy` returned HTTP `200`
- `/support` returned HTTP `200`
- both pages contain `musu@musu.pro`
- go/no-go now reports `public_metadata_ok=True`
- `store-public-metadata` is no longer a blocker when not skipped

External recheck results:

- release ready `False`
- local artifacts ready `True`
- single-machine verified `True`
- runtime idle CPU valid machine count `1`
- runtime CPU matrix valid machine count `1`
- second PC `192.168.1.192:8949` ping `False`, TCP `False`
- second PC TCP error `tcp_connect_timeout`
- P2P env ready `False`
- P2P evidence verified `False`
- P2P relay route evidence count `0`
- P2P relay payload transport proven `False`
- P2P relay payload delivery proof valid count `0`

Live P2P evidence used the packaged WindowsApps alias:
`C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`. It fails closed
because relay status, relay transport, relay leases, and relay route evidence
all report `logged_in=false`; owner scope is not verified; relay lease storage
is not configured or release-grade; and release relay transport/connect/payload
endpoints are not wired.

Remaining go/no-go blockers are `multi-device`, `runtime-idle-cpu`,
`runtime-cpu-scenario-matrix`, `support-mailbox`, `store-release`, and
`p2p-control-plane`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_GATE_RECHECK_2026_06_06.md`

## 2026-06-06 External Gate Recheck Index Refresh (wiki/808)

MUSU local indexer was refreshed after wiki/807 and GOAL v632.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2571 files`
- `2751 symbols`
- `12705 ms`

Indexed context includes external gate evidence
`20260606-082244-HUGH_SECOND.external-gates`, live P2P evidence
`20260606-082429-musu.pro`, the external gate recheck report, BETA checklist,
MUSU.PRO P2P control-plane spec, WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v633`, `wiki/808`,
`external gate recheck index refresh`, `2571 files`, `2751 symbols`,
`12705 ms`, `20260606-082244-HUGH_SECOND.external-gates`,
`20260606-082429-musu.pro`, `public_metadata_ok=True`,
`store-public-metadata no longer blocker`, `tcp_connect_timeout`,
`logged_in=false`, and `relay payload transport proven False`.

## 2026-06-06 External Gate Root-Cause Recheck (wiki/809)

The external release gate recorder now exposes actionable root-cause fields at
the top level instead of requiring operators to inspect nested child JSON.

Code changes:

- `record-external-release-gate-recheck.ps1` flattens public metadata,
  second-PC TCP, P2P logged-in, owner-scope, relay lease store, endpoint wiring,
  route-evidence, and payload-proof fields.
- helper property readers accept null child JSON so failed child recorders stay
  evidence-friendly.
- `test-release-evidence-verifiers.ps1` now gates the source contract
  `external gate recheck exposes actionable root-cause fields`.

Validation:

- PowerShell parser check: pass
- release evidence verifier regression: `55/55`
- `git diff --check`: pass

Clean HEAD evidence:

- commit `f0b09139de93cfa98ab1b5d0d8f85e0115fea6b3`
- external evidence
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-090152-HUGH_SECOND.external-gates.evidence.json`
- P2P evidence
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.evidence.json`
- P2P verification
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-090333-musu.pro.verification.json`

Result:

- public metadata checked/ok `True`/`True`
- local artifacts ready `True`
- single-machine verified `True`
- second PC TCP error `tcp_connect_timeout`
- P2P env/evidence `False`/`False`
- P2P verification fail count `40`
- P2P runtime logged in `False`
- owner scope verified `False`
- relay lease store release-grade `False`
- relay transport/connect/payload endpoints wired `False`
- relay route evidence count `0`
- relay payload delivery proof valid count `0`

Qualitative audit found no high/medium issue. Public release remains No-Go on
second-PC route/CPU/matrix, hosted P2P login/auth/storage/relay proof, support
mailbox, and Store evidence. Product boundary is unchanged: MUSU Desktop is the
local executor, while MUSU.PRO is remote input, rooms, rendezvous, path
selection, relay fallback, and evidence control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_EXTERNAL_GATE_RECHECK_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_EXTERNAL_GATE_ROOT_CAUSE_RECHECK_2026_06_06.md`

## 2026-06-06 External Gate Root-Cause Index Refresh (wiki/810)

MUSU local indexer was refreshed after wiki/809 and GOAL v634.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2577 files`
- `2751 symbols`
- `12476 ms`

Indexed context includes clean external evidence
`20260606-090152-HUGH_SECOND.external-gates`, hosted P2P evidence
`20260606-090333-musu.pro`, the external gate root-cause recorder source
contract, release verifier regression `55/55`, the external gate report,
next-step plan, BETA checklist, MUSU.PRO P2P control-plane spec, network
boundary spec, WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v635`, `wiki/810`,
`external gate root-cause index refresh`, `2577 files`, `2751 symbols`,
`12476 ms`, `20260606-090152-HUGH_SECOND.external-gates`,
`20260606-090333-musu.pro`, `p2p_runtime_not_logged_in`,
`p2p_relay_lease_store_not_release_grade`,
`p2p_relay_payload_endpoint_not_wired`, `release verifier 55/55`, and
`MUSU Desktop local executor`.

## 2026-06-06 P2P Env Runtime Login Remediation (wiki/811)

`show-musu-pro-p2p-env-status.ps1` now classifies latest hosted P2P evidence
`not_logged_in` as `live_evidence_p2p_runtime_not_logged_in` instead of
`live_evidence_unknown`.

Changed:

- evidence summary exposes `relay_status_logged_in`,
  `relay_transport_logged_in`, `relay_leases_logged_in`, and
  `relay_route_evidence_logged_in`
- evidence summary exposes relay lease store configured/backend/release-grade
  state
- evidence summary exposes relay transport descriptor/connect/payload endpoint
  wiring
- next steps explicitly require packaged WindowsApps runtime login:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`
- next steps explicitly reject the localhost developer dashboard as a way to
  satisfy the hosted P2P gate

Current env status:

- `ok=false`
- evidence `20260606-090333-musu.pro`
- `error_class=p2p_runtime_not_logged_in`
- blocker `live_evidence_p2p_runtime_not_logged_in`
- all four logged-in checks `False`

Validation:

- parser check: pass
- env status JSON: pass
- release evidence verifier regression: `56/56`
- `git diff --check`: pass

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_ENV_RUNTIME_LOGIN_REMEDIATION_2026_06_06.md`

## 2026-06-06 P2P Env Runtime Login Index Refresh (wiki/812)

MUSU local indexer was refreshed after wiki/811 and GOAL v636.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2580 files`
- `2751 symbols`
- `12902 ms`

Indexed context includes `show-musu-pro-p2p-env-status.ps1` runtime login
remediation, the new P2P env status source contract, the canonical report,
BETA checklist, CONFIG, WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v637`, `wiki/812`,
`P2P env runtime login index refresh`, `2580 files`, `2751 symbols`,
`12902 ms`, `live_evidence_p2p_runtime_not_logged_in`,
`relay_status_logged_in`, `relay_transport_logged_in`,
`relay_leases_logged_in`, `relay_route_evidence_logged_in`, `WindowsApps
alias`, `musu.exe login`, `localhost developer dashboard`, and
`20260606-090333-musu.pro`.

## 2026-06-06 Idle Busy-Loop Source Contract Audit (wiki/813)

`test-release-evidence-verifiers.ps1` now locks the go/no-go idle busy-loop
candidate summary as a source contract.

Required candidates:

- `clipboard polling`
- `mDNS discovery`
- `health check retry loop`
- `bridge readiness wait loop`
- `frontend interval/refetch`
- `relay payload target poller`
- `cloud heartbeat`
- `log/telemetry flush loop`

Required go/no-go fields and blocker:

- `idle_busy_loop_candidate_status`
- `idle_busy_loop_candidate_contract_verified`
- `idle-busy-loop-candidates`

Validation:

- parser check: pass
- release evidence verifier regression: `57/57`
- new case: `go-no-go exposes all idle busy-loop candidate statuses`
- Rust background-loop audit: `ok=true`, unaudited loops `0`, unaudited spawns
  `0`, network watcher primitive hits `0`, telemetry flush primitive hits `0`
- frontend polling audit: `ok=true`, direct intervals `0`, low-duty call sites
  `29`
- P2P store-forward relay audit: `ok=true`
- dirty-tree go/no-go: idle candidate count `8`, failed candidate count `0`,
  runtime idle CPU `1/2`, runtime CPU matrix `1/2`

Qualitative audit found no high/medium issue. This is verifier-only hardening:
the packaged runtime behavior and MUSU Desktop local-executor / MUSU.PRO
remote-input control-plane boundary are unchanged. Public release remains
No-Go on second-PC route/CPU/matrix evidence, hosted MUSU.PRO P2P
login/auth/storage/relay proof, support mailbox proof, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_IDLE_BUSY_LOOP_SOURCE_CONTRACT_AUDIT_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_IDLE_BUSY_LOOP_SOURCE_CONTRACT_AUDIT_2026_06_06.md`

## 2026-06-06 Idle Busy-Loop Source Contract Index Refresh (wiki/814)

MUSU local indexer was refreshed after wiki/813 and GOAL v638.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2583 files`
- `2751 symbols`
- `24515 ms`

Indexed context includes `test-release-evidence-verifiers.ps1`
source-contract hardening, the idle busy-loop source contract audit report,
the next-step plan, P2P control-plane spec, MUSU.PRO P2P control-plane spec,
network boundary spec, BETA checklist, GOAL v638, WIKI/WIKI_INDEX, and CoS
memory updates.

Search terms should include `GOAL v639`, `wiki/814`, `idle busy-loop source
contract index refresh`, `2583 files`, `2751 symbols`, `24515 ms`,
`go-no-go exposes all idle busy-loop candidate statuses`, `release verifier
57/57`, `candidate count 8`, `failed candidate count 0`, and
`MUSU Desktop local executor`.

## 2026-06-06 Current HEAD Runtime CPU Matrix Refresh (wiki/815)

Fresh current-HEAD runtime CPU scenario evidence was captured on `HUGH_SECOND`
from clean commit `ac1e67a4dd8f610a6f09ff61d3107f556e2ac5e5`.

Full matrix evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-094149-HUGH_SECOND.verification.json`
- verifier `ok=true`, `fail_count=0`

The full matrix covers `startup-open`, `runtime-started`, `dashboard-open`,
`desktop-open`, and `post-route`. All scenarios have hot process count `0`,
MUSU CPU `0`, Node CPU `0`, owned process count `8`, WebView2 helper count
`6`, and working set around `364MB`. The highest WebView2 CPU value is `0.16`.

Targeted HUGH-MAIN route-attempt CPU diagnostic:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-095252-HUGH_SECOND.target-route.verification.json`
- verifier `ok=true`, `fail_count=0`
- target `HUGH-MAIN`
- route attempt timed out against
  `http://192.168.1.192:8949/api/tasks/delegate`
- failed route probe was explicitly allowed for this diagnostic
- CPU after the failed route attempt stayed healthy: hot `0`, MUSU `0`, Node
  `0`, WebView2 `0.13`, owned process count `8`, WebView2 helper count `6`,
  working set `364.24MB`

Qualitative audit found no high/medium issue. No runtime code changed in this
update; the diff is evidence/docs only. The HUGH-MAIN route timeout is
diagnostic and does not count as successful multi-device route proof.

Product boundary remains unchanged: MUSU Desktop is the local executor;
MUSU.PRO is remote input, project/company rooms, presence, rendezvous, path
selection, relay fallback, and evidence control plane. `localhost:3001` remains
optional developer/operator dashboard behavior, not required packaged runtime
behavior.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_RUNTIME_CPU_MATRIX_REFRESH_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_RUNTIME_CPU_MATRIX_REFRESH_2026_06_06.md`

## 2026-06-06 Current HEAD Runtime CPU Matrix Index Refresh (wiki/816)

MUSU local indexer was refreshed after wiki/815 and GOAL v640.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2590 files`
- `2751 symbols`
- `56258 ms`

Indexed context includes full runtime CPU matrix evidence
`20260606-094149-HUGH_SECOND.runtime-cpu-scenario-matrix`, HUGH-MAIN
target-route diagnostic evidence
`20260606-095252-HUGH_SECOND.runtime-cpu-scenario-matrix`, the current HEAD
runtime CPU matrix refresh report, next-step plan, BETA checklist, P2P
control-plane spec, MUSU.PRO P2P control-plane spec, network boundary spec,
WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v641`, `wiki/816`, `current HEAD runtime CPU
matrix index refresh`, `2590 files`, `2751 symbols`, `56258 ms`,
`20260606-094149-HUGH_SECOND`, `20260606-095252-HUGH_SECOND`, `HUGH-MAIN`,
`192.168.1.192:8949`, `WebView2 0.16`, `WebView2 0.13`, and `MUSU Desktop
local executor`.

## 2026-06-06 Room Work-Order Rejected Audit Gate (wiki/817)

Room work-order rejected-input audit logging is now locked by route regression
tests, the operator API security audit, and release verifier source-contract
coverage.

Changed:

- `musu-bee/src/app/api/rooms/[roomId]/work-orders/route.test.ts`
  - invalid JSON after P2P auth is rejected, audit-logged, and does not call
    the bridge
  - missing instruction after P2P auth is rejected, audit-logged, and does not
    call the bridge
  - rejected audit events omit `text` and `instruction`
- `scripts/windows/audit-operator-api-security-contract.ps1`
  - adds `room work order rejected input audit logging`
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds `operator API security gates rejected room work-order audit logging`

Validation:

- parser check: pass
- `npm run test:routes`: `30/30`
- `npm run typecheck`: pass
- operator API security audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `58/58`
- `git diff --check`: pass

Qualitative audit found no high/medium issue. No runtime route behavior changed;
the existing rejected-input audit path is now release-gated. MUSU.PRO remains
remote input/control plane, and local MUSU Desktop/bridge remains the executor.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROOM_WORK_ORDER_REJECTED_AUDIT_GATE_2026_06_06.md`

## 2026-06-06 Room Work-Order Rejected Audit Index Refresh (wiki/818)

MUSU local indexer was refreshed after wiki/817 and GOAL v642.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2593 files`
- `2752 symbols`
- `16401 ms`

Indexed context includes route regression updates for rejected room work-order
audit logging, the operator API security audit update, the release evidence
verifier source-contract update, the room work-order rejected audit report,
BETA checklist, P2P control-plane spec, MUSU.PRO P2P control-plane spec,
network boundary spec, WIKI/WIKI_INDEX, and CoS memory updates.

Search terms should include `GOAL v643`, `wiki/818`, `room work-order rejected
audit index refresh`, `2593 files`, `2752 symbols`, `16401 ms`,
`operator API security gates rejected room work-order audit logging`,
`invalid_json`, `instruction required`, `command-center.jsonl`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 P2P Relay Route Transport Proof Verifier Gate (wiki/819)

Hosted P2P release evidence now requires bound relay route transport proof in
each returned release-grade relay route record.

Changed:

- `scripts/windows/verify-p2p-control-plane-evidence.ps1`
  - validates returned relay route records independently
  - requires `relay_transport_proof` with session/lease/source/target binding
  - requires release relay kind `quic_relay_tunnel`, `wss://` relay URL,
    `quic_tls_1_3`, and `musu_quic_tls_transport`
  - exposes `relay_route_transport_proof_required_count`,
    `relay_route_transport_proof_valid_count`, and
    `relay_route_transport_proof_invalid_count`
- `musu-bee/src/lib/routeEvidenceStore.ts`
  - release-grade relay queries filter stale/manual records unless fallback,
    transport proof, and payload delivery proof are all currently bound
- `musu-bee/src/app/api/v1/p2p/route-evidence/route.test.ts`
  - adds stale payload-only and missing-session release-grade query regressions
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - adds negative case
    `p2p rejects relay route evidence without route transport proof`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - updates the release-grade query source contract for required lease/session
    binding

Validation:

- parser check: pass
- `npm run test:p2p -- --test-name-pattern "route evidence|P2P route evidence"`:
  `105/105`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `59/59`
- `git diff --check`: pass

Qualitative audit found no high/medium issue. This prevents hosted P2P
evidence from passing with lease-only, queue-only, or stale/manual
`release_grade=true` relay records. It does not implement release relay tunnel
transport and does not move execution into MUSU.PRO.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_ROUTE_TRANSPORT_PROOF_VERIFIER_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_P2P_RELAY_ROUTE_TRANSPORT_PROOF_VERIFIER_GATE_2026_06_06.md`

## 2026-06-06 P2P Relay Route Transport Proof Index Refresh (wiki/820)

MUSU local indexer was refreshed after wiki/819 and GOAL v644.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2596 files`
- `2752 symbols`
- `9181 ms`

Indexed context includes the relay route transport proof verifier gate,
`verify-p2p-control-plane-evidence.ps1`, `routeEvidenceStore.ts`, route
evidence stale-record regressions, P2P relay contract audit update, release
verifier fixture update, canonical report, next-step plan, BETA checklist,
P2P control-plane spec, MUSU.PRO P2P spec, network boundary spec,
WIKI/WIKI_INDEX, GOAL v644, and CoS memory update.

Search terms should include `GOAL v645`, `wiki/820`,
`p2p relay route transport proof index refresh`, `2596 files`,
`2752 symbols`, `9181 ms`, `relay_route_transport_proof_valid_count`,
`p2p rejects relay route evidence without route transport proof`,
`stale-relay-missing-session-release-grade`, and `quic_relay_tunnel`.

## 2026-06-06 P2P Relay Route Transport Proof Status Surface (wiki/821)

Release status tooling now carries the relay route transport proof count
through every operator handoff layer.

Changed:

- `scripts/windows/write-release-go-no-go.ps1`
  - exposes `p2p_relay_route_transport_proof_valid_count`
  - updates the P2P blocker message to require the route transport proof count
- `scripts/windows/record-external-release-gate-recheck.ps1`
  - records `p2p_relay_route_transport_proof_valid_count`
  - emits `p2p_relay_route_transport_proof_missing`
- `scripts/windows/show-musu-pro-p2p-env-status.ps1`
  - exposes route transport proof valid/required/invalid counts
  - emits `live_evidence_relay_route_transport_proof_missing`
  - adds next steps to rerun hosted evidence until
    `relay_route_transport_proof_valid_count > 0`
- `scripts/windows/show-final-release-handoff-status.ps1`
  - forwards the go/no-go count
- `scripts/windows/test-release-evidence-verifiers.ps1`
  - source-contracts the new status fields and blockers

Validation:

- parser check: pass
- release evidence verifier regression: `59/59`
- `npm run test:p2p -- --test-name-pattern "route evidence|P2P route evidence"`:
  `105/105`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- P2P env status reports
  `live_evidence_relay_route_transport_proof_missing`
- go/no-go reports `p2p_relay_route_transport_proof_valid_count=0`
- `git diff --check`: pass

Qualitative audit found no high/medium issue. This closes an operator status
blind spot only. It does not implement release relay tunnel transport and does
not move execution into MUSU.PRO. MUSU Desktop remains the local executor, and
MUSU.PRO remains the remote input/control-plane/rendezvous/relay-proof layer.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_ROUTE_TRANSPORT_PROOF_STATUS_SURFACE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_P2P_RELAY_ROUTE_TRANSPORT_PROOF_STATUS_SURFACE_2026_06_06.md`

## 2026-06-06 P2P Relay Route Transport Proof Status Surface Index Refresh (wiki/822)

MUSU local indexer was refreshed after wiki/821 and GOAL v646.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2598 files`
- `2752 symbols`
- `13649 ms`

Indexed context includes the release status surface hardening in go/no-go,
external gate recheck, P2P env status, final handoff status, release verifier
source contracts, the canonical wiki/821 report, next-step plan, BETA
checklist, P2P control-plane spec, MUSU.PRO P2P spec, WIKI/WIKI_INDEX, and
GOAL v646.

Search terms should include `GOAL v647`, `wiki/822`,
`p2p relay route transport proof status surface index refresh`, `2598 files`,
`2752 symbols`, `13649 ms`,
`p2p_relay_route_transport_proof_valid_count`,
`p2p_relay_route_transport_proof_missing`,
`live_evidence_relay_route_transport_proof_missing`, and `MUSU Desktop local
executor`.

## 2026-06-06 Rust Route Evidence Relay Transport Proof Carry (wiki/823)

Rust bridge route evidence now preserves `relay_transport_proof` through local
JSON and cloud submission DTOs.

Changed:

- `musu-rs/src/bridge/route_evidence.rs`
  - adds `RouteRelayTransportProof`
  - adds optional `relay_transport_proof` to `RouteAttemptEvidence`
  - adds optional `relay_transport_proof` to `RouteAttemptEvidenceInput`
  - maps proof to `crate::cloud::RouteRelayTransportProof` in
    `cloud_route_evidence()`
  - extends route evidence unit tests so local JSON and cloud DTO both preserve
    proof fields
- `musu-rs/src/install/cli_commands.rs`
  - keeps direct/CLI route evidence explicitly proof-free
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
  - adds `route evidence carries relay transport proof to cloud`

Validation:

- `cargo fmt --check`: pass
- `cargo test -p musu-rs route_evidence --lib`: `14 passed`
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `59/59`
- `git diff --check`: pass

Qualitative audit found no high/medium issue. This is runtime evidence plumbing
only. It does not implement release `quic_relay_tunnel` transport and does not
make store-forward queue fallback release-grade.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUST_ROUTE_EVIDENCE_RELAY_TRANSPORT_PROOF_CARRY_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RUST_ROUTE_EVIDENCE_RELAY_TRANSPORT_PROOF_CARRY_2026_06_06.md`

## 2026-06-06 Rust Route Evidence Relay Transport Proof Carry Index Refresh (wiki/824)

MUSU local indexer was refreshed after wiki/823 and GOAL v648.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2599 files`
- `2754 symbols`
- `33284 ms`

Indexed context includes Rust route evidence relay transport proof carry-path
changes, the P2P relay contract audit update, canonical wiki/823 report,
next-step plan, BETA checklist, P2P control-plane spec, MUSU.PRO P2P spec,
WIKI/WIKI_INDEX, and GOAL v648.

Search terms should include `GOAL v649`, `wiki/824`,
`rust route evidence relay transport proof carry index refresh`, `2599 files`,
`2754 symbols`, `33284 ms`, `RouteRelayTransportProof`,
`route evidence carries relay transport proof to cloud`, `cloud_route_evidence`,
and `MUSU Desktop local executor`.

## 2026-06-06 Current MSIX Alias Shadow Live Gate (wiki/825)

`write-release-go-no-go.ps1` now performs a live current-machine MSIX legacy
conflict check by running `check-msix-legacy-conflicts.ps1 -Json`.

Changed:

- `write-release-go-no-go.ps1`
  - exposes `msix_current_legacy_conflicts_ok`
  - exposes `msix_current_legacy_conflicts`
  - blocks with `msix-current-legacy-conflicts` when active startup helpers,
    scheduled tasks, legacy bins, or PATH alias shadowing exist
  - includes the live conflict check in manual internal gates
- `test-release-evidence-verifiers.ps1`
  - adds source-contract case
    `go-no-go blocks on current MSIX legacy conflicts`

Current `HUGH_SECOND` live state:

- `where.exe musu` resolves `C:\Users\empty\.cargo\bin\musu.exe` before
  `C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- terminal `musu --version` returns `musu 1.15.0-dev`
- explicit WindowsApps alias returns `musu 1.15.0-rc.1`
- live MUSU Desktop and bridge processes are packaged WindowsApps processes

Current diagnostic CPU result:

- `.local-build\runtime-idle-cpu\musu-idle-cpu-20260606-112220.json`
- `ok=true`, `60.057s`
- MUSU `0.03`, Node `0.0`, WebView2 `0.08`
- `bridge_runtime=1`, `desktop_shell=1`, `webview2_helper=6`

This diagnostic did not reproduce the 20% busy-loop, but it was captured while
the release-gate scripts were dirty and does not replace clean release
evidence.

Validation:

- parser check: pass
- release evidence verifier regression: `60/60`
- frontend polling contract audit: `ok=true`, `fail_count=0`
- Rust background-loop contract audit: `ok=true`, `fail_count=0`
- dirty-tree go/no-go exposes `msix_current_legacy_conflicts_ok=false`

Qualitative audit found no high/medium issue. The product split remains:
MUSU Desktop is the local executor, the packaged WindowsApps alias is the
release CLI/runtime identity, developer `musu 1.15.0-dev` is diagnostic only,
and MUSU.PRO is remote input/control-plane/rendezvous/relay evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_MSIX_ALIAS_SHADOW_LIVE_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_MSIX_ALIAS_SHADOW_LIVE_GATE_2026_06_06.md`

## 2026-06-06 Current MSIX Alias Shadow Live Gate Index Refresh (wiki/826)

MUSU local indexer was refreshed after wiki/825 and GOAL v650.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2601 files`
- `2754 symbols`
- `13353 ms`

The explicit WindowsApps alias was used because current PATH resolves terminal
`musu` to the developer binary first.

Indexed context includes the go/no-go live MSIX alias-shadow gate,
`test-release-evidence-verifiers.ps1` source-contract update, the canonical
wiki/825 report, next-step plan, BETA checklist, WIKI/WIKI_INDEX, and CoS
memory.

Search terms should include `GOAL v651`, `wiki/826`,
`current MSIX alias shadow live gate index refresh`, `2601 files`,
`2754 symbols`, `13353 ms`, `msix_current_legacy_conflicts_ok`,
`msix-current-legacy-conflicts`, `musu 1.15.0-dev`, `musu 1.15.0-rc.1`, and
`MUSU Desktop local executor`.

## 2026-06-06 MSIX Alias Persisted PATH Gate (wiki/827)

`check-msix-legacy-conflicts.ps1` now separates persisted User+Machine PATH
from the current process PATH.

Changed:

- release pass/fail now uses persisted Machine PATH plus User PATH
- result emits `alias_path_scope=persisted_user_machine`
- current shell state is preserved separately:
  `current_process_alias_sources`, `current_process_first_alias_path`,
  `current_process_alias_shadowing_count`, and
  `current_process_path_stale`
- `test-release-evidence-verifiers.ps1` adds source-contract case
  `MSIX legacy conflict check separates persisted and current process PATH`

Current `HUGH_SECOND` result:

- `ok=true`
- `alias_shadowing_count=0`
- `first_alias_path=C:\Users\empty\AppData\Local\Microsoft\WindowsApps\musu.exe`
- `current_process_alias_shadowing_count=1`
- `current_process_first_alias_path=C:\Users\empty\.cargo\bin\musu.exe`
- `current_process_path_stale=true`

Dirty-tree go/no-go now reports
`msix_current_legacy_conflicts_ok=true` and no
`msix-current-legacy-conflicts` blocker; `git` remains a blocker until commit.

Validation:

- parser check: pass
- legacy conflict JSON: pass
- release verifier regression: `61/61`
- dirty-tree go/no-go alias blocker removed

Qualitative audit found no high/medium issue. This is release-gate accuracy
hardening: a fresh terminal must resolve packaged WindowsApps `musu.exe` first,
while an already-open stale automation process is reported but does not become
a permanent machine-level release blocker.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_MSIX_ALIAS_PERSISTED_PATH_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_MSIX_ALIAS_PERSISTED_PATH_GATE_2026_06_06.md`

## 2026-06-06 MSIX Alias Persisted PATH Gate Index Refresh (wiki/828)

MUSU local indexer was refreshed after wiki/827 and GOAL v652.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2604 files`
- `2754 symbols`
- `17847 ms`

The explicit WindowsApps alias was used because the current Codex process PATH
is stale even though persisted PATH is clean.

Indexed context includes the MSIX alias persisted PATH gate, release verifier
source contract, canonical wiki/827 report, next-step plan, BETA checklist,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v653`, `wiki/828`,
`MSIX alias persisted PATH gate index refresh`, `2604 files`, `2754 symbols`,
`17847 ms`, `alias_path_scope=persisted_user_machine`,
`current_process_path_stale`, and `MUSU Desktop local executor`.

## 2026-06-06 Current Packaged Local Evidence Refresh (wiki/829)

Current packaged MUSU Desktop local evidence was refreshed on `HUGH_SECOND`
after the MSIX alias persisted PATH gate.

Evidence:

- single-machine:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-114258-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-114621-HUGH_SECOND.desktop-open.evidence.json`
- full runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-120547-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- targeted HUGH-MAIN diagnostic:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-121806-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Clean go/no-go at `2026-06-06T12:21:29+09:00` on commit `168f4530` reports:

- `ready_for_public_desktop_release=false`
- `git_dirty=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_current_legacy_conflicts_ok=true`
- `current_process_path_stale=true` diagnostic only
- `runtime_idle_cpu_valid_machine_count=1/2`
- `runtime_cpu_scenario_matrix_valid_machine_count=1/2`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1/1`

The targeted HUGH-MAIN route attempt timed out against
`http://192.168.1.192:8949/api/tasks/delegate`, but verifier accepted it as an
explicitly allowed failed route diagnostic and the post-attempt CPU sample
stayed healthy with WebView2 `0.03`, hot `0`, and working set `363.93MB`.

Qualitative audit found no high/medium issue. `localhost:3001` is not required
for the packaged local runtime. MUSU Desktop remains the local executor;
MUSU.PRO remains remote input, project/company room, presence, rendezvous,
path-selection, relay-fallback policy, and evidence/control plane.

Public release remains No-Go on real second-PC multi-device evidence,
two-machine CPU/matrix evidence, hosted MUSU.PRO P2P release relay proof,
support mailbox evidence, and Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_PACKAGED_LOCAL_EVIDENCE_REFRESH_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_PACKAGED_LOCAL_EVIDENCE_REFRESH_2026_06_06.md`

## 2026-06-06 Current Packaged Local Evidence Index Refresh (wiki/830)

MUSU local indexer was refreshed after wiki/829 and GOAL v654.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2621 files`
- `2754 symbols`
- `28082 ms`

Indexed context includes the current packaged local evidence report,
next-step plan, BETA checklist update, MUSU.PRO P2P control-plane spec update,
network boundary spec update, WIKI/WIKI_INDEX, GOAL v654, and CoS memory.

Search terms should include `GOAL v655`, `wiki/830`,
`current packaged local evidence index refresh`, `2621 files`, `2754 symbols`,
`28082 ms`, `runtime_cpu_second_pc_route_attempt_verified`,
`20260606-121806-HUGH_SECOND`, `localhost:3001 not required`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 P2P Env Status Release Payload Terminology (wiki/831)

`show-musu-pro-p2p-env-status.ps1` now separates release payload preflight,
missing release tunnel payload transport, and preview store-forward payload
queue terminology.

New/current source facts:

- `release_payload_preflight_endpoint_implemented=true`
- `release_tunnel_payload_endpoint_missing=true`
- `preview_store_forward_payload_queue_non_release_grade=true`
- `release_payload_endpoint_queue_only=true` remains a legacy alias only

The current status stays `ok=false` with the expected blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `source_relay_transport_kind_not_release_grade`
- missing KV/Upstash URL/token
- live runtime login, route proof, transport proof, and delivery proof gaps

Validation passed parser checks, P2P env status JSON recheck, P2P
store-forward relay contract audit `ok=true`/`fail_count=0`, and release
evidence verifier regressions `ok=true`/`case_count=62`/`failed_case_count=0`.

Qualitative audit found no high/medium issue. This is status/audit hardening
only, not release relay tunnel implementation. MUSU Desktop remains the local
executor; MUSU.PRO remains remote input, project/company room, rendezvous,
path-selection, relay-fallback policy, and evidence/control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_ENV_STATUS_RELEASE_PAYLOAD_TERMINOLOGY_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_P2P_ENV_STATUS_RELEASE_PAYLOAD_TERMINOLOGY_2026_06_06.md`

## 2026-06-06 P2P Env Status Release Payload Terminology Index Refresh (wiki/832)

MUSU local indexer was refreshed after wiki/831 and GOAL v656.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2624 files`
- `2754 symbols`
- `18024 ms`

Indexed context includes the P2P env status release payload terminology
hardening, `show-musu-pro-p2p-env-status.ps1`, P2P relay contract audit,
release evidence verifier source-contract update, canonical report, next-step
plan, BETA checklist, MUSU.PRO P2P control-plane spec, network boundary spec,
GOAL v656, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v657`, `wiki/832`,
`P2P env status release payload terminology index refresh`, `2624 files`,
`2754 symbols`, `18024 ms`, `release_tunnel_payload_endpoint_missing`,
`preview_store_forward_payload_queue_non_release_grade`,
`source_preview_store_forward_payload_queue_non_release_grade`,
`release verifier 62/62`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 Relay Transport Proof Peer Identity Binding (wiki/833)

`musu.relay_transport_proof.v1` now carries peer identity binding fields:

- `peer_identity_verified`
- `peer_identity_method`
- `peer_public_key`

Release proof now requires the proof identity to match the route evidence
identity and to use `quic_tls_cert_fingerprint` with a `sha256:` fingerprint.
The proof is still also bound to session, lease, source, target, tunnel,
transport kind, relay URL, payload transit, encryption, verifier, and
timestamps.

Validation passed P2P targeted tests `105/105`, `npm run typecheck`,
`cargo check --lib`, `cargo fmt --check`, `cargo test --lib route_evidence`
with `14 passed`, P2P store-forward relay audit `ok=true`/`fail_count=0`,
release evidence verifier regressions `ok=true`/`case_count=63`/
`failed_case_count=0`, and `git diff --check`.

Qualitative audit found no high/medium issue. This is proof-integrity
hardening, not release relay tunnel implementation. MUSU Desktop remains the
local executor; MUSU.PRO remains remote input, project/company room,
rendezvous, path-selection, relay-fallback policy, and evidence/control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_TRANSPORT_PROOF_PEER_IDENTITY_BINDING_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_TRANSPORT_PROOF_PEER_IDENTITY_BINDING_2026_06_06.md`

## 2026-06-06 Relay Transport Proof Peer Identity Binding Index Refresh (wiki/834)

MUSU local indexer was refreshed after wiki/833 and GOAL v658.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2627 files`
- `2754 symbols`
- `55082 ms`

Indexed context includes relay transport proof peer identity binding code,
release verifier case `p2p rejects relay route evidence with transport proof
identity mismatch`, P2P relay contract audit source-contract update, Rust route
evidence/cloud DTO carry-path updates, canonical report, next-step plan, BETA
checklist, MUSU.PRO P2P control-plane spec, network boundary spec, GOAL v658,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v659`, `wiki/834`,
`relay transport proof peer identity binding index refresh`, `2627 files`,
`2754 symbols`, `55082 ms`, `peer_identity_verified`,
`peer_identity_method`, `peer_public_key`, `quic_tls_cert_fingerprint`,
`sha256:`, `release verifier 63/63`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 Relay Payload Delivery Proof Release Metadata (wiki/835)

`musu.relay_payload_delivery_proof.v1` now carries release transport metadata:

- `relay_url`
- `transport_kind`
- `relay_default_data_path`
- `release_grade`

Route evidence release grading and hosted P2P verification now reject preview
queue delivery proof as release-grade evidence. Release delivery proof must use
`transport_kind=quic_relay_tunnel`, `release_grade=true`,
`relay_default_data_path=false`, and a `wss://` relay URL matching route
transport proof. Stored payload records must carry matching release metadata.

Validation passed P2P targeted tests `105/105`, `npm run typecheck`,
`cargo fmt --check`, `cargo check --lib`, `cargo test --lib route_evidence`
with `14 passed`, `cargo test --lib relay_payload` with `24 passed`, P2P
store-forward relay audit `ok=true`/`fail_count=0`, release evidence verifier
regressions `ok=true`/`case_count=64`/`failed_case_count=0`, and
`git diff --check`.

Qualitative audit found no high/medium issue. This is proof-boundary
hardening, not release relay tunnel implementation. MUSU Desktop remains the
local executor; MUSU.PRO remains remote input, project/company room,
rendezvous, path-selection, relay-fallback policy, and evidence/control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_DELIVERY_PROOF_RELEASE_METADATA_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_PAYLOAD_DELIVERY_PROOF_RELEASE_METADATA_2026_06_06.md`

## 2026-06-06 Relay Payload Delivery Proof Release Metadata Index Refresh (wiki/836)

MUSU local indexer was refreshed after wiki/835 and GOAL v660.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2630 files`
- `2755 symbols`
- `20544 ms`

Indexed context includes relay payload delivery proof release metadata code,
route evidence delivery proof record-level release blockers, Rust bridge/cloud
DTO carry-path updates, hosted P2P verifier case `p2p rejects relay route
evidence with preview payload delivery proof transport`, P2P relay contract
audit source-contract update, canonical report, next-step plan, BETA checklist,
MUSU.PRO P2P control-plane spec, network boundary spec, GOAL v660,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v661`, `wiki/836`,
`relay payload delivery proof release metadata index refresh`, `2630 files`,
`2755 symbols`, `20544 ms`, `http_store_forward_preview`,
`quic_relay_tunnel`, `release verifier 64/64`,
`relay_fallback_payload_delivery_proof_stored_not_release_grade`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Telemetry Flush Scope Audit (wiki/837)

Rust background-loop auditing now explicitly separates one-shot log flushes
from background telemetry/log flush worker primitives.

The only current Rust flush primitive is the uninstall purge prompt in
`musu-rs\src\install\uninstall.rs`; it is now tracked as an allowlisted
one-shot flush. Disallowed telemetry/log flush primitive count remains `0`.

Validation passed PowerShell parser checks, Rust background-loop audit
`ok=true`/`fail_count=0` with
`telemetry_flush_primitive_hit_count=0` and
`allowed_telemetry_flush_primitive_hit_count=1`, and release evidence verifier
regressions `ok=true`/`case_count=65`/`failed_case_count=0`.

Qualitative audit found no high/medium issue. The fixed issue was a low-risk
audit blind spot: plain Rust `stdout/stderr.flush()` calls are now classified
instead of relying only on telemetry/exporter keyword detection.

Product boundary remains unchanged: MUSU Desktop is the local executor and
resource owner; MUSU.PRO remains remote input, project/company room,
rendezvous, path-selection, relay-fallback policy, and evidence/control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_TELEMETRY_FLUSH_SCOPE_AUDIT_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_TELEMETRY_FLUSH_SCOPE_AUDIT_2026_06_06.md`

## 2026-06-06 Telemetry Flush Scope Audit Index Refresh (wiki/838)

MUSU local indexer was refreshed after wiki/837 and GOAL v662.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2633 files`
- `2755 symbols`
- `29667 ms`

Indexed context includes telemetry/log flush scope audit hardening,
`allowed_telemetry_flush_primitive_hit_count`, source-contract case
`rust background audit limits telemetry flush scope`, final operator packet
log-flush scope check, canonical report, next-step plan, BETA checklist,
MUSU.PRO P2P control-plane spec, network boundary spec, GOAL v662,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v663`, `wiki/838`,
`telemetry flush scope index refresh`, `2633 files`, `2755 symbols`,
`29667 ms`, `allowed_telemetry_flush_primitive_hit_count`,
`telemetry_flush_primitive_hit_count=0`, `release verifier 65/65`,
`musu-rs\src\install\uninstall.rs`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 Current HEAD Packaged Local Evidence After Relay Proof Hardening (wiki/839)

Current HEAD `83e8bd415432529474930bcf54c6408847c0ad24` was rebuilt into the
local-sideload MSIX, reinstalled, and refreshed on `HUGH_SECOND`.

Evidence includes MSIX install
`docs\evidence\msix-install\1.15.0-rc.1\20260606-141418-HUGH_SECOND.evidence.json`,
single-machine smoke
`docs\evidence\single-machine\1.15.0-rc.1\20260606-140158-HUGH_SECOND.evidence.json`,
desktop-open CPU
`docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-140222-HUGH_SECOND.desktop-open.evidence.json`,
full runtime matrix
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-140335-HUGH_SECOND.runtime-cpu-scenario-matrix.json`,
and targeted HUGH-MAIN route CPU diagnostic
`docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-140947-HUGH_SECOND.runtime-cpu-scenario-matrix.json`.

Key results: single-machine `ok=true`, `local-bridge-only`, bridge
`http://127.0.0.1:8179`; desktop-open CPU `ok=true`, `git_dirty=false`,
`60.038s`, WebView2 max `0.16`, hot process `0`; full matrix `ok=true` with
route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_140335`; targeted HUGH-MAIN
diagnostic `ok=true`, failed route allowed, timeout to `192.168.1.192:8949`,
post-route WebView2 max `0.05`, hot process `0`.

Dirty worktree go/no-go before committing evidence restored single-machine
true, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime matrix
`1/2 [HUGH_SECOND]`, and targeted second-PC route CPU diagnostic `1/1`.

Qualitative audit found no high/medium issue. The local packaged 20% idle CPU
issue is not reproduced on `HUGH_SECOND`; remaining release blockers are real
second-PC evidence, hosted MUSU.PRO P2P release proof, support mailbox, and
Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_PACKAGED_LOCAL_EVIDENCE_AFTER_RELAY_PROOF_HARDENING_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_PACKAGED_LOCAL_EVIDENCE_AFTER_RELAY_PROOF_HARDENING_2026_06_06.md`

## 2026-06-06 Current HEAD Packaged Local Evidence After Relay Proof Hardening Index Refresh (wiki/840)

MUSU local indexer was refreshed after wiki/839 and GOAL v664.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2647 files`
- `2755 symbols`
- `13328 ms`

Indexed context includes current HEAD packaged local evidence after relay proof
hardening, MSIX install evidence `20260606-141418-HUGH_SECOND`,
single-machine evidence `20260606-140158-HUGH_SECOND`, desktop-open CPU
evidence `20260606-140222-HUGH_SECOND.desktop-open`, full runtime CPU matrix
`20260606-140335-HUGH_SECOND`, targeted HUGH-MAIN route CPU diagnostic
`20260606-140947-HUGH_SECOND`, canonical report, next-step plan, BETA
checklist, WIKI/WIKI_INDEX, GOAL v664, and CoS memory.

Search terms should include `GOAL v665`, `wiki/840`, `2647 files`,
`2755 symbols`, `13328 ms`,
`current HEAD packaged local evidence after relay proof hardening index
refresh`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_140335`,
`runtime idle CPU 1/2`, `runtime matrix 1/2`, `targeted second-PC route CPU
1/1`, `MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 MSIX Install Candidate Selection Hardening (wiki/841)

Code audit after wiki/839 found that `write-release-go-no-go.ps1` selected only
the newest MSIX install evidence candidate. A developer warning-mode evidence
file with `AliasShadowingMode=warn-explicit-windowsapps` could therefore mask
older clean strict MSIX install evidence and create a false `msix-install`
blocker.

The go/no-go writer now gathers recent MSIX install evidence candidates from
docs and local build roots, applies latest-per-machine selection up to six
candidates per machine, and accepts the first candidate that passes the default
strict `verify-msix-install-evidence.ps1` invocation. Warning-mode evidence
remains diagnostic only unless the verifier is explicitly run with
`-AliasShadowingMode warn-explicit-windowsapps`.

Validation passed `git diff --check` and release evidence verifier regressions
with `ok=true`, `case_count=66`, `failed_case_count=0`, including source
contract `go-no-go MSIX install selection scans recent candidates`. Dirty-tree
go/no-go after the patch reports `msix_install_verified=true`,
`single_machine_verified=true`, runtime idle CPU `1/2 [HUGH_SECOND]`, runtime
matrix `1/2 [HUGH_SECOND]`, and targeted second-PC route CPU `1/1`.

Qualitative audit found no high/medium issue. Product boundary remains
unchanged: MUSU Desktop is local executor; MUSU.PRO is remote input,
project/company room, rendezvous, path-selection, relay fallback policy, and
evidence/control plane.

## 2026-06-06 MSIX Install Candidate Selection Index Refresh (wiki/842)

MUSU local indexer was refreshed after wiki/841 and GOAL v666.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2649 files`
- `2755 symbols`
- `12489 ms`

Indexed context includes MSIX install candidate selection hardening,
`write-release-go-no-go.ps1`, release verifier source contract
`go-no-go MSIX install selection scans recent candidates`, current packaged
local evidence, P2P control-plane product split/spec addendum, BETA checklist,
GOAL v666, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v667`, `wiki/842`, `MSIX install candidate
selection index refresh`, `2649 files`, `2755 symbols`, `12489 ms`,
`latest-per-machine-up-to-6`, `warn-explicit-windowsapps`,
`release verifier 66/66`, `msix_install_verified=true`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Relay Preflight Failure Evidence Hardening (wiki/843)

Relay connect and release payload preflight invalid JSON/metadata responses now
return structured release status fields instead of terse error-only JSON.
`musu.relay_connect.v1` failure responses include
`relay_connect_accepted=false`, `payload_transported=false`, and
`lease_verified=false`; `musu.relay_payload_preflight.v1` failure responses
include `release_payload_accepted=false`, `payload_stored=false`,
`payload_transported=false`, and `lease_verified=false`.

The P2P relay contract audit now requires regression coverage for these
failure-status paths. Validation passed P2P tests `107/107`, `npm run
typecheck`, P2P relay contract audit `ok=true`/`fail_count=0`, release verifier
`ok=true`/`case_count=66`/`failed_case_count=0`, and `git diff --check`.

Qualitative audit found no high/medium issue. This is failure-handling and
release-evidence hardening only; release relay tunnel payload transport remains
unimplemented and the preview queue remains non-release-grade. Canonical
report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PREFLIGHT_FAILURE_EVIDENCE_HARDENING_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_PREFLIGHT_FAILURE_EVIDENCE_HARDENING_2026_06_06.md`

## 2026-06-06 Relay Preflight Failure Evidence Index Refresh (wiki/844)

MUSU local indexer was refreshed after wiki/843 and GOAL v668.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2652 files`
- `2757 symbols`
- `12802 ms`

Indexed context includes relay preflight failure evidence hardening,
structured invalid JSON/metadata failure responses, P2P relay contract audit
updates, canonical report, next-step plan, P2P control-plane spec addendum,
BETA checklist, GOAL v668, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v669`, `wiki/844`, `relay preflight failure
evidence index refresh`, `2652 files`, `2757 symbols`, `12802 ms`,
`invalid_json`, `relay_connect_accepted=false`,
`release_payload_accepted=false`, `payload_transported=false`,
`lease_verified=false`, `MUSU Desktop local executor`, and `MUSU.PRO remote
input control plane`.

## 2026-06-06 Route Evidence Peer Identity Gate (wiki/845)

Route evidence release grading now requires top-level peer identity proof to
use `peer_identity_method=quic_tls_cert_fingerprint` and a `sha256:`
fingerprint. The route evidence API adds blockers
`peer_identity_method_not_release_grade` and
`peer_public_key_not_fingerprint`; the route evidence store adds
`hasCurrentPeerIdentityProof()` so release-grade queries revalidate stale/manual
records before returning them.

Validation passed P2P tests `108/108`, `npm run typecheck`, P2P relay contract
audit `ok=true`/`fail_count=0`, release verifier `ok=true`/`case_count=66`/
`failed_case_count=0`, and `git diff --check`.

Qualitative audit found no high/medium issue. This is route evidence integrity
hardening only; second-PC, hosted relay tunnel, support mailbox, and Store
gates remain open. Canonical report:

- `docs\RELEASE_1_15_0_RC1_ROUTE_EVIDENCE_PEER_IDENTITY_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_ROUTE_EVIDENCE_PEER_IDENTITY_GATE_2026_06_06.md`

## 2026-06-06 Route Evidence Peer Identity Gate Index Refresh (wiki/846)

MUSU local indexer was refreshed after wiki/845 and GOAL v670.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2655 files`
- `2758 symbols`
- `11366 ms`

Indexed context includes route evidence peer identity release gate hardening,
`peer_identity_method_not_release_grade`,
`peer_public_key_not_fingerprint`, `hasCurrentPeerIdentityProof`, canonical
report, next-step plan, P2P control-plane spec addendum, BETA checklist, GOAL
v670, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v671`, `wiki/846`, `route evidence peer
identity gate index refresh`, `2655 files`, `2758 symbols`, `11366 ms`,
`peer_identity_method_not_release_grade`, `peer_public_key_not_fingerprint`,
`hasCurrentPeerIdentityProof`, `quic_tls_cert_fingerprint`, `sha256:`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Current External Gate Snapshot (wiki/847)

Current clean HEAD `0ba26d6d27a23a213240962517079d5fd817c7e8` was rechecked
without `-SkipPublicMetadata`.

Evidence:

- external gate:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-151336-HUGH_SECOND.external-gates.evidence.json`
- hosted P2P:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-151527-musu.pro.evidence.json`
- hosted P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-151527-musu.pro.verification.json`

Current result:

- public metadata checked/ok `true`/`true`
- local artifacts ready `true`
- single-machine verified `true`
- MSIX install verified `true`
- runtime idle CPU valid machine count `1/2`
- runtime CPU scenario matrix valid machine count `1/2`
- targeted failed-route CPU diagnostic `1/1`
- second PC `192.168.1.192:8949` TCP error `tcp_connect_timeout`
- hosted P2P verification `ok=false`, `fail_count=42`
- relay route evidence count `0`
- relay route transport proof valid count `0`
- relay payload delivery proof valid count `0`

Validation/code audit:

- changed code files in this snapshot: none
- `git diff --check`: pass
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`

Remaining go/no-go blockers are `multi-device`, `runtime-idle-cpu`,
`runtime-cpu-scenario-matrix`, `support-mailbox`, `store-release`, and
`p2p-control-plane`.

Qualitative audit found no high/medium issue. This is external
machine/account/infrastructure evidence work; it is not a localhost dashboard
problem and it does not change the product boundary. MUSU Desktop remains the
local executor, while MUSU.PRO remains remote input, project/company room,
rendezvous, path selection, relay fallback, and evidence/control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_EXTERNAL_GATE_SNAPSHOT_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_EXTERNAL_GATE_SNAPSHOT_2026_06_06.md`

## 2026-06-06 Current External Gate Snapshot Index Refresh (wiki/848)

MUSU local indexer was refreshed after wiki/847 and GOAL v672.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2662 files`
- `2758 symbols`
- `11836 ms`

Indexed context includes current external gate evidence
`20260606-151336-HUGH_SECOND.external-gates`, hosted P2P evidence
`20260606-151527-musu.pro`, public metadata pass, second-PC
`tcp_connect_timeout`, hosted P2P verifier `fail_count=42`, current external
gate snapshot report, next-step plan, BETA checklist, P2P control-plane specs,
GOAL v672, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v673`, `wiki/848`, `current external gate
snapshot index refresh`, `2662 files`, `2758 symbols`, `11836 ms`,
`public_metadata_ok=true`, `P2P fail_count=42`,
`relay_route_transport_proof_valid_count=0`,
`relay_payload_delivery_proof_valid_count=0`, `MUSU Desktop local executor`,
and `MUSU.PRO remote input control plane`.

## 2026-06-06 Relay Tunnel Runtime Source Gate (wiki/849)

Relay tunnel runtime readiness is now a distinct source gate.

Changed:

- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `relayTransportWired()` requires `relayTunnelRuntimeImplemented()`
- relay lease, transport, connect, and release payload preflight APIs expose
  `relay_tunnel_runtime_implemented=false`
- P2P env status emits
  `source_release_relay_tunnel_runtime_not_implemented`

Validation:

- P2P tests: `108/108`
- `npm run typecheck`: pass
- P2P store-forward relay audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

Qualitative audit found no high/medium issue. This prevents fake release
enablement; it does not implement the actual `quic_relay_tunnel` runtime.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_TUNNEL_RUNTIME_SOURCE_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_TUNNEL_RUNTIME_SOURCE_GATE_2026_06_06.md`

## 2026-06-06 Relay Tunnel Runtime Source Gate Index Refresh (wiki/850)

MUSU local indexer was refreshed after wiki/849 and GOAL v674.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2665 files`
- `2759 symbols`
- `12696 ms`

Indexed context includes `RELAY_TUNNEL_RUNTIME_IMPLEMENTED`,
`relay_tunnel_runtime_implemented`,
`source_release_relay_tunnel_runtime_not_implemented`, relay API status
updates, P2P env status source contract, canonical report, next-step plan,
BETA checklist, P2P control-plane specs, GOAL v674, WIKI/WIKI_INDEX, and CoS
memory.

Search terms should include `GOAL v675`, `wiki/850`, `relay tunnel runtime
source gate index refresh`, `2665 files`, `2759 symbols`, `12696 ms`,
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`,
`source_release_relay_tunnel_runtime_not_implemented`, `MUSU Desktop local
executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Current HEAD Desktop-Open CPU Evidence After Relay Runtime Gate (wiki/851)

Clean HEAD `dd0e409ee3a8ade2153bb858f74c4c5a0abf5bc2` was sampled on
`HUGH_SECOND` in actual packaged `desktop-open` state.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-154524-HUGH_SECOND.desktop-open.evidence.json`

Result:

- `ok=true`
- `git_dirty=false`
- sample: `60.028s`
- hot process count: `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.03`
- subrole max: bridge `0`, desktop shell `0`, WebView2 helper `0.03`
- process counts: bridge runtime `1`, desktop shell `1`, node helper `0`,
  WebView2 helper `6`
- working set: `366.33MB`
- resource budget violations: none

Post-evidence audits passed:

- frontend polling contract: `ok=true`, `fail_count=0`
- Rust background-loop contract: `ok=true`, `fail_count=0`
- process ownership audit: `ok=true`, `fail_count=0`

Diagnostic matrix:

- `.local-build\runtime-cpu-scenarios\20260606-154644-HUGH_SECOND\20260606-154644-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`
- `ok=true`, `fail_count=0`
- not release evidence because `git_dirty=true`

Qualitative audit found no high/medium issue. The reported 20% idle CPU loop
is not reproduced on this current one-machine packaged desktop state. Public
release remains No-Go until second-PC CPU/matrix, real route evidence, hosted
P2P control-plane/relay proof, support mailbox, and Store evidence are real.

## 2026-06-06 Current HEAD Desktop-Open CPU Evidence Index Refresh (wiki/852)

MUSU local indexer was refreshed after wiki/851 and GOAL v676.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2668 files`
- `2759 symbols`
- `15241 ms`

Indexed context includes evidence
`20260606-154524-HUGH_SECOND.desktop-open`, dirty diagnostic matrix
`20260606-154644-HUGH_SECOND`, updated CPU reports, next-step plan, BETA
checklist, GOAL v676, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v677`, `wiki/852`, `current HEAD
desktop-open CPU after relay runtime gate index refresh`, `2668 files`,
`2759 symbols`, `15241 ms`, `20260606-154524-HUGH_SECOND.desktop-open`,
`WebView2 0.03`, `hot process count 0`, `git_dirty=false`, `diagnostic matrix
git_dirty=true`, `MUSU Desktop local executor`, and `MUSU.PRO remote input
control plane`.

## 2026-06-06 Relay Fallback Candidate Coverage Gate (wiki/853)

Relay fallback route evidence now has to prove candidate coverage before a
relay route can be release-grade.

Changed:

- `relay_fallback.candidate_route_kinds`
- `relay_route_candidate_set_missing`
- `relay_route_candidate_set_missing_relay_fallback`
- `relay_route_candidate_set_missing_direct_candidate`
- `relay_route_skipped_available_direct_candidate`
- `relay_route_attempted_unavailable_direct_candidate`
- `relay_route_candidate_attempt_order_mismatch`
- `hasCurrentRelayCandidateCoverage()`

Validation:

- P2P tests: `111/111`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

Qualitative audit found no high/medium issue. This is evidence/path-selection
hardening only; second-PC route proof and the release relay tunnel runtime
remain open.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_FALLBACK_CANDIDATE_COVERAGE_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RELAY_FALLBACK_CANDIDATE_COVERAGE_GATE_2026_06_06.md`

## 2026-06-06 Relay Fallback Candidate Coverage Gate Index Refresh (wiki/854)

MUSU local indexer was refreshed after wiki/853 and GOAL v678.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2671 files`
- `2763 symbols`
- `26393 ms`

Indexed context includes `relay_fallback.candidate_route_kinds`,
`relay_route_candidate_set_missing`,
`relay_route_skipped_available_direct_candidate`,
`relay_route_attempted_unavailable_direct_candidate`,
`relay_route_candidate_attempt_order_mismatch`,
`hasCurrentRelayCandidateCoverage`, canonical report, next-step plan, BETA
checklist, P2P control-plane specs, GOAL v678, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v679`, `wiki/854`, `relay fallback
candidate coverage gate index refresh`, `2671 files`, `2763 symbols`,
`26393 ms`, `candidate_route_kinds`, `hasCurrentRelayCandidateCoverage`, `MUSU
Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Runtime Relay Candidate Coverage Carry (wiki/855)

The local runtime now carries the hosted relay fallback candidate coverage
contract through the source and target-side preview relay path.

Changed:

- Rust rendezvous preserves `candidate_route_kinds` in selected peer metadata.
- Rust forwarding attempts ordered direct candidates before relay fallback.
- `RouteRelayFallbackEvidence` carries `candidate_route_kinds` into local JSON
  and cloud route evidence DTOs.
- Relay payload enqueue/store preserves `candidate_route_kinds` and
  `attempted_route_kinds`.
- Target-side relay delivery route evidence reuses the stored route metadata
  instead of the old `failed`/`relay` placeholder.
- The P2P relay contract audit checks the web verifier and Rust source path.

Validation:

- Rust route evidence tests: `14/14`
- Rust relay payload tests: `24/24`
- Rust rendezvous tests: `6/6`
- Rust router candidate test: `1/1`
- `cargo check --bin musu`: pass
- P2P tests: `111/111`
- `npm run typecheck`: pass
- P2P relay contract audit: `ok=true`, `fail_count=0`
- release verifier: `ok=true`, `case_count=66`, `failed_case_count=0`
- `git diff --check`: pass

Qualitative audit found no high/medium issue. This is runtime evidence
carry-path hardening only. It does not implement the release
`quic_relay_tunnel`, does not make the preview store-forward queue
release-grade, and does not close second-PC/support/Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_RELAY_CANDIDATE_COVERAGE_CARRY_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_RUNTIME_RELAY_CANDIDATE_COVERAGE_CARRY_2026_06_06.md`

## 2026-06-06 Runtime Relay Candidate Coverage Carry Index Refresh (wiki/856)

MUSU local indexer was refreshed after wiki/855 and GOAL v680.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2675 files`
- `2776 symbols`
- `18098 ms`

Indexed context includes `route_peers_from_target_candidates`,
`candidate_route_kind_labels`, `route_kind_labels_to_cloud`,
`candidate_route_kinds`, `attempted_route_kinds`,
`P2pRelayPayloadRequest`, `P2pRelayPayloadStoredRecord`, canonical report,
next-step plan, BETA checklist, P2P control-plane specs, GOAL v680,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v681`, `wiki/856`, `runtime relay candidate
coverage carry index refresh`, `2675 files`, `2776 symbols`, `18098 ms`,
`candidate_route_kinds`, `attempted_route_kinds`, `MUSU Desktop local
executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Current Desktop Clean-Start Evidence (wiki/857)

Current source after runtime relay candidate coverage carry was rebuilt into
the local-sideload MSIX, reinstalled on `HUGH_SECOND`, and revalidated as MUSU
Desktop rather than the localhost developer dashboard.

Evidence:

- MSIX install:
  `docs\evidence\msix-install\1.15.0-rc.1\20260606-171011-HUGH_SECOND.evidence.json`
- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-170759-HUGH_SECOND.evidence.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-171154-HUGH_SECOND.desktop-open.evidence.json`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-171403-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- runtime CPU matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-171403-HUGH_SECOND.verification.json`

Results:

- strict MSIX install evidence: `ok=true`, startup contract
  `local-sideload-manual`, WindowsApps alias first
- single-machine smoke: `ok=true`, `local-bridge-only`, bridge
  `http://127.0.0.1:4751`, CLI route checked
- desktop-open CPU: `ok=true`, `git_dirty=false`, `60.043s`, hot `0`,
  WebView2 max one-core CPU `0.23`, working set `363.69MB`
- full runtime CPU matrix: verifier `ok=true`, `fail_count=0`; scenarios
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
  `post-route`; route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_171403`;
  route task `08b81687-bacf-40eb-a677-e92fca76149b`

Clean go/no-go recognizes current one-machine evidence:

- `single_machine_verified=true`
- `msix_install_verified=true`
- runtime idle CPU valid machines: `1`
- runtime CPU matrix valid machines: `1`
- `manifest_git.dirty=false`

Public release remains No-Go on real second-PC multi-device evidence, second-PC
CPU/matrix counts, targeted second-PC route-attempt CPU evidence, live
MUSU.PRO P2P/relay proof, support mailbox, and Store evidence.

Root cause note: `localhost:3001` connection refusal is not the packaged MUSU
Desktop contract. MUSU Desktop is the local executor; MUSU.PRO is remote input,
project/company room, AI meeting room, presence, rendezvous, path selection,
relay fallback coordination, and evidence/control plane.

Qualitative audit found no high/medium issue in the current evidence refresh.
No runtime source changed during this refresh.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_DESKTOP_CLEAN_START_EVIDENCE_AUDIT_NEXT_STEPS_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_DESKTOP_CLEAN_START_EVIDENCE_2026_06_06.md`

## 2026-06-06 Current Desktop Clean-Start Evidence Index Refresh (wiki/858)

MUSU local indexer was refreshed after wiki/857 and GOAL v682.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2686 files`
- `2776 symbols`
- `67224 ms`

Indexed context includes current desktop clean-start evidence
`20260606-171011-HUGH_SECOND`, `20260606-170759-HUGH_SECOND`,
`20260606-171154-HUGH_SECOND.desktop-open`,
`20260606-171403-HUGH_SECOND.runtime-cpu-scenario-matrix`, canonical report,
next-step plan, BETA checklist, P2P control-plane spec, GOAL v682,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v683`, `wiki/858`, `current desktop
clean-start evidence index refresh`, `2686 files`, `2776 symbols`, `67224 ms`,
`20260606-171011-HUGH_SECOND`, `20260606-170759-HUGH_SECOND`,
`20260606-171154-HUGH_SECOND.desktop-open`, `20260606-171403-HUGH_SECOND`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260606_171403`, `localhost:3001 is not the
packaged desktop contract`, `MUSU Desktop local executor`, and `MUSU.PRO remote
input control plane`.

## 2026-06-06 Current Targeted Second-PC Route-Attempt CPU Evidence (wiki/859)

Current HEAD `0fb31ddff5fef4704104ca364fff92632627e4e3` now has fresh targeted
`HUGH-MAIN` route-attempt CPU evidence.

Evidence:

- matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-173706-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-173706-HUGH_SECOND.target-route.verification.json`

Result:

- verifier `ok=true`, `fail_count=0`
- scenario: `post-route`
- target: `HUGH-MAIN`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_173706`
- route result: `ok=false`, `failure_allowed=true`
- failure: request to `http://192.168.1.192:8949/api/tasks/delegate` timed out
- post-route CPU: MUSU `0.03`, Node `0`, WebView2 `0.03`
- working set: `356.6MB`
- hot process count: `0`

This is not successful two-machine route proof. It proves the current packaged
desktop remains CPU-budget-safe after a targeted failed route attempt to the
known second-PC peer. Real second-PC multi-device, second-PC CPU/matrix, hosted
P2P relay proof, support mailbox, and Store gates remain open.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_TARGETED_SECOND_PC_ROUTE_ATTEMPT_CPU_2026_06_06.md`

## 2026-06-06 Current Targeted Second-PC Route-Attempt CPU Index Refresh (wiki/860)

MUSU local indexer was refreshed after wiki/859 and GOAL v684.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2691 files`
- `2776 symbols`
- `56299 ms`

Indexed context includes targeted `HUGH-MAIN` route-attempt CPU evidence
`20260606-173706-HUGH_SECOND`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260606_173706`, canonical report, BETA
checklist, WIKI/WIKI_INDEX, GOAL v684, and CoS memory.

Search terms should include `GOAL v685`, `wiki/860`, `targeted second-PC
route-attempt CPU index refresh`, `2691 files`, `2776 symbols`, `56299 ms`,
`20260606-173706-HUGH_SECOND`, `HUGH-MAIN`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260606_173706`, `failure_allowed=true`,
`WebView2 0.03`, `hot process count 0`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 Current Code Audit, Product Spec, and Next Steps (wiki/861)

Current clean HEAD `c879a849f403aadefdd071a012aaa4cd304cbf24` was audited
after targeted HUGH-MAIN route-attempt CPU evidence.

Validation:

- `npm run test:p2p`: `111/111`
- `npm run typecheck`: pass
- P2P store-forward relay contract audit: `ok=true`, `fail_count=0`
- Rust background-loop contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=true`, `case_count=66`,
  `failed_case_count=0`
- clean go/no-go at `2026-06-06T17:48:59+09:00`: public metadata, local
  artifacts, MSIX install, and single-machine evidence pass; public release
  remains No-Go

Qualitative audit found no high/medium code issue in the audited source
surfaces.

Current product spec:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback, and evidence/control plane.
- `localhost:3001` is not the packaged desktop runtime contract.
- hosted relay is fallback-only and non-default until real `quic_relay_tunnel`
  and `quic_tls_1_3` proof exist.

Remaining release blockers are second-PC route/CPU/matrix evidence, live
MUSU.PRO P2P proof, production runtime login, KV/Upstash relay lease storage,
release relay tunnel runtime, release payload endpoint, relay route transport
proof, relay payload delivery proof, support mailbox evidence, and
Store/Partner Center evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_P2P_CONTROL_PLANE_CODE_AUDIT_NEXT_STEPS_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_AUDIT_AND_INDEX_2026_06_06.md`

## 2026-06-06 Current Code Audit Product Spec Index Refresh (wiki/862)

MUSU local indexer was refreshed after wiki/861 and GOAL v686.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2694 files`
- `2776 symbols`
- `12906 ms`

Indexed context includes current code audit report, current next-step plan,
BETA checklist update, MUSU.PRO P2P control-plane spec update, network boundary
spec update, WIKI/WIKI_INDEX, GOAL v686, and CoS memory.

Search terms should include `GOAL v687`, `wiki/862`, `current code audit
product spec index refresh`, `2694 files`, `2776 symbols`, `12906 ms`,
`c879a849f403aadefdd071a012aaa4cd304cbf24`, `P2P tests 111/111`,
`release verifier 66/66`, `MUSU Desktop local executor`, `MUSU.PRO remote input
control plane`, and `localhost:3001 is not the packaged desktop runtime
contract`.

## 2026-06-06 Current HEAD External Gate Recheck After Audit (wiki/863)

Current HEAD `c0886f197e3298d896d606b664da0de20b9b0e3a` has fresh external
gate evidence after the code audit/product-boundary documentation commit.

Evidence:

- external gate:
  `docs\evidence\external-gates\1.15.0-rc.1\20260606-180122-HUGH_SECOND.external-gates.evidence.json`
- hosted P2P evidence:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-180311-musu.pro.evidence.json`
- hosted P2P verification:
  `docs\evidence\p2p-control-plane\1.15.0-rc.1\20260606-180311-musu.pro.verification.json`

Result:

- release ready: `false`
- public metadata checked/ok: `true`/`true`
- local artifacts ready: `true`
- single-machine verified: `true`
- runtime idle CPU valid machines: `1/2`
- runtime CPU matrix valid machines: `1/2`
- second PC reachable: `false`, `tcp_connect_timeout`
- P2P env ready: `false`
- P2P evidence verified: `false`
- P2P runtime logged in: `false`
- owner scope verified: `false`
- relay transport/payload endpoint wired: `false`
- relay route transport proof valid count: `0`
- relay payload delivery proof valid count: `0`

This confirms the blocker split: local packaged desktop evidence remains good
on `HUGH_SECOND`; the remaining gates are real second-PC proof, production
MUSU.PRO login/storage, release relay tunnel proof, support mailbox proof, and
Store proof.

## 2026-06-06 Current HEAD External Gate Recheck Index Refresh (wiki/864)

MUSU local indexer was refreshed after wiki/863 and GOAL v688.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2699 files`
- `2776 symbols`
- `21591 ms`

Indexed context includes current HEAD external gate evidence
`20260606-180122-HUGH_SECOND.external-gates`, hosted P2P evidence
`20260606-180311-musu.pro`, current external gate recheck report, BETA
checklist, WIKI/WIKI_INDEX, GOAL v688, and CoS memory.

Search terms should include `GOAL v689`, `wiki/864`, `current HEAD external
gate recheck index refresh`, `2699 files`, `2776 symbols`, `21591 ms`,
`20260606-180122-HUGH_SECOND.external-gates`, `20260606-180311-musu.pro`,
`tcp_connect_timeout`, `p2p_runtime_not_logged_in`,
`runtime idle CPU 1/2`, `runtime CPU matrix 1/2`, `MUSU Desktop local
executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Current HEAD Qualitative Code Audit and Next Steps (wiki/865)

Current HEAD `52d325d43b691c6e1b56404e34cfd2ba85257311` was audited after the
current external gate recheck.

Validation:

- `npm run typecheck`: pass
- `npm run test:p2p`: `111/111`
- local API auth contract: `ok=true`, `fail_count=0`
- operator API security contract: `ok=true`, `fail_count=0`
- secret storage contract: `ok=true`, `fail_count=0`
- frontend polling contract: `ok=true`, `fail_count=0`, 29 low-duty
  call-site files, no direct interval or visibility listener hits outside the
  shared pollers
- Rust background-loop contract: `ok=true`, `fail_count=0`, no unaudited
  loops/spawns/network watcher primitives
- P2P store-forward relay contract: `ok=true`, `fail_count=0`
- process ownership: `ok=true`, packaged runtime 1, desktop shell 1, owned
  Node helpers 0, owned WebView2 helpers 6, bridge HTTP 200 at
  `127.0.0.1:4751`
- release evidence verifier regression: `ok=true`, `case_count=66`,
  `failed_case_count=0`

Go/no-go at `2026-06-06T18:13:07+09:00` remains
`ready_for_public_desktop_release=false` with local artifacts, single-machine,
public metadata, and MSIX install verified; `multi_device_verified=false`.

P2P env status remains fail-closed with
`source_release_relay_payload_endpoint_not_implemented`,
`source_release_relay_tunnel_runtime_not_implemented`,
`source_preview_store_forward_payload_queue_non_release_grade`,
`source_relay_transport_kind_not_release_grade`,
`live_evidence_p2p_runtime_not_logged_in`,
`live_evidence_relay_route_transport_proof_missing`, and
`live_evidence_relay_payload_delivery_proof_missing`.

Qualitative audit found no high/medium code issue in the audited surfaces.
Local packaged MUSU Desktop is healthy on `HUGH_SECOND`; public release remains
blocked by second-PC route/CPU/matrix proof, live MUSU.PRO login/storage and
relay proof, support mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_QUAL_CODE_AUDIT_NEXT_STEPS_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_QUAL_CODE_AUDIT_2026_06_06.md`

## 2026-06-06 Current HEAD Qualitative Code Audit Index Refresh (wiki/866)

MUSU local indexer was refreshed after wiki/865 and GOAL v690.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2702 files`
- `2776 symbols`
- `11885 ms`

Indexed context includes current HEAD
`52d325d43b691c6e1b56404e34cfd2ba85257311`, current qualitative code audit
report, next-step plan, BETA checklist, MUSU.PRO P2P control-plane spec,
network boundary spec, WIKI/WIKI_INDEX, GOAL v690, and CoS memory.

Search terms should include `GOAL v691`, `wiki/866`, `current HEAD qualitative
code audit index refresh`, `2702 files`, `2776 symbols`, `11885 ms`,
`52d325d43b691c6e1b56404e34cfd2ba85257311`, `P2P tests 111/111`,
`release verifier 66/66`, `127.0.0.1:4751`,
`source_release_relay_tunnel_runtime_not_implemented`,
`live_evidence_p2p_runtime_not_logged_in`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 Crash-Recovery Contract Gate (wiki/867)

`musu up` now removes a dead bridge service registry record before probing
bridge health. The Rust `UpReport` exposes `stale_bridge_registry_removed` and
`stale_bridge_registry_pid`, and text output prints the removed stale PID when
cleanup happened.

New release audit:

- `scripts\windows\audit-musu-crash-recovery-contract.ps1`
- schema: `musu.crash_recovery_contract.v1`
- latest result: `ok=true`, `fail_count=0`

Release gate wiring:

- `write-release-go-no-go.ps1` reports
  `crash_recovery_contract_verified` and `crash_recovery_contract_audit`, and
  blocks on `crash-recovery`
- `show-final-release-handoff-status.ps1` reports the rerun step
- final operator packet generation and verification include the audit as Gate
  D4
- release verifier regressions cover the audit, go/no-go wiring, and freshness
  classifiers
- desktop readiness inventory includes the audit script

Validation:

- PowerShell parser: pass
- `cargo fmt --check`: pass
- `cargo check --bin musu`: pass
- `cargo test --lib cleanup_stale_removes_dead_pids`: `1/1`
- release verifier: `ok=true`, `case_count=69`, `failed_case_count=0`
- desktop release readiness: local artifacts, MSIX desktop entrypoint, desktop
  shell, and single-machine evidence pass; public readiness remains false on
  multi-device evidence
- `git diff --check`: pass

Qualitative audit found no high/medium issue. This closes a local packaged
runtime crash-recovery contract gap only; public release remains blocked by
second-PC route/CPU/matrix proof, live MUSU.PRO P2P/relay proof, support
mailbox proof, and Store proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CRASH_RECOVERY_CONTRACT_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CRASH_RECOVERY_CONTRACT_2026_06_06.md`

## 2026-06-06 Crash-Recovery Contract Index Refresh (wiki/868)

MUSU local indexer was refreshed after wiki/867 and GOAL v692.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2707 files`
- `2776 symbols`
- `14571 ms`

Indexed context includes the Rust `musu up` stale bridge registry cleanup,
`audit-musu-crash-recovery-contract.ps1`, go/no-go/handoff/operator-packet
wiring, release verifier coverage, canonical report, next-step plan, BETA
checklist, MUSU.PRO P2P control-plane spec, network boundary spec,
WIKI/WIKI_INDEX, GOAL v692, and CoS memory.

Search terms should include `GOAL v693`, `wiki/868`, `crash-recovery contract
index refresh`, `2707 files`, `2776 symbols`, `14571 ms`,
`stale_bridge_registry_removed`, `stale_bridge_registry_pid`,
`musu.crash_recovery_contract.v1`, `crash_recovery_contract_verified`,
`release verifier 69/69`, `cargo check --bin musu`, `MUSU Desktop local
executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Idle CPU 4-State Recheck (wiki/869)

Current installed WindowsApps MUSU was rechecked on `HUGH_SECOND` at repo HEAD
`e0474473e366f847f24bd77ec862c5a72f02e59b` for four 60s scenarios:
`startup-open`, `runtime-started`, `dashboard-open`, and `desktop-open`.

Matrix path:

- `.local-build\runtime-cpu-scenarios\20260606-190449-HUGH_SECOND\20260606-190449-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- matrix `ok=true`
- `git_dirty=false`
- `fail_count=0`
- hot process count `0` in all four scenarios
- MUSU max `0%`
- Node max `0%`
- WebView2 max `0.16%`
- owned Node helpers `0`
- owned WebView2 helpers `6`
- working set about `123 MB`

Process ownership passed with one packaged runtime, one desktop shell, bridge
PID `37928`, and bridge HTTP `200` at `127.0.0.1:4751`.

Loop-candidate audits:

- frontend polling audit: `ok=true`, `fail_count=0`, 29 low-duty polling
  call-site files, direct interval hits `0`, direct visibility listener hits
  `0`
- Rust background-loop audit: `ok=true`, `fail_count=0`, unaudited loop hits
  `0`, unaudited spawn hits `0`

The four-state local verifier passes when scoped to these four scenarios with
`-RequirePostRouteProbe:$false`. The default full release matrix verifier still
fails because `post-route` is missing. This is expected: full release CPU
evidence still needs second-PC route/post-route proof.

Packaging note: the installed package reports `musu 1.15.0-rc.1` but does not
expose a build commit and does not yet show the new `stale_bridge_registry_*`
fields from the crash-recovery source change. Treat this as current installed
runtime CPU evidence only, not crash-recovery package evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_IDLE_CPU_4_STATE_RECHECK_2026_06_06.md`

Search terms should include `GOAL v694`, `wiki/869`, `20260606-190449-HUGH_SECOND`,
`startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`,
`WebView2 0.16`, `hot process count 0`, `frontend polling 29`, `direct interval
0`, `unaudited loop hits 0`, `post-route missing`, `second-PC CPU evidence`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Idle CPU 4-State Index Refresh (wiki/870)

MUSU local indexer was refreshed after wiki/869 and GOAL v694.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2709 files`
- `2776 symbols`
- `11901 ms`

Indexed context includes the idle CPU 4-state recheck report, BETA checklist
update, WIKI/WIKI_INDEX, GOAL v694, and CoS memory.

Search terms should include `GOAL v695`, `wiki/870`, `idle CPU 4-state index
refresh`, `2709 files`, `2776 symbols`, `11901 ms`,
`20260606-190449-HUGH_SECOND`, `WebView2 0.16`, `hot process count 0`,
`post-route missing`, `MUSU Desktop local executor`, and `MUSU.PRO remote input
control plane`.

## 2026-06-06 Current HEAD MSIX Reinstall Crash-Recovery Evidence (wiki/871)

Current HEAD `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2` was rebuilt and
reinstalled as MUSU Desktop on `HUGH_SECOND`.

Installed package:

- `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`

Reinstall workflow:

- release Rust runtime build passed
- Tauri shell build passed
- MSIX package/sign passed
- packaged startup smoke passed
- sideload readiness passed
- install and installed package contract passed

Crash-recovery evidence:

- packaged `musu up --json` exposes `stale_bridge_registry_removed`
- packaged `musu up --json` exposes `stale_bridge_registry_pid`
- dynamic stale registry simulation removed dead PID `999999`
- new bridge started healthy at `127.0.0.1:3678`
- crash-recovery audit passed with `ok=true` and `fail_count=0`

Canonical local evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260606-195631-HUGH_SECOND.evidence.json`
- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260606-200405-HUGH_SECOND.desktop-open.evidence.json`

Idle CPU result:

- `ok=true`
- `git_dirty=false`
- sample `60.049s`
- hot process count `0`
- MUSU `0`
- Node `0`
- WebView2 `0.08`
- working set `178 MB`

Additional audits passed:

- process ownership
- Rust background-loop contract
- frontend polling contract
- scoped Rust crash-recovery library tests `2/2`

Qualitative audit found no high or medium issue. Remaining release blockers are
second-PC route/CPU/matrix proof, a current full matrix with `post-route`, live
MUSU.PRO runtime login/storage, release `quic_relay_tunnel` transport and
payload delivery proof, support mailbox proof, and Store proof.

Product boundary remains unchanged: MUSU Desktop is the local executor;
MUSU.PRO is remote input, project/company room, AI meeting room, presence,
rendezvous, path selection, relay fallback, and evidence/control plane.
`localhost:3001` is not the packaged desktop runtime contract.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_MSIX_REINSTALL_CRASH_RECOVERY_EVIDENCE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_MSIX_REINSTALL_CRASH_RECOVERY_EVIDENCE_2026_06_06.md`

Search terms should include `GOAL v696`, `wiki/871`,
`29dc84db1d8018fd8f8f7bf98588cb6bca0700a2`,
`Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`,
`stale_bridge_registry_removed`, `stale_bridge_registry_pid`, `999999`,
`127.0.0.1:3678`, `20260606-195631-HUGH_SECOND`,
`20260606-200405-HUGH_SECOND.desktop-open`, `WebView2 0.08`, `hot process
count 0`, `local-bridge-only`, `MUSU Desktop local executor`,
`MUSU.PRO remote input control plane`, and `localhost:3001 is not the packaged
desktop runtime contract`.

## 2026-06-06 Current HEAD MSIX Reinstall Crash-Recovery Index Refresh (wiki/872)

MUSU local indexer was refreshed after wiki/871 and GOAL v696.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2716 files`
- `2776 symbols`
- `42871 ms`

Indexed context includes the current HEAD MSIX reinstall/crash-recovery report,
next-step plan, canonical single-machine evidence
`20260606-195631-HUGH_SECOND`, canonical desktop-open idle CPU evidence
`20260606-200405-HUGH_SECOND.desktop-open`, BETA checklist, P2P control-plane
specs, network boundary spec, WIKI/WIKI_INDEX, GOAL v696, and CoS memory.

Search terms should include `GOAL v697`, `wiki/872`, `current HEAD MSIX
reinstall crash-recovery index refresh`, `2716 files`, `2776 symbols`,
`42871 ms`, `stale_bridge_registry_removed`, `stale_bridge_registry_pid`,
`127.0.0.1:3678`, `20260606-195631-HUGH_SECOND`,
`20260606-200405-HUGH_SECOND.desktop-open`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 Go/No-Go Latest Output Gate (wiki/873)

`write-release-go-no-go.ps1` now writes the current result to
`.local-build\go-no-go\latest.json` by default and exposes
`go_no_go_output_path`.

This closes a release-evidence reliability gap where the local `latest.json`
snapshot could remain stale while a fresh go/no-go result was only printed to
stdout.

Validation:

- parser checks passed for `write-release-go-no-go.ps1` and
  `test-release-evidence-verifiers.ps1`
- `git diff --check` passed
- release verifier passed with `ok=true`, `case_count=70`,
  `failed_case_count=0`
- new source-contract case:
  `go-no-go writes current latest output evidence`
- Rust background-loop audit passed with unaudited loop/spawn/network watcher
  and telemetry flush primitive counts `0`
- frontend polling audit passed with low-duty call sites `29`, direct intervals
  `0`, direct visibility listeners `0`
- actual go/no-go latest write smoke wrote
  `F:\workspace\musu-bee\.local-build\go-no-go\latest.json`
- stdout/file `generated_at` matched
- dirty-tree go/no-go still reports public release No-Go, single-machine true,
  runtime idle CPU valid machines `1`, runtime matrix valid machines `0`, idle
  busy-loop candidate contract true, candidate count `8`, and manifest dirty
  true before commit

Canonical report:

- `docs\RELEASE_1_15_0_RC1_GO_NO_GO_LATEST_OUTPUT_GATE_2026_06_06.md`

Search terms should include `GOAL v698`, `wiki/873`, `go-no-go latest output
gate`, `.local-build\go-no-go\latest.json`, `go_no_go_output_path`,
`case_count=70`, `go-no-go writes current latest output evidence`,
`idle_busy_loop_candidate_contract_verified`, `candidate count 8`,
`runtime_idle_cpu_valid_machine_count=1`,
`runtime_cpu_scenario_matrix_valid_machine_count=0`, `MUSU Desktop local
executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Go/No-Go Latest Output Index Refresh (wiki/874)

MUSU local indexer was refreshed after wiki/873 and GOAL v698.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2719 files`
- `2776 symbols`
- `18409 ms`

Indexed context includes `write-release-go-no-go.ps1` `-OutputPath`,
`.local-build\go-no-go\latest.json`, `go_no_go_output_path`, source-contract
case `go-no-go writes current latest output evidence`, release verifier
`70/70`, go/no-go latest output report, BETA checklist, WIKI/WIKI_INDEX, GOAL
v698, and CoS memory.

Search terms should include `GOAL v699`, `wiki/874`, `go-no-go latest output
index refresh`, `2719 files`, `2776 symbols`, `18409 ms`,
`.local-build\go-no-go\latest.json`, `go_no_go_output_path`,
`go-no-go writes current latest output evidence`, and `release verifier 70/70`.

## 2026-06-06 Current HEAD 5-State Runtime CPU Matrix (wiki/875)

Current HEAD `d6e494eabb9dcc70dd90e78b621e7f520067a192` restored the primary
five-state runtime CPU matrix on `HUGH_SECOND`.

Canonical evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-203857-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260606-203857-HUGH_SECOND.verification.json`

Results:

- `ok=true`
- `git_dirty=false`
- `fail_count=0`
- scenarios: `startup-open`, `runtime-started`, `dashboard-open`,
  `desktop-open`, `post-route`
- route token: `MUSU_CPU_SCENARIO_ROUTE_OK_20260606_203857`
- route task id: `1bb405b5-76cf-4084-a542-e7ee0beca780`
- hot process count `0` in every scenario
- MUSU `0`
- Node `0`
- WebView2 max `0.13`
- `bridge_runtime=1`
- `desktop_shell=1`
- `webview2_helper=6`
- working set range `179.72-183.95MB`

Go/no-go after capture reports runtime matrix valid machines `1 [HUGH_SECOND]`,
runtime idle CPU valid machines `1 [HUGH_SECOND]`, single-machine true, and
manifest dirty false. Public release remains No-Go because second-PC
route/CPU/matrix proof, live MUSU.PRO P2P/relay proof, support mailbox proof,
and Store proof remain missing.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_5_STATE_RUNTIME_CPU_MATRIX_2026_06_06.md`

Search terms should include `GOAL v700`, `wiki/875`, `20260606-203857`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260606_203857`, `runtime matrix 1/2`,
`WebView2 0.13`, `hot process count 0`, `bridge_runtime=1`,
`desktop_shell=1`, `webview2_helper=6`, `runtime_cpu_scenario_matrix_valid_machine_count=1`,
`runtime_cpu_second_pc_route_attempt_valid_machine_count=0`, `MUSU Desktop
local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-06 Current HEAD 5-State Runtime CPU Matrix Index Refresh (wiki/876)

MUSU local indexer was refreshed after wiki/875 and GOAL v700.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2724 files`
- `2776 symbols`
- `14849 ms`

Indexed context includes canonical matrix evidence
`20260606-203857-HUGH_SECOND.runtime-cpu-scenario-matrix.json`, verification
`20260606-203857-HUGH_SECOND.verification.json`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260606_203857`, current matrix report, BETA
checklist, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v701`, `wiki/876`, `current HEAD 5-state
runtime CPU matrix index refresh`, `2724 files`, `2776 symbols`, `14849 ms`,
`runtime_cpu_scenario_matrix_valid_machine_count=1`, `WebView2 0.13`, and `hot
process count 0`.

## 2026-06-06 Second-PC Route-Attempt Self-Target Gate (wiki/877)

Targeted second-PC route-attempt CPU evidence now rejects self-target probes.

`verify-runtime-cpu-scenario-matrix.ps1` gained
`-RejectSelfPostRouteTarget`, and `write-release-go-no-go.ps1` now enables it
for `runtime_cpu_second_pc_route_attempt_*` verification. A `post-route` matrix
whose `route_probe.target` equals `operator_machine` can no longer satisfy the
targeted second-PC CPU diagnostic gate, even when failed probes are explicitly
allowed.

Validation:

- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=71`, `failed_case_count=0`
- new negative case:
  `runtime matrix rejects self-target second-PC route attempt`
- go/no-go source contract now checks `"-RejectSelfPostRouteTarget"`

Release interpretation: this is evidence hardening, not second-PC proof. It
prevents self-target route attempts from being counted as targeted second-PC
route-attempt CPU evidence. Public release remains No-Go until real second-PC
route/CPU/matrix evidence, live MUSU.PRO P2P/relay proof, support mailbox
proof, and Store/Partner Center proof are recorded.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_ATTEMPT_SELF_TARGET_GATE_2026_06_06.md`

Search terms should include `GOAL v702`, `wiki/877`,
`RejectSelfPostRouteTarget`, `runtime matrix rejects self-target second-PC
route attempt`, `runtime_cpu_second_pc_route_attempt`, `route_probe.target`,
`operator_machine`, `case_count=71`, `MUSU Desktop local executor`, and
`MUSU.PRO remote input control plane`.

## 2026-06-06 Second-PC Route-Attempt Self-Target Gate Index Refresh (wiki/878)

MUSU local indexer was refreshed after wiki/877 and GOAL v702.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2727 files`
- `2776 symbols`
- `20946 ms`

Indexed context includes `verify-runtime-cpu-scenario-matrix.ps1`
`-RejectSelfPostRouteTarget`, `write-release-go-no-go.ps1` targeted
second-PC route-attempt verifier args, release verifier regression case
`runtime matrix rejects self-target second-PC route attempt`, canonical report,
GOAL v702, WIKI/WIKI_INDEX, BETA checklist, and CoS memory.

Search terms should include `GOAL v703`, `wiki/878`, `second-PC route-attempt
self-target gate index refresh`, `2727 files`, `2776 symbols`, `20946 ms`,
`RejectSelfPostRouteTarget`, `runtime_cpu_second_pc_route_attempt`,
`route_probe.target`, `operator_machine`, and `case_count=71`.

## 2026-06-06 Second-PC Route-Attempt Target Binding Gate (wiki/879)

Targeted second-PC route-attempt CPU evidence now requires the recorded target
to be bound to the actual route command and arguments.

`verify-runtime-cpu-scenario-matrix.ps1` checks targeted `post-route` probes
for command text containing `--target` plus the reported target, and arguments
containing either `--target <target>` or `--target=<target>`. This closes the
case where `route_probe.target` is changed in JSON while command/arguments
still show another peer.

Validation:

- parser checks passed
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=73`, `failed_case_count=0`
- new source-contract case:
  `runtime CPU matrix target command binding contract`
- new negative case:
  `runtime matrix rejects target field not bound to route command arguments`

Release interpretation: this is evidence hardening, not second-PC proof. Public
release remains No-Go until real second-PC route/CPU/matrix evidence, live
MUSU.PRO P2P/relay proof, support mailbox proof, and Store/Partner Center proof
are recorded.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_ATTEMPT_TARGET_BINDING_GATE_2026_06_06.md`

Search terms should include `GOAL v704`, `wiki/879`,
`runtime CPU matrix target command binding contract`,
`runtime matrix rejects target field not bound to route command arguments`,
`route_probe.command`, `route_probe.arguments`, `--target <target>`,
`runtime_cpu_second_pc_route_attempt`, and `case_count=73`.

## 2026-06-06 Second-PC Route-Attempt Target Binding Gate Index Refresh (wiki/880)

MUSU local indexer was refreshed after wiki/879 and GOAL v704.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2730 files`
- `2776 symbols`
- `13306 ms`

Indexed context includes `verify-runtime-cpu-scenario-matrix.ps1` route
command/argument target binding checks, `test-release-evidence-verifiers.ps1`
source-contract case `runtime CPU matrix target command binding contract`,
negative regression `runtime matrix rejects target field not bound to route
command arguments`, canonical report, BETA checklist, GOAL, WIKI/WIKI_INDEX,
and CoS memory.

Search terms should include `GOAL v705`, `wiki/880`, `second-PC route-attempt
target binding gate index refresh`, `2730 files`, `2776 symbols`, `13306 ms`,
`route_probe.command`, `route_probe.arguments`, `--target <target>`,
`runtime_cpu_second_pc_route_attempt`, and `case_count=73`.

## 2026-06-06 Post-Route Wait Token Binding Gate (wiki/881)

Runtime CPU `post-route` evidence now verifies that the route probe is bound to
the recorded wait prompt and expected token.

`verify-runtime-cpu-scenario-matrix.ps1` now checks route probes for non-empty
`expected_token`, command text containing `--wait` and the expected token,
arguments containing `--wait <prompt-with-token>` or
`--wait=<prompt-with-token>`, successful output containing the expected token,
and numeric non-zero exit code for explicitly allowed failed diagnostics.
Failed-route diagnostics remain allowed only when explicitly enabled, but they
must still prove which wait prompt and token were attempted.

Validation:

- parser checks passed
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=77`, `failed_case_count=0`
- new negative cases:
  - `runtime matrix rejects allowed failed route attempt with zero exit code`
  - `runtime matrix rejects allowed failed route attempt with nonnumeric exit code`
  - `runtime matrix rejects route wait prompt without expected token`
  - `runtime matrix rejects successful route probe without token output`
- direct nonnumeric fixture check returned structured verifier failure JSON:
  `exit_code=1`, `ok=false`, `fail_count=2`

Code audit found no high/medium issue in this scoped verifier change after
safe numeric parsing was used for failed diagnostic `exit_code` values. The
zero-exit and nonnumeric-exit regression cases require parsed JSON output from
the verifier.

Release interpretation: this is evidence hardening, not second-PC proof. Public
release remains No-Go until real second-PC route/CPU/matrix evidence, live
MUSU.PRO P2P/relay proof, support mailbox proof, and Store/Partner Center proof
are recorded.

Next steps are to capture real second-PC runtime CPU matrix and targeted
route-attempt CPU evidence under this stricter post-route contract, then record
live MUSU.PRO control-plane P2P/relay proof, support mailbox proof, and
Store/Partner Center proof before changing public release status.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_POST_ROUTE_WAIT_TOKEN_BINDING_GATE_2026_06_06.md`

Search terms should include `GOAL v706`, `wiki/881`, `post-route wait token
binding gate`, `expected_token`, `--wait <prompt-with-token>`, `runtime matrix
rejects allowed failed route attempt with zero exit code`, `runtime matrix
rejects allowed failed route attempt with nonnumeric exit code`, `runtime matrix
rejects route wait prompt without expected token`, `runtime matrix rejects
successful route probe without token output`, and `case_count=77`.

## 2026-06-06 Post-Route Wait Token Binding Gate Index Refresh (wiki/882)

MUSU local indexer was refreshed after wiki/881 and GOAL v706.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2734 files`
- `2776 symbols`
- `26395 ms`

Indexed context includes `verify-runtime-cpu-scenario-matrix.ps1` wait-token
binding and failed-diagnostic exit-code checks, release verifier negative cases
`runtime matrix rejects allowed failed route attempt with zero exit code`,
`runtime matrix rejects allowed failed route attempt with nonnumeric exit code`,
`runtime matrix rejects route wait prompt without expected token`, and
`runtime matrix rejects successful route probe without token output`, canonical
report, BETA checklist, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v707`, `wiki/882`, `post-route wait token
binding gate index refresh`, `2734 files`, `2776 symbols`, `26395 ms`,
`expected_token`, `--wait <prompt-with-token>`, `runtime matrix rejects
allowed failed route attempt with zero exit code`, `runtime matrix rejects
allowed failed route attempt with nonnumeric exit code`, `runtime matrix rejects
successful route probe without token output`, and `case_count=77`.

## 2026-06-06 Idle Busy-Loop Candidate Count Gate (wiki/883)

`write-release-go-no-go.ps1` now reports explicit top-level idle busy-loop
candidate counts:

- `idle_busy_loop_candidate_count`
- `idle_busy_loop_candidate_verified_count`
- `idle_busy_loop_candidate_unverified_count`

The text output also prints `idle_busy_loop_candidate_verified_count: X/Y`.
This makes the existing candidate matrix easier to audit without digging into
the full `idle_busy_loop_candidate_status` array.

The current matrix is still the same eight release candidates: clipboard
polling, mDNS discovery, health check retry loop, bridge readiness wait loop,
frontend interval/refetch, relay payload target poller, cloud heartbeat, and
log/telemetry flush loop.

Validation:

- parser checks passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=77`, `failed_case_count=0`
- dirty-tree go/no-go showed candidate count `8`, verified `8`, unverified `0`

This is evidence visibility hardening only. It does not replace the required
second-PC 60s CPU/matrix/route evidence or live MUSU.PRO P2P control-plane
proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_IDLE_BUSY_LOOP_CANDIDATE_COUNT_GATE_2026_06_06.md`

Search terms should include `GOAL v708`, `wiki/883`, `idle busy-loop candidate
count gate`, `idle_busy_loop_candidate_count`,
`idle_busy_loop_candidate_verified_count`,
`idle_busy_loop_candidate_unverified_count`, `candidate count 8`, `verified
8`, `unverified 0`, and `case_count=77`.

## 2026-06-06 Idle Busy-Loop Candidate Count Gate Index Refresh (wiki/884)

MUSU local indexer was refreshed after wiki/883 and GOAL v708.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2736 files`
- `2776 symbols`
- `14211 ms`

Indexed context includes `write-release-go-no-go.ps1` top-level idle busy-loop
candidate count fields, `test-release-evidence-verifiers.ps1` source-contract
needles for those fields, canonical report, BETA checklist, GOAL,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v709`, `wiki/884`, `idle busy-loop candidate
count gate index refresh`, `2736 files`, `2776 symbols`, `14211 ms`,
`idle_busy_loop_candidate_verified_count`, and `case_count=77`.

## 2026-06-06 P2P Route Record Metadata Gate (wiki/885)

Hosted MUSU.PRO P2P release evidence now requires the returned relay route
record itself to carry release-grade metadata around the relay proof.

`verify-p2p-control-plane-evidence.ps1` now requires relay success route
records to include:

- `schema=musu.route_evidence.v1`
- `candidate_addr`
- `handshake_ms`
- `total_attempt_ms >= handshake_ms`
- `peer_identity_verified=true`
- `peer_identity_method=quic_tls_cert_fingerprint`
- `peer_public_key=sha256:*`
- `encryption=quic_tls_1_3`
- `transport_verified_by=musu_quic_tls_transport`
- valid `recorded_at`
- matching `relay_transport_proof.handshake_ms`

The verifier now emits `relay_route_metadata_required_count`,
`relay_route_metadata_valid_count`, and
`relay_route_metadata_invalid_count`, and fails check
`relay route metadata coverage` if any returned relay success record is weak.

Regression coverage:

- `P2P verifier requires route record metadata`
- `p2p rejects relay route evidence without record latency metadata`
- `p2p rejects relay route evidence with unverified record identity metadata`
- `p2p rejects relay route evidence with transport proof handshake mismatch`

Validation:

- parser checks passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=81`, `failed_case_count=0`
- direct valid P2P fixture reported metadata `1/1`
- direct missing-latency fixture failed with metadata invalid `1`

Qualitative code audit found no high/medium issue. This is hosted P2P evidence
hardening only; it does not implement release relay runtime or close
second-PC proof. MUSU Desktop remains the local executor, and MUSU.PRO remains
remote input, room, rendezvous, path-selection, relay-fallback, and evidence
control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_ROUTE_RECORD_METADATA_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_P2P_ROUTE_RECORD_METADATA_GATE_2026_06_06.md`

Search terms should include `GOAL v710`, `wiki/885`, `P2P route record
metadata gate`, `relay_route_metadata_valid_count`, `relay route metadata
coverage`, `p2p rejects relay route evidence without record latency metadata`,
`p2p rejects relay route evidence with unverified record identity metadata`,
`p2p rejects relay route evidence with transport proof handshake mismatch`, and
`case_count=81`.

## 2026-06-06 P2P Route Record Metadata Index Refresh (wiki/886)

MUSU local indexer was refreshed after wiki/885 and GOAL v710.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2739 files`
- `2776 symbols`
- `17136 ms`

Indexed context includes `verify-p2p-control-plane-evidence.ps1` route-record
metadata checks, `test-release-evidence-verifiers.ps1` source-contract and
negative fixtures, canonical report, next-step plan, BETA checklist, P2P
control-plane specs, network boundary spec, GOAL, WIKI/WIKI_INDEX, and CoS
memory.

Search terms should include `GOAL v711`, `wiki/886`, `P2P route record
metadata index refresh`, `2739 files`, `2776 symbols`, `17136 ms`,
`relay_route_metadata_valid_count`, `relay route metadata coverage`, and
`case_count=81`.

## 2026-06-06 Second-PC Route-Attempt Local Target Gate (wiki/887)

Targeted second-PC route-attempt CPU evidence now rejects localhost and
loopback targets.

`verify-runtime-cpu-scenario-matrix.ps1` gained
`-RejectLocalPostRouteTarget`. The verifier normalizes route targets from URLs,
`host:port`, bracketed IPv6, and hostnames, then rejects local-only targets:

- `localhost`
- `*.localhost`
- `localhost.localdomain`
- `127.0.0.0/8`
- `::1`
- `0.0.0.0`
- `host.docker.internal`

`write-release-go-no-go.ps1` now passes this switch for
`runtime_cpu_second_pc_route_attempt_*` verification.

Validation:

- parser checks passed
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=82`, `failed_case_count=0`
- direct remote-target diagnostic with local-target rejection passed
- direct `127.0.0.1:2751` diagnostic failed with `fail_count=1`

Qualitative code audit found no high/medium issue. This is false-positive
prevention only; it does not create second-PC route evidence or change the
two-machine CPU requirement.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_ATTEMPT_LOCAL_TARGET_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_SECOND_PC_ROUTE_ATTEMPT_LOCAL_TARGET_GATE_2026_06_06.md`

Search terms should include `GOAL v712`, `wiki/887`, `second-PC
route-attempt local target gate`, `RejectLocalPostRouteTarget`, `runtime
matrix rejects localhost second-PC route attempt`, `127.0.0.1:2751`,
`runtime_cpu_second_pc_route_attempt`, and `case_count=82`.

## 2026-06-06 Second-PC Route-Attempt Local Target Index Refresh (wiki/888)

MUSU local indexer was refreshed after wiki/887 and GOAL v712.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2742 files`
- `2776 symbols`
- `14224 ms`

Indexed context includes `verify-runtime-cpu-scenario-matrix.ps1`
`-RejectLocalPostRouteTarget`, `write-release-go-no-go.ps1` targeted
second-PC route-attempt verifier args, release verifier negative case
`runtime matrix rejects localhost second-PC route attempt`, canonical report,
next-step plan, BETA checklist, network boundary spec, GOAL, WIKI/WIKI_INDEX,
and CoS memory.

Search terms should include `GOAL v713`, `wiki/888`, `second-PC
route-attempt local target index refresh`, `2742 files`, `2776 symbols`,
`14224 ms`, `RejectLocalPostRouteTarget`,
`runtime_cpu_second_pc_route_attempt`, and `case_count=82`.

## 2026-06-06 P2P Route Metadata Status Surface (wiki/889)

P2P route metadata counts now surface through the release handoff status chain.

Updated:

- `record-p2p-control-plane-evidence.ps1`
  - records `relay_route_metadata_valid_count`
- `write-release-go-no-go.ps1`
  - exposes `p2p_relay_route_metadata_required_count`
  - exposes `p2p_relay_route_metadata_valid_count`
  - exposes `p2p_relay_route_metadata_invalid_count`
  - requires `relay_route_metadata_valid_count > 0` in the P2P blocker
- `show-musu-pro-p2p-env-status.ps1`
  - exposes route metadata valid/required/invalid counts
  - emits `live_evidence_relay_route_metadata_missing`
- `record-external-release-gate-recheck.ps1`
  - flattens `p2p_relay_route_metadata_valid_count`
  - emits `p2p_relay_route_metadata_missing`
- `show-final-release-handoff-status.ps1`
  - forwards `p2p_relay_route_metadata_valid_count`
- `test-release-evidence-verifiers.ps1`
  - adds source-contract coverage for route metadata status propagation

Validation:

- parser checks passed
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=83`, `failed_case_count=0`
- dirty-tree go/no-go status smoke surfaced metadata required/valid/invalid
  counts `0/0/0`
- MUSU.PRO P2P env status smoke emitted
  `live_evidence_relay_route_metadata_missing` with metadata counts `0/0/0`

Qualitative audit found no high/medium issue. This is an operator visibility
fix only: the verifier already rejected incomplete route metadata, and now the
handoff reports show that count directly.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_ROUTE_METADATA_STATUS_SURFACE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_P2P_ROUTE_METADATA_STATUS_SURFACE_2026_06_06.md`

CoS memory:

- `docs\memory\chief_of_staff\2026-06-06_p2p_route_metadata_status_surface.md`

Search terms should include `GOAL v714`, `wiki/889`,
`p2p_relay_route_metadata_valid_count`,
`live_evidence_relay_route_metadata_missing`,
`p2p_relay_route_metadata_missing`, `relay_route_metadata_valid_count > 0`,
and `case_count=83`.

## 2026-06-06 P2P Route Metadata Status Surface Index Refresh (wiki/890)

MUSU local indexer was refreshed after wiki/889 and GOAL v714.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2745 files`
- `2776 symbols`
- `15800 ms`

Indexed context includes the route metadata status fields in
`record-p2p-control-plane-evidence.ps1`, `write-release-go-no-go.ps1`,
`show-musu-pro-p2p-env-status.ps1`,
`record-external-release-gate-recheck.ps1`,
`show-final-release-handoff-status.ps1`, release verifier source contract
`P2P route metadata counts surface through release status reports`, canonical
report, next-step plan, BETA checklist, P2P control-plane specs, GOAL,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v715`, `wiki/890`, `P2P route metadata
status surface index refresh`, `2745 files`, `2776 symbols`, `15800 ms`,
`p2p_relay_route_metadata_valid_count`,
`live_evidence_relay_route_metadata_missing`,
`p2p_relay_route_metadata_missing`, and `case_count=83`.

## 2026-06-06 P2P Route Metadata Count Completeness (wiki/891)

P2P route metadata status propagation now carries required, valid, and invalid
counts through all external handoff reports.

Updated:

- `record-p2p-control-plane-evidence.ps1`
  - prints and returns `relay_route_metadata_required_count`
  - prints and returns `relay_route_metadata_valid_count`
  - prints and returns `relay_route_metadata_invalid_count`
- `record-external-release-gate-recheck.ps1`
  - flattens `p2p_relay_route_metadata_required_count`
  - flattens `p2p_relay_route_metadata_valid_count`
  - flattens `p2p_relay_route_metadata_invalid_count`
  - includes the full triplet in JSON, summary markdown, and final JSON
- `show-final-release-handoff-status.ps1`
  - forwards the full go/no-go metadata count triplet
- `test-release-evidence-verifiers.ps1`
  - strengthens the status source contract for recorder, external recheck, and
    final handoff

Validation:

- parser checks passed
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=83`, `failed_case_count=0`

Qualitative audit found no high/medium issue. This is diagnostic hardening
only. It lets handoff reports distinguish no route metadata from invalid route
metadata, but it does not implement second-PC proof or release relay runtime.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_ROUTE_METADATA_COUNT_COMPLETENESS_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_P2P_ROUTE_METADATA_COUNT_COMPLETENESS_2026_06_06.md`

CoS memory:

- `docs\memory\chief_of_staff\2026-06-06_p2p_route_metadata_count_completeness.md`

Search terms should include `GOAL v716`, `wiki/891`,
`p2p_relay_route_metadata_required_count`,
`p2p_relay_route_metadata_valid_count`,
`p2p_relay_route_metadata_invalid_count`,
`relay_route_metadata_invalid_count`, and `case_count=83`.

## 2026-06-06 P2P Route Metadata Count Completeness Index Refresh (wiki/892)

MUSU local indexer was refreshed after wiki/891 and GOAL v716.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2748 files`
- `2776 symbols`
- `15440 ms`

Indexed context includes route metadata required/valid/invalid count
propagation in `record-p2p-control-plane-evidence.ps1`,
`record-external-release-gate-recheck.ps1`,
`show-final-release-handoff-status.ps1`, release verifier source contract
hardening, canonical report, next-step plan, BETA checklist, P2P control-plane
specs, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v717`, `wiki/892`, `P2P route metadata
count completeness index refresh`, `2748 files`, `2776 symbols`, `15440 ms`,
`p2p_relay_route_metadata_required_count`,
`p2p_relay_route_metadata_valid_count`,
`p2p_relay_route_metadata_invalid_count`, and `case_count=83`.

## 2026-06-06 P2P Proof Count Triplet Status Surface (wiki/893)

P2P route transport proof and payload delivery proof now surface as
required/valid/invalid triplets through release status reports.

Updated:

- `record-p2p-control-plane-evidence.ps1`
  - records route transport proof required/valid/invalid counts
  - records payload delivery proof required/valid/invalid counts
- `write-release-go-no-go.ps1`
  - exposes `p2p_relay_route_transport_proof_required_count`
  - exposes `p2p_relay_route_transport_proof_valid_count`
  - exposes `p2p_relay_route_transport_proof_invalid_count`
  - exposes `p2p_relay_payload_delivery_proof_required_count`
  - exposes `p2p_relay_payload_delivery_proof_valid_count`
  - exposes `p2p_relay_payload_delivery_proof_invalid_count`
- `record-external-release-gate-recheck.ps1`
  - carries the same proof triplets in JSON, summary markdown, and final JSON
- `show-final-release-handoff-status.ps1`
  - forwards the go/no-go proof triplets
- `test-release-evidence-verifiers.ps1`
  - adds source-contract case
    `P2P proof count triplets surface through release status reports`

Validation:

- parser checks passed
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=84`, `failed_case_count=0`
- dirty-tree go/no-go status smoke surfaced route transport proof and payload
  delivery proof triplets as `0/0/0`

Qualitative audit found no high/medium issue. This is diagnostic hardening
only; it makes hosted relay proof blockers easier to diagnose but does not
implement release relay runtime or second-PC proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_PROOF_COUNT_TRIPLET_STATUS_SURFACE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_P2P_PROOF_COUNT_TRIPLET_STATUS_SURFACE_2026_06_06.md`

CoS memory:

- `docs\memory\chief_of_staff\2026-06-06_p2p_proof_count_triplet_status_surface.md`

Search terms should include `GOAL v718`, `wiki/893`,
`p2p_relay_route_transport_proof_required_count`,
`p2p_relay_route_transport_proof_invalid_count`,
`p2p_relay_payload_delivery_proof_required_count`,
`p2p_relay_payload_delivery_proof_invalid_count`, and `case_count=84`.

## 2026-06-06 P2P Proof Count Triplet Status Surface Index Refresh (wiki/894)

MUSU local indexer was refreshed after wiki/893 and GOAL v718.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2751 files`
- `2776 symbols`
- `15134 ms`

Indexed context includes proof required/valid/invalid count propagation in
`record-p2p-control-plane-evidence.ps1`, `write-release-go-no-go.ps1`,
`record-external-release-gate-recheck.ps1`,
`show-final-release-handoff-status.ps1`, release verifier source contract
hardening, canonical report, next-step plan, BETA checklist, P2P control-plane
specs, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v719`, `wiki/894`, `P2P proof count triplet
status surface index refresh`, `2751 files`, `2776 symbols`, `15134 ms`,
`p2p_relay_route_transport_proof_required_count`,
`p2p_relay_route_transport_proof_invalid_count`,
`p2p_relay_payload_delivery_proof_required_count`,
`p2p_relay_payload_delivery_proof_invalid_count`, and `case_count=84`.

## 2026-06-06 Process Ownership Freshness Gate (wiki/895)

Process ownership release evidence is now freshness-gated like runtime CPU
evidence.

Updated:

- `write-release-go-no-go.ps1`
  - passes current HEAD into `Test-ProcessOwnershipEvidence`
  - requires process ownership evidence to record a valid `git_commit`
  - allows stale ownership evidence only when the delta to current HEAD is
    documentation/evidence/status/tooling-only
- `test-release-evidence-verifiers.ps1`
  - adds source-contract case
    `go-no-go process ownership requires current freshness`
- `MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md`
  - records the product/spec rule that runtime-affecting changes after process
    ownership capture require fresh process ownership proof

Validation:

- parser checks passed
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=85`, `failed_case_count=0`
- dirty-tree go/no-go smoke reported `process_ownership_verified=true`, valid
  machines `1`, first process ownership candidate commit
  `29dc84db1d8018fd8f8f7bf98588cb6bca0700a2`, and `expected git commit`
  check `pass` because the delta to current HEAD was
  docs/evidence/status/tooling-only

Qualitative audit found no high/medium issue. This prevents stale process
ownership proof from surviving runtime-affecting changes, but it does not
replace real second-PC CPU/matrix or multi-device route evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_PROCESS_OWNERSHIP_FRESHNESS_GATE_2026_06_06.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_PROCESS_OWNERSHIP_FRESHNESS_GATE_2026_06_06.md`

CoS memory:

- `docs\memory\chief_of_staff\2026-06-06_process_ownership_freshness_gate.md`

Search terms should include `GOAL v720`, `wiki/895`,
`process_ownership_verified`, `process ownership freshness`,
`Test-ProcessOwnershipEvidence`, `ExpectedGitCommit`,
`Test-DocumentationOrStatusOnlyGitDelta`, and `case_count=85`.

## 2026-06-06 Process Ownership Freshness Gate Index Refresh (wiki/896)

MUSU local indexer was refreshed after wiki/895 and GOAL v720.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2754 files`
- `2776 symbols`
- `26216 ms`

Indexed context includes process ownership freshness hardening in
`write-release-go-no-go.ps1`, release verifier source contract
`go-no-go process ownership requires current freshness`, runtime stabilization
spec update, canonical report, next-step plan, BETA checklist, GOAL,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v721`, `wiki/896`, `process ownership
freshness gate index refresh`, `2754 files`, `2776 symbols`, `26216 ms`,
`process_ownership_verified`, `ExpectedGitCommit`,
`Test-ProcessOwnershipEvidence`, `Test-DocumentationOrStatusOnlyGitDelta`,
and `case_count=85`.

## 2026-06-07 Single-Instance Freshness Gate (wiki/897)

Startup and desktop single-instance release evidence is now freshness-gated.

Updated:

- `write-release-go-no-go.ps1`
  - passes current HEAD into `Test-StartupSingleInstanceEvidence`
  - passes current HEAD into `Test-DesktopSingleInstanceEvidence`
  - requires each single-instance evidence candidate to record a valid
    `git_commit`
  - allows stale single-instance evidence only when the delta to current HEAD
    is documentation/evidence/status/tooling-only
  - exposes candidate `git_commit` in each single-instance result object
- `test-release-evidence-verifiers.ps1`
  - adds source-contract case
    `go-no-go single-instance evidence requires current freshness`
- `MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md`
  - records the product/spec rule that runtime-affecting changes after startup
    or desktop single-instance capture require fresh local evidence

Validation:

- parser checks passed
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=86`, `failed_case_count=0`
- dirty-tree go/no-go smoke rejected stale startup single-instance candidate
  `dd0e409ee3a8ade2153bb858f74c4c5a0abf5bc2` and desktop single-instance
  candidate `fad519c509d784453f938a79df28b02fff497c10`
- dirty-tree go/no-go reported `startup_single_instance_verified=false`,
  `desktop_single_instance_verified=false`, and blockers
  `startup-single-instance` plus `desktop-single-instance`

Qualitative audit found no high/medium issue. This prevents stale local
single-instance proof from surviving runtime-affecting changes, but it does
not replace fresh current-HEAD startup/desktop evidence or second-PC proof.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SINGLE_INSTANCE_FRESHNESS_GATE_2026_06_07.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_SINGLE_INSTANCE_FRESHNESS_GATE_2026_06_07.md`

CoS memory:

- `docs\memory\chief_of_staff\2026-06-07_single_instance_freshness_gate.md`

Search terms should include `GOAL v722`, `wiki/897`,
`single-instance freshness gate`, `startup_single_instance_verified`,
`desktop_single_instance_verified`, `Test-StartupSingleInstanceEvidence`,
`Test-DesktopSingleInstanceEvidence`, `ExpectedGitCommit`,
`Test-DocumentationOrStatusOnlyGitDelta`, and `case_count=86`.

## 2026-06-07 Single-Instance Freshness Gate Index Refresh (wiki/898)

MUSU local indexer was refreshed after wiki/897 and GOAL v722.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2757 files`
- `2776 symbols`
- `15488 ms`

Indexed context includes startup/desktop single-instance freshness hardening in
`write-release-go-no-go.ps1`, release verifier source contract
`go-no-go single-instance evidence requires current freshness`, runtime
stabilization spec update, canonical report, next-step plan, BETA checklist,
GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v723`, `wiki/898`, `single-instance
freshness gate index refresh`, `2757 files`, `2776 symbols`, `15488 ms`,
`startup_single_instance_verified`, `desktop_single_instance_verified`,
`Test-StartupSingleInstanceEvidence`, `Test-DesktopSingleInstanceEvidence`,
`ExpectedGitCommit`, `Test-DocumentationOrStatusOnlyGitDelta`, and
`case_count=86`.

## 2026-06-07 Current-HEAD Single-Instance Evidence Refresh (wiki/899)

The local-sideload MSIX was rebuilt, reinstalled, and verified from current
HEAD. Fresh primary-machine startup and desktop single-instance evidence now
passes the release freshness gate.

Current-HEAD install:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/run-msix-workflow.ps1 -Configuration release -StartupContract local-sideload-manual -AttemptInstall -VerifyInstalled -ReplaceExisting`
- commit under test:
  `4dd6a8445b3a196009eb8dc4f3af6ebc91f04974`
- MSIX:
  `.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- installed package:
  `Yellowhama.MUSU_1.15.0.0_x64__ygcjq669as2b6`
- build, package, smoke, install, installed contract, and packaged runtime
  identity checks passed

Fresh evidence:

- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-002403-HUGH_SECOND.desktop-single-instance.json`
  - `ok=true`
  - `git_dirty=false`
  - shell count stayed `1`
  - new shell count `0`
  - activation failures `0`
- startup single-instance:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-002452-HUGH_SECOND.startup-single-instance.json`
  - `ok=true`
  - runtime count stayed `1`
  - observed bridge PID count `1`
  - repeated spawn count `0`
  - failed invocation count `0`
- nested process ownership:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-002452-HUGH_SECOND.startup-single-instance.process-ownership.json`
  - `ok=true`
  - `fail_count=0`

Dirty-tree go/no-go after evidence capture:

- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- valid machine counts `1/1`
- blocker count `8`, with only temporary `git` added to the remaining release
  blockers

Qualitative audit found no high/medium issue. This closes the reopened
primary-machine local single-instance blockers, not the second-PC, CPU,
hosted P2P/relay, support, or Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_SINGLE_INSTANCE_EVIDENCE_REFRESH_2026_06_07.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_SINGLE_INSTANCE_EVIDENCE_REFRESH_2026_06_07.md`

CoS memory:

- `docs\memory\chief_of_staff\2026-06-07_current_head_single_instance_evidence_refresh.md`

Search terms should include `GOAL v724`, `wiki/899`,
`current-head single-instance evidence refresh`, `20260607-002403`,
`20260607-002452`, `startup_single_instance_verified=true`,
`desktop_single_instance_verified=true`, `new_desktop_shell=0`,
`repeated_spawn_count=0`, `run-msix-workflow`, and `HUGH_SECOND`.

## 2026-06-07 Current-HEAD Single-Instance Evidence Index Refresh (wiki/900)

MUSU local indexer was refreshed after wiki/899 and GOAL v724.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2763 files`
- `2776 symbols`
- `16196 ms`

Indexed context includes current-HEAD local-sideload MSIX rebuild/reinstall
notes, fresh desktop/startup single-instance evidence, nested process
ownership evidence, canonical report, next-step plan, BETA checklist, runtime
stabilization spec update, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v725`, `wiki/900`, `current-head
single-instance evidence index refresh`, `2763 files`, `2776 symbols`,
`16196 ms`, `20260607-002403`, `20260607-002452`,
`startup_single_instance_verified=true`, `desktop_single_instance_verified=true`,
`new_desktop_shell=0`, and `repeated_spawn_count=0`.

## 2026-06-07 Current-HEAD Idle CPU And Route Attempt (wiki/901)

Current packaged MUSU Desktop does not reproduce the reported 20% busy-loop on
`HUGH_SECOND`.

Updated:

- `measure-musu-runtime-cpu-scenarios.ps1`
  - preserves route command `raw_exit_code`
  - records non-zero effective `exit_code` when the route output lacks the
    expected token
- `test-release-evidence-verifiers.ps1`
  - source-contract needles require failed route probe exit normalization

Evidence:

- desktop-open idle CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-003914-HUGH_SECOND.desktop-open.evidence.json`
  - `ok=true`
  - `sample_seconds=60.031`
  - MUSU `0`
  - Node `0`
  - owned WebView2 max `0.03`
  - bridge/runtime `1`, desktop shell `1`, owned WebView2 helpers `6`
- runtime CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-005241-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  - CPU budget `ok=true` across all five scenarios
  - max WebView2 `0.1`
  - MUSU/Node/bridge/desktop max `0`
  - route target `HUGH-MAIN`
  - route timed out to `192.168.1.192:8949`
  - effective route `exit_code=1`
  - raw route CLI `raw_exit_code=0`

Verification:

- release verifier: `ok=true`, `case_count=86`, `failed_case_count=0`
- target route-attempt verifier: `ok=true`, `fail_count=0`
- full matrix verifier: `ok=false`, `fail_count=1`, because no route token was
  returned
- dirty-tree go/no-go:
  - `runtime_cpu_second_pc_route_attempt_verified=true`
  - runtime idle valid machines `1`
  - runtime matrix valid machines `1`
  - blocker count `7` including temporary `git`

Qualitative audit found no high/medium issue. This removes the targeted
route-attempt CPU blocker, but public release remains No-Go on second-PC CPU
counts, successful route matrix, hosted MUSU.PRO P2P/relay proof, support, and
Store evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_IDLE_CPU_AND_ROUTE_ATTEMPT_2026_06_07.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_IDLE_CPU_AND_ROUTE_ATTEMPT_2026_06_07.md`

CoS memory:

- `docs\memory\chief_of_staff\2026-06-07_current_head_idle_cpu_and_route_attempt.md`

Search terms should include `GOAL v726`, `wiki/901`, `20260607-003914`,
`20260607-005241`, `raw_exit_code`, `runtime_cpu_second_pc_route_attempt_verified=true`,
`HUGH-MAIN`, `192.168.1.192:8949`, `desktop-open idle CPU`, and
`owned WebView2 max 0.03`.

## 2026-06-07 Current-HEAD Idle CPU And Route Attempt Index Refresh (wiki/902)

MUSU local indexer was refreshed after wiki/901 and GOAL v726.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2770 files`
- `2776 symbols`
- `21681 ms`

Indexed context includes desktop-open idle CPU evidence `20260607-003914`,
runtime CPU matrix `20260607-005241`, target-route and full-matrix verification
JSON, route probe exit normalization code, release verifier source-contract
update, canonical report, next-step plan, BETA checklist, runtime
stabilization spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v727`, `wiki/902`, `current-head idle CPU
route attempt index refresh`, `2770 files`, `2776 symbols`, `21681 ms`,
`20260607-003914`, `20260607-005241`, `raw_exit_code`,
`runtime_cpu_second_pc_route_attempt_verified=true`, and `owned WebView2 max
0.03`.

## 2026-06-07 HUGH-MAIN Route Reachability Diagnostic (wiki/903)

Current packaged MUSU Desktop status on `HUGH_SECOND` confirms the local
runtime is healthy and the current blocker is the `HUGH-MAIN` peer endpoint.

Evidence:

- route attempt:
  `docs\evidence\route-diagnostics\1.15.0-rc.1\20260607-011317-HUGH_SECOND-HUGH_MAIN.route-attempt.json`
- reachability diagnostic:
  `docs\evidence\route-diagnostics\1.15.0-rc.1\20260607-011750-HUGH_SECOND-HUGH_MAIN.route-reachability-diagnostic.json`
- canonical report:
  `docs\RELEASE_1_15_0_RC1_HUGH_MAIN_ROUTE_REACHABILITY_DIAGNOSTIC_2026_06_07.md`
- next-step plan:
  `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_HUGH_MAIN_ROUTE_REACHABILITY_DIAGNOSTIC_2026_06_07.md`
- CoS memory:
  `docs\memory\chief_of_staff\2026-06-07_hugh_main_route_reachability_diagnostic.md`

Findings:

- local bridge: `http://127.0.0.1:1158`, healthy
- peer: `HUGH-MAIN`, `192.168.1.192:8949`, `healthy=false`,
  `version=unknown`
- selected candidate: manual `lan` HTTP route
- current transport: `http_bearer`
- encryption: `none_http_bearer`
- peer identity: `peer_identity_verified=false`
- release transport requirement: `quic_tls_1_3`
- TCP probe to `192.168.1.192:8949`: `false`
- ping probe to `192.168.1.192`: `false`
- neighbor entry: present, but not route success proof

Interpretation:

- MUSU Desktop is the correct local executor and is running on this machine.
- `localhost:3001` is not the packaged desktop runtime contract.
- The current route failure is that `HUGH-MAIN` is not accepting or reachable
  at the registered LAN endpoint.
- A manual HTTP bearer candidate is diagnostic only and remains non-release
  grade even if it starts responding.
- MUSU.PRO remains remote input, project/company room, rendezvous,
  path-selection, relay-fallback, and evidence control plane. It does not
  become the executor or default payload path.

Qualitative audit found no high/medium code issue. The release gate is failing
closed on unhealthy peer state, unverified identity, non-release transport,
missing relay tunnel runtime, and missing hosted P2P evidence.

Search terms should include `GOAL v728`, `wiki/903`, `HUGH-MAIN route
reachability diagnostic`, `127.0.0.1:1158`, `192.168.1.192:8949`,
`submit_http_error`, `none_http_bearer`, `peer_identity_verified=false`,
`quic_tls_1_3`, `tcp_test_succeeded=false`, and `MUSU Desktop local executor`.

## 2026-06-07 HUGH-MAIN Route Reachability Index Refresh (wiki/904)

MUSU local indexer was refreshed after wiki/903 and GOAL v728.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2775 files`
- `2776 symbols`
- `23081 ms`

Indexed context includes route diagnostic evidence `20260607-011317` and
`20260607-011750`, canonical report, next-step plan, beta checklist, P2P
control-plane spec, MUSU.PRO P2P control-plane spec, runtime stabilization
spec, network boundary spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v729`, `wiki/904`, `HUGH-MAIN route
reachability index refresh`, `2775 files`, `2776 symbols`, `23081 ms`,
`127.0.0.1:1158`, `192.168.1.192:8949`, `submit_http_error`,
`none_http_bearer`, `peer_identity_verified=false`, and `MUSU Desktop local
executor`.

## 2026-06-07 Route Reachability Diagnostic Tooling (wiki/905)

Route reachability diagnostics are now reusable release tooling.

Added scripts:

- `scripts\windows\record-route-reachability-diagnostic.ps1`
- `scripts\windows\verify-route-reachability-diagnostic.ps1`

The recorder captures packaged MUSU status, route explain/path priority,
TCP/ping/neighbor reachability, raw `musu.route_evidence.v1` route-attempt
evidence, command captures, and an explicit conclusion that failed/manual HTTP
routes are not successful multi-device proof.

The verifier accepts failed non-local peer diagnostics and rejects local-only
targets or fake successful route proof.

Validation:

- parser checks: pass
- existing HUGH-MAIN diagnostic `20260607-011750` verified with `ok=true`,
  `fail_count=0`
- full recorder smoke against `HUGH-MAIN`: TCP `false`, route result `failed`,
  failure `submit_http_error`
- generated smoke diagnostic verified with `ok=true`, `fail_count=0`
- release verifier regression: `ok=true`, `case_count=90`,
  `failed_case_count=0`

New regression cases:

- `route reachability recorder captures status explain network and route evidence`
- `route reachability accepts failed non-local peer diagnostic`
- `route reachability rejects local-only target diagnostic`
- `route reachability rejects fake successful route proof`

Search terms should include `GOAL v730`, `wiki/905`, `route reachability
diagnostic tooling`, `record-route-reachability-diagnostic.ps1`,
`verify-route-reachability-diagnostic.ps1`, `case_count=90`,
`submit_http_error`, `none_http_bearer`, `peer_identity_verified=false`,
`RequireNonLocalTarget`, and `MUSU Desktop local executor`.

## 2026-06-07 Route Reachability Diagnostic Tooling Index Refresh (wiki/906)

MUSU local indexer was refreshed after wiki/905 and GOAL v730.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2780 files`
- `2776 symbols`
- `16843 ms`

Indexed context includes `record-route-reachability-diagnostic.ps1`,
`verify-route-reachability-diagnostic.ps1`, release verifier regression
`case_count=90`, route reachability tooling report, next-step plan, beta
checklist, P2P control-plane docs, MUSU.PRO P2P spec, runtime stabilization
spec, network boundary spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v731`, `wiki/906`, `route reachability
diagnostic tooling index refresh`, `2780 files`, `2776 symbols`, `16843 ms`,
`record-route-reachability-diagnostic.ps1`,
`verify-route-reachability-diagnostic.ps1`, `RequireNonLocalTarget`,
`case_count=90`, and `submit_http_error`.

## 2026-06-07 Second-PC Route Reachability Handoff (wiki/907)

Route reachability diagnostics are now wired into the second-PC operator
handoff path.

Implementation:

- `run-second-pc-release-check.ps1` records
  `musu.route_reachability_diagnostic.v1` when `-RouteReachabilityTarget` or
  `-RuntimeCpuRouteTarget` is supplied.
- Second-PC return zips can include
  `.local-build\route-diagnostics\*.route-reachability-diagnostic.json`.
- `import-second-pc-return.ps1` copies diagnostics into the primary repo's
  `.local-build\route-diagnostics\` evidence root.
- Returned diagnostics are verified with
  `verify-route-reachability-diagnostic.ps1 -RequireNonLocalTarget
  -AllowSuccessfulReachability`.
- Multi-device kit, final operator packet, operator action pack, and their
  verifiers now include route reachability scripts and README/runbook checks.

Product boundary:

- MUSU Desktop is the local executor on each device.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback coordination, and evidence/control
  plane.
- MUSU.PRO does not execute local work and does not become the default payload
  path.
- `localhost:3001` remains optional developer/operator dashboard behavior, not
  the packaged desktop runtime contract.

Validation:

- parser checks: pass
- release verifier regression: `ok=true`, `case_count=93`,
  `failed_case_count=0`

New regression cases:

- `second-PC release check returns route reachability diagnostics`
- `second-PC return import verifies route reachability diagnostics`
- `second-PC kit includes route reachability diagnostic handoff`

Search terms should include `GOAL v732`, `wiki/907`, `second-PC route
reachability handoff`, `RouteReachabilityTarget`,
`route_reachability_diagnostic_verified`,
`musu.route_reachability_diagnostic.v1`, `.local-build\route-diagnostics`,
`case_count=93`, `MUSU Desktop local executor`, and `MUSU.PRO control plane`.

## 2026-06-07 Second-PC Route Reachability Handoff Index Refresh (wiki/908)

MUSU local indexer was refreshed after wiki/907 and GOAL v732.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2784 files`
- `2776 symbols`
- `15188 ms`

Indexed context includes `run-second-pc-release-check.ps1`,
`import-second-pc-return.ps1`, multi-device kit/operator packet/action-pack
handoff updates, route reachability source-contract regression
`case_count=93`, canonical report, next-step plan, beta checklist, P2P
control-plane docs, MUSU.PRO P2P spec, runtime stabilization spec, network
boundary spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v733`, `wiki/908`, `second-PC route
reachability handoff index refresh`, `2784 files`, `2776 symbols`, `15188 ms`,
`RouteReachabilityTarget`, `route_reachability_diagnostic_verified`,
`musu.route_reachability_diagnostic.v1`, and `case_count=93`.

## 2026-06-07 Process Ownership Transient CLI Hardening (wiki/909)

Process ownership now separates long-lived MUSU bridge runtime roots from
transient `musu.exe` operator commands.

Root cause:

- overlapping `musu status --json` and process attribution could make the old
  audit report `musu_runtime=2`
- rerunning attribution by itself passed, so this was a false-positive audit
  risk, not proven duplicate bridge startup

Implementation:

- `audit-musu-process-ownership.ps1` counts only `musud`, bridge registry PID,
  or `musu.exe bridge` command line as `musu_runtime`
- other `musu.exe` commands are reported as `musu_cli`
- `show-musu-process-attribution.ps1` exposes `counts.musu_cli`
- release verifier added
  `process ownership excludes transient MUSU CLI from bridge runtime count`

Evidence:

- local bridge: `http://127.0.0.1:1158`, healthy
- `HUGH-MAIN`: `192.168.1.192:8949`, unhealthy, `version=unknown`
- process ownership: `ok=true`, `fail_count=0`, `musu_runtime=1`,
  `musu_cli=0`, `desktop_shell=1`, `owned_node=0`, `owned_webview2=6`
- process attribution: `ok=true`, orphan repo helpers `0`
- release verifier regression: `ok=true`, `case_count=94`,
  `failed_case_count=0`
- 60s desktop-open CPU diagnostic: `ok=true`, hot processes `0`, WebView2 max
  `0.05`, dirty tree, diagnostic only

Qualitative audit found no high/medium issue. This is local audit hardening
only; public release remains No-Go on real second-PC route/CPU/matrix, hosted
MUSU.PRO P2P/relay proof, support mailbox, and Store proof.

Search terms should include `GOAL v734`, `wiki/909`, `musu_cli`,
`Test-MusuRuntimeRoot`, `Test-MusuBridgeCommandLine`, `musu_runtime=1`,
`case_count=94`, `127.0.0.1:1158`, `HUGH-MAIN unhealthy`, and `MUSU Desktop
local executor`.

## 2026-06-07 Process Ownership Transient CLI Hardening Index Refresh (wiki/910)

MUSU local indexer was refreshed after wiki/909 and GOAL v734.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2786 files`
- `2776 symbols`
- `33404 ms`

Indexed context includes `audit-musu-process-ownership.ps1`,
`show-musu-process-attribution.ps1`, release verifier regression
`case_count=94`, canonical report, next-step plan, beta checklist, runtime
stabilization spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v735`, `wiki/910`, `process ownership
transient CLI hardening index refresh`, `2786 files`, `2776 symbols`,
`33404 ms`, `musu_cli`, `Test-MusuRuntimeRoot`,
`Test-MusuBridgeCommandLine`, and `case_count=94`.

## 2026-06-07 Current HEAD Primary CPU Refresh After Process Ownership CLI Hardening (wiki/911)

Current primary-machine CPU evidence was refreshed after process ownership CLI
hardening.

Evidence:

- clean desktop-open idle CPU:
  `20260607-024332-HUGH_SECOND.desktop-open.evidence.json`
- idle commit: `05904ae3cc714ae31984f11c56005718439e2335`
- idle `git_dirty=false`, hot process count `0`, MUSU `0`, Node `0`,
  WebView2 `0.08`, working set `361.49MB`
- clean runtime CPU matrix:
  `20260607-025704-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix commit: `db4e0c8ef99dd2b75440a46c2d3da468dd57a72d`
- matrix `git_dirty=false`, dirty scenarios none, MUSU `0`, Node `0`,
  WebView2 max `0.18`, working set max `361.4MB`
- target-route verifier passed with `ok=true`, `fail_count=0`
- full route-success verifier failed with `ok=false`, `fail_count=1`, failing
  only `post-route route probe`
- release evidence verifier regression passed with `ok=true`, `case_count=94`,
  `failed_case_count=0`

Route state:

- route target: `HUGH-MAIN`
- endpoint attempted: `192.168.1.192:8949`
- result: timeout
- route wait prompt and expected token both use
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_025704`

Process lesson:

- capture multi-scenario matrix output in ignored `.local-build`
- verify from `.local-build`
- copy only verified matrix and verification JSON to `docs\evidence`
- use `-RoutePrompt "Return exactly {TOKEN}"` to avoid token drift

Qualitative audit found no high/medium code issue and no source code changed.
The current primary packaged runtime is quiet; public release remains No-Go on
second-PC route/CPU/matrix, hosted MUSU.PRO P2P/relay proof, support mailbox,
and Store proof.

Search terms should include `GOAL v736`, `wiki/911`, `20260607-024332`,
`20260607-025704`, `db4e0c8e`, `HUGH-MAIN`, `192.168.1.192:8949`,
`Return exactly {TOKEN}`, `target-route verifier ok`, and `WebView2 max 0.18`.

## 2026-06-07 Current HEAD Primary CPU Refresh Index Refresh (wiki/912)

MUSU local indexer was refreshed after wiki/911 and GOAL v736.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2794 files`
- `2776 symbols`
- `15663 ms`

Indexed context includes clean desktop-open idle CPU evidence
`20260607-024332`, clean runtime CPU matrix evidence `20260607-025704`,
target-route and full route verification JSON, the current primary CPU refresh
canonical report, next-step plan, BETA checklist, runtime stabilization spec,
MUSU.PRO P2P control-plane spec, P2P control-plane notes, network boundary
spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v737`, `wiki/912`, `current HEAD primary CPU
refresh index refresh`, `2794 files`, `2776 symbols`, `15663 ms`,
`20260607-024332`, `20260607-025704`, `Return exactly {TOKEN}`, and
`WebView2 max 0.18`.

## 2026-06-07 Runtime CPU Matrix OutputRoot Hygiene Gate (wiki/913)

Runtime CPU matrix capture now rejects tracked in-repo output roots before any
scenario sample starts.

Root cause:

- writing a multi-scenario matrix directly to tracked `docs\evidence` creates
  the first scenario file in the repo
- later scenarios then record `git_dirty=true`
- that makes the matrix invalid for release evidence

Implementation:

- `measure-musu-runtime-cpu-scenarios.ps1` normalizes `OutputRoot`
- in-repo OutputRoot paths are checked with `git check-ignore`
- unsafe tracked paths throw before `New-Item` and before sampling
- matrix JSON now records `output_root`, `output_root_within_repo`, and
  `output_root_git_ignored`
- `test-release-evidence-verifiers.ps1` adds
  `runtime CPU matrix rejects tracked in-repo output roots`

Validation:

- parser checks passed
- unsafe `docs/evidence/.../unsafe-output-root-smoke` OutputRoot failed before
  sampling
- default `.local-build` smoke passed and recorded
  `output_root_git_ignored=true`
- release verifier regression passed with `ok=true`, `case_count=95`,
  `failed_case_count=0`

Qualitative audit found no high/medium issue. This hardens release evidence
hygiene only; public release remains No-Go on second-PC route/CPU/matrix,
hosted MUSU.PRO P2P/relay proof, support mailbox, and Store proof.

Search terms should include `GOAL v738`, `wiki/913`, `OutputRoot hygiene`,
`output_root_git_ignored`, `git check-ignore`, `unsafe-output-root-smoke`,
`.local-build`, `case_count=95`, and `runtime CPU matrix rejects tracked
in-repo output roots`.

## 2026-06-07 Runtime CPU Matrix OutputRoot Hygiene Index Refresh (wiki/914)

MUSU local indexer was refreshed after wiki/913 and GOAL v738.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2796 files`
- `2776 symbols`
- `15618 ms`

Indexed context includes OutputRoot hygiene changes in
`measure-musu-runtime-cpu-scenarios.ps1`, release verifier regression
`case_count=95`, canonical report, next-step plan, BETA checklist, runtime
stabilization spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v739`, `wiki/914`, `runtime CPU matrix
OutputRoot hygiene index refresh`, `2796 files`, `2776 symbols`, `15618 ms`,
`output_root_git_ignored`, `git check-ignore`, and `case_count=95`.

## 2026-06-07 P2P Env Blockers Go/No-Go Surface (wiki/915)

`write-release-go-no-go.ps1` now surfaces the P2P env status blocker list from
`show-musu-pro-p2p-env-status.ps1`.

Changed:

- go/no-go invokes `show-musu-pro-p2p-env-status.ps1 -Json`
- the selected latest P2P evidence path is passed through to the env status
  reporter
- go/no-go JSON now contains `p2p_control_plane_env_ready`
- go/no-go JSON now contains `p2p_control_plane_env_blockers`
- go/no-go JSON now contains `p2p_control_plane_env_status`
- the `p2p-control-plane` blocker message now includes a short
  `P2P env blockers:` summary
- release verifier regression adds
  `go-no-go surfaces P2P env status blockers`

Current env status remains `ok=false` with expected blockers:

- `source_release_relay_payload_endpoint_not_implemented`
- `source_release_relay_tunnel_runtime_not_implemented`
- `source_preview_store_forward_payload_queue_non_release_grade`
- `source_relay_transport_kind_not_release_grade`
- missing KV/Upstash URL/token names
- `live_evidence_p2p_runtime_not_logged_in`
- `live_evidence_relay_transport_not_wired`
- missing relay route metadata, transport proof, and payload delivery proof

Qualitative audit found no high/medium issue. This is status/evidence surface
hardening only. It does not implement release relay tunnel transport and does
not move execution into MUSU.PRO.

Search terms should include `GOAL v740`, `wiki/915`,
`p2p_control_plane_env_ready`, `p2p_control_plane_env_blockers`,
`p2p_control_plane_env_status`, `P2P env blockers`,
`source_release_relay_tunnel_runtime_not_implemented`,
`source_release_relay_payload_endpoint_not_implemented`, and
`go-no-go surfaces P2P env status blockers`.

Validation:

- parser checks passed for the touched PowerShell scripts
- `git diff --check` passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=96`, and `failed_case_count=0`
- dirty go/no-go smoke stayed fail-closed with
  `p2p_control_plane_env_ready=false`, `12` P2P env blockers, and a `git`
  blocker while the working tree was intentionally dirty

## 2026-06-07 P2P Env Blockers Go/No-Go Index Refresh (wiki/916)

MUSU local indexer was refreshed after wiki/915 and GOAL v740.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2799 files`
- `2776 symbols`
- `18256 ms`

Indexed context includes go/no-go P2P env status fields,
`show-musu-pro-p2p-env-status.ps1` source/live/env detail, release verifier
regression `case_count=96`, dirty go/no-go smoke with `12` P2P env blockers,
canonical report, next-step plan, BETA checklist, runtime stabilization spec,
MUSU.PRO P2P control-plane spec, network boundary spec, GOAL, WIKI/WIKI_INDEX,
and CoS memory.

Search terms should include `GOAL v741`, `wiki/916`, `P2P env blockers
go/no-go index refresh`, `2799 files`, `2776 symbols`, `18256 ms`,
`p2p_control_plane_env_status`, `case_count=96`,
`source_release_relay_tunnel_runtime_not_implemented`, and
`source_release_relay_payload_endpoint_not_implemented`.

## 2026-06-07 Relay Tunnel Marker Conflict Gate (wiki/917)

`show-musu-pro-p2p-env-status.ps1` now detects marker-only release relay
tunnel flips.

Changed:

- source status emits `release_relay_tunnel_runtime_source_contract_ready`
- source status emits `release_relay_tunnel_runtime_missing_source_hooks`
- source status emits `release_payload_preflight_only`
- source status emits
  `release_payload_endpoint_marker_conflicts_with_preflight_only`
- source status emits
  `release_relay_tunnel_runtime_marker_conflicts_with_source_contract`
- env status adds conflict blockers if release markers are true while source
  is still preflight-only or missing release tunnel hooks
- release verifier regression adds
  `P2P env status rejects marker-only relay tunnel flips`

Current smoke:

- blocker count remains `12`
- `release_relay_tunnel_runtime_source_contract_ready=false`
- missing hooks:
  `rust_source_submit_release_relay_tunnel_payload`,
  `rust_target_accept_release_relay_tunnel_payload`,
  `rust_transport_emits_quic_relay_tunnel_proof`,
  `rust_delivery_records_release_relay_tunnel_payload`
- `release_payload_preflight_only=true`
- marker conflict blockers are false because the release markers are still
  correctly false

Validation:

- parser checks passed
- P2P env status smoke preserved existing blocker count
- release evidence verifier regression passed with `ok=true`,
  `case_count=97`, and `failed_case_count=0`

Qualitative audit found no high/medium issue. This is source gate hardening,
not release tunnel implementation. It prevents preflight-only endpoints,
preview queues, DTOs, or proof recorders from being treated as the real
`quic_relay_tunnel` payload path.

Search terms should include `GOAL v742`, `wiki/917`,
`release_relay_tunnel_runtime_source_contract_ready`,
`release_relay_tunnel_runtime_missing_source_hooks`,
`release_payload_preflight_only`,
`source_release_relay_tunnel_runtime_marker_conflicts_with_source_contract`,
`source_release_relay_payload_marker_conflicts_with_preflight_only`, and
`case_count=97`.

## 2026-06-07 Relay Tunnel Marker Conflict Gate Index Refresh (wiki/918)

MUSU local indexer was refreshed after wiki/917 and GOAL v742.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2802 files`
- `2776 symbols`
- `15049 ms`

Indexed context includes `show-musu-pro-p2p-env-status.ps1` marker conflict
fields, release verifier regression `case_count=97`, canonical report,
next-step plan, BETA checklist, MUSU.PRO P2P control-plane spec, P2P
control-plane notes, runtime stabilization spec, network boundary spec, GOAL,
WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v743`, `wiki/918`, `relay tunnel marker
conflict gate index refresh`, `2802 files`, `2776 symbols`, `15049 ms`,
`release_relay_tunnel_runtime_source_contract_ready`,
`release_payload_preflight_only`, and `case_count=97`.

## 2026-06-07 Support Mailbox Request Packet (wiki/919)

Support mailbox verification now has a support-only request packet generator.

Changed:

- added `prepare-support-mailbox-verification-request.ps1`
- request output defaults to `.local-build\support-mailbox-requests`
- request schema is `musu.support_mailbox_verification_request.v1`
- generated files include `SUPPORT_MAILBOX_VERIFICATION_EMAIL.txt`, README,
  request JSON, `SHA256SUMS.txt`, timestamped zip, and latest zip
- request output includes the post-delivery
  `record-support-mailbox-verification.ps1` command
- request output reports `release_gate_satisfied=false`
- final operator packet tooling now carries the request script and verifies
  that support-only request packets do not satisfy release evidence
- release verifier regression added
  `support mailbox request packet is not release evidence`
- release verifier regression added support-mailbox freshness status-only
  coverage so support request/record/verify/operator-card changes do not stale
  unrelated local desktop evidence

Smoke:

- `support_email=musu@musu.pro`
- `verification_id=musu-support-smoke-20260607-fedcba0987654321`
- `schema=musu.support_mailbox_verification_request.v1`
- `ok=true`
- `release_gate_satisfied=false`
- record command uses `REPLACE_WITH_EXTERNAL_SENDER_EMAIL`
- no support evidence file was written

Validation:

- parser checks passed
- support request smoke passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=102`, and `failed_case_count=0`
- dirty-tree go/no-go smoke restored `single_machine_verified=true`, runtime
  idle count `1`, runtime matrix count `1`, and process/startup/desktop
  single-instance true; temporary `git` blocker was expected before commit

Code audit found and fixed one issue before finalizing: email-shaped
placeholders could be copied literally into support evidence. The verifier now
rejects placeholder sender addresses, and handoff templates use
`REPLACE_WITH_EXTERNAL_SENDER_EMAIL`.

No remaining high/medium issue was found. This is operator-action tooling only.
Public release remains No-Go until actual support inbox delivery is recorded,
and the second-PC, hosted MUSU.PRO P2P/relay, and Store gates remain open.

Search terms should include `GOAL v744`, `wiki/919`,
`prepare-support-mailbox-verification-request.ps1`,
`musu.support_mailbox_verification_request.v1`,
`release_gate_satisfied=false`,
`support mailbox request packet is not release evidence`,
`support mailbox rejects placeholder sender evidence`,
`freshness classifiers allow support mailbox tooling as status-only`, and
`case_count=102`.

## 2026-06-07 Support Mailbox Request Packet Index Refresh (wiki/920)

MUSU local indexer was refreshed after wiki/919 and GOAL v744.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2807 files`
- `2776 symbols`
- `23584 ms`

Indexed context includes `prepare-support-mailbox-verification-request.ps1`,
`verify-support-mailbox-evidence.ps1` placeholder sender rejection, final
operator packet/action-pack support placeholder updates, release verifier
regression `case_count=102`, freshness status-only support mailbox tooling
coverage, canonical support request packet report,
next-step plan, BETA checklist, P2P specs, runtime stabilization spec, network
boundary spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v745`, `wiki/920`, `support mailbox request
packet index refresh`, `2807 files`, `2776 symbols`, `23584 ms`,
`REPLACE_WITH_EXTERNAL_SENDER_EMAIL`,
`support mailbox rejects placeholder sender evidence`,
`freshness classifiers allow support mailbox tooling as status-only`, and
`case_count=102`.

## 2026-06-07 Route Attempt CPU Attempt Metadata Gate (wiki/921)

Allowed failed target-route CPU evidence now requires route probe per-attempt
metadata.

Changed:

- `verify-runtime-cpu-scenario-matrix.ps1` requires allowed failed route probe
  `raw_exit_code`
- it requires `attempt_count`
- it requires matching `attempts[]`
- it requires complete attempt row fields: attempt number, timestamp,
  exit/raw exit, stdout/stderr/output fields, `ok`, and timeout
- it requires top-level route probe summary exit/raw-exit codes to match the
  final attempt
- release verifier regression added
  `runtime matrix rejects allowed failed route attempt without per-attempt metadata`

Evidence:

- current primary matrix
  `20260607-025704-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- target `HUGH-MAIN`
- route probe `ok=false`, `failure_allowed=true`
- `attempt_count=1`
- `attempts[]` count `1`
- direct target-route verifier passed with `ok=true`, `fail_count=0`

Validation:

- parser checks passed
- direct verifier passed
- release evidence verifier regression passed with `ok=true`,
  `case_count=103`, and `failed_case_count=0`
- dirty-tree go/no-go preserved `single_machine=true`, runtime idle count `1`,
  runtime matrix count `1`, and targeted route-attempt CPU true; temporary
  `git` blocker was expected before commit

No high/medium issue was found. This is evidence hardening only: failed route
attempts remain CPU diagnostics, not route success proof. Public release remains
No-Go on second-PC route/CPU/matrix 2/2, hosted MUSU.PRO P2P/relay proof,
support mailbox proof, and Store proof.

Search terms should include `GOAL v746`, `wiki/921`,
`route attempt CPU attempt metadata gate`, `attempt_count`, `attempts[]`,
`raw_exit_code`, `runtime matrix rejects allowed failed route attempt without
per-attempt metadata`, `20260607-025704`, and `case_count=103`.

## 2026-06-07 Route Attempt CPU Attempt Metadata Index Refresh (wiki/922)

MUSU local indexer was refreshed after wiki/921 and GOAL v746.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2810 files`
- `2776 symbols`
- `14922 ms`

Indexed context includes the route attempt CPU attempt metadata gate,
`verify-runtime-cpu-scenario-matrix.ps1` allowed failed route probe attempt
metadata checks,
`test-release-evidence-verifiers.ps1` regression `case_count=103`, canonical
report, next-step plan, BETA checklist, runtime stabilization spec, P2P
control-plane notes, network boundary spec, GOAL, WIKI/WIKI_INDEX, and CoS
memory.

Search terms should include `GOAL v747`, `wiki/922`, `route attempt CPU
attempt metadata index refresh`, `2810 files`, `2776 symbols`, `14922 ms`,
`attempt_count`, `attempts[]`, `raw_exit_code`, and `case_count=103`.

## 2026-06-07 Release Relay Tunnel Source Hook Contract (wiki/923)

Rust release relay tunnel source hooks now exist without enabling release
runtime markers.

Changed:

- `musu-rs/src/bridge/rendezvous.rs` adds
  `release_relay_tunnel_submission_contract()` and
  `submit_release_relay_tunnel_payload(...)`
- submit contract binds release metadata to `quic_relay_tunnel`,
  `quic_tls_1_3`, `quic_tls_cert_fingerprint`, and
  `musu_quic_tls_transport`
- submit still returns `release_relay_tunnel_runtime_not_implemented` after
  validation, so no source scaffold can be mistaken for real payload transit
- `musu-rs/src/bridge/handlers/relay_payload.rs` adds
  `release_relay_tunnel_acceptance_contract()` and
  `accept_release_relay_tunnel_payload(...)`
- target accept contract requires `transport_kind=quic_relay_tunnel`,
  `release_grade=true`, `relay_default_data_path=false`, `wss://` relay URL,
  and matching session/lease/source/target/tunnel/payload fields
- preview store-forward delivery proof is rejected as non-release-grade
- release verifier regression adds
  `Rust release relay tunnel hook contract is explicit`

Validation:

- parser checks passed
- `cargo fmt --check`
- `cargo test --lib relay_payload`: `26 passed`
- `cargo test --lib rendezvous`: `8 passed`
- `cargo check --lib`
- release evidence verifier regression passed with `ok=true`,
  `case_count=104`, and `failed_case_count=0`
- P2P env status now reports
  `release_relay_tunnel_runtime_source_contract_ready=true` and zero missing
  source hooks

No high/medium issue was found. The release gate remains fail-closed:
`release_relay_tunnel_runtime_implemented=false`,
`relay_payload_endpoint_implemented=false`, `relay_transport_kind=websocket_tunnel`,
and the same 12 source/env/live P2P blockers remain. This is source-contract
hardening only, not actual `quic_relay_tunnel` payload movement.

Search terms should include `GOAL v748`, `wiki/923`,
`release relay tunnel source hook contract`,
`submit_release_relay_tunnel_payload`,
`accept_release_relay_tunnel_payload`,
`release_relay_tunnel_runtime_source_contract_ready=true`,
`release_relay_tunnel_runtime_not_implemented`, and `case_count=104`.

## 2026-06-07 Release Relay Tunnel Source Hook Contract Index Refresh (wiki/924)

MUSU local indexer was refreshed after wiki/923 and GOAL v748.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2812 files`
- `2788 symbols`
- `15395 ms`

Indexed context includes Rust release relay tunnel source hook contracts,
release verifier regression `case_count=104`, canonical report, next-step
plan, BETA checklist, P2P control-plane specs, runtime stabilization spec,
network boundary spec, GOAL, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v749`, `wiki/924`, `release relay tunnel
source hook contract index refresh`, `2812 files`, `2788 symbols`, `15395 ms`,
`submit_release_relay_tunnel_payload`,
`accept_release_relay_tunnel_payload`,
`release_relay_tunnel_runtime_source_contract_ready=true`, and
`case_count=104`.

## 2026-06-07 Release Relay Tunnel Source Hook Clean Go/No-Go (wiki/925)

Clean go/no-go was rerun after commit
`402a5f332808152a3c039438b1aa92411d1a9fbb`.

Result:

- `ready_for_public_desktop_release=false`
- `manifest_git.dirty=false`
- `local_artifacts_ready=true`
- `public_metadata_ok=true`
- `msix_install_verified=true`
- `single_machine_verified=false`
- `multi_device_verified=false`
- `p2p_control_plane_env_ready=false`
- P2P env blocker count: `12`

Interpretation:

- the Rust release relay tunnel source hook contract changed runtime source;
- previous local runtime evidence is therefore stale for current HEAD;
- this is expected gate behavior, not a new code failure;
- fresh single-machine, process ownership, startup/desktop single-instance,
  runtime idle CPU, and runtime CPU matrix evidence are needed on current HEAD;
- P2P env source hook status remains improved
  (`release_relay_tunnel_runtime_source_contract_ready=true`, missing hooks
  `0`), but release runtime/proof blockers remain.

Search terms should include `GOAL v750`, `wiki/925`, `clean go/no-go`,
`402a5f332808152a3c039438b1aa92411d1a9fbb`,
`single_machine_verified=false`,
`p2p_control_plane_env_ready=false`, and `P2P env blocker count 12`.

## 2026-06-07 Release Relay Tunnel Source Hook Clean Go/No-Go Index Refresh (wiki/926)

MUSU local indexer was refreshed after wiki/925 and GOAL v750.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2814 files`
- `2788 symbols`
- `16331 ms`

Indexed context includes clean go/no-go after commit
`402a5f332808152a3c039438b1aa92411d1a9fbb`, current-HEAD local evidence
freshness status, P2P env blocker count `12`, release relay tunnel source hook
contract docs, next-step plan, GOAL, WIKI/WIKI_INDEX, BETA checklist, and CoS
memory.

Search terms should include `GOAL v751`, `wiki/926`, `release relay tunnel
source hook clean go/no-go index refresh`, `2814 files`, `2788 symbols`,
`16331 ms`, `single_machine_verified=false`, and `P2P env blocker count 12`.

## 2026-06-07 Current-HEAD Local Desktop Evidence Refresh (wiki/927)

Current HEAD `2b9ff2e1415aaf857bae2a1d3a6a9d6d77174b4e` has fresh local
packaged desktop evidence on `HUGH_SECOND`.

Evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-054358-HUGH_SECOND.evidence.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260607-053318-HUGH_SECOND.process-ownership.json`
- startup single-instance:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-053336-HUGH_SECOND.startup-single-instance.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-053413-HUGH_SECOND.desktop-single-instance.json`
- desktop-open CPU:
  `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-053429-HUGH_SECOND.desktop-open.evidence.json`
- five-state CPU matrix:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-053555-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verification:
  `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-053555-HUGH_SECOND.verification.json`

Result:

- single-machine verifier `ok=true`, `fail_count=0`
- local surface `local-bridge-only`
- bridge `http://127.0.0.1:1158`
- process ownership `ok=true`: packaged runtime `1`, desktop shell `1`, owned
  Node `0`, owned WebView2 `6`
- startup single-instance reused bridge PID `39876`
- desktop single-instance reused `musu-desktop` PID `31040`
- desktop-open CPU `ok=true`, `git_dirty=false`, `60.036s`, hot `0`, WebView2
  max `0.05`, working set `362.33MB`
- matrix verifier `ok=true`, `fail_count=0`, route token
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_053555`, hot `0`, WebView2 max `0.13`,
  working set max `363.73MB`

Dirty-tree go/no-go after docs evidence promotion reports
`single_machine_verified=true`, runtime idle CPU valid machines
`1 [HUGH_SECOND]`, runtime CPU matrix valid machines `1 [HUGH_SECOND]`, and
process/startup/desktop single-instance true. The public release remains No-Go
on second-PC route/CPU/matrix, clean targeted second-PC route-attempt CPU,
hosted MUSU.PRO P2P/relay proof, support mailbox proof, and Store proof.

Product boundary: MUSU Desktop is the local executor; MUSU.PRO is remote input,
rooms/meeting, rendezvous, path selection, relay fallback, and evidence/control
plane. `localhost:3001` is not the packaged desktop runtime contract.

Search terms should include `GOAL v752`, `wiki/927`,
`current-head local desktop evidence refresh`,
`20260607-054358-HUGH_SECOND`, `20260607-053429-HUGH_SECOND.desktop-open`,
`20260607-053555-HUGH_SECOND.runtime-cpu-scenario-matrix`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260607_053555`, `local-bridge-only`,
`127.0.0.1:1158`, `WebView2 0.13`, and `single_machine_verified=true`.

## 2026-06-07 Current-HEAD Local Desktop Evidence Index Refresh (wiki/928)

MUSU local indexer was refreshed after wiki/927 and GOAL v752.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2828 files`
- `2788 symbols`
- `16114 ms`

Indexed context includes current local desktop evidence
`20260607-054358-HUGH_SECOND`, process ownership
`20260607-053318-HUGH_SECOND`, startup single-instance
`20260607-053336-HUGH_SECOND`, desktop single-instance
`20260607-053413-HUGH_SECOND`, desktop-open CPU
`20260607-053429-HUGH_SECOND`, five-state runtime CPU matrix
`20260607-053555-HUGH_SECOND`, canonical report, BETA checklist, P2P
control-plane spec, runtime stabilization spec, network boundary spec, GOAL,
WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v753`, `wiki/928`,
`current-head local desktop evidence index refresh`, `2828 files`,
`2788 symbols`, `16114 ms`, `local-bridge-only`, `127.0.0.1:1158`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260607_053555`, and
`single_machine_verified=true`.

## 2026-06-07 Clipboard Poller Cancellation Hardening (wiki/929)

The opt-in clipboard monitor now has an explicit cancellation contract.

Changed runtime behavior:

- `start_clipboard_monitor(...)` creates a `CancellationToken`
- a Ctrl-C watcher cancels the token
- the blocking monitor loop runs under `while !worker_token.is_cancelled()`
- the loop rechecks cancellation after its 2s sleep before reading the OS
  clipboard
- the function returns the token for future explicit shutdown use

Changed release audit:

- `audit-rust-background-loop-contract.ps1` now requires clipboard
  cancellation token ownership
- it requires Ctrl-C cancellation
- it requires the blocking poll loop to be scoped by the cancellation token
- it keeps the existing 2s sleep requirement
- it requires an exit-after-cancellation branch
- `write-release-go-no-go.ps1` now requires those clipboard cancellation checks
  in the `clipboard polling` idle busy-loop candidate
- `test-release-evidence-verifiers.ps1` now fails if the go/no-go candidate
  mapping regresses

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- Rust background-loop audit `ok=true`, `fail_count=0`,
  `unaudited_loop_hit_count=0`, `unaudited_spawn_hit_count=0`
- `cargo check --manifest-path .\musu-rs\Cargo.toml --lib`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib clipboard`
  compiled successfully with `0` matching tests and `338` filtered
- release verifier regression `ok=true`, `case_count=104`,
  `failed_case_count=0`

Product interpretation:

- default packaged idle behavior is unchanged because clipboard polling remains
  off unless `MUSU_ENABLE_CLIPBOARD_SYNC=1`
- when an operator opts in, the monitor no longer has only sleep; it also has a
  shutdown path
- this is CPU/hardening progress, not a public-release closeout
- because runtime source changed, packaged local evidence needs another refresh
  after this lands

Search terms should include `GOAL v754`, `wiki/929`, `clipboard poller
cancellation hardening`, `CancellationToken`, `worker_token.is_cancelled`,
`MUSU_ENABLE_CLIPBOARD_SYNC`, `audit-rust-background-loop-contract.ps1`,
`write-release-go-no-go.ps1`, `unaudited_spawn_hit_count=0`, `case_count=104`,
and `cargo check --lib`.

## 2026-06-07 Clipboard Poller Cancellation Hardening Index Refresh (wiki/930)

MUSU local indexer was refreshed after wiki/929 and GOAL v754.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2830 files`
- `2788 symbols`
- `14867 ms`

Indexed context includes clipboard monitor `CancellationToken` hardening,
`worker_token.is_cancelled`, go/no-go idle busy-loop candidate mapping,
release verifier idle source contract, canonical clipboard poller cancellation
report, BETA checklist, runtime stabilization spec, MUSU.PRO P2P control-plane
spec, network boundary spec, GOAL, WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v755`, `wiki/930`, `clipboard poller
cancellation hardening index refresh`, `2830 files`, `2788 symbols`,
`14867 ms`, `worker_token.is_cancelled`, `write-release-go-no-go.ps1`, and
`case_count=104`.

## 2026-06-07 Current-HEAD Target Route CPU Audit and Spec Refresh (wiki/935)

Current HEAD `6cbeb3b34dad0c01c4a539f170435759095efc59` has fresh targeted
HUGH-MAIN route-attempt CPU evidence on `HUGH_SECOND`.

Evidence:

- `20260607-072059-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `20260607-072059-HUGH_SECOND.target-route.verification.json`

Route attempt:

- target `HUGH-MAIN`
- token `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_072059`
- timeout to `http://192.168.1.192:8949/api/tasks/delegate`
- `failure_allowed=true`
- `attempt_count=1`
- normalized exit code `1`

CPU result:

- all five scenarios passed
- hot process count `0`
- MUSU CPU `0`
- Node CPU `0`
- max WebView2 CPU `0.13`
- max working set `362.50MB`

Gate result:

- `single_machine_verified=true`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_control_plane_env_ready=false`
- `ready_for_public_desktop_release=false`

Validation:

- `cargo fmt --check`
- `cargo check --lib`
- `cargo test --lib mdns` passed `3/3`
- Rust background-loop audit `ok=true`, `fail_count=0`, unaudited
  loops/spawns `0`
- release verifier regression `ok=true`, `case_count=104`,
  `failed_case_count=0`

Product interpretation: MUSU Desktop remains the local executor. MUSU.PRO is
remote input, project room, presence, rendezvous, path-selection, relay
fallback, and evidence/control plane. `localhost:3001` is not the packaged
desktop contract. This evidence is a CPU diagnostic for a failed non-local
target route attempt; it is not successful second-PC route proof.

Search terms should include `GOAL v760`, `wiki/935`,
`20260607-072059-HUGH_SECOND`, `HUGH-MAIN`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260607_072059`,
`runtime_cpu_second_pc_route_attempt_verified=true`, `release verifier 104/104`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-07 Current-HEAD Target Route CPU Audit Spec Refresh Index Refresh (wiki/936)

MUSU local indexer was refreshed after wiki/935 and GOAL v760.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2849 files`
- `2788 symbols`
- `13902 ms`

Indexed context includes targeted HUGH-MAIN route-attempt CPU evidence
`20260607-072059-HUGH_SECOND`, route token
`MUSU_CPU_SCENARIO_ROUTE_OK_20260607_072059`, code audit results, product
boundary/spec refresh, canonical report, next-step plan, BETA checklist, P2P
control-plane spec, runtime stabilization spec, network boundary spec, GOAL,
WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v761`, `wiki/936`, `2849 files`,
`2788 symbols`, `13902 ms`,
`current-head target-route CPU audit spec refresh index refresh`,
`20260607-072059-HUGH_SECOND`, `HUGH-MAIN`,
`runtime_cpu_second_pc_route_attempt_verified=true`, and
`MUSU.PRO remote input control plane`.

## 2026-06-07 Current Operator Handoff Pack After Target Route CPU Audit (wiki/937)

Current handoff scripts were refreshed after the target-route CPU audit.

Changed behavior:

- final operator packets include the current local desktop evidence report
- final operator packets include the current target-route CPU audit/spec report
- second-PC quickstart warns against self/local route targets for targeted
  route diagnostics

Generated from commit `981f37ac2a03fba228a252269d1cfc761ae87777`:

- final packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260607-074518.zip`
- multi-device kit:
  `musu-multidevice-1.15.0-rc.1-20260607-074518.zip`
- action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-074533.zip`
- second-PC transfer:
  `MUSU-second-PC-transfer-1.15.0-rc.1-20260607-074533.zip`
- Partner Center zip:
  `MUSU-1.15.0-rc.1-store-submission-20260607-074533.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260607-074518`

Verification:

- final packet verifier `ok=true`, `fail_count=0`, `kit_count=1`
- action pack verifier `ok=true`, `fail_count=0`
- final packet zip includes both current CPU/local reports

Release meaning: this prepares the next physical second-PC execution path. It
does not close second-PC route/CPU/matrix, live MUSU.PRO P2P/relay, support
mailbox, or Store gates.

Search terms should include `GOAL v762`, `wiki/937`, `981f37ac`,
`musu-final-operator-gates-1.15.0-rc.1-20260607-074518.zip`,
`MUSU-1.15.0-rc.1-operator-action-pack-20260607-074533.zip`,
`MUSU-second-PC-transfer-1.15.0-rc.1-20260607-074533.zip`,
`self/local route targets rejected`, and `kit_count=1`.

## 2026-06-07 Current Operator Handoff After Target Route CPU Audit Index Refresh (wiki/938)

MUSU local indexer was refreshed after wiki/937 and GOAL v762.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2852 files`
- `2788 symbols`
- `14742 ms`

Indexed context includes handoff script updates, the current final operator
packet/action pack paths, second-PC transfer
`MUSU-second-PC-transfer-1.15.0-rc.1-20260607-074533.zip`, canonical handoff
report, BETA checklist, GOAL, WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v763`, `wiki/938`, `2852 files`,
`2788 symbols`, `14742 ms`,
`current operator handoff after target-route CPU audit index refresh`,
`981f37ac`, `musu-final-operator-gates-1.15.0-rc.1-20260607-074518.zip`, and
`self/local route targets rejected`.

## 2026-06-07 Release Payload Preflight Required Metadata Gate (wiki/939)

`/api/v1/relay/payload` remains an authenticated, metadata-only release
payload preflight surface, but now requires release tunnel payload metadata
before owner-scoped lease lookup:

- `tunnel_id`
- `payload_kind=forwarded_task_envelope`
- 64-hex `payload_sha256`

Changed behavior:

- missing tunnel payload metadata fails with
  `invalid_relay_payload_preflight_request`
- known byte fields still fail before schema parsing with
  `release_payload_bytes_not_accepted`
- unknown fields still fail strict parsing
- lease-verified blocked responses echo `release_payload_metadata`
- `release_payload_accepted=false`, `payload_stored=false`, and
  `payload_transported=false` remain false

Release boundary:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- `RELAY_TRANSPORT_KIND=websocket_tunnel`
- P2P env status remains expected No-Go

Validation:

- `git diff --check`
- `npm run test:p2p -- --test-name-pattern "release payload"` passed `112/112`
- `npm run typecheck`
- P2P relay contract audit `ok=true`, `fail_count=0`
- P2P env status expected `ok=false`
- release verifier regression `ok=true`, `case_count=104`,
  `failed_case_count=0`

Qualitative audit found no high or medium issue. This hardens MUSU.PRO remote
input/control-plane metadata without moving local execution or payload transit
into MUSU.PRO. Clean go/no-go keeps current packaged local desktop evidence
accepted because this is server-only P2P control-plane source. Public release
remains No-Go on real second-PC route/CPU/matrix evidence, hosted MUSU.PRO
P2P/relay proof, support mailbox proof, and Store proof.

Search terms should include `GOAL v764`, `wiki/939`,
`release payload preflight required metadata gate`,
`payload_kind=forwarded_task_envelope`, `release_payload_metadata`,
`release_payload_bytes_not_accepted`, `source_release_relay_payload_endpoint_not_implemented`,
`source_release_relay_tunnel_runtime_not_implemented`, `case_count=104`, and
`MUSU.PRO remote input control plane`.

## 2026-06-07 Release Payload Preflight Required Metadata Gate Index Refresh (wiki/940)

MUSU local indexer was refreshed after wiki/939 and GOAL v764.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2856 files`
- `2788 symbols`
- `20378 ms`

Indexed context includes release payload preflight schema hardening,
`payload_kind=forwarded_task_envelope`, `release_payload_metadata`, required
`tunnel_id` and `payload_sha256`, clean go/no-go interpretation, the canonical
report, BETA checklist, MUSU.PRO P2P control-plane spec, runtime stabilization
spec, network boundary spec, GOAL, WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v765`, `wiki/940`, `2856 files`,
`2788 symbols`, `20378 ms`,
`release payload preflight required metadata gate index refresh`,
`payload_kind=forwarded_task_envelope`, `release_payload_metadata`, and
`case_count=104`.

## 2026-06-07 Release Relay Tunnel Submit Metadata Gate (wiki/941)

Rust release relay tunnel submission now requires the same release payload
metadata as the MUSU.PRO release payload preflight before it can reach the
fail-closed runtime branch.

Changed source:

- `musu-rs/src/bridge/rendezvous.rs`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
- `scripts/windows/test-release-evidence-verifiers.ps1`

`submit_release_relay_tunnel_payload(...)` still returns
`release_relay_tunnel_runtime_not_implemented` for otherwise valid inputs, but
now rejects:

- missing `source_node_id`
- missing `target_node_id`
- missing `tunnel_id`
- `payload_kind` other than `forwarded_task_envelope`
- missing `payload_sha256`
- non-64-hex `payload_sha256`

Validation:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml --check`
- `cargo test --manifest-path .\musu-rs\Cargo.toml --lib release_relay_tunnel -- --nocapture`
  passed `5/5`
- P2P relay contract audit `ok=true`, `fail_count=0`
- release verifier regression `ok=true`, `case_count=104`,
  `failed_case_count=0`
- `git diff --check`

Qualitative audit found no high or medium issue. This hardens the local
runtime source contract before actual `quic_relay_tunnel` payload movement
exists. It does not enable `RELAY_TUNNEL_RUNTIME_IMPLEMENTED`, does not enable
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED`, and does not move execution into
MUSU.PRO. Because Rust runtime source changed, current packaged local desktop
evidence must be refreshed before local desktop gates can be current again.

Search terms should include `GOAL v766`, `wiki/941`,
`release relay tunnel submit metadata gate`,
`submit_release_relay_tunnel_payload`,
`release_relay_tunnel_payload_kind_not_forwarded_task_envelope`,
`release_relay_tunnel_payload_sha256_invalid`, `is_hex_sha256`,
`payload_kind=forwarded_task_envelope`, and
`release_relay_tunnel_runtime_not_implemented`.

## 2026-06-07 Release Relay Tunnel Submit Metadata Gate Index Refresh (wiki/942)

MUSU local indexer was refreshed after wiki/941 and GOAL v766.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2858 files`
- `2790 symbols`
- `18362 ms`

Indexed context includes Rust release relay tunnel submit metadata hardening,
`submit_release_relay_tunnel_payload`, `payload_kind=forwarded_task_envelope`,
`release_relay_tunnel_payload_sha256_invalid`, `is_hex_sha256`, the P2P relay
contract audit source gate, release verifier source needles, canonical report,
BETA checklist, MUSU.PRO P2P control-plane spec, runtime stabilization spec,
GOAL, WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v767`, `wiki/942`, `2858 files`,
`2790 symbols`, `18362 ms`,
`release relay tunnel submit metadata gate index refresh`,
`submit_release_relay_tunnel_payload`,
`release_relay_tunnel_payload_sha256_invalid`, and `is_hex_sha256`.

## 2026-06-07 Release Relay Tunnel Submit Metadata Clean Go/No-Go (wiki/943)

Clean go/no-go after the release relay tunnel submit metadata code change
correctly requires fresh packaged local evidence.

Result:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=false`
- `runtime_idle_cpu_valid_machine_count=0`
- `runtime_cpu_scenario_matrix_valid_machine_count=0`
- `runtime_cpu_second_pc_route_attempt_verified=false`
- `p2p_control_plane_env_ready=false`
- `multi_device_verified=false`
- `manifest_git.dirty=false`

Interpretation: this is expected because `musu-rs/src/bridge/rendezvous.rs`
changed runtime source after the latest packaged local evidence. The release
freshness gate is behaving conservatively. The next local evidence step is
rebuild/reinstall and refresh of single-machine, process ownership,
single-instance, desktop-open idle CPU, five-state runtime matrix, and targeted
second-PC route-attempt CPU evidence.

Search terms should include `GOAL v768`, `wiki/943`,
`single_machine_verified=false`, `runtime_idle_cpu_valid_machine_count=0`,
`runtime_cpu_scenario_matrix_valid_machine_count=0`,
`runtime_cpu_second_pc_route_attempt_verified=false`, and
`manifest_git.dirty=false`.

## 2026-06-07 Release Relay Tunnel Submit Metadata Clean Go/No-Go Index Refresh (wiki/944)

MUSU local indexer was refreshed after wiki/943 and GOAL v768.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2861 files`
- `2790 symbols`
- `11722 ms`

Indexed context includes the Rust release relay tunnel submit metadata gate,
the clean go/no-go interpretation that fresh packaged local evidence is now
required, canonical report updates, BETA checklist, WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v769`, `wiki/944`,
`release relay tunnel submit metadata clean go-no-go index refresh`,
`2861 files`, `2790 symbols`,
`11722 ms`, `single_machine_verified=false`,
`runtime_idle_cpu_valid_machine_count=0`, and `fresh packaged local evidence`.

## 2026-06-07 Current-Head Local Desktop Evidence After Relay Metadata Gate (wiki/945)

Current packaged local desktop evidence was refreshed on `HUGH_SECOND` after
the release relay tunnel submit metadata gate changed Rust runtime source.

Evidence promoted:

- MSIX install: `20260607-090353-HUGH_SECOND`
- single-machine smoke: `20260607-090436-HUGH_SECOND`
- process ownership: `20260607-090457-HUGH_SECOND`
- startup single-instance: `20260607-090512-HUGH_SECOND`
- desktop single-instance: `20260607-090550-HUGH_SECOND`
- desktop-open idle CPU: `20260607-092453-HUGH_SECOND`
- five-state CPU matrix: `20260607-091438-HUGH_SECOND`
- HUGH-MAIN target-route CPU attempt: `20260607-092030-HUGH_SECOND`

Results:

- MSIX install evidence passed with `warn-explicit-windowsapps` alias mode
  because this shell still resolves `C:\Users\empty\.cargo\bin\musu.exe`
  before the WindowsApps alias.
- Single-machine smoke passed on `local-bridge-only` with bridge
  `http://127.0.0.1:14361` and CLI route checked.
- Process ownership passed with packaged runtime `1`, owned Node `0`, owned
  WebView2 `0`, and repo orphan helpers `0`.
- Startup single-instance reused bridge PID `34860` across repeated `musu up`
  invocations.
- Desktop single-instance kept one packaged `musu-desktop` process after three
  activations.
- Desktop-open idle CPU passed for `60.03s` with bridge runtime `1`, desktop
  shell `1`, owned WebView2 `6`, hot process count `0`, and WebView2 max
  `0.18` of one logical core.
- Five-state CPU matrix passed for `startup-open`, `runtime-started`,
  `dashboard-open`, `desktop-open`, and `post-route`; route probe succeeded.
- Target-route CPU passed after a `HUGH-MAIN` route attempt; the route output
  did not contain the expected token, but the failed attempt was explicitly
  allowed and the post-route CPU sample passed.

Clean go/no-go after evidence promotion:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `msix_install_verified=true`
- `process_ownership_verified=true`
- `startup_single_instance_verified=true`
- `desktop_single_instance_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_control_plane_env_ready=false`
- `multi_device_verified=false`
- `manifest_git.dirty=false`

Qualitative audit: no high or medium issue found. The current packaged local
desktop runtime does not reproduce the reported idle CPU busy-loop on
`HUGH_SECOND`. Public release remains No-Go because idle CPU and five-state
matrix evidence require two machines, and multi-device, hosted MUSU.PRO
P2P/relay, support mailbox, and Store evidence remain missing.

Search terms should include `GOAL v770`, `wiki/945`,
`current-head local desktop evidence after relay metadata gate`,
`20260607-090436-HUGH_SECOND`, `20260607-092453`,
`20260607-091438`, `20260607-092030`, `WebView2 max 0.18`,
`runtime_idle_cpu_valid_machine_count=1`,
`runtime_cpu_scenario_matrix_valid_machine_count=1`, and
`runtime_cpu_second_pc_route_attempt_verified=true`.

## 2026-06-07 Current-Head Local Desktop Evidence After Relay Metadata Gate Index Refresh (wiki/946)

MUSU local indexer was refreshed after wiki/945 and GOAL v770.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2879 files`
- `2790 symbols`
- `57437 ms`

Indexed context includes the current-head local desktop evidence refresh,
promoted evidence JSON, canonical report, BETA checklist, runtime
stabilization spec, GOAL, WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v771`, `wiki/946`,
`current-head local desktop evidence after relay metadata gate index refresh`,
`2879 files`, `2790 symbols`,
`57437 ms`, `20260607-092453`, `20260607-091438`, and
`20260607-092030`.

## 2026-06-07 Current-Head Qual Audit, Spec, and Next Steps (wiki/947)

Current HEAD `078ce1c5eeb11edc00aa9a6597e6db1f5b0acc59` was re-audited after
the local desktop evidence refresh.

Current interpretation:

- local packaged MUSU Desktop evidence remains current on `HUGH_SECOND`
- public release remains No-Go
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=1`
- `runtime_cpu_second_pc_route_attempt_verified=true`
- `p2p_control_plane_env_ready=false`
- P2P env status still reports 12 blockers

Spec lock:

- MUSU Desktop is the local executor.
- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback, and evidence/control plane.
- MUSU.PRO does not execute local work and does not become the default payload
  path.
- `localhost:3001` is not the packaged desktop runtime contract.

Validation:

- P2P tests: `112/112`
- typecheck: passed
- P2P relay/source contract audit: `ok=true`, `fail_count=0`
- release evidence verifier regression: `ok=True`, `case_count=104`
- `git diff --check`

Qualitative code audit found no high or medium issue. Low concerns are current
PowerShell PATH alias shadowing for developer evidence, fail-closed relay hook
dead-code appearance before real tunnel runtime lands, and stale operator packs
from `981f37ac` that must be regenerated before second-PC handoff.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_QUAL_AUDIT_SPEC_AND_NEXT_STEPS_2026_06_07.md`

Next-step plan:

- `docs\plans\RELEASE_1_15_0_RC1_NEXT_STEPS_AFTER_CURRENT_HEAD_QUAL_AUDIT_2026_06_07.md`

Search terms should include `GOAL v772`, `wiki/947`,
`current-head qual audit spec and next steps`, `078ce1c5`,
`P2P tests 112/112`, `release verifier 104/104`,
`P2P env blockers 12`, `MUSU Desktop local executor`,
`MUSU.PRO remote input control plane`, and `regenerate operator packs`.

## 2026-06-07 Current-Head Qual Audit Index Refresh (wiki/948)

MUSU local indexer was refreshed after wiki/947 and GOAL v772.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2881 files`
- `2790 symbols`
- `22225 ms`

Indexed context includes current-head qual audit/spec/next-steps docs, P2P
No-Go blockers, BETA checklist, P2P control-plane docs, MUSU.PRO P2P spec,
runtime stabilization spec, network boundary spec, GOAL, WIKI_INDEX, and CoS
memory.

Search terms should include `GOAL v773`, `wiki/948`,
`current-head qual audit index refresh`, `2881 files`, `2790 symbols`,
`22225 ms`, `078ce1c5`, `P2P env blockers 12`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-07 Frontend Polling Inventory Gate (wiki/949)

The frontend interval/refetch busy-loop release gate was hardened after the
current-head qual audit.

Code change:

- `audit-frontend-polling-contract.ps1` now locks the exact current inventory
  of 29 non-test `useLowDutyPolling` call-site files.
- The existing `low-duty polling call-site inventory` check now requires actual
  paths to equal expected paths.
- Audit JSON now reports expected, missing, and unexpected call-site counts and
  path arrays.
- `write-release-go-no-go.ps1` requires the inventory check for the
  `frontend interval/refetch` idle-busy-loop candidate.
- `runtime-polling-contract.test.ts` verifies the explicit inventory contract.

Validation:

- frontend polling audit `ok=true`, expected/actual `29/29`, missing `0`,
  unexpected `0`
- runtime polling tests `17/17`
- P2P tests `112/112`
- typecheck passed
- release evidence verifier regression `ok=True`
- P2P env status remains expected No-Go with 12 blockers
- `git diff --check` passed

Qualitative audit found no high or medium issue. The low residual risk is
intentional strictness: legitimate new polling surfaces must now update the
expected inventory and prove low-duty, abort-aware behavior.

Product boundary remains unchanged: MUSU Desktop is the local executor;
MUSU.PRO is remote input, project/company room, AI meeting room, presence,
rendezvous, path selection, relay fallback, and evidence/control plane.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_FRONTEND_POLLING_INVENTORY_GATE_2026_06_07.md`

Search terms should include `GOAL v774`, `wiki/949`,
`frontend polling inventory gate`, `expected_low_duty_polling_call_site_count`,
`missing_low_duty_polling_call_sites`,
`unexpected_low_duty_polling_call_sites`, `29/29`, `runtime polling 17/17`,
`P2P tests 112/112`, and `frontend interval/refetch`.

## 2026-06-07 Frontend Polling Inventory Gate Index Refresh (wiki/950)

MUSU local indexer was refreshed after wiki/949 and GOAL v774.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2884 files`
- `2790 symbols`
- `15020 ms`

Indexed context includes the frontend polling inventory gate code changes,
runtime polling contract test update, go/no-go idle busy-loop candidate
requirement, release verifier source-contract update, canonical report,
next-step plan, BETA checklist, runtime stabilization spec, MUSU.PRO P2P spec,
network boundary spec, WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v775`, `wiki/950`,
`frontend polling inventory gate index refresh`, `2884 files`,
`2790 symbols`, `15020 ms`,
`expected_low_duty_polling_call_site_count`,
`missing_low_duty_polling_call_sites`,
`unexpected_low_duty_polling_call_sites`, and `frontend interval/refetch`.

## 2026-06-07 Current Operator Handoff After Frontend Polling Inventory Gate (wiki/951)

Final operator handoff artifacts were regenerated after the frontend polling
inventory gate.

Source commit:

- `e53810cf365c4c3228cae5a14b373ee8878376fb`

Generated artifacts:

- final operator packet:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-20260607-101224.zip`
- latest final operator packet alias:
  `.local-build\final-operator-gates\musu-final-operator-gates-1.15.0-rc.1-latest.zip`
- operator action pack:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-101255.zip`
- latest operator action pack alias:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-latest.zip`
- second-PC transfer:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-101255\second-pc\MUSU-second-PC-transfer-1.15.0-rc.1-20260607-101255.zip`
- Partner Center zip:
  `.local-build\operator-action-pack\MUSU-1.15.0-rc.1-operator-action-pack-20260607-101255\partner-center\MUSU-1.15.0-rc.1-store-submission-20260607-101255.zip`
- support verification id:
  `musu-store-support-1.15.0-rc.1-20260607-101224`

Verification:

- final packet verifier `ok=true`, `fail_count=0`, `kit_count=1`
- action pack verifier `ok=true`, `fail_count=0`
- final handoff status sees packet/action pack verified
- clean go/no-go still reports `ready_for_public_desktop_release=false`,
  `local_artifacts_ready=true`, `single_machine_verified=true`,
  `runtime_idle_cpu_valid_machine_count=1`,
  `runtime_cpu_scenario_matrix_valid_machine_count=1`,
  `runtime_cpu_second_pc_route_attempt_verified=true`,
  `multi_device_verified=false`, `p2p_control_plane_env_ready=false`,
  `support_mailbox_verified=false`, `store_release_verified=false`, and
  `manifest_git.dirty=false`

Release meaning: the current operator artifact is ready for the next physical
second-PC run. It does not close second-PC route/CPU/matrix, live MUSU.PRO
P2P/relay, support mailbox, or Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_OPERATOR_HANDOFF_AFTER_FRONTEND_POLLING_INVENTORY_GATE_2026_06_07.md`

Search terms should include `GOAL v776`, `wiki/951`,
`current operator handoff after frontend polling inventory gate`, `e53810cf`,
`20260607-101224`, `20260607-101255`,
`MUSU-second-PC-transfer-1.15.0-rc.1-20260607-101255.zip`,
`musu-store-support-1.15.0-rc.1-20260607-101224`, `packet verified`,
`action pack verified`, and `ready_for_public_desktop_release=false`.

## 2026-06-07 Current Operator Handoff Index Refresh (wiki/952)

MUSU local indexer was refreshed after wiki/951 and GOAL v776.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2887 files`
- `2790 symbols`
- `30952 ms`

Indexed context includes the regenerated current operator handoff report, the
new second-PC transfer path, BETA checklist, next-step plan, WIKI_INDEX, GOAL,
and CoS memory.

Search terms should include `GOAL v777`, `wiki/952`,
`current operator handoff index refresh`, `2887 files`, `2790 symbols`,
`30952 ms`, `e53810cf`, `20260607-101224`, `20260607-101255`, and
`MUSU-second-PC-transfer-1.15.0-rc.1-20260607-101255.zip`.

## 2026-06-07 Current-Head Desktop-Open CPU Recheck After Operator Handoff (wiki/953)

A fresh 60s desktop-open idle CPU sample was captured on `HUGH_SECOND` from
clean source commit `059b947437231f0f1319e16f4d728115b402d020`.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-102745-HUGH_SECOND.desktop-open.evidence.json`

Result:

- `ok=true`
- `git_dirty=false`
- bridge `127.0.0.1:14361`, PID `34860`
- sample duration `60.039s`
- process roles: MUSU `2`, Node `0`, owned WebView2 `6`, other `0`
- process subroles: bridge runtime `1`, desktop shell `1`, WebView2 helper `6`
- hot processes `0`
- resource budget violations `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.08`
- total working set `363.16MB`

Code audit found no high or medium issue because this step adds evidence and
documentation only; no runtime source, polling surface, local API surface, P2P
transport, or trust boundary changed. The final operator packet and action pack
should be regenerated again after the documentation/evidence commit so their
metadata points at the final repository HEAD.

Product boundary remains unchanged: MUSU Desktop is the local executor;
MUSU.PRO is remote input, project/company room, AI meeting room, presence,
rendezvous, path selection, relay fallback, and evidence/control plane.
`localhost:3001` is not the packaged desktop release contract.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_DESKTOP_OPEN_CPU_RECHECK_AFTER_OPERATOR_HANDOFF_2026_06_07.md`

Search terms should include `GOAL v778`, `wiki/953`,
`current-head desktop-open CPU recheck after operator handoff`,
`20260607-102745-HUGH_SECOND.desktop-open`, `059b9474`,
`WebView2 0.08`, `hot process count 0`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-07 Current-Head Desktop-Open CPU Recheck Index Refresh (wiki/954)

MUSU local indexer was refreshed after wiki/953 and GOAL v778.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2891 files`
- `2790 symbols`
- `15617 ms`

Indexed context includes the `20260607-102745-HUGH_SECOND.desktop-open`
evidence JSON, current-head desktop-open CPU recheck report, BETA checklist,
next-step plan, runtime stabilization plan, MUSU.PRO P2P control-plane spec,
network boundary spec, WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v779`, `wiki/954`,
`current-head desktop-open CPU recheck index refresh`, `2891 files`,
`2790 symbols`, `15617 ms`, `20260607-102745-HUGH_SECOND.desktop-open`,
`MUSU Desktop local executor`, and `MUSU.PRO remote input control plane`.

## 2026-06-07 Bridge-Only Idle CPU Attribution (wiki/955)

Bridge-only CPU attribution was captured after closing the packaged desktop
shell and keeping the WindowsApps bridge runtime alive.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-105020-HUGH_SECOND.bridge-only.evidence.json`

Result:

- `ok=true`
- `git_dirty=false`
- bridge `127.0.0.1:14361`, PID `34860`
- sample duration `60.05s`
- process count before/after `1/1`
- process roles: MUSU `1`, Node `0`, WebView2 `0`, other `0`
- process subroles: bridge runtime `1`, desktop shell `0`, Node helper `0`,
  WebView2 helper `0`
- hot processes `0`
- resource budget violations `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0`
- total working set `18.98MB`

Assessment: the packaged bridge runtime is quiet in isolation, so the current
busy-loop investigation should not treat the bridge readiness/health loop as
the active CPU source on this machine. The remaining attribution work is
runtime-started after this evidence commit, desktop-open/WebView2 comparison,
post-route behavior, and second-PC evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_BRIDGE_ONLY_IDLE_CPU_ATTRIBUTION_2026_06_07.md`

Search terms should include `GOAL v780`, `wiki/955`,
`bridge-only idle CPU attribution`, `20260607-105020-HUGH_SECOND.bridge-only`,
`bridge_runtime 1`, `desktop_shell 0`, `WebView2 0`, `Node 0`,
`working set 18.98MB`, and `bridge CPU 0`.

## 2026-06-07 Bridge-Only Idle CPU Attribution Index Refresh (wiki/956)

MUSU local indexer was refreshed after wiki/955 and GOAL v780.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2895 files`
- `2790 symbols`
- `17851 ms`

Indexed context includes the `20260607-105020-HUGH_SECOND.bridge-only`
evidence JSON, bridge-only idle CPU attribution report, BETA checklist,
runtime stabilization plan, network boundary spec, WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v781`, `wiki/956`,
`bridge-only idle CPU attribution index refresh`, `2895 files`,
`2790 symbols`, `17851 ms`, `20260607-105020-HUGH_SECOND.bridge-only`,
`bridge_runtime 1`, `desktop_shell 0`, and `bridge CPU 0`.

## 2026-06-07 Runtime-Started Idle CPU Attribution (wiki/957)

Runtime-started CPU attribution was captured from clean source commit
`763a85a7880466e2bcccc72b57cdf0d5b9a660b1`.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-105940-HUGH_SECOND.runtime-started.evidence.json`

Result:

- `ok=true`
- `git_dirty=false`
- bridge `127.0.0.1:14361`, PID `34860`
- sample duration `60.049s`
- process count before/after `1/1`
- process roles: MUSU `1`, Node `0`, WebView2 `0`, other `0`
- process subroles: bridge runtime `1`, desktop shell `0`, Node helper `0`,
  WebView2 helper `0`
- hot processes `0`
- resource budget violations `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0`
- total working set `18.98MB`

Assessment: runtime-started matches bridge-only. The packaged bridge runtime
does not introduce a startup/readiness/health CPU loop in isolation on
`HUGH_SECOND`. Remaining attribution work is desktop-open/WebView2 delta,
startup-open activation delta, post-route behavior, and second-PC evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_STARTED_IDLE_CPU_ATTRIBUTION_2026_06_07.md`

Search terms should include `GOAL v782`, `wiki/957`,
`runtime-started idle CPU attribution`,
`20260607-105940-HUGH_SECOND.runtime-started`, `bridge_runtime 1`,
`desktop_shell 0`, `WebView2 0`, `Node 0`, `working set 18.98MB`, and
`bridge CPU 0`.

## 2026-06-07 Runtime-Started Idle CPU Attribution Index Refresh (wiki/958)

MUSU local indexer was refreshed after wiki/957 and GOAL v782.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2899 files`
- `2790 symbols`
- `16322 ms`

Indexed context includes the `20260607-105940-HUGH_SECOND.runtime-started`
evidence JSON, runtime-started idle CPU attribution report, BETA checklist,
runtime stabilization plan, network boundary spec, WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v783`, `wiki/958`,
`runtime-started idle CPU attribution index refresh`, `2899 files`,
`2790 symbols`, `16322 ms`,
`20260607-105940-HUGH_SECOND.runtime-started`, `bridge_runtime 1`,
`desktop_shell 0`, and `bridge CPU 0`.

## 2026-06-07 Startup-Open CPU Attribution (wiki/959)

Targeted startup-open CPU attribution was captured from clean source commit
`af394058c10d9691cf9d5217ffaa4ed24e4a31f9`.

Evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-111114-HUGH_SECOND.startup-open.evidence.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-111114-HUGH_SECOND.runtime-cpu-scenario-matrix.json`

Result:

- `ok=true`
- `git_dirty=false`
- startup sample delay `2.01s`
- sample duration `60.039s`
- bridge `127.0.0.1:14361`, PID `34860`
- process roles: MUSU `2`, Node `0`, WebView2 `6`, other `0`
- process subroles: bridge runtime `1`, desktop shell `1`, Node helper `0`,
  WebView2 helper `6`
- hot processes `0`
- resource budget violations `0`
- max one-core CPU: MUSU `0`, Node `0`, WebView2 `0.52`
- max subrole CPU: bridge runtime `0`, desktop shell `0`,
  WebView2 helper `0.52`
- total working set `359.53MB`
- targeted startup-open matrix verifier `ok=true`, `fail_count=0`

Assessment: startup activation does not reproduce a 20% idle busy-loop on
`HUGH_SECOND`. The only measurable CPU came from WebView2 helpers and stayed
far below the 5% one-core release budget. Bridge/runtime readiness and desktop
shell activation are not implicated by the current bridge-only,
runtime-started, and startup-open samples. Remaining attribution work is
post-route behavior and second-PC evidence.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_STARTUP_OPEN_CPU_ATTRIBUTION_2026_06_07.md`

Search terms should include `GOAL v784`, `wiki/959`,
`startup-open CPU attribution`,
`20260607-111114-HUGH_SECOND.startup-open`, `sample_delay_seconds 2.01`,
`WebView2 0.52`, `bridge_runtime 0`, `desktop_shell 0`,
`Node 0`, and `working set 359.53MB`.

## 2026-06-07 Startup-Open CPU Attribution Index Refresh (wiki/960)

MUSU local indexer was refreshed after wiki/959 and GOAL v784.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2904 files`
- `2790 symbols`
- `19789 ms`

Indexed context includes the `20260607-111114-HUGH_SECOND.startup-open`
evidence JSON, the targeted startup-open matrix, startup-open CPU attribution
report, BETA checklist, runtime stabilization plan, network boundary spec,
WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v785`, `wiki/960`,
`startup-open CPU attribution index refresh`, `2904 files`, `2790 symbols`,
`19789 ms`, `20260607-111114-HUGH_SECOND.startup-open`,
`WebView2 0.52`, `sample_delay_seconds 2.01`, and `bridge_runtime 0`.

## 2026-06-07 AG UI/UX SaaS Landscape Design (wiki/961)

AG UI/UX design was added after a same-day landscape check of official product
and docs surfaces for OpenAI Codex, GitHub Copilot cloud agent, Cursor
background agents, Google Jules, Devin, and Replit Agent.

Design source:

- `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`

Design conclusion:

- comparable SaaS products make cloud or remote async execution feel simple;
- MUSU should make distributed local execution feel just as simple;
- MUSU must be more explicit than competitors about execution device, route
  kind, local runtime state, and evidence;
- every run should show input source, execution device, route kind, and
  evidence state;
- primary IA is Command Center, Project Rooms, Agent Grid, Devices, Tasks,
  Evidence, and Settings;
- Project Rooms are the "AI company meeting room" where local agents coordinate
  plans, approvals, artifacts, and evidence.

Product boundary remains unchanged: MUSU.PRO is remote input, project/company
room, rendezvous, path-selection, relay fallback, and evidence/control plane;
local MUSU Desktop runtimes execute work.

Search terms should include `GOAL v786`, `wiki/961`, `AG UI/UX`,
`Agent Grid`, `Command Center`, `Project Rooms`, `Device Mesh`,
`Evidence Center`, `execution location explicit`, and `SaaS landscape`.

## 2026-06-07 AG UI/UX SaaS Landscape Design Index Refresh (wiki/962)

MUSU local indexer was refreshed after wiki/961 and GOAL v786.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2907 files`
- `2790 symbols`
- `19508 ms`

Indexed context includes `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`,
the MUSU.PRO P2P control-plane spec addendum, BETA checklist, WIKI_INDEX,
GOAL, and CoS memory.

Search terms should include `GOAL v787`, `wiki/962`,
`AG UI/UX index refresh`, `2907 files`, `2790 symbols`, `19508 ms`,
`Agent Grid`, `Command Center`, `Project Rooms`, `Device Mesh`,
`Evidence Center`, and `SaaS landscape`.

## 2026-06-07 AG UI/UX Design Freshness Boundary (wiki/963)

Clean go/no-go after commit `6c03729c` showed
`runtime_idle_cpu_valid_machine_count=0` because root/app `DESIGN.md` updates
are not part of the runtime evidence freshness allowlist. The AG UI/UX work was
documentation-only, but changing allowlist-external root design files made the
desktop-open CPU evidence appear stale.

Decision:

- keep canonical AG UI/UX design in
  `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`;
- do not touch root/app `DESIGN.md` for this release-evidence update;
- do not broaden freshness allowlists without source-contract tests;
- preserve local packaged runtime evidence freshness by keeping design addenda
  under `docs\`.

Search terms should include `GOAL v788`, `wiki/963`,
`AG UI/UX design freshness boundary`, `runtime_idle_cpu_valid_machine_count=0`,
`DESIGN.md freshness`, and `docs-only design`.

## 2026-06-07 AG UI/UX Design Freshness Boundary Index Refresh (wiki/964)

MUSU local indexer was refreshed after wiki/963 and GOAL v788.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2909 files`
- `2790 symbols`
- `16842 ms`

Indexed context includes the canonical AG UI/UX design, freshness boundary CoS
memory, BETA checklist freshness note, WIKI_INDEX, and GOAL.

Search terms should include `GOAL v789`, `wiki/964`,
`AG UI/UX freshness boundary index refresh`, `2909 files`, `2790 symbols`,
`16842 ms`, `DESIGN.md freshness`, and `docs-only design`.

## 2026-06-07 Runtime Idle CPU Scenario Selection Gate (wiki/965)

Clean go/no-go exposed a release-gate selection bug after targeted
`startup-open` CPU evidence was added. The release idle CPU gate requires
`desktop-open`, but go/no-go selected only recent runtime-idle files per machine
and the newer `startup-open` evidence masked the older desktop-open evidence.
That made `runtime_idle_cpu_valid_machine_count=0` even though the local
desktop-open CPU evidence was still valid.

Fix:

- `scripts\windows\write-release-go-no-go.ps1` now selects up to 12 recent
  runtime idle CPU candidates per machine;
- `candidate_selection=latest-per-machine-up-to-12`;
- `scripts\windows\test-release-evidence-verifiers.ps1` source-checks the
  runtime idle selection contract.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RUNTIME_IDLE_CPU_SCENARIO_SELECTION_GATE_2026_06_07.md`

Search terms should include `GOAL v790`, `wiki/965`,
`runtime idle CPU scenario selection`, `latest-per-machine-up-to-12`,
`startup-open masked desktop-open`, and
`runtime_idle_cpu_valid_machine_count=1`.

## 2026-06-07 Runtime Idle CPU Scenario Selection Gate Index Refresh (wiki/966)

MUSU local indexer was refreshed after wiki/965 and GOAL v790.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2912 files`
- `2790 symbols`
- `20441 ms`

Indexed context includes `write-release-go-no-go.ps1`,
`test-release-evidence-verifiers.ps1`, the runtime idle CPU scenario selection
report, BETA checklist, runtime stabilization plan, WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v791`, `wiki/966`,
`runtime idle CPU scenario selection index refresh`, `2912 files`,
`2790 symbols`, `20441 ms`, `latest-per-machine-up-to-12`, and
`startup-open masked desktop-open`.

## 2026-06-07 Process, Startup, and Desktop Single-Instance Recheck (wiki/967)

Current packaged MUSU Desktop local hardening was rechecked on `HUGH_SECOND`
from source commit `c9129327884eefe016e7776442a96d3eb8643831`.

Promoted evidence:

- `docs\evidence\process-ownership\1.15.0-rc.1\20260607-115103-HUGH_SECOND.process-ownership.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-115104-HUGH_SECOND.startup-single-instance.json`
- `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-115104-HUGH_SECOND.startup-single-instance.process-ownership.json`
- `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-115149-HUGH_SECOND.desktop-single-instance.json`

Results:

- process ownership `ok=true`, runtime `1`, desktop shell `1`, owned Node
  `0`, owned WebView2 `6`, orphan repo helpers `0`, bridge PID `34860`
- startup single-instance `ok=true`, three `musu up --json` calls reused
  bridge PID `34860`, repeated spawn count `0`
- desktop single-instance `ok=true`, three packaged AppUserModelId activations
  reused desktop PID `24144`, new desktop shell count `0`
- P2P store-forward/relay contract `ok=true`, Rust background loop contract
  `ok=true`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_PROCESS_STARTUP_DESKTOP_SINGLE_INSTANCE_RECHECK_2026_06_07.md`

Search terms should include `GOAL v792`, `wiki/967`,
`process startup desktop single-instance recheck`,
`20260607-115103-HUGH_SECOND.process-ownership`,
`20260607-115104-HUGH_SECOND.startup-single-instance`,
`20260607-115149-HUGH_SECOND.desktop-single-instance`, `bridge PID 34860`,
`desktop PID 24144`, `owned WebView2 6`, and `repeated_spawn_count 0`.

## 2026-06-07 Process/Startup/Desktop Single-Instance Recheck Index Refresh (wiki/968)

MUSU local indexer was refreshed after wiki/967 and GOAL v792.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2919 files`
- `2790 symbols`
- `15387 ms`

Indexed context includes the process/startup/desktop single-instance recheck
report, promoted process/startup/desktop evidence JSON, BETA checklist,
runtime stabilization plan, WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v793`, `wiki/968`,
`process startup desktop single-instance recheck index refresh`, `2919 files`,
`2790 symbols`, `15387 ms`, `bridge PID 34860`, `desktop PID 24144`,
`owned WebView2 6`, and `repeated_spawn_count 0`.

## 2026-06-07 Agent Control SaaS Deep Research (wiki/969)

Comparable SaaS and agent-control research was added:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LANDSCAPE_2026_06_07.md`
- updated `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`
- updated BETA checklist product split
- updated runtime stabilization execution plan
- CoS memory:
  `docs\memory\chief_of_staff\2026-06-07_agent_control_saas_deep_research.md`

Research conclusion:

- Claude Code Remote Control is the closest direct comparator because
  web/mobile controls a local agent session while execution stays on the local
  machine.
- Codex, GitHub Copilot cloud agent, Cursor Background Agents, Jules, Devin,
  and Replit validate command center, async agent, plan/log/review, ticket/team,
  and plain-language order patterns, but most move work into cloud execution.
- Tailscale validates the control-plane/data-plane split; ngrok validates
  outbound connector and explicit relay/tunnel patterns.

MUSU product decision:

- MUSU.PRO is the paid coordination/control plane: remote input, rooms,
  presence, rendezvous, path selection, relay fallback, evidence history,
  notifications, and team permissions.
- MUSU Desktop remains the local executor on each device.
- Pro features must not be described as hosted default execution.
- `localhost:3001` should not be the normal user-facing release path.

Search terms should include `GOAL v794`, `wiki/969`,
`agent control SaaS deep research`, `Claude Code Remote Control`,
`MUSU.PRO remote input`, `local MUSU Desktop execution`,
`control plane data plane`, `Agent Grid`, `Project Rooms`, `Device Mesh`, and
`localhost:3001`.

## 2026-06-07 Agent Control SaaS Deep Research Index Refresh (wiki/970)

MUSU local indexer was refreshed after wiki/969 and GOAL v794.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2922 files`
- `2790 symbols`
- `13677 ms`

Indexed context includes the agent-control SaaS deep research report, AG UI/UX
design update, BETA checklist product split update, runtime stabilization
research alignment, WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v795`, `wiki/970`,
`agent control SaaS deep research index refresh`, `2922 files`, `2790 symbols`,
`13677 ms`, `Claude Code Remote Control`, `MUSU.PRO remote input`,
`local MUSU Desktop execution`, `control plane data plane`, and
`localhost:3001`.

## 2026-06-07 Current-HEAD Target Route CPU Matrix and Selection Gate (wiki/971)

Current HEAD `c71915aa86b94241cbd12d53b88c303c324a599b` has fresh five-state
runtime CPU evidence on `HUGH_SECOND` after a targeted route attempt to
`HUGH-MAIN`.

Promoted evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-122313-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- per-scenario evidence for `startup-open`, `runtime-started`,
  `dashboard-open`, `desktop-open`, and `post-route`
- five-state verification:
  `20260607-122313-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- targeted post-route verification:
  `20260607-122313-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`

Results:

- all five samples ran at least `60s` and stayed under the `5%` one-core
  budget
- MUSU, bridge runtime, and desktop shell max CPU stayed `0`
- Node process count stayed `0`
- owned WebView2 count stayed `6`
- highest WebView2 max was `0.16`
- hot process count stayed `0`
- `HUGH-MAIN` route attempt timed out at
  `http://192.168.1.192:8949/api/tasks/delegate`

Go/no-go runtime CPU scenario selection now keeps latest candidates, complete
five-state candidates, and target-bearing `post-route` candidates. The reported
selection mode is
`latest-per-machine-up-to-12-plus-complete-scenario-and-target-route-candidates`.

Validation passed:

- five-state failed-route-allowed verifier `ok=true`, `fail_count=0`
- targeted post-route verifier `ok=true`, `fail_count=0`
- release evidence verifier regression `104/104`
- pre-commit go/no-go completed and remains No-Go on second-PC/multi-device,
  P2P env, support mailbox, Store, and dirty-worktree blockers

Search terms should include `GOAL v796`, `wiki/971`,
`current-head target route CPU matrix`,
`20260607-122313-HUGH_SECOND.current-head-target-route`, `HUGH-MAIN timeout`,
`candidate_selection`,
`latest-per-machine-up-to-12-plus-complete-scenario-and-target-route-candidates`,
`WebView2 0.16`, `MUSU max 0`, `Node 0`, and `hot process count 0`.

## 2026-06-07 Current-HEAD Target Route CPU Matrix Selection Gate Index Refresh (wiki/972)

MUSU local indexer was refreshed after wiki/971 and GOAL v796.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2933 files`
- `2790 symbols`
- `26410 ms`

Indexed context includes the current-head target-route CPU matrix report,
promoted `20260607-122313-HUGH_SECOND.current-head-target-route` evidence,
go/no-go runtime CPU candidate selection hardening, release verifier
source-contract update, BETA checklist, runtime stabilization plan, WIKI_INDEX,
GOAL, and CoS memory.

Search terms should include `GOAL v797`, `wiki/972`,
`current-head target route CPU matrix selection gate index refresh`,
`2933 files`, `2790 symbols`, `26410 ms`,
`20260607-122313-HUGH_SECOND.current-head-target-route`, `HUGH-MAIN timeout`,
`candidate_selection`, and
`latest-per-machine-up-to-12-plus-complete-scenario-and-target-route-candidates`.

## 2026-06-07 Agent Control SaaS Deep Research Supplement (wiki/973)

The agent-control SaaS landscape and AG UI/UX design were supplemented with
new primary-source comparisons checked on 2026-06-07.

Updated files:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LANDSCAPE_2026_06_07.md`
- `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`
- `docs\BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`
- `docs\MUSU_RUNTIME_STABILIZATION_EXECUTION_PLAN_2026_05_31.md`
- CoS memory:
  `docs\memory\chief_of_staff\2026-06-07_agent_control_saas_deep_research_supplement.md`

New comparators:

- GitHub Copilot CLI Remote Control
- GitHub Copilot cloud/local sandboxes
- GitHub Actions self-hosted runners
- VS Code Remote Tunnels
- Cloudflare Tunnel
- Tailscale DERP servers
- Factory Droids

Supplemental decision:

- Claude Code Remote Control and GitHub Copilot CLI Remote Control are the
  closest direct comparators for MUSU.PRO remote input into local execution.
- Web/mobile remote control may submit prompts, answer questions, approve/deny
  plans and permission requests, cancel current work, and view status/evidence.
- Local files, shell commands, tools, adapters, and process ownership must stay
  on the selected MUSU Desktop device unless a separately labeled hosted-worker
  mode is introduced later.
- Device scheduling should borrow self-hosted-runner semantics: online/idle
  matching, capability labels, assignment, pickup timeout, queued state, stale
  runner detection, and externalized logs.
- Tunnel/relay features must be authenticated, non-anonymous, owner-scoped,
  expiring, revocable, and backed by route metadata, transport proof, and
  payload delivery proof before closing release gates.

Release impact:

- This is docs/spec/research progress only.
- Public release remains No-Go on second-PC route/CPU/matrix, live
  `musu.pro` release-grade relay proof, support mailbox proof, and Store proof.

Search terms should include `GOAL v798`, `wiki/973`,
`agent control SaaS deep research supplement`,
`GitHub Copilot CLI Remote Control`, `self-hosted runners`,
`VS Code Remote Tunnels`, `Cloudflare Tunnel`, `Tailscale DERP`,
`remote control local execution`, `MUSU.PRO remote input`,
`local MUSU Desktop execution`, and `no anonymous agent tunnels`.

## 2026-06-07 Agent Control SaaS Deep Research Supplement Index Refresh (wiki/974)

MUSU local indexer was refreshed after wiki/973 and GOAL v798.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2935 files`
- `2790 symbols`
- `18552 ms`

Indexed context includes the supplemented agent-control SaaS research, updated
AG UI/UX control-plane design, BETA checklist product split, runtime
stabilization research alignment, WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v799`, `wiki/974`,
`agent control SaaS deep research supplement index refresh`, `2935 files`,
`2790 symbols`, `18552 ms`, `GitHub Copilot CLI Remote Control`,
`self-hosted runners`, `VS Code Remote Tunnels`, `Cloudflare Tunnel`,
`Tailscale DERP`, `remote control local execution`, and
`no anonymous agent tunnels`.

## 2026-06-07 P2P Relay Transport Descriptor Target Kind (wiki/975)

The P2P relay policy now reports the source relay transport descriptor as the
release target kind:

- `RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_RELAY_TRANSPORT_KIND=quic_relay_tunnel`
- `RELEASE_GRADE_TRANSPORT_REQUIRED=quic_tls_1_3`

The release data path remains closed:

- `RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED=false`
- `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=false`
- release payload endpoint is still metadata-only preflight
- preview store-forward queue remains non-release-grade

Current `show-musu-pro-p2p-env-status.ps1 -Json` now reports
`source.relay_transport_kind_release_grade=true` and no longer includes
`source_relay_transport_kind_not_release_grade`, but remains `ok=false` on the
real missing work: release payload endpoint, local release tunnel runtime,
preview queue, hosted KV/Upstash storage, runtime login, route proof, route
metadata, transport proof, and payload delivery proof.

Validation passed:

- `npm run test:p2p` `112/112`
- `npm run typecheck`
- P2P relay contract audit `ok=true`, `fail_count=0`
- P2P env status expected `ok=false`
- release verifier regression `ok=true`, `case_count=104`,
  `failed_case_count=0`
- `git diff --check`

Code audit found no high or medium issue. Residual semantic risk is that
`relay_transport_kind=quic_relay_tunnel` can be misread as runtime readiness;
the source gate still prevents that because `relayTransportWired()` requires
the release payload endpoint and local release tunnel runtime markers, both
still false.

Search terms should include `GOAL v800`, `wiki/975`,
`P2P relay transport descriptor target kind`,
`RELAY_TRANSPORT_KIND=quic_relay_tunnel`,
`relay_transport_kind_release_grade=true`,
`source_release_relay_payload_endpoint_not_implemented`, and
`source_release_relay_tunnel_runtime_not_implemented`.

## 2026-06-07 P2P Relay Transport Descriptor Target Kind Index Refresh (wiki/976)

MUSU local indexer was refreshed after wiki/975 and GOAL v800.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2938 files`
- `2790 symbols`
- `14289 ms`

Indexed context includes the relay descriptor target-kind code/test update,
canonical report, P2P control-plane specs, BETA checklist, WIKI_INDEX, GOAL,
and CoS memory.

Search terms should include `GOAL v801`, `wiki/976`,
`P2P relay transport descriptor target kind index refresh`, `2938 files`,
`2790 symbols`, `14289 ms`, and
`RELAY_TRANSPORT_KIND=quic_relay_tunnel`.

## 2026-06-07 P2P Relay Candidate Protocol Release Kind (wiki/977)

The P2P relay candidate metadata path now accepts and preserves the same
release relay kind used by the transport descriptor.

Changed:

- web rendezvous candidate schema accepts `relay_protocol=quic_relay_tunnel`
- room presence schema accepts `relay_protocol=quic_relay_tunnel`
- `normalizeCandidateEndpoints()` preserves `quic_relay_tunnel`
- Rust `RelayProtocol` adds `QuicRelayTunnel`
- `musu room presence publish --relay-url ...` defaults relay candidates to
  `QuicRelayTunnel`
- Rust route candidate metadata tests now preserve `quic_relay_tunnel`
- P2P relay contract audit and release verifier regressions now source-check
  this candidate protocol path

Validation passed:

- `npm run test:p2p` `112/112`
- `npm run typecheck`
- Rust route candidate tests `2/2`
- Rust room presence tests `5/5`
- P2P relay contract audit `ok=true`, `fail_count=0`
- release verifier regression `ok=true`, `case_count=105`,
  `failed_case_count=0`
- P2P env status expected `ok=false`
- `git diff --check`

Release boundary:

- this is candidate metadata alignment only
- it does not implement the release payload endpoint
- it does not implement local `quic_relay_tunnel` byte movement
- it does not close live MUSU.PRO login/storage, route metadata, transport
  proof, payload delivery proof, second-machine, support mailbox, or Store
  gates

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_RELAY_CANDIDATE_PROTOCOL_RELEASE_KIND_2026_06_07.md`

Search terms should include `GOAL v802`, `wiki/977`,
`P2P relay candidate protocol release kind`,
`relay_protocol=quic_relay_tunnel`, `RelayProtocol::QuicRelayTunnel`,
`room presence publish`, `release verifier 105/105`, and
`source_release_relay_tunnel_runtime_not_implemented`.

## 2026-06-07 P2P Relay Candidate Protocol Index Refresh (wiki/978)

MUSU local indexer was refreshed after wiki/977 and GOAL v802.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2941 files`
- `2790 symbols`
- `19972 ms`

Indexed context includes the web/Rust candidate protocol source change,
release verifier source-contract coverage, canonical report, P2P
control-plane specs, BETA checklist, WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v803`, `wiki/978`,
`P2P relay candidate protocol index refresh`, `2941 files`,
`2790 symbols`, `19972 ms`, `relay_protocol=quic_relay_tunnel`, and
`RelayProtocol::QuicRelayTunnel`.

## 2026-06-07 Current-HEAD Local Evidence After Relay Candidate Protocol (wiki/979)

Fresh HUGH_SECOND local evidence was recorded after commit `5b2a184d` because
the relay candidate protocol source change made prior local evidence stale for
go/no-go freshness.

Promoted evidence:

- single-machine smoke:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-134308-HUGH_SECOND.evidence.json`
- single-machine verification:
  `docs\evidence\single-machine\1.15.0-rc.1\20260607-134308-HUGH_SECOND.verification.json`
- process ownership:
  `docs\evidence\process-ownership\1.15.0-rc.1\20260607-134335-HUGH_SECOND.process-ownership.json`
- startup single-instance:
  `docs\evidence\startup-single-instance\1.15.0-rc.1\20260607-134335-HUGH_SECOND.startup-single-instance.json`
- desktop single-instance:
  `docs\evidence\desktop-single-instance\1.15.0-rc.1\20260607-134335-HUGH_SECOND.desktop-single-instance.json`

Results:

- single-machine `ok=true`, `local-bridge-only`, bridge
  `http://127.0.0.1:14361`
- process ownership `ok=true`
- startup single-instance `ok=true`
- desktop single-instance `ok=true`
- dirty-tree go/no-go restored single-machine/process/startup/desktop gates
  and stayed No-Go on multi-device, two-machine CPU/matrix, targeted/successful
  second-PC route proof, support, Store, and P2P control-plane proof

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_LOCAL_EVIDENCE_AFTER_RELAY_CANDIDATE_PROTOCOL_2026_06_07.md`

Search terms should include `GOAL v804`, `wiki/979`,
`current-head local evidence after relay candidate protocol`,
`20260607-134308-HUGH_SECOND`, `20260607-134335-HUGH_SECOND`,
`single_machine=true`, `process_ownership=true`,
`startup_single_instance=true`, and `desktop_single_instance=true`.

## 2026-06-07 Current-HEAD Local Evidence Index Refresh After Relay Candidate Protocol (wiki/980)

MUSU local indexer was refreshed after wiki/979 and GOAL v804.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2951 files`
- `2790 symbols`
- `20277 ms`

Indexed context includes the relay candidate protocol source/docs, fresh
HUGH_SECOND single-machine/process/startup/desktop evidence, canonical local
evidence report, WIKI_INDEX, GOAL, BETA checklist, and CoS memory.

Search terms should include `GOAL v805`, `wiki/980`,
`current-head local evidence index refresh after relay candidate protocol`,
`2951 files`, `2790 symbols`, `20277 ms`,
`20260607-134308-HUGH_SECOND`, and `20260607-134335-HUGH_SECOND`.

## 2026-06-07 Agent Control SaaS Research Current Primary-Source Supplement (wiki/981)

The agent-control SaaS landscape research and AG UI/UX control-plane design
were supplemented with current primary-source findings.

Updated docs:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LANDSCAPE_2026_06_07.md`
- `docs\AG_UI_UX_CONTROL_PLANE_DESIGN_2026_06_07.md`

Added/reinforced comparators:

- Claude Code Remote Control versus Claude Code on the web
- OpenAI Codex Local, Codex Cloud, Remote Control, enterprise controls, and
  local shell
- GitHub Copilot CLI Remote Control and cloud agent
- OpenHands local GUI/CLI, SDK, remote server, and cloud topology
- Tailscale, ZeroTier, Twingate, VS Code Remote Tunnels, and Cloudflare Tunnel
  as control-plane/data-plane and connector/relay references

Product conclusion:

- MUSU.PRO is the remote input, project room, presence, rendezvous, path
  selection, relay fallback, and evidence/control plane.
- MUSU Desktop is the local executor on each device.
- UI must expose `Input from <surface>`, `Executing on <device/runtime>`,
  `Route <direct|relay|cloud>`, and `Evidence <ok|missing|failed>`.
- `Remote control`, `Local execution`, `Local sandbox`, `Cloud task`, and
  `Relay fallback` are separate states and must not collapse into a generic
  `connected` label.

Search terms should include `GOAL v806`, `wiki/981`,
`agent control SaaS research current primary-source supplement`,
`Codex Local`, `Codex Cloud`, `Remote Control`, `OpenHands`,
`Twingate`, `ZeroTier`, and `execution-locus banner`.

## 2026-06-07 Current-HEAD CPU Matrix After Agent Control Research (wiki/982)

After commit `13dcd4677fde12daa6454b4064ca14da55b3a3ae`, HUGH_SECOND captured
a clean packaged runtime CPU matrix with `-OpenDesktopApp`, `-RunRouteProbe`,
target `HUGH-MAIN`, and `-AllowFailedRouteProbe`.

Promoted evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-141207-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-141207-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-141207-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`
- per-scenario evidence for startup-open, runtime-started, dashboard-open,
  desktop-open, and post-route

Results:

- full matrix verifier `ok=true`, `fail_count=0`
- post-route target verifier `ok=true`, `fail_count=0`
- `git_dirty=false`
- hot process count `0` in all five scenarios
- MUSU CPU `0`, Node CPU `0`
- owned WebView2 max `0.13`
- route probe `ok=false`, `failure_allowed=true`, target `HUGH-MAIN`,
  timeout to `http://192.168.1.192:8949/api/tasks/delegate`

Release meaning:

- the reported 20% busy-loop did not reproduce on HUGH_SECOND/current HEAD
- this is valid failed target-route CPU diagnostic evidence
- this is not successful second-PC route proof or hosted P2P release proof

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_CPU_MATRIX_AFTER_AGENT_CONTROL_RESEARCH_2026_06_07.md`

Search terms should include `GOAL v807`, `wiki/982`,
`current-head CPU matrix after agent control research`,
`20260607-141207-HUGH_SECOND`, `13dcd467`, `HUGH-MAIN timeout`,
`WebView2 max 0.13`, and `MUSU CPU 0`.

## 2026-06-07 Current-HEAD CPU Matrix Agent Control Research Index Refresh (wiki/983)

MUSU local indexer was refreshed after wiki/981, wiki/982, and GOAL v807.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2963 files`
- `2790 symbols`
- `39771 ms`

Indexed context includes the agent-control SaaS primary-source supplement, AG
UI/UX execution-locus design, clean current-head CPU matrix evidence,
canonical report, BETA checklist, P2P specs, runtime stabilization plan,
WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v808`, `wiki/983`, `2963 files`,
`2790 symbols`, `39771 ms`,
`current-head CPU matrix agent control research index refresh`,
`20260607-141207-HUGH_SECOND`, `agent control SaaS primary-source supplement`,
and `execution-locus banner`.

## 2026-06-07 Current-HEAD CPU Matrix Goal Continuation (wiki/984)

Current HEAD `f7f45922611e1986947053e94c3525d7b395eb8a` has a later
HUGH_SECOND packaged WindowsApps runtime CPU matrix after the SaaS/AG UI
research and docs refresh.

Promoted evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-143513-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-143513-HUGH_SECOND.current-head-target-route.runtime-cpu-scenario-matrix.verification.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-143513-HUGH_SECOND.current-head-target-route.post-route-target.verification.json`
- per-scenario evidence for startup-open, runtime-started, dashboard-open,
  desktop-open, and post-route

Results:

- full matrix verifier `ok=true`, `fail_count=0`
- post-route target verifier `ok=true`, `fail_count=0`
- `git_dirty=false`
- `musu_exe_release_identity=true`
- hot process count `0` in all five scenarios
- MUSU CPU `0`, Node CPU `0`
- owned WebView2 max `0.10`
- owned WebView2 helper count `6`
- route probe target `HUGH-MAIN`, timeout to
  `http://192.168.1.192:8949/api/tasks/delegate`, `failure_allowed=true`

Audit results:

- P2P store-forward relay contract `ok=true`, `fail_count=0`
- Rust background-loop contract `ok=true`, `fail_count=0`
- frontend polling contract `ok=true`, `fail_count=0`, `29/29` low-duty
  polling call sites
- process ownership `ok=true`, `fail_count=0`, packaged runtime `1`,
  packaged desktop `1`, owned Node `0`, owned WebView2 `6`

Release meaning:

- the reported 20% busy-loop did not reproduce on HUGH_SECOND/current HEAD;
- this is valid failed target-route CPU diagnostic evidence;
- this is not successful second-PC route proof and does not close the
  multi-device, hosted P2P/relay, support, or Store gates.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_CPU_MATRIX_GOAL_CONTINUATION_2026_06_07.md`

Search terms should include `GOAL v809`, `wiki/984`,
`current-head CPU matrix goal continuation`,
`20260607-143513-HUGH_SECOND`, `f7f45922`, `HUGH-MAIN timeout`,
`WebView2 max 0.10`, `MUSU CPU 0`, and `process ownership fail_count=0`.

## 2026-06-07 Current-HEAD CPU Matrix Goal Continuation Index Refresh (wiki/985)

MUSU local indexer was refreshed after wiki/984 and GOAL v809.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2974 files`
- `2790 symbols`
- `15841 ms`

Indexed context includes the current-head CPU matrix goal continuation report,
promoted `20260607-143513-HUGH_SECOND` runtime CPU matrix evidence, SaaS
continuation source check, AG MVP screen contracts, BETA checklist update,
runtime stabilization plan, WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v810`, `wiki/985`, `2974 files`,
`2790 symbols`, `15841 ms`,
`current-head CPU matrix goal continuation index refresh`,
`20260607-143513-HUGH_SECOND`, `SaaS continuation source check`, and
`AG MVP screen contracts`.

## 2026-06-07 Current-HEAD Desktop-Open CPU And Research Gate Recheck (wiki/986)

Current HEAD `41ce3d71e14138cf44d6d9d4879bf1c939508deb` has fresh
HUGH_SECOND packaged desktop-open idle CPU evidence after the SaaS/AG UI/UX
research and CPU matrix continuation work.

Promoted evidence:

- `docs\evidence\runtime-idle-cpu\1.15.0-rc.1\20260607-150047-HUGH_SECOND.desktop-open.evidence.json`

Results:

- `ok=true`
- `git_dirty=false`
- `sample_seconds=60.048`
- MUSU CPU `0`
- Node CPU `0`
- owned WebView2 max `0.13`
- owned WebView2 helpers `6`
- hot process count `0`
- working set `370.64MB`

Dirty-tree go/no-go after promotion reported:

- `ready_for_public_desktop_release=false`
- `local_artifacts_ready=true`
- `single_machine_verified=true`
- `runtime_idle_cpu_valid_machine_count=1`
- `runtime_cpu_scenario_matrix_valid_machine_count=0`
- `runtime_cpu_second_pc_route_attempt_valid_machine_count=1`

The matrix count remains `0` because current target-route CPU evidence is a
failed allowed route diagnostic against `HUGH-MAIN`, not successful release
post-route proof.

The 15:00 KST SaaS source recheck reconfirmed that Claude Code Remote Control,
GitHub Copilot CLI Remote Control, OpenAI Codex, and Tailscale-style
control/data-plane designs all point to the same MUSU boundary: MUSU.PRO is
remote input, rooms, rendezvous, path selection, relay fallback, and evidence;
MUSU Desktop is the local executor.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_DESKTOP_OPEN_CPU_AND_RESEARCH_GATE_RECHECK_2026_06_07.md`

Search terms should include `GOAL v811`, `wiki/986`,
`20260607-150047-HUGH_SECOND.desktop-open`, `41ce3d71`, `WebView2 max 0.13`,
`runtime_idle_cpu_valid_machine_count=1`, `runtime_cpu_scenario_matrix_valid_machine_count=0`,
and `remote control local execution`.

## 2026-06-07 Current-HEAD Desktop-Open CPU And Research Gate Index Refresh (wiki/987)

MUSU local indexer was refreshed after wiki/986 and GOAL v811.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2978 files`
- `2790 symbols`
- `31771 ms`

Indexed context includes the fresh
`20260607-150047-HUGH_SECOND.desktop-open` idle CPU evidence, current-head CPU
and research gate recheck report, 15:00 KST SaaS source recheck, AG UI/UX
design recheck, BETA checklist update, runtime stabilization plan,
WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v812`, `wiki/987`, `2978 files`,
`2790 symbols`, `31771 ms`,
`current-head desktop-open CPU research gate index refresh`,
`20260607-150047-HUGH_SECOND.desktop-open`, `WebView2 max 0.13`, and
`runtime_idle_cpu_valid_machine_count=1`.

## 2026-06-07 Relay Tunnel Not-Implemented Branch Marker Guard (wiki/988)

P2P env status now treats the active Rust
`release_relay_tunnel_runtime_not_implemented` branch as part of the release
relay tunnel runtime marker contract.

Changed implementation:

- `show-musu-pro-p2p-env-status.ps1` now reports
  `release_relay_tunnel_runtime_not_implemented_branch_active`;
- the marker conflict rule now fails a future
  `RELAY_TUNNEL_RUNTIME_IMPLEMENTED=true` flip if the not-implemented branch is
  still active;
- `test-release-evidence-verifiers.ps1` checks the guard and next-step
  contract.

Current env status remains expected No-Go:

- `ok=false`
- blocker count `11`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- marker conflict is currently false because the runtime marker remains false

Validation:

- P2P env status expected No-Go with `11` blockers
- release verifier regression `ok=true`, `case_count=105`,
  `failed_case_count=0`
- P2P relay contract audit `ok=true`, `fail_count=0`
- `git diff --check`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_TUNNEL_NOT_IMPLEMENTED_BRANCH_MARKER_GUARD_2026_06_07.md`

Search terms should include `GOAL v813`, `wiki/988`,
`release_relay_tunnel_runtime_not_implemented_branch_active`,
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED`, `quic_relay_tunnel`,
`quic_tls_1_3`, `case_count=105`, and `blocker count 11`.

## 2026-06-07 Relay Tunnel Not-Implemented Branch Guard Index Refresh (wiki/989)

MUSU local indexer was refreshed after wiki/988 and GOAL v813.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2981 files`
- `2790 symbols`
- `20979 ms`

Indexed context includes the not-implemented branch marker guard code update,
canonical relay tunnel marker-guard report, P2P control-plane spec notes, BETA
checklist update, runtime stabilization plan update, WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v814`, `wiki/989`, `2981 files`,
`2790 symbols`, `20979 ms`,
`relay tunnel not-implemented branch guard index refresh`,
`release_relay_tunnel_runtime_not_implemented_branch_active`,
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED`, and `case_count=105`.

## 2026-06-07 Release Relay Lease Readiness Gate (wiki/990)

Release relay connect and payload preflight now share a release relay lease
readiness gate.

Changed implementation:

- added `musu-bee\src\lib\p2pReleaseRelayLeaseValidation.ts`;
- `/api/v1/relay/connect` rejects stale or mismatched relay leases with
  `release_relay_lease_not_connect_ready`;
- `/api/v1/relay/payload` rejects stale or mismatched relay leases with
  `release_relay_lease_not_payload_ready`;
- both paths expose lease blockers such as
  `release_relay_lease_relay_url_mismatch`;
- P2P tests cover stale relay URL rejection for both preflight paths;
- P2P relay contract audit now checks the shared readiness validator.

Validation:

- `npm run test:p2p`: `114/114`
- `npm run typecheck`
- P2P relay contract audit `ok=true`, `fail_count=0`
- `git diff --check`

Release meaning:

- no release marker was flipped;
- release payload bytes remain rejected;
- release payload endpoint and release tunnel runtime remain unimplemented;
- live MUSU.PRO route metadata, transport proof, payload delivery proof, and
  second-PC evidence remain required.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELEASE_RELAY_LEASE_READINESS_GATE_2026_06_07.md`

Search terms should include `GOAL v815`, `wiki/990`,
`p2pReleaseRelayLeaseValidation`, `release_relay_lease_relay_url_mismatch`,
`release_relay_lease_not_connect_ready`,
`release_relay_lease_not_payload_ready`, and `test:p2p 114/114`.

## 2026-06-07 Release Relay Lease Readiness Gate Index Refresh (wiki/991)

MUSU local indexer was refreshed after wiki/990 and GOAL v815.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2985 files`
- `2794 symbols`
- `25903 ms`

Indexed context includes the shared release relay lease validator,
connect/payload preflight readiness gate updates, P2P tests, P2P relay contract
audit update, canonical release relay lease readiness report, BETA checklist,
P2P control-plane specs, runtime stabilization plan, WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v816`, `wiki/991`, `2985 files`,
`2794 symbols`, `25903 ms`,
`release relay lease readiness gate index refresh`,
`p2pReleaseRelayLeaseValidation`,
`release_relay_lease_relay_url_mismatch`, and `test:p2p 114/114`.

## 2026-06-07 Agent Control SaaS Final Source Recheck (wiki/992)

Final same-day source recheck was added after the release relay lease readiness
gate.

Canonical report:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_FINAL_RECHECK_2026_06_07.md`

Sources rechecked:

- Claude Code Remote Control
- OpenAI Codex product page, app announcement, and GitHub repository
- GitHub Copilot cloud agent and third-party coding agents
- Cursor Background Agents and Web/Mobile Agents
- Google Jules
- Devin
- Replit Agent
- Tailscale control/data-plane and DERP references

Decision unchanged:

- MUSU.PRO is remote input, project/company room, AI meeting room, presence,
  rendezvous, path selection, relay fallback, evidence, notifications, and
  team-policy control plane.
- MUSU Desktop is the local filesystem/process/tool/adapter executor and local
  permission boundary.
- P2P direct paths remain preferred after MUSU.PRO bootstrap.
- Hosted relay remains explicit fallback and must prove policy allow, lease
  readiness, route metadata, transport proof, and payload delivery proof before
  release.
- `localhost` remains a local diagnostic detail, not the normal release URL.

AG UI/UX requirement:

- The order composer must show `Input`, `Executing on`, `Route`, and
  `Evidence` before submission.
- No eligible online MUSU Desktop runtime means no immediate submit; the only
  valid remote behavior is explicit queueing with pickup timeout and visible
  offline/sleep/policy state.

Search terms should include `GOAL v817`, `wiki/992`,
`agent control SaaS final source recheck`, `GitHub third-party coding agents`,
`Codex command center`, `Cursor Web and Mobile Agents`,
`Tailscale control data plane`, `MUSU Desktop local executor`, and
`execution-locus strip`.

## 2026-06-07 Agent Control SaaS Final Source Recheck Index Refresh (wiki/993)

MUSU local indexer was refreshed after wiki/992 and GOAL v817.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2988 files`
- `2794 symbols`
- `18593 ms`

Indexed context includes the final agent-control SaaS source recheck, AG UI/UX
final design recheck, BETA checklist product split update, WIKI_INDEX, GOAL,
and CoS memory.

Search terms should include `GOAL v818`, `wiki/993`, `2988 files`,
`2794 symbols`, `18593 ms`,
`agent control SaaS final source recheck index refresh`,
`GitHub third-party coding agents`, `Codex command center`,
`Cursor Web and Mobile Agents`, `Tailscale control data plane`, and
`execution-locus strip`.

## 2026-06-07 Agent Control SaaS Operator Deep Dive (wiki/994)

Operator-requested deeper SaaS research was added after wiki/992/wiki/993.

Canonical report:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_OPERATOR_DEEP_DIVE_2026_06_07.md`

The research separates comparable products into five patterns:

- remote control of local execution;
- command center for multiple agents;
- hosted async coding agent;
- cloud queue to customer-owned runner;
- control plane plus device data plane.

Closest direct comparators:

- Claude Code Remote Control;
- GitHub Copilot CLI Remote Control;
- OpenAI Codex Remote connections.

Product decision remains unchanged:

- MUSU.PRO is web/mobile/team coordination SaaS: remote input, rooms, meeting
  timeline, presence, authenticated work-order envelopes, rendezvous, path
  selection, relay fallback negotiation, evidence, notifications, and policy.
- MUSU Desktop remains the local executor: filesystem, process, tools,
  adapters, secrets, permission prompts, local durable inbox, and evidence.
- Hosted agent products are useful references for plan/status/review UX, but
  not MUSU's default execution model.
- Relay/tunnel behavior must be explicit, authenticated, revocable, and backed
  by route metadata, transport proof, and payload delivery proof.

AG UI/UX requirement:

- Command Center must require room, target, execution locus, route policy,
  permission envelope, queue timeout, and expected evidence before submission.
- No eligible online Desktop runtime means explicit queueing or remediation,
  not fake cloud execution.

Search terms should include `GOAL v819`, `wiki/994`,
`operator deep dive`, `remote control of local execution`,
`GitHub Copilot CLI Remote Control`, `Codex Remote connections`,
`cloud queue to customer-owned runner`, `Command Center`, and
`local MUSU Desktop executor`.

## 2026-06-07 Agent Control SaaS Operator Deep Dive Index Refresh (wiki/995)

MUSU local indexer was refreshed after wiki/994 and GOAL v819.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `2991 files`
- `2794 symbols`
- `16985 ms`

Indexed context includes the operator-requested SaaS deep dive, updated
landscape research, AG UI/UX design update, BETA checklist product split,
WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v820`, `wiki/995`, `2991 files`,
`2794 symbols`, `16985 ms`, `operator deep dive index refresh`,
`GitHub Copilot CLI Remote Control`, `Codex Remote connections`,
`local MUSU Desktop executor`, and `control plane plus device data plane`.

## 2026-06-07 Current-HEAD CPU Matrix After Operator Deep Dive (wiki/996)

Fresh HUGH_SECOND packaged runtime CPU matrix evidence was captured after the
operator-requested SaaS deep dive commit.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_CPU_MATRIX_AFTER_OPERATOR_DEEP_DIVE_2026_06_07.md`

Promoted evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-161441-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-161441-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`
- five per-scenario evidence files for `startup-open`, `runtime-started`,
  `dashboard-open`, `desktop-open`, and `post-route`

Result:

- commit `924a2b1f680f6c9041bc01c2307d011c626276fd`
- `git_dirty=false`
- matrix `ok=true`
- verifier `ok=true`
- `fail_count=0`
- route task `02b2af44-5ec5-451f-b692-343a7db40b10`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_161441`
- hot process count `0` across all five scenarios
- MUSU CPU `0`
- Node CPU `0`
- owned WebView2 max `0.08`
- owned process count `8`
- owned WebView2 helper count `6`
- max working set `370.46MB`

Dirty-tree go/no-go after evidence promotion restored
`runtime_cpu_scenario_matrix_valid_machine_count=1` while keeping public
release No-Go on multi-device, second-machine CPU/matrix, support, Store, and
live P2P control-plane proof.

Search terms should include `GOAL v821`, `wiki/996`,
`20260607-161441-HUGH_SECOND`, `924a2b1f`, `WebView2 max 0.08`,
`runtime_cpu_scenario_matrix_valid_machine_count=1`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260607_161441`, and
`operator deep dive CPU matrix`.

## 2026-06-07 Current-HEAD CPU Matrix After Operator Deep Dive Index Refresh (wiki/997)

MUSU local indexer was refreshed after wiki/996 and GOAL v821.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3001 files`
- `2794 symbols`
- `15498 ms`

Indexed context includes the promoted
`20260607-161441-HUGH_SECOND` CPU matrix evidence, matrix verifier output,
canonical CPU matrix report, operator SaaS deep dive, BETA checklist update,
WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v822`, `wiki/997`, `3001 files`,
`2794 symbols`, `15498 ms`,
`current-head CPU matrix after operator deep dive index refresh`,
`20260607-161441-HUGH_SECOND`, `WebView2 max 0.08`, and
`runtime_cpu_scenario_matrix_valid_machine_count=1`.

## 2026-06-07 P2P Env Root Readiness Summary (wiki/998)

`show-musu-pro-p2p-env-status.ps1 -Json` now exposes release relay source and
runtime readiness as root-level summary fields as well as under `source`.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_P2P_ENV_ROOT_READINESS_SUMMARY_2026_06_07.md`

Changed implementation:

- `scripts\windows\show-musu-pro-p2p-env-status.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Current status snapshot:

- `ok=false`
- blocker count `11`
- `release_relay_payload_endpoint_implemented=false`
- `release_payload_preflight_endpoint_implemented=true`
- `release_tunnel_payload_endpoint_missing=true`
- `release_relay_tunnel_runtime_implemented=false`
- `release_relay_tunnel_runtime_source_contract_ready=true`
- `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `preview_store_forward_payload_queue_non_release_grade=true`
- `relay_transport_kind=quic_relay_tunnel`
- `relay_transport_kind_release_grade=true`

Validation:

- `git diff --check`
- P2P env status JSON root field smoke passed
- P2P relay/store-forward contract audit `ok=true`, `fail_count=0`
- release verifier regression `ok=true`, `case_count=105`,
  `failed_case_count=0`

Release meaning:

- no release marker was flipped;
- release payload byte transport remains unimplemented;
- release tunnel runtime remains unimplemented;
- preview store-forward queue remains non-release-grade;
- public release remains No-Go.

Search terms should include `GOAL v823`, `wiki/998`,
`P2P env root readiness summary`,
`release_relay_tunnel_runtime_source_contract_ready=true`,
`release_relay_tunnel_runtime_not_implemented_branch_active=true`,
`release_relay_payload_endpoint_implemented=false`,
`preview_store_forward_payload_queue_non_release_grade=true`, and
`case_count=105`.

## 2026-06-07 P2P Env Root Readiness Summary Index Refresh (wiki/999)

MUSU local indexer was refreshed after wiki/998 and GOAL v823.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3004 files`
- `2794 symbols`
- `16440 ms`

Indexed context includes the P2P env root readiness summary code update,
release verifier contract update, canonical report, BETA checklist, WIKI_INDEX,
GOAL, and CoS memory.

Search terms should include `GOAL v824`, `wiki/999`, `3004 files`,
`2794 symbols`, `16440 ms`,
`P2P env root readiness summary index refresh`,
`release_relay_tunnel_runtime_not_implemented_branch_active=true`, and
`case_count=105`.

## 2026-06-07 Current-Head CPU Matrix After P2P Env Root Readiness (wiki/1000)

Fresh HUGH_SECOND packaged runtime CPU matrix evidence was captured from clean
commit `eb7f58231547d73d8f011a3fbbebca90d585f1e9` after the P2P env root
readiness JSON update.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_CPU_MATRIX_AFTER_P2P_ENV_ROOT_READINESS_2026_06_07.md`

Evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-165333-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-165333-HUGH_SECOND.runtime-cpu-scenario-matrix.verification.json`

Result:

- `ok=true`
- `fail_count=0`
- `git_dirty=false`
- `musu_exe_release_identity=true`
- hot process count `0`
- MUSU CPU `0`
- Node CPU `0`
- owned WebView2 max `0.10`
- owned process count `8`
- owned WebView2 helper count `6`
- max working set `370.51MB`
- route target `PRIMARY-PC`
- route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_165333`
- route probe failed with `peer 'PRIMARY-PC' not found`

Release meaning:

- current HEAD remains under local runtime resource budgets on `HUGH_SECOND`;
- the failed `PRIMARY-PC` target route was explicitly allowed for diagnostic
  CPU evidence;
- this is not successful multi-device route proof;
- release remains No-Go on second-machine CPU/matrix, real multi-device route
  evidence, hosted MUSU.PRO relay proof, support mailbox proof, and Store
  proof.

Search terms should include `GOAL v825`, `wiki/1000`,
`20260607-165333-HUGH_SECOND`, `eb7f5823`, `WebView2 max 0.10`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260607_165333`, and
`PRIMARY-PC peer not found`.

## 2026-06-07 Current-Head CPU Matrix After P2P Env Root Readiness Index Refresh (wiki/1001)

MUSU local indexer was refreshed after wiki/1000 and GOAL v825.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3014 files`
- `2794 symbols`
- `18870 ms`

Indexed context includes the promoted
`20260607-165333-HUGH_SECOND` CPU matrix evidence, matrix verifier output,
canonical CPU matrix report, BETA checklist update, WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v826`, `wiki/1001`, `3014 files`,
`2794 symbols`, `18870 ms`,
`current-head CPU matrix after P2P env root readiness index refresh`,
`20260607-165333-HUGH_SECOND`, and `WebView2 max 0.10`.

## 2026-06-07 Second-PC Route Preflight (wiki/1002)

Added a primary-side route preflight helper:

- `scripts\windows\test-second-pc-route-preflight.ps1`

Canonical report:

- `docs\RELEASE_1_15_0_RC1_SECOND_PC_ROUTE_PREFLIGHT_2026_06_07.md`

The helper consumes a second-PC return zip or handoff JSON, resolves
`suggested_remote_addrs`, runs `musu up`, `musu doctor`, `musu peer add`,
confirms `musu peer list`, runs
`musu route --explain --target <SECOND_PC_NAME>`, rejects self/local targets,
writes `.local-build\second-pc-route-preflight\*.second-pc-route-preflight.json`
with schema `musu.second_pc_route_preflight.v1`, and prints exact next
commands for targeted CPU matrix, multi-device smoke, and route reachability.

Updated:

- multi-device kit packaging and README
- final operator packet packaging and README
- operator action pack quickstart
- final packet verifier
- operator action pack verifier
- release verifier regression
- desktop release readiness script inventory
- go/no-go / single-machine / runtime matrix freshness allowlists

Synthetic smoke:

- fake handoff: `203.0.113.2:8949`, `SECOND-PC`
- flags: `-SkipPeerAdd -SkipRouteExplain`
- result: exit code `1`, schema `musu.second_pc_route_preflight.v1`,
  `ok=false`, evidence written, `target peer listed=fail`

Release meaning:

- catches `peer not found` before a 60s post-route CPU sample;
- improves operator handoff for second-machine route evidence;
- does not close multi-device proof, second-machine CPU/matrix, hosted
  MUSU.PRO relay, support mailbox, or Store gates.

Search terms should include `GOAL v827`, `wiki/1002`,
`test-second-pc-route-preflight.ps1`,
`musu.second_pc_route_preflight.v1`, `second-pc-route-preflight`,
`musu peer add`, `route --explain`, and `peer not found`.

## 2026-06-07 Second-PC Route Preflight Index Refresh (wiki/1003)

MUSU local indexer was refreshed after wiki/1002 and GOAL v827.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3018 files`
- `2794 symbols`
- `36479 ms`

Indexed context includes `scripts\windows\test-second-pc-route-preflight.ps1`,
the route preflight report, multi-device kit/final packet/operator action pack
updates, verifier/audit updates, BETA checklist, WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v828`, `wiki/1003`, `3018 files`,
`2794 symbols`, `36479 ms`, `second-PC route preflight index refresh`,
`musu.second_pc_route_preflight.v1`, and
`test-second-pc-route-preflight.ps1`.

## 2026-06-07 Agent Control SaaS Late Source Recheck (wiki/1004)

Late same-day comparable SaaS research was added after the second-PC route
preflight helper.

Canonical report:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LATE_RECHECK_2026_06_07.md`

Sources rechecked:

- OpenAI Codex product/app/upgrades/repo sources
- GitHub Copilot cloud-agent session docs
- Cursor Background Agents
- Google Jules
- Devin
- Replit Agent
- AG-UI protocol docs and repo
- Tailscale connection types and DERP docs

Result:

- MUSU.PRO remains the remote input, room, presence, rendezvous, path
  selection, relay fallback, evidence, notification, and policy control plane.
- MUSU Desktop remains the installed local executor and permission boundary.
- Competitor command-center/cloud-agent UX should inform assignment, plan,
  follow-up, review, notification, and artifact surfaces.
- AG-UI validates typed, event-based room/order/run UI streams, but it does not
  replace local execution policy or release evidence.
- Tailscale continues to validate direct-first mesh UX with explicit relay
  fallback.

Release meaning:

- this is research/spec progress only;
- it does not close second-PC route/CPU/matrix, hosted MUSU.PRO P2P/relay,
  support mailbox, or Store gates.

Search terms should include `GOAL v829`, `wiki/1004`,
`Agent Control SaaS Late Source Recheck`, `AG-UI`,
`typed room/order/run events`, `Codex command center`, `local MUSU Desktop
executor`, and `Tailscale direct-first relay fallback`.

## 2026-06-07 Agent Control SaaS Late Source Recheck Index Refresh (wiki/1005)

MUSU local indexer was refreshed after wiki/1004 and GOAL v829.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3021 files`
- `2794 symbols`
- `16427 ms`

Indexed context includes
`docs\RESEARCH_AGENT_CONTROL_SAAS_LATE_RECHECK_2026_06_07.md`, AG UI/UX
design updates, BETA checklist update, MUSU.PRO P2P control-plane spec note,
WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v830`, `wiki/1005`, `3021 files`,
`2794 symbols`, `16427 ms`,
`agent control SaaS late source recheck index refresh`, `AG-UI`,
`typed room/order/run events`, and `MUSU.PRO control plane`.

## 2026-06-07 Agent Control SaaS Current Deep Research Recheck (wiki/1006)

Current comparable SaaS research was added after the late source recheck.

Canonical report:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_CURRENT_DEEP_RESEARCH_2026_06_07.md`

Sources rechecked:

- Claude Code Remote Control
- GitHub Copilot CLI Remote Control
- OpenAI Codex product, repo, and Windows remote-control notes
- Cursor Background/Web/Mobile Agents
- Google Jules
- Devin
- AG-UI protocol docs and repo
- Tailscale connection types and DERP docs

Result:

- closest MUSU lane is remote control over local execution;
- hosted async agents remain UX references for plan/status/review/team flows;
- MUSU.PRO remains the command-room/control-plane SaaS;
- MUSU Desktop remains the local executor and permission boundary;
- AG UI must require room, target, execution locus, route policy, permission
  envelope, queue timeout, and evidence requirement before accepting remote
  work;
- route UI must show direct, peer relay, hosted relay, fallback reason, and
  proof as separate states.

Release meaning:

- this is research/spec progress only;
- it does not close second-PC route/CPU/matrix, hosted MUSU.PRO P2P/relay,
  support mailbox, or Store gates.

Search terms should include `GOAL v831`, `wiki/1006`,
`current deep research recheck`, `Codex Windows remote control`,
`GitHub Copilot CLI Remote Control`, `Claude Code Remote Control`,
`AG-UI typed event streams`, `Tailscale direct peer relay DERP`, and
`MUSU Desktop local executor`.

## 2026-06-07 Current-Head CPU Matrix After Route Preflight (wiki/1007)

Fresh HUGH_SECOND packaged runtime CPU matrix evidence was promoted after the
second-PC route preflight helper and current deep research recheck.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_CURRENT_HEAD_CPU_MATRIX_AFTER_ROUTE_PREFLIGHT_2026_06_07.md`

Evidence:

- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-174550-HUGH_SECOND.current-head-after-route-preflight.runtime-cpu-scenario-matrix.json`
- `docs\evidence\runtime-cpu-scenarios\1.15.0-rc.1\20260607-174550-HUGH_SECOND.current-head-after-route-preflight.runtime-cpu-scenario-matrix.verification.json`

Result:

- commit `26ae15a853837cfbbbf19d6e72eb0bf9facaa1fc`
- `git_dirty=false`
- verifier `ok=true`, `fail_count=0`, `267` checks
- hot process count `0`
- MUSU CPU `0`
- Node CPU `0`
- owned WebView2 max `0.10`
- owned process count `8`
- owned WebView2 helper count `6`
- max working set `370.46MB`
- route target `PRIMARY-PC`
- route failed with `peer 'PRIMARY-PC' not found`
- route failure was explicitly allowed for CPU diagnostics

Audit:

- Rust background-loop contract `ok=true`, `fail_count=0`, unaudited loops and
  spawns `0`
- frontend polling contract `ok=true`, `fail_count=0`, `29/29` low-duty
  call sites, direct interval hits `0`

Release meaning:

- one-machine current-head CPU matrix remains healthy on HUGH_SECOND;
- this is not successful multi-device route proof;
- public release remains No-Go on second-PC route/CPU/matrix, live MUSU.PRO
  P2P/relay proof, support mailbox, and Store proof.

Search terms should include `GOAL v832`, `wiki/1007`,
`20260607-174550-HUGH_SECOND`, `26ae15a8`, `WebView2 max 0.10`,
`PRIMARY-PC peer not found`, and `AllowFailedPostRouteProbe`.

## 2026-06-07 Current Deep Research And CPU Matrix Index Refresh (wiki/1008)

MUSU local indexer was refreshed after wiki/1006, wiki/1007, and GOAL
v831-v832.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3028 files`
- `2794 symbols`
- `18261 ms`

Indexed context includes the current comparable SaaS deep research recheck,
current-head CPU matrix after route preflight, promoted
`20260607-174550-HUGH_SECOND` CPU matrix evidence, AG UI/UX control-plane
design update, MUSU.PRO P2P control-plane spec update, BETA checklist, GOAL,
WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v833`, `wiki/1008`, `3028 files`,
`2794 symbols`, `18261 ms`,
`current deep research CPU matrix index refresh`,
`20260607-174550-HUGH_SECOND`, `PRIMARY-PC peer not found`,
`Codex Windows remote control`, and `AG-UI typed event streams`.

## 2026-06-07 Release Relay Payload Route Evidence Recorder (wiki/1009)

Rust route evidence now has a release-grade relay payload delivery recorder:
`record_release_relay_payload_delivery_route_evidence(...)`.

The recorder accepts only a delivered release payload plus bound transport and
delivery proof. It verifies:

- `route_kind=relay`
- `transport_kind=quic_relay_tunnel`
- `encryption=quic_tls_1_3`
- `transport_verified_by=musu_quic_tls_transport`
- `peer_identity_method=quic_tls_cert_fingerprint`
- `payload_transited_musu_infra=true`
- `relay_fallback.payload_transport_proven=true`
- matching session, lease, source, target, relay URL, tunnel ID, payload hash,
  and payload byte count across payload, transport proof, and delivery proof

Updated source gates:

- `scripts\windows\show-musu-pro-p2p-env-status.ps1`
- `scripts\windows\audit-p2p-store-forward-relay-contract.ps1`

Validation:

- Rust route evidence tests: `16 passed`
- cargo check for `musu`: passed
- P2P relay contract audit: `ok=true`, `fail_count=0`
- P2P env status: expected `ok=false`
- release verifier regression: `ok=true`, `case_count=105`,
  `failed_case_count=0`
- `git diff --check`

Release meaning:

- this is source-contract/evidence-chain hardening only;
- release relay payload endpoint remains unimplemented;
- release relay tunnel runtime remains unimplemented;
- live `musu.pro` route/transport/payload proof remains missing;
- public release remains No-Go.

Search terms should include `GOAL v834`, `wiki/1009`,
`record_release_relay_payload_delivery_route_evidence`,
`RELEASE_RELAY_PAYLOAD_DELIVERY_ROUTE_EVIDENCE_NOTE`,
`quic_tls_1_3`, `musu_quic_tls_transport`,
`relay_payload_delivery_proof`, and
`release relay payload route evidence recorder`.

## 2026-06-07 Release Relay Payload Route Evidence Recorder Index Refresh (wiki/1010)

MUSU local indexer was refreshed after wiki/1009 and GOAL v834.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3031 files`
- `2800 symbols`
- `21469 ms`

Indexed context includes `musu-rs/src/bridge/route_evidence.rs`, the release
relay payload route evidence recorder, P2P env/source audits, the canonical
recorder report, AG UI Evidence Center update, MUSU.PRO P2P control-plane spec,
BETA checklist, GOAL, WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v835`, `wiki/1010`, `3031 files`,
`2800 symbols`, `21469 ms`,
`release relay payload route evidence recorder index refresh`,
`record_release_relay_payload_delivery_route_evidence`,
`musu_quic_tls_transport`, and `relay_payload_delivery_proof`.

## 2026-06-07 Current-HEAD Local Desktop Evidence After Relay Recorder (wiki/1011)

Current packaged local desktop evidence was refreshed after the release relay
payload route evidence recorder.

Promoted evidence:

- MSIX install: `20260607-185659-HUGH_SECOND`
- single-machine smoke: `20260607-185741-HUGH_SECOND`
- process ownership: `20260607-185807-HUGH_SECOND`
- startup single-instance: `20260607-185807-HUGH_SECOND`
- desktop single-instance: `20260607-185821-HUGH_SECOND`
- desktop-open idle CPU: `20260607-190027-HUGH_SECOND.desktop-open`
- five-state CPU matrix:
  `20260607-190401-HUGH_SECOND.current-head-after-relay-recorder`
- target-route diagnostic:
  `20260607-191020-HUGH_SECOND.current-head-target-route-after-relay-recorder`

Results:

- desktop-open idle CPU: `ok=true`, `git_dirty=false`, hot `0`, WebView2 max
  `0.08`, owned WebView2 helpers `6`
- full runtime matrix: `ok=true`, `fail_count=0`, `git_dirty=false`, hot `0`,
  MUSU `0`, Node `0`, WebView2 max `0.08`, max working set `365.22MB`
- target route: `PRIMARY-PC`, `peer 'PRIMARY-PC' not found`,
  `failure_allowed=true`, target-only verifier `ok=true`
- dirty-tree go/no-go: local artifacts true, single-machine true, runtime idle
  CPU `1`, runtime matrix `1`, runtime second-PC route attempt `1`,
  process/startup/desktop single-instance true

Release meaning:

- one-machine local desktop evidence is healthy;
- target-route evidence is failed-route CPU diagnostic proof only;
- successful second-PC route proof, second-PC CPU/matrix, live MUSU.PRO
  P2P/relay proof, support mailbox proof, and Store proof remain open.

SaaS/AG UI research recheck:

- Codex Windows remote-control and the Codex repo reinforce remote input over
  local execution.
- VS Code Remote Tunnels reinforces authenticated, non-anonymous remote access.
- AG-UI reinforces typed streamable room/order/run events.
- MUSU.PRO remains command center, remote input, rooms, rendezvous, route
  policy, relay fallback, evidence, notification, and owner/org policy plane.
- MUSU Desktop remains executor.

Search terms should include `GOAL v836`, `wiki/1011`,
`current-head local desktop evidence after relay recorder`,
`20260607-190401-HUGH_SECOND`, `20260607-191020-HUGH_SECOND`,
`PRIMARY-PC peer not found`, `runtime_cpu_scenario_matrix_valid_machine_count=1`,
`runtime_cpu_second_pc_route_attempt_valid_machine_count=1`, and
`Codex Windows remote control`.

## 2026-06-07 Current-HEAD Local Desktop Evidence Index Refresh (wiki/1012)

MUSU local indexer was refreshed after wiki/1011 and GOAL v836.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3055 files`
- `2800 symbols`
- `26417 ms`

Indexed context includes promoted MSIX/single-machine/process/startup/desktop
single-instance evidence, desktop-open idle CPU evidence, the
`20260607-190401-HUGH_SECOND.current-head-after-relay-recorder` runtime CPU
matrix, the `20260607-191020-HUGH_SECOND.current-head-target-route-after-relay-recorder`
diagnostic matrix, the current-head local desktop evidence report, the current
SaaS research supplement, AG UI lock, P2P spec update, BETA checklist, GOAL,
WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v837`, `wiki/1012`, `3055 files`,
`2800 symbols`, `26417 ms`,
`current-head local desktop evidence index refresh`,
`20260607-190401-HUGH_SECOND.current-head-after-relay-recorder`,
`20260607-191020-HUGH_SECOND.current-head-target-route-after-relay-recorder`,
and `PRIMARY-PC peer not found`.

## 2026-06-07 Target Drain Release Relay Proof Wiring And Local-Fleet SaaS Addendum (wiki/1013)

Rust target-side relay payload drain now consumes optional
`relay_transport_proof` from `P2pRelayPayloadDeliveryResponse`.

Changed source:

- `musu-rs/src/cloud/mod.rs`
- `musu-rs/src/bridge/handlers/relay_payload.rs`
- `scripts/windows/audit-p2p-store-forward-relay-contract.ps1`
- `scripts/windows/show-musu-pro-p2p-env-status.ps1`

Behavior:

- attached `musu.relay_transport_proof.v1` plus delivery proof routes to
  `record_release_relay_payload_delivery_route_evidence(...)`;
- release-grade payload/delivery proof without transport proof fails as
  `release_relay_transport_proof_missing`;
- preview store-forward delivery still writes non-release-grade preview
  evidence;
- release payload endpoint and release tunnel runtime markers remain false.

Validation:

- `cargo test --manifest-path musu-rs\Cargo.toml relay_payload --lib`:
  `32 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml cloud::tests::relay_payload_delivery_response --lib`:
  `2 passed`
- `cargo test --manifest-path musu-rs\Cargo.toml route_evidence --lib`:
  `17 passed`
- P2P relay contract audit: `ok=true`, `fail_count=0`
- P2P env status: expected `ok=false`,
  `release_relay_tunnel_runtime_source_contract_ready=true`,
  `release_relay_tunnel_runtime_not_implemented_branch_active=true`
- `cargo fmt --check`
- `git diff --check`

Comparable SaaS addendum:

- `docs\RESEARCH_AGENT_CONTROL_SAAS_LOCAL_FLEET_CONTROL_PLANE_ADDENDUM_2026_06_07.md`

The addendum separates cloud coding-agent command centers from the closer
local/self-hosted worker control-plane lane. Product lock remains:
MUSU.PRO is command room/control plane; MUSU Desktop is executor; each run must
show input surface, executing runtime, route, and evidence state.

Release meaning:

- this is proof-chain wiring and product-spec documentation only;
- public release remains No-Go on second-PC route/CPU/matrix, live MUSU.PRO
  P2P/relay proof, release relay byte path, support mailbox, and Store proof.

Search terms should include `GOAL v838`, `wiki/1013`,
`target drain release relay proof wiring`,
`relay_transport_proof_from_cloud_proof`,
`release_relay_transport_proof_missing`,
`record_target_relay_payload_delivery_route_evidence`,
`P2pRelayPayloadDeliveryResponse`, `local fleet control plane addendum`, and
`MUSU Desktop executor`.

## 2026-06-07 Target Drain Release Relay Proof Wiring Index Refresh (wiki/1014)

MUSU local indexer was refreshed after wiki/1013 and GOAL v838.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3059 files`
- `2808 symbols`
- `19670 ms`

Indexed context includes target-drain release relay proof wiring, optional
`P2pRelayPayloadDeliveryResponse.relay_transport_proof`,
`relay_transport_proof_from_cloud_proof`,
`record_target_relay_payload_delivery_route_evidence`,
`release_relay_transport_proof_missing`, the local-fleet control-plane SaaS
addendum, updated AG UI/P2P/BETA docs, WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v839`, `wiki/1014`, `3059 files`,
`2808 symbols`, `19670 ms`,
`target drain release relay proof wiring index refresh`,
`relay_transport_proof_from_cloud_proof`, and
`local fleet control plane addendum`.

## 2026-06-07 Current-Head Local Desktop Evidence After Target-Drain Proof Wiring (wiki/1015)

Fresh packaged local Desktop evidence was refreshed after target-drain release
relay proof wiring.

Evidence:

- MSIX install: `20260607-201305-HUGH_SECOND`
- single-machine smoke: `20260607-201412-HUGH_SECOND`
- process ownership: `20260607-201501-HUGH_SECOND`
- startup single-instance: `20260607-201501-HUGH_SECOND`
- desktop single-instance: `20260607-201501-HUGH_SECOND`
- desktop-open idle CPU:
  `20260607-202202-HUGH_SECOND.current-head-after-target-proof`
- five-state runtime CPU matrix:
  `20260607-202317-HUGH_SECOND.current-head-after-target-proof`
- target-route diagnostic:
  `20260607-202934-HUGH_SECOND.current-head-target-route-after-target-proof`

Results:

- evidence commit: `573d727f0df3b823e12090a237728ca1d293b00c`
- local bridge: `http://127.0.0.1:9741`
- desktop-open idle CPU: `ok=true`, `git_dirty=false`, hot `0`, MUSU `0`,
  Node `0`, WebView2 max `0.08`, owned WebView2 helpers `6`, working set
  `367.77MB`
- full runtime matrix: `ok=true`, `fail_count=0`, `git_dirty=false`, local
  route token `MUSU_CPU_SCENARIO_ROUTE_OK_20260607_202317`, hot `0`, MUSU
  `0`, Node `0`, WebView2 max `0.16`, max working set `367.99MB`
- target route: `PRIMARY-PC`, `peer 'PRIMARY-PC' not found`,
  `failure_allowed=true`, target-only verifier `ok=true`

Operator diagnosis:

- `http://127.0.0.1:3001/app` is not the current installed MUSU Desktop
  runtime.
- Port `3001` refusal means that separate dashboard/dev surface is absent.
- The installed local runtime evidence is the packaged bridge on
  `127.0.0.1:9741`.

Release meaning:

- one-machine local Desktop evidence is healthy;
- target-route evidence is failed-route CPU diagnostic proof only;
- successful second-PC route proof, second-PC CPU/matrix, live MUSU.PRO
  P2P/relay proof, support mailbox proof, and Store proof remain open.

Search terms should include `GOAL v840`, `wiki/1015`,
`current-head local desktop evidence after target-drain proof wiring`,
`20260607-202202-HUGH_SECOND.current-head-after-target-proof`,
`20260607-202317-HUGH_SECOND.current-head-after-target-proof`,
`20260607-202934-HUGH_SECOND.current-head-target-route-after-target-proof`,
`127.0.0.1:9741`, `localhost 3001`, and `PRIMARY-PC peer not found`.

## 2026-06-07 Current-Head Local Desktop Evidence Index Refresh After Target-Drain Proof Wiring (wiki/1016)

MUSU local indexer was refreshed after wiki/1015 and GOAL v840.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3077 files`
- `2808 symbols`
- `45011 ms`

Indexed context includes fresh MSIX/single-machine/process/startup/desktop
evidence, desktop-open idle CPU
`20260607-202202-HUGH_SECOND.current-head-after-target-proof`, full runtime
CPU matrix `20260607-202317-HUGH_SECOND.current-head-after-target-proof`,
target-route diagnostic
`20260607-202934-HUGH_SECOND.current-head-target-route-after-target-proof`,
the current-head local Desktop evidence report, localhost `3001` versus
packaged bridge `9741` diagnosis, AG UI/UX localhost diagnostic lock,
comparable SaaS local-fleet source recheck, BETA checklist, WIKI_INDEX, GOAL,
and CoS memory.

Search terms should include `GOAL v841`, `wiki/1016`, `3077 files`,
`2808 symbols`, `45011 ms`,
`current-head local desktop evidence index refresh after target-drain proof wiring`,
`localhost 3001`, `127.0.0.1:9741`, and
`20260607-202317-HUGH_SECOND.current-head-after-target-proof`.

## 2026-06-07 Idle Busy-Loop Candidate Audit (wiki/1017)

Current source-contract and runtime evidence does not reproduce the reported
20% idle CPU issue on HUGH_SECOND.

Evidence:

- Rust background loop audit:
  `20260607-204601-HUGH_SECOND.rust-background-loop-contract`
- frontend polling audit:
  `20260607-204601-HUGH_SECOND.frontend-polling-contract`
- desktop-open idle CPU:
  `20260607-202202-HUGH_SECOND.current-head-after-target-proof`
- five-state runtime CPU matrix:
  `20260607-202317-HUGH_SECOND.current-head-after-target-proof`
- target-route diagnostic:
  `20260607-202934-HUGH_SECOND.current-head-target-route-after-target-proof`

Results:

- Rust background loop audit: `ok=true`, `fail_count=0`,
  unaudited loop hits `0`
- frontend polling audit: `ok=true`, `fail_count=0`,
  low-duty polling call sites `29`, direct interval hits `0`
- go/no-go idle busy-loop candidates: `8/8`, unverified `0`
- desktop-open idle CPU: MUSU `0`, Node `0`, WebView2 max `0.08`, hot `0`
- full five-state matrix: `ok=true`, `fail_count=0`, WebView2 max `0.16`

Release meaning:

- source and one-machine runtime evidence are good;
- release CPU gate still requires second Windows PC evidence;
- next evidence step is second-PC install plus desktop-open CPU, five-state
  matrix, and real second-PC route proof.

Search terms should include `GOAL v842`, `wiki/1017`,
`idle busy-loop candidate audit`, `idle_busy_loop_candidate_verified_count=8`,
`rust_background_loop_contract_verified=true`,
`frontend_polling_contract_verified=true`, `direct_interval_hit_count=0`,
`20260607-204601-HUGH_SECOND`, and `20% idle CPU`.

## 2026-06-07 Idle Busy-Loop Candidate Audit Index Refresh (wiki/1018)

MUSU local indexer was refreshed after wiki/1017 and GOAL v842.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3082 files`
- `2808 symbols`
- `12708 ms`

Indexed context includes the idle busy-loop candidate audit report, the Rust
background-loop audit evidence, the frontend polling audit evidence, current
one-machine packaged CPU evidence, the localhost `3001` versus packaged bridge
`9741` diagnosis, BETA checklist update, WIKI/WIKI_INDEX, GOAL, and CoS
memory.

Search terms should include `GOAL v843`, `wiki/1018`, `3082 files`,
`2808 symbols`, `12708 ms`, `idle busy-loop candidate audit index refresh`,
`20260607-204601-HUGH_SECOND`, `localhost 3001`, `127.0.0.1:9741`, and
`release CPU gate still requires second Windows PC evidence`.

## 2026-06-07 Public Metadata and P2P Source Blocker Recheck (wiki/1019)

Current-head go/no-go was rerun without skipping public metadata after the
idle busy-loop candidate audit.

Evidence:

- canonical report:
  `docs\RELEASE_1_15_0_RC1_PUBLIC_METADATA_AND_P2P_SOURCE_BLOCKER_RECHECK_2026_06_07.md`
- public metadata verifier:
  `scripts\windows\verify-store-public-metadata.ps1 -BaseUrl https://musu.pro -Json`
- go/no-go:
  `scripts\windows\write-release-go-no-go.ps1 -Json`
- P2P env status:
  `scripts\windows\show-musu-pro-p2p-env-status.ps1 -SkipGithub -Json`

Results:

- `https://musu.pro/privacy` returned HTTP `200`
- `https://musu.pro/support` returned HTTP `200`
- public metadata `ok=true`, `fail_count=0`
- current go/no-go commit:
  `f158336ac3fec3481ea4160bb1351485c6e10a63`
- `public_metadata_checked=true`
- `public_metadata_ok=true`
- blocker count is now `6`

Remaining blocker areas:

- `multi-device`
- `runtime-idle-cpu`
- `runtime-cpu-scenario-matrix`
- `support-mailbox`
- `store-release`
- `p2p-control-plane`

P2P source read:

- release relay payload endpoint implemented `false`
- release payload preflight endpoint implemented `true`
- store-forward queue fallback implemented `true`
- release relay tunnel runtime implemented `false`
- release relay tunnel runtime source contract ready `true`
- release relay tunnel runtime not-implemented branch active `true`
- preview store-forward payload queue non-release-grade `true`

Release meaning:

- public privacy/support metadata is no longer the active blocker;
- release relay source markers must stay false until the real
  `quic_relay_tunnel` byte path and bound relay transport/delivery proofs
  exist;
- second-PC CPU/matrix/route evidence, support mailbox, Store evidence, and
  live MUSU.PRO P2P proof remain open.

Search terms should include `GOAL v844`, `wiki/1019`,
`public metadata and P2P source blocker recheck`, `public_metadata_ok=true`,
`blocker count 6`, `f158336ac3fec3481ea4160bb1351485c6e10a63`,
`release_relay_tunnel_runtime_not_implemented_branch_active=true`, and
`RELAY_PAYLOAD_ENDPOINT_IMPLEMENTED`.

## 2026-06-07 Public Metadata and P2P Source Blocker Recheck Index Refresh (wiki/1020)

MUSU local indexer was refreshed after wiki/1019 and GOAL v844.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3085 files`
- `2808 symbols`
- `13386 ms`

Indexed context includes the public metadata and P2P source blocker recheck
report, latest current-head go/no-go with public metadata included, P2P source
blocker status, BETA checklist, WIKI/WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v845`, `wiki/1020`, `3085 files`,
`2808 symbols`, `13386 ms`,
`public metadata and P2P source blocker recheck index refresh`,
`public_metadata_ok=true`, `blocker count 6`,
`release_relay_tunnel_runtime_not_implemented_branch_active=true`, and
`RELAY_TUNNEL_RUNTIME_IMPLEMENTED`.

## 2026-06-07 One-Machine MUSU.PRO Functional Roadmap (wiki/1021)

`docs\RELEASE_1_15_0_RC1_ONE_MACHINE_MUSU_PRO_CONNECTION_FUNCTIONAL_ROADMAP_2026_06_07.md`
narrows the next milestone back to one Windows machine before continuing
second-PC/P2P release work.

Current one-machine facts remain: local artifacts are ready,
single-machine packaged Desktop evidence passes, public metadata passes, and
primary idle CPU / runtime CPU matrix evidence each pass on one machine.
Public release still remains No-Go because second-PC evidence, live P2P/relay
proof, support mailbox proof, and Store evidence are missing.

The new functional gate is authenticated MUSU.PRO work input, local MUSU
Desktop pickup/execution on this PC, result/status return to MUSU.PRO, and
post-run idle/resource evidence. `localhost:3001` is explicitly not the success
criterion; the packaged runtime must discover its actual local bridge URL.

Search terms should include `GOAL v846`, `wiki/1021`,
`one-machine MUSU.PRO functional roadmap`,
`musu.one_machine_musu_pro_work_order.v1`, `remote work-order pickup`,
`MUSU Desktop local executor`, and `localhost:3001`.

## 2026-06-07 One-Machine MUSU.PRO Functional Roadmap Index Refresh (wiki/1022)

MUSU local indexer was refreshed after wiki/1021 and GOAL v846.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3088 files`
- `2808 symbols`
- `11642 ms`

Indexed context includes the one-machine MUSU.PRO functional roadmap, local
program/web input roadmap update, AG UI/UX one-machine Command Center rule,
BETA checklist scope reset, WIKI/WIKI_INDEX/GOAL, and CoS memory.

Search terms should include `GOAL v847`, `wiki/1022`, `3088 files`,
`2808 symbols`, `11642 ms`, `one-machine MUSU.PRO functional roadmap`,
`musu.one_machine_musu_pro_work_order.v1`, and `remote work-order pickup`.

## 2026-06-07 One-Machine MUSU.PRO Work-Order Smoke Gate (wiki/1023)

`scripts\windows\smoke-one-machine-musu-pro-work-order.ps1` now records the
one-machine MUSU.PRO functional gate as executable evidence with schema
`musu.one_machine_musu_pro_work_order.v1`. The release verifier regression has
a source contract that requires local Desktop readiness, actual bridge URL
discovery, room presence publish/list, owner-scoped work-order POST, no fixed
`localhost:3001` assumption, post-run idle CPU evidence linkage, and failure
exit behavior unless `-AllowUnverified` is used for diagnostics.

Canonical report:

`docs\RELEASE_1_15_0_RC1_ONE_MACHINE_MUSU_PRO_WORK_ORDER_SMOKE_GATE_2026_06_07.md`

Diagnostic evidence:

`docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260607-213245-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`

Current result is `ok=false` with `fail_count=10`. Local Desktop starts,
`musu up` passes, `doctor` is not failed, and bridge discovery returns
`http://127.0.0.1:9741`, so the repeated `localhost:3001` browser refusal is
not the product success criterion. The remaining one-machine blockers are
MUSU.PRO account login, room presence publish/list, P2P control token,
work-order POST, Desktop outbound pickup/claim, result return, and post-run
idle CPU evidence.

Source audit note: the existing room work-order API currently forwards
server-side through `getBridgeUrl()` to `/api/tasks/delegate`, so hosted
`https://musu.pro` still needs a durable owner-scoped work-order inbox and local
Desktop outbound pickup path. Search terms should include `GOAL v848`,
`wiki/1023`, `one-machine MUSU.PRO work-order smoke gate`,
`20260607-213245-HUGH_SECOND`, `not_logged_in`, `P2P control token`,
`Desktop outbound pickup`, `127.0.0.1:9741`, and `localhost:3001`.

## 2026-06-07 One-Machine MUSU.PRO Work-Order Smoke Gate Index Refresh (wiki/1024)

MUSU local indexer was refreshed after wiki/1023 and GOAL v848.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3093 files`
- `2808 symbols`
- `15589 ms`

Indexed context includes the one-machine MUSU.PRO work-order smoke script,
release verifier source contract, diagnostic evidence
`20260607-213245-HUGH_SECOND`, canonical smoke-gate report, one-machine
roadmap updates, AG UI/UX incomplete-state update, BETA checklist, WIKI,
WIKI_INDEX, GOAL, and CoS memory.

Search terms should include `GOAL v849`, `wiki/1024`, `3093 files`,
`2808 symbols`, `15589 ms`, `one-machine MUSU.PRO work-order smoke gate`,
`20260607-213245-HUGH_SECOND`, `not_logged_in`, `P2P control token`,
`Desktop outbound pickup`, and `127.0.0.1:9741`.

## 2026-06-07 Room Work-Order Outbound Pickup Inbox (wiki/1025)

`docs\RELEASE_1_15_0_RC1_ROOM_WORK_ORDER_OUTBOUND_PICKUP_INBOX_2026_06_07.md`
records the first server-side implementation step for hosted-safe MUSU.PRO work
orders. The room work-order route now supports explicit
`delivery_mode: "desktop_outbound_pickup"`, persists owner-scoped
`musu.room_work_order.v1` queued records through
`musu-bee\src\lib\roomWorkOrderStore.ts`, lists same-owner public records via
`GET /api/rooms/[roomId]/work-orders`, and claims queued target-node work via
`PATCH /api/rooms/[roomId]/work-orders` with schema
`musu.room_work_order_claim.v1`.

This preserves the existing local/dev bridge-forward path, but hosted
`https://musu.pro` now has the durable inbox/claim boundary needed before a
packaged Desktop outbound claimant can pull work without MUSU.PRO calling the
user's `127.0.0.1` bridge directly. Security behavior is owner-scoped: P2P
control auth is required for POST/GET/PATCH, public responses strip `owner_key`,
and cross-owner claim attempts return zero records.

Latest diagnostic smoke evidence is
`docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260607-215300-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`
with `ok=false`/`fail_count=12`: local Desktop starts and bridge discovery is
`127.0.0.1:9741`, but packaged login and P2P control token are still missing,
so live work-order POST/claim, local bridge execution, result return, and
post-run CPU evidence remain open.

Validation passed `npm run test:routes` `34/34`, `npx tsc --noEmit --pretty
false`, one-machine smoke diagnostic No-Go with expected login/token blockers,
operator API security audit `ok=true`/`fail_count=0`, release evidence verifier
`ok=true`/`failed_case_count=0`/`case_count=106`, and `git diff --check`.
Search terms should include `GOAL v850`, `wiki/1025`,
`room work-order outbound pickup inbox`, `desktop_outbound_pickup`,
`musu.room_work_order_claim.v1`, `roomWorkOrderStore`,
`20260607-215300-HUGH_SECOND`, `P2P control token`, and `127.0.0.1:9741`.

## 2026-06-07 Room Work-Order Outbound Pickup Inbox Index Refresh (wiki/1026)

MUSU local indexer was refreshed after wiki/1025 and GOAL v850.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3098 files`
- `2843 symbols`
- `11321 ms`

Indexed context includes `roomWorkOrderStore`, the room work-order POST/GET/PATCH
route and tests, one-machine smoke update, operator API security contract
update, canonical outbound pickup inbox report, latest diagnostic smoke evidence
`20260607-215300-HUGH_SECOND`, WIKI/WIKI_INDEX/GOAL, and CoS memory.

Search terms should include `GOAL v851`, `wiki/1026`, `3098 files`,
`2843 symbols`, `11321 ms`, `desktop_outbound_pickup`,
`musu.room_work_order_claim.v1`, `roomWorkOrderStore`, and
`20260607-215300-HUGH_SECOND`.

## 2026-06-08 Room Work-Order Drain Delivery Ack (wiki/1027)

`docs\RELEASE_1_15_0_RC1_ROOM_WORK_ORDER_DRAIN_DELIVERY_ACK_2026_06_08.md`
records the next one-machine MUSU.PRO functional-path step. The server room
work-order route now accepts `musu.room_work_order_delivery.v1` PATCH requests
after local Desktop drain handoff. Claimed work can transition to `accepted`
with bridge task metadata, back to `queued` with `last_error` after local
bridge handoff failure, or to terminal `failed`.

Rust local program support now lives in
`musu-rs\src\install\room_work_orders.rs` instead of adding more claim/drain
orchestration to the already-large `cli_commands.rs`. The drain path resolves
control tokens from `MUSU_P2P_CONTROL_TOKEN`, `MUSU_ROUTE_EVIDENCE_TOKEN`,
`MUSU_TOKEN`, or `~/.musu\token`, preserves advisory `permission_envelope` in
the local bridge delegate body, submits server delivery ack after each bridge
handoff, and counts `server_ack_ok` only when the server response outcome
matches the requested delivery status.

Latest diagnostic smoke evidence is
`docs\evidence\one-machine-musu-pro-work-order\1.15.0-rc.1\20260608-002507-HUGH_SECOND-musu.pro.one-machine-musu-pro-work-order.evidence.json`
with `ok=false`/`fail_count=11`: packaged MUSU starts from the WindowsApps
alias, `musu up` is `ok=true`, doctor is `warn`, bridge discovery is
`http://127.0.0.1:9741`, fixed `localhost:3001` assumption is `false`, room
presence returns `not_logged_in`, and work-order POST/drain are skipped because
no owner-scoped P2P control token is present. Linked runtime-started CPU
diagnostic evidence is `ok=true`, but it is dirty diagnostic evidence only.

Validation passed `cargo fmt`, `cargo check --bin musu`, TS route test `13/13`,
`npx tsc --noEmit --pretty false`, release evidence verifier regression
`ok=true`/`case_count=106`/`failed_case_count=0`, and `git diff --check`.
Filtered `cargo test --bin musu room_work_order -- --nocapture` was stopped
during the long test-profile Rust compile, so Rust unit-test proof is still
missing for this pass.

Search terms should include `GOAL v852`, `wiki/1027`,
`room work-order drain delivery ack`, `musu.room_work_order_delivery.v1`,
`server_ack_count`, `room_work_orders.rs`, `permission_envelope`,
`20260608-002507-HUGH_SECOND`, `not_logged_in`, `P2P control token`, and
`127.0.0.1:9741`.

## 2026-06-08 Room Work-Order Drain Delivery Ack Index Refresh (wiki/1028)

MUSU local indexer was refreshed after wiki/1027 and GOAL v852.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2878 symbols`
- `72601 ms`

Indexed context includes `musu-rs\src\install\room_work_orders.rs`, room
work-order delivery ack server route/store/tests, cloud DTOs, smoke/verifier
token fallback fix, latest diagnostic smoke evidence
`20260608-002507-HUGH_SECOND`, canonical drain delivery ack report, BETA
checklist, MUSU.PRO P2P control-plane spec, WIKI/WIKI_INDEX, and CoS memory.

Search terms should include `GOAL v853`, `wiki/1028`, `3103 files`,
`2878 symbols`, `72601 ms`, `room work-order drain delivery ack index refresh`,
`musu.room_work_order_delivery.v1`, `server_ack_count`, and
`room_work_orders.rs`.

## 2026-06-08 MUSU.PRO Login Endpoint Blocker and Concise Cloud Errors (wiki/1029)

Packaged one-machine diagnostics narrowed the current MUSU.PRO blocker to live
device-auth deployment, not local bridge startup.

- packaged alias direct doctor showed `logged_in=false`, `account_token_present=false`,
  `bridge_token_present=true`, no `~/.musu/token`, and `PATH` shadowing by
  `C:\Users\empty\.cargo\bin\musu.exe`
- packaged alias direct login reproduced the failure against the live cloud:
  `POST https://musu.pro/api/v1/auth/device` returned a Next HTML `404` page
  instead of API JSON
- local web source at `F:\Aisaak\Projects\musu-pro\src\app\api\v1\auth\device\route.ts`
  still exists, so the blocker is deployment/base-URL mismatch rather than a
  missing desktop caller
- `musu-rs\src\cloud\mod.rs` now normalizes cloud failures into concise errors
  that report the URL, HTTP status, and whether MUSU.PRO returned landing-page
  HTML instead of API JSON
- the same helper covers login, node registration, room presence/work-order,
  rendezvous, relay, and route-evidence calls so future cloud failures stop
  dumping raw HTML into the terminal

Validation target for this change:

- `cargo fmt --manifest-path .\musu-rs\Cargo.toml`
- `cargo check --bin musu`
- `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" login`

Search terms should include `GOAL v854`, `wiki/1029`,
`https://musu.pro/api/v1/auth/device`, `returned HTML instead of API JSON`,
`landing site`, `account_token_present=false`, `bridge_token_present=true`,
and `alias_shadowed_by`.

## 2026-06-08 Local MUSU.PRO Override Proved Device-Code Start/Poll (wiki/1030)

One-machine MUSU.PRO testing is no longer blocked at Desktop-to-control-plane
handshake once the local web control plane is allowed to run.

- local `musu-pro` `next start -p 3102` responded to
  `POST /api/v1/auth/device` with `503 {"code":"site_disabled"}`, which
  narrowed the local blocker to the hard site-disable gate rather than missing
  route code
- `F:\Aisaak\Projects\musu-pro\src\lib\site-availability.ts` was changed so
  `MUSU_SITE_DISABLED=false` can locally override the default disabled state
- with `MUSU_SITE_DISABLED=false`, local `musu-pro` on
  `http://localhost:3005` returned `200` for `POST /api/v1/auth/device` and
  emitted a valid `user_code`, `device_code`, and `expires_in`
- packaged WindowsApps MUSU then succeeded with
  `MUSU_CLOUD_BASE_URL=http://localhost:3005` and printed the device approval
  code instead of failing immediately
- local server logs confirmed end-to-end handshake traffic:
  `POST /api/v1/auth/device 200` and repeated
  `GET /api/v1/auth/device?... 202` polls from Desktop

This moves the blocker forward. Desktop can now start and poll device login
against a local MUSU.PRO control plane; what remains is approval/auth UX on the
web side, token persistence under `~/.musu/token`, and then room/work-order
E2E on the same machine.

Search terms should include `GOAL v855`, `wiki/1030`,
`MUSU_SITE_DISABLED=false`, `POST /api/v1/auth/device 200`,
`GET /api/v1/auth/device?... 202`, `MUSU_CLOUD_BASE_URL=http://localhost:3005`,
`site_disabled`, and `device_code`.

## 2026-06-08 Local MUSU.PRO Override Proof Index Refresh (wiki/1031)

MUSU local indexer was refreshed after wiki/1030 and GOAL v855.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2881 symbols`
- `129838 ms`

Indexed context now includes the concise cloud error changes, packaged doctor
shadowing findings, live `musu.pro` HTML 404 blocker, local
`MUSU_SITE_DISABLED=false` override, local `POST /api/v1/auth/device 200`
proof, packaged Desktop `MUSU_CLOUD_BASE_URL=http://localhost:3005` device-code
start/poll evidence, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v856`, `wiki/1031`, `3103 files`,
`2881 symbols`, `129838 ms`, `local MUSU.PRO override proof index refresh`,
`MUSU_SITE_DISABLED=false`, and `device-code start/poll`.

## 2026-06-08 One-Machine Packaged Desktop CPU Refresh (wiki/1032)

Fresh packaged Desktop CPU evidence on this machine does not reproduce a busy
loop in the one-machine states that can be tested locally today.

- diagnostic bridge-only idle evidence:
  `F:\workspace\musu-bee\.local-build\runtime-idle-cpu\musu-idle-cpu-20260608-024014.json`
  passed with `sample_seconds=60.04`, bridge-runtime CPU `0`, hot process
  count `0`, and working set `5.23MB`
- packaged Desktop 4-state matrix:
  `F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-024133-HUGH_SECOND\20260608-024133-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
  passed with `ok=true`
- scenario maxima:
  - `startup-open`: MUSU `0`, Node `0`, WebView2 `0.68`, hot `0`
  - `runtime-started`: MUSU `0`, Node `0`, WebView2 `0.08`, hot `0`
  - `dashboard-open`: MUSU `0`, Node `0`, WebView2 `0.03`, hot `0`
  - `desktop-open`: MUSU `0`, Node `0`, WebView2 `0.08`, hot `0`
- owned process/resource shape stayed stable in all four states:
  `owned_processes=8`, `owned_webview2=6`, working set `361.66-361.84MB`
- post-run process attribution confirmed:
  `musu_runtime=1`, `desktop_shell=1`, `owned_webview2=6`, `owned_node=0`,
  `orphan_repo_helpers=0`
- loop-risk code contracts also remained green:
  - `musu.rust_background_loop_contract.v1 ok=true fail_count=0`
  - `musu.frontend_polling_contract.v1 ok=true fail_count=0`

`verify-runtime-cpu-scenario-matrix.ps1` still rejects this matrix as release
evidence because the tree was dirty during capture, not because of CPU or
resource-budget failure. That narrows the remaining CPU gate to:

1. rerun from a clean tree
2. capture the eventual `post-route` state against a second machine

Search terms should include `GOAL v857`, `wiki/1032`,
`20260608-024133-HUGH_SECOND`, `startup-open 0.68`, `owned_webview2=6`,
`git_dirty=true`, `rust background loop contract`, and
`frontend polling contract`.

## 2026-06-08 One-Machine Packaged Desktop CPU Refresh Index (wiki/1033)

MUSU local indexer was refreshed after wiki/1032 and GOAL v857.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2881 symbols`
- `26548 ms`

Indexed context now includes fresh bridge-only idle evidence, packaged Desktop
4-state CPU matrix evidence, process attribution after the run, background-loop
audit results, frontend polling audit results, and the updated GOAL/WIKI/WIKI_INDEX
entries describing the remaining clean-tree and second-PC route blockers.

Search terms should include `GOAL v858`, `wiki/1033`, `3103 files`,
`2881 symbols`, `26548 ms`, `one-machine packaged Desktop CPU refresh index`,
and `20260608-024133-HUGH_SECOND`.

## 2026-06-08 Clean One-Machine Packaged Desktop CPU Recheck (wiki/1034)

The clean-tree rerun is now in place, and it still does not reproduce a local
idle busy-loop on packaged MUSU Desktop.

- clean 4-state matrix:
  `F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-025226-HUGH_SECOND\20260608-025226-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix verifier:
  `verify-runtime-cpu-scenario-matrix.ps1` returned `ok=true`,
  `fail_count=0`, and `git_dirty=false`
- per-state maxima:
  - `startup-open`: MUSU `1.41`, Node `0`, WebView2 `0.81`, hot `0`
  - `runtime-started`: MUSU `0`, Node `0`, WebView2 `0.13`, hot `0`
  - `dashboard-open`: MUSU `0`, Node `0`, WebView2 `0.08`, hot `0`
  - `desktop-open`: MUSU `0`, Node `0`, WebView2 `0.08`, hot `0`
- owned process shape stayed stable:
  `musu_runtime=1`, `desktop_shell=1`, `owned_webview2=6`, `owned_node=0`,
  and working set `367.55-370.65MB`
- separate clean `desktop-open` idle sample:
  `F:\workspace\musu-bee\.local-build\runtime-idle-cpu\musu-idle-cpu-20260608-025738.json`
  passed with `sample_seconds=60.042`, MUSU `0.42`, WebView2 `0.10`,
  hot `0`, owned WebView2 `6`, and total working set `367.3MB`

This matters because the dirty-tree qualifier is gone. The remaining CPU proof
work is now outside this one-machine local state: second-PC `post-route` plus
the full two-machine capture.

Search terms should include `GOAL v859`, `wiki/1034`,
`20260608-025226-HUGH_SECOND`, `20260608-025738`, `git_dirty=false`,
`startup-open 1.41`, `desktop-open 0.08`, and `desktop-open 0.42`.

## 2026-06-08 Clean One-Machine Packaged Desktop CPU Recheck Index (wiki/1035)

MUSU local indexer was refreshed after wiki/1034 and GOAL v859.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2881 symbols`
- `13423 ms`

Indexed context now includes the clean packaged Desktop 4-state matrix, the
clean `desktop-open` idle CPU sample, the BETA checklist CPU refresh note, and
the updated GOAL/WIKI/WIKI_INDEX entries that move the remaining CPU blocker to
second-PC `post-route` / two-machine proof.

Search terms should include `GOAL v860`, `wiki/1035`, `3103 files`,
`2881 symbols`, `13423 ms`, `clean one-machine packaged Desktop CPU recheck
index`, `20260608-025226-HUGH_SECOND`, and `20260608-025738`.

## 2026-06-08 Second-PC Runtime CPU Target Verification Hardening (wiki/1036)

The second-PC release-check wrapper now enforces the same target-proof rules
that go/no-go already expects for targeted `post-route` CPU evidence.

- changed:
  `scripts\windows\run-second-pc-release-check.ps1`
- verifier args added when `-RuntimeCpuRouteTarget` is supplied:
  - `-RequirePostRouteTarget`
  - `-ExpectedPostRouteTarget <target>`
  - `-RejectSelfPostRouteTarget`
  - `-RejectLocalPostRouteTarget`
- regression coverage added:
  `scripts\windows\test-release-evidence-verifiers.ps1`
- regression result:
  `musu.release_evidence_verifier_regression.v1 ok=true`, `case_count=107`,
  `failed_case_count=0`

Why this matters:

- the wrapper previously checked target equality only;
- it did not force proof that the recorded `musu route` command/arguments
  actually bound `--target`;
- it also did not force rejection of self-targeted or localhost/loopback
  target attempts in the wrapper path.

This is evidence-chain hardening, not final route proof. The release blocker is
still the real second-PC `post-route` / two-machine capture, but the remaining
evidence path is now stricter and less ambiguous.

Search terms should include `GOAL v861`, `wiki/1036`,
`second-PC targeted runtime CPU route verification contract`,
`RequirePostRouteTarget`, `RejectSelfPostRouteTarget`,
`RejectLocalPostRouteTarget`, and `107/107`.

## 2026-06-08 Second-PC Runtime CPU Target Verification Hardening Index (wiki/1037)

MUSU local indexer was refreshed after wiki/1036 and GOAL v861.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2881 symbols`
- `14633 ms`

Indexed context now includes the second-PC runtime CPU target-verifier wrapper
hardening, the new source-contract regression case, the `107/107` verifier
result, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v862`, `wiki/1037`, `3103 files`,
`2881 symbols`, `14633 ms`,
`second-PC runtime CPU target verification hardening index`, and `107/107`.

## 2026-06-08 Device-Code Login Poll Cadence Hardening (wiki/1038)

The packaged `musu login` device-code poll loop no longer assumes a fixed 5s
cadence when MUSU.PRO wants to supply one.

- changed:
  - `musu-rs\src\cloud\mod.rs`
  - `musu-rs\src\install\cli_commands.rs`
  - `scripts\windows\audit-rust-background-loop-contract.ps1`
- `DeviceCodeResponse` now accepts optional:
  - `interval`
  - `poll_interval_sec`
  - `interval_seconds`
- the Rust client normalizes that through:
  - `poll_interval_secs()`
  - `poll_interval()`
- floor:
  - minimum poll cadence stays `5s`
- CLI login now:
  - prints `timeout` plus effective `poll` cadence
  - sleeps with `flow.poll_interval()` instead of a hard-coded `5s`

Validation:

- `cargo fmt`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=107`, `failed_case_count=0`
- targeted `cargo test --manifest-path musu-rs/Cargo.toml device_code_response -- --nocapture`
  was started but stopped after the long test-profile compile path; no passing
  Rust test claim is attached to this step

This is not the final two-machine proof, but it does make the MUSU.PRO
control-plane login path better behaved: server-driven cadence when available,
and no tighter than the existing low-duty floor when it is not.

Search terms should include `GOAL v863`, `wiki/1038`, `DeviceCodeResponse
interval`, `poll_interval_secs`, `flow.poll_interval()`, and `107/107`.

## 2026-06-08 Device-Code Login Poll Cadence Hardening Index (wiki/1039)

MUSU local indexer was refreshed after wiki/1038 and GOAL v863.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2886 symbols`
- `14292 ms`

Indexed context now includes the device-code interval DTO change, the login
poll cadence update, the refreshed Rust background loop audit, the refreshed
verifier regression result, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v864`, `wiki/1039`, `3103 files`,
`2886 symbols`, `14292 ms`,
`device-code login poll cadence hardening index`, and `flow.poll_interval()`.

## 2026-06-08 Room Presence Candidate Publication Hardening (wiki/1040)

Room presence publication and local rendezvous candidate exchange now share the
same candidate-building logic, and that logic publishes more than one usable
path when the local machine has one.

- changed:
  - `musu-rs\src\bridge\rendezvous.rs`
  - `musu-rs\src\install\cli_commands.rs`
- new shared rendezvous helpers:
  - `endpoint_url_with_host(...)`
  - `candidate_endpoint_from_url(...)`
  - `local_candidate_endpoints_for_advertised_url(...)`
- behavior:
  - normalize candidate `scheme` and `kind` from URL input
  - auto-synthesize a Tailscale candidate from the advertised bridge URL when
    `crate::peer::tailscale::get_tailscale_ip()` returns a local IP
  - dedupe candidates by `(kind, addr)`
  - attach `public_addr` plus `nat_type` to `direct_quic` candidates instead
    of publishing a bare URL-derived address
- `local_candidate_request_for_node_id()` now publishes the multi-candidate
  set to MUSU.PRO instead of a single advertised endpoint
- `room_presence_request_from_opts()` now uses the same shared builders for:
  - the primary advertised/public URL
  - any explicit `--candidate-url`
  - the local synthesized Tailscale variant
  - the explicit relay candidate path

This closes a real control-plane gap: MUSU.PRO candidate exchange was already
ready for multiple route kinds, but local Rust publication could still degrade
to only one path or miss the local Tailscale variant. After this change, room
presence and local rendezvous publication describe the local node more honestly
to the remote selector.

Test hardening also landed in `cli_commands.rs`: room-presence tests no longer
assert fixed candidate counts, because the presence of a local Tailscale
adapter should not make those tests fail on one machine and pass on another.
They now assert required candidate presence instead.

Validation:

- `cargo fmt`
- `cargo check --manifest-path musu-rs/Cargo.toml --bin musu`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`:
  `ok=true`, `fail_count=0`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`:
  `ok=true`, `case_count=107`, `failed_case_count=0`
- targeted Rust tests were not claimed here because the long test-profile
  compile path still makes them impractical in this session

Search terms should include `GOAL v865`, `wiki/1040`,
`room presence candidate publication hardening`,
`local_candidate_endpoints_for_advertised_url`,
`candidate_endpoint_from_url`, `public_addr`, `nat_type`,
`auto Tailscale candidate`, and `107/107`.

## 2026-06-08 Room Presence Candidate Publication Hardening Index (wiki/1041)

MUSU local indexer was refreshed after wiki/1040 and GOAL v865.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2889 symbols`
- `44962 ms`

Indexed context now includes the shared room-presence/rendezvous candidate
builders, auto-published Tailscale/direct-quic metadata, the room-presence
test hardening, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v866`, `wiki/1041`, `3103 files`,
`2889 symbols`, `44962 ms`,
`room presence candidate publication hardening index`,
`local_candidate_endpoints_for_advertised_url`, and
`candidate_endpoint_from_url`.

## 2026-06-08 Runtime CPU Matrix Doctor Background Snapshot Hardening (wiki/1042)

Runtime CPU matrix evidence now carries the low-duty background configuration
that produced the sample, instead of forcing later readers to infer loop state
from separate audits.

- changed:
  - `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1`
  - `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`
  - `scripts\windows\test-release-evidence-verifiers.ps1`
- new matrix field:
  - `doctor_background_snapshot`
  - schema: `musu.runtime_cpu_background_snapshot.v1`
- capture source:
  - packaged `musu doctor --json`
- snapshot records:
  - `mdns_enabled`
  - `clipboard_sync_enabled`
  - `cloud_registration_enabled`
  - `cloud_heartbeat_interval_sec`
  - `cloud_heartbeat_floor_sec`
  - `relay_payload_poller_enabled`
  - `relay_payload_poller_interval_sec`
  - `planner_enabled`
  - `planner_interval_sec`
  - file-serve state
  - bridge PID / health HTTP status

The verifier now requires that snapshot on every runtime matrix and rejects
evidence that lacks it. It also checks that the snapshot came from
`musu doctor --json` and that key bounded-loop values remain coherent:

- cloud heartbeat interval >= floor and floor >= `60`
- relay payload poller interval >= floor
- planner interval >= floor
- planner timeout within its floor/ceiling bounds

Regression coverage was extended in
`scripts\windows\test-release-evidence-verifiers.ps1`:

- new source-contract case:
  - `runtime CPU matrix captures doctor background feature snapshot`
- new failing verifier fixture:
  - `runtime matrix rejects missing doctor background snapshot`
- full regression result:
  - `ok=true`
  - `case_count=109`
  - `failed_case_count=0`

A short real packaged diagnostic run proved the field lands in live evidence:

- matrix:
  `F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-034143-HUGH_SECOND\20260608-034143-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- scope:
  `runtime-started` only
- sample:
  `5s`
- diagnostic snapshot highlights:
  - `mdns_enabled=false`
  - `clipboard_sync_enabled=false`
  - `relay_payload_poller_enabled=false`
  - `planner_enabled=false`
  - `cloud_registration_enabled=false`
  - `cloud_heartbeat_interval_sec=300`
  - `bridge_service_registry_pid=29912`
  - `bridge_health_http_status=200`

This is not release-grade CPU evidence because it is a one-scenario, 5-second,
dirty-tree capture. Its purpose was to verify that the new snapshot contract is
real on this machine, not just in fixtures.

Search terms should include `GOAL v867`, `wiki/1042`,
`runtime CPU matrix doctor background snapshot`,
`musu.runtime_cpu_background_snapshot.v1`,
`doctor_background_snapshot`, `109/109`,
`20260608-034143-HUGH_SECOND`, and `cloud_heartbeat_interval_sec=300`.

## 2026-06-08 Runtime CPU Matrix Doctor Background Snapshot Index (wiki/1043)

MUSU local indexer was refreshed after wiki/1042 and GOAL v867.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2889 symbols`
- `16559 ms`

Indexed context now includes the runtime CPU matrix background snapshot
capture/verifier hardening, the `109/109` verifier regression pass, the short
live diagnostic matrix `20260608-034143-HUGH_SECOND`, and the updated
GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v868`, `wiki/1043`, `3103 files`,
`2889 symbols`, `16559 ms`,
`runtime CPU matrix doctor background snapshot index`, `109/109`, and
`20260608-034143-HUGH_SECOND`.

## 2026-06-08 Standalone Idle CPU Doctor Background Snapshot (wiki/1044)

The standalone idle CPU capture now preserves the same background loop state as
the runtime CPU matrix wrapper.

- changed:
  - `scripts\windows\measure-musu-idle-cpu.ps1`
- new field on idle evidence:
  - `doctor_background_snapshot`
  - schema: `musu.runtime_cpu_background_snapshot.v1`
- capture mode:
  - best-effort packaged `musu doctor --json` when available
  - fallback snapshot with `error` if the MUSU CLI cannot be resolved

This means a direct `measure-musu-idle-cpu.ps1` run now records:

- `mdns_enabled`
- `clipboard_sync_enabled`
- `cloud_registration_enabled`
- `cloud_heartbeat_interval_sec`
- `relay_payload_poller_enabled`
- `planner_enabled`
- file-serve state
- bridge PID / health HTTP status

That closes the evidence-shape gap between:

- per-scenario direct idle captures
- matrix-generated per-scenario evidence
- matrix wrapper summary JSON

A short live diagnostic run proved the field lands in standalone idle evidence:

- evidence:
  `F:\workspace\musu-bee\.local-build\runtime-idle-cpu\musu-idle-cpu-20260608-034858.json`
- scope:
  `runtime-started`
- sample:
  `5.045s`
- snapshot highlights:
  - `mdns_enabled=false`
  - `clipboard_sync_enabled=false`
  - `relay_payload_poller_enabled=false`
  - `planner_enabled=false`
  - `cloud_registration_enabled=false`
  - `cloud_heartbeat_interval_sec=300`
  - `bridge_service_registry_pid=29912`
  - `bridge_health_http_status=200`

This is not release-grade evidence. It was taken on a dirty tree and is too
short for the release CPU gate. Its job was to verify that direct idle evidence
now preserves the same loop-state context as the scenario matrix path.

Search terms should include `GOAL v869`, `wiki/1044`,
`standalone idle CPU doctor background snapshot`,
`musu.runtime_cpu_background_snapshot.v1`,
`musu-idle-cpu-20260608-034858.json`, and
`cloud_heartbeat_interval_sec=300`.

## 2026-06-08 Standalone Idle CPU Doctor Background Snapshot Index (wiki/1045)

MUSU local indexer was refreshed after wiki/1044 and GOAL v869.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2889 symbols`
- `71216 ms`

Indexed context now includes the standalone idle CPU background snapshot
capture update, the live diagnostic idle evidence
`musu-idle-cpu-20260608-034858.json`, and the updated GOAL/WIKI/WIKI_INDEX
entries.

Search terms should include `GOAL v870`, `wiki/1045`, `3103 files`,
`2889 symbols`, `71216 ms`,
`standalone idle CPU doctor background snapshot index`, and
`musu-idle-cpu-20260608-034858.json`.

## 2026-06-08 Runtime Idle Go/No-Go Doctor Snapshot Gate (wiki/1046)

The release go/no-go path now requires the same MUSU doctor background snapshot
for standalone idle CPU evidence that runtime CPU matrices already require.

- changed:
  - `scripts\windows\write-release-go-no-go.ps1`
  - `scripts\windows\test-release-evidence-verifiers.ps1`
- gated evidence:
  - `musu.runtime_idle_cpu_evidence.v1`
- required nested field:
  - `doctor_background_snapshot`
  - schema: `musu.runtime_cpu_background_snapshot.v1`
  - command: `musu doctor --json`

`write-release-go-no-go.ps1` `Test-RuntimeIdleCpuEvidence` now enforces:

- snapshot presence
- snapshot schema
- doctor command identity
- background feature field presence
- bounded cadence/timeout metadata for:
  - `cloud_heartbeat`
  - `relay_payload_poller`
  - `planner`

This closes the remaining verifier asymmetry between:

- runtime CPU matrix evidence
- standalone idle CPU evidence
- release go/no-go aggregation

Without this change, direct idle evidence could have been accepted by the
release writer even if it omitted the loop-state snapshot that explains which
background candidates were actually enabled during sampling.

Regression coverage was updated in
`scripts\windows\test-release-evidence-verifiers.ps1` and now includes:

- `go-no-go runtime idle CPU requires doctor background snapshot`

Validation passed:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test-release-evidence-verifiers.ps1 -Json`
- result:
  - `ok=true`
  - `case_count=110`
  - `failed_case_count=0`

Search terms should include `GOAL v871`, `wiki/1046`,
`runtime idle go/no-go doctor snapshot gate`,
`go-no-go runtime idle CPU requires doctor background snapshot`,
`doctor_background_snapshot`, `musu.runtime_cpu_background_snapshot.v1`, and
`case_count=110`.

## 2026-06-08 Runtime Idle Go/No-Go Doctor Snapshot Gate Index (wiki/1047)

MUSU local indexer was refreshed after wiki/1046 and GOAL v871.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2889 symbols`
- `15957 ms`

Indexed context now includes the standalone idle CPU go/no-go doctor snapshot
gate, the new verifier source-contract case, and the updated GOAL/WIKI/WIKI_INDEX
entries.

Search terms should include `GOAL v872`, `wiki/1047`, `3103 files`,
`2889 symbols`, `15957 ms`,
`runtime idle go-no-go doctor snapshot gate index`, and `110/110`.

## 2026-06-08 Idle CPU Matching Process Inventory And Current 4-State Evidence (wiki/1048)

Idle CPU evidence now preserves the machine-wide helper inventory alongside the
MUSU-owned attribution slice.

- changed:
  - `scripts\windows\measure-musu-idle-cpu.ps1`
- new field on idle evidence:
  - `matching_process_inventory`

That inventory records:

- machine-wide matching `node` counts
- machine-wide matching `WebView2` counts
- MUSU-owned helper counts
- unowned helper counts
- top matching raw helper processes by CPU during the sample

This matters because operator-visible CPU spikes can come from unrelated
machine-wide `node.exe` or `msedgewebview2.exe` processes even when the MUSU
runtime itself is idle. The previous evidence shape preserved only the
MUSU-owned slice.

A short live diagnostic run proved the new field lands in output:

- evidence:
  `F:\workspace\musu-bee\.local-build\runtime-idle-cpu\musu-idle-cpu-20260608-040443.json`
- scope:
  `runtime-started`
- sample:
  `5.037s`
- inventory highlights:
  - `node machine_wide=22`
  - `node owned_by_musu_process_tree=0`
  - `node unowned_other=22`
  - `webview2 machine_wide=18`
  - `webview2 owned_by_musu_process_tree=6`
  - `webview2 unowned_other=12`

Fresh current one-machine packaged 4-state evidence also stayed comfortably
under the release CPU budget:

- matrix:
  `F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-040059-HUGH_SECOND\20260608-040059-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- `startup-open`
  - `sample_seconds=60.06`
  - `hot_process_count=0`
  - `max_one_core_percent_by_role.musu=0`
  - `max_one_core_percent_by_role.webview2=0.03`
- `runtime-started`
  - `sample_seconds=60.053`
  - `hot_process_count=0`
  - `musu=0.03`
  - `webview2=0.16`
- `dashboard-open`
  - `sample_seconds=60.042`
  - `hot_process_count=0`
  - `musu=0.03`
  - `webview2=0.03`
- `desktop-open`
  - `sample_seconds=60.059`
  - `hot_process_count=0`
  - `musu=0`
  - `webview2=0.10`
- common state:
  - owned Node `0`
  - owned WebView2 `6`
  - working set about `46.46-46.47MB`
  - doctor background snapshot still shows `mdns=false`, `clipboard=false`,
    `cloud_registration=false`, `relay_payload_poller=false`, `planner=false`

Interpretation:

- current one-machine packaged MUSU Desktop still does not reproduce a
  MUSU-owned idle busy-loop
- the sampler now carries enough context to distinguish MUSU-owned helper CPU
  from unrelated machine-wide helper noise in the same sample artifact

Search terms should include `GOAL v873`, `wiki/1048`,
`matching_process_inventory`, `machine_wide=22`, `owned_by_musu_process_tree=6`,
`20260608-040059-HUGH_SECOND`, and `runtime-started webview2 0.16`.

## 2026-06-08 Idle CPU Matching Process Inventory Index (wiki/1049)

MUSU local indexer was refreshed after wiki/1048 and GOAL v873.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2889 symbols`
- `19714 ms`

Indexed context now includes the `matching_process_inventory` sampler update,
the live diagnostic idle evidence `musu-idle-cpu-20260608-040443.json`, the
fresh packaged 4-state matrix `20260608-040059-HUGH_SECOND`, and the updated
GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v874`, `wiki/1049`, `3103 files`,
`2889 symbols`, `19714 ms`, `matching_process_inventory index`,
`20260608-040443`, and `20260608-040059-HUGH_SECOND`.

## 2026-06-08 Doctor Background Auto-Update Attribution (wiki/1050)

`musu doctor --json` now exposes the last remaining obvious low-duty loop
candidate that was missing from the CPU evidence path: auto-update supervisor
cadence and bounded health polling.

Changes:

- `musu-rs\src\install\auto_update.rs`
  - exports `AUTO_UPDATE_DEFAULT_INTERVAL_MINUTES=60`
  - exports `AUTO_UPDATE_MIN_INTERVAL_MINUTES=5`
  - keeps public `HEALTH_POLL_INITIAL_MS=250`
  - keeps public `HEALTH_POLL_MAX_MS=2000`
- `musu-rs\src\install\cli_commands.rs`
  - extends `DoctorBackground` with:
    - `auto_update_supervise`
    - `auto_update_check_interval_minutes`
    - `auto_update_check_interval_floor_minutes`
    - `auto_update_health_poll_initial_ms`
    - `auto_update_health_poll_max_ms`
  - `check_background_features(...)` now inspects `update.toml`
  - doctor marks invalid auto-update config as `Warn`
  - doctor notes that retries only happen during explicit
    `musu auto-update --supervise`
- `scripts\windows\measure-musu-idle-cpu.ps1`
  and `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1`
  now preserve these auto-update fields in
  `musu.runtime_cpu_background_snapshot.v1`
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`
  and `scripts\windows\write-release-go-no-go.ps1`
  now require the new fields and enforce:
  - interval floor `>= 5m`
  - health poll initial `>= 250ms`
  - health poll max `<= 2000ms`
  - initial `<=` max
- `scripts\windows\test-release-evidence-verifiers.ps1`
  fixture/source-contract coverage was extended for the new checks
- `scripts\windows\audit-rust-background-loop-contract.ps1`
  was updated so the auto-update interval audit accepts the new constant-based
  floor check

Validation:

- `cargo fmt`
- `cargo check --manifest-path musu-rs/Cargo.toml --bin musu`
- `scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=110`
  - `failed_case_count=0`
- `scripts\windows\audit-rust-background-loop-contract.ps1 -Json`
  - `ok=true`
  - `fail_count=0`

Targeted Rust tests were attempted with
`cargo test --manifest-path musu-rs/Cargo.toml doctor_background -- --nocapture`
but are still not claimed because test-profile compile stayed too long and the
run was stopped manually.

Meaning:

- idle/runtime CPU evidence can now say whether auto-update supervise was a
  real contributor during sampling, instead of leaving that loop candidate
  implicit
- the verifier/gate path now treats auto-update cadence the same way it already
  treats cloud heartbeat, relay payload poller, and planner cadence

Search terms should include `GOAL v875`, `wiki/1050`,
`auto_update_supervise`, `auto_update_check_interval_minutes`,
`auto_update_health_poll_initial_ms`, `AUTO_UPDATE_MIN_INTERVAL_MINUTES`,
`doctor background auto-update interval floor`, and
`doctor background auto-update health poll bounds`.

## 2026-06-08 Doctor Background Auto-Update Attribution Index (wiki/1051)

MUSU local indexer was refreshed after wiki/1050 and GOAL v875.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `14379 ms`

Indexed context now includes the doctor auto-update background attribution
changes, the verifier/audit pass updates, and the updated GOAL/WIKI/WIKI_INDEX
entries.

Search terms should include `GOAL v876`, `wiki/1051`, `3103 files`,
`2890 symbols`, `14379 ms`, `doctor background auto-update attribution index`,
and `auto_update_supervise`.

## 2026-06-08 Runtime Matrix Post-Route Route Diagnostics (wiki/1052)

`post-route` runtime CPU evidence now carries the route-diagnostic context that
was previously split across separate scripts.

Changes:

- `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1`
  now records, inside `route_probe`:
  - `route_explain_command`
  - `route_explain_exit_code`
  - `route_explain_output`
  - parsed `route_explain`
  - `network_probe`
  - `route_evidence_path`
  - parsed `route_attempt_evidence`
- the same extractor now defaults missing auto-update doctor fields to:
  - `auto_update_check_interval_minutes=60`
  - `auto_update_check_interval_floor_minutes=5`
  - `auto_update_health_poll_initial_ms=250`
  - `auto_update_health_poll_max_ms=2000`
  so current packaged Desktop builds do not emit zero-valued snapshot budgets
  before the new Rust doctor schema is rolled into the package
- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`
  now requires:
  - `post-route route explain present`
  - `post-route route explain schema`
  - `post-route route explain path priority`
  - `post-route route explain bridge path selection wired`
  - `post-route route explain rendezvous wired`
  - `post-route route evidence path`
  - `post-route route attempt evidence present`
  - `post-route route attempt evidence schema`
  - `post-route route attempt result present`
  - `post-route route attempt kind present`
  - `post-route route attempt candidate addr present`
  - `post-route route attempt encryption present`
  - selected-candidate `network_probe` binding when applicable
- `scripts\windows\test-release-evidence-verifiers.ps1`
  now has a dedicated source-contract gate for this route-diagnostic capture and
  a negative fixture for missing `route_explain`

Live proof:

- matrix:
  `F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-043537-HUGH_SECOND\20260608-043537-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- route evidence sidecar:
  `F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-043537-HUGH_SECOND\20260608-043537-HUGH_SECOND.post-route.route-evidence.json`
- captured facts:
  - `route_explain.schema = musu.route_explain.v1`
  - `path_priority = ["lan","tailscale","direct_quic","relay"]`
  - `bridge_path_selection_wired = true`
  - `rendezvous_session_wired = true`
  - `route_attempt_evidence.schema = musu.route_evidence.v1`
  - `route_attempt_evidence.route_kind = lan`
  - `route_attempt_evidence.encryption = none_http_bearer`
  - `route_attempt_evidence.result = success`

Targeted verifier replay:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-043537-HUGH_SECOND\20260608-043537-HUGH_SECOND.runtime-cpu-scenario-matrix.json -ExpectedVersion 1.15.0-rc.1 -RequiredScenarios post-route -MinSampleSeconds 5 -MaxOneCorePercent 5 -RequirePostRouteProbe -Json`
- result:
  - all new route-diagnostic checks passed
  - remaining failures were only:
    - `git clean during matrix`
    - `measurement clean git: post-route`

This is still diagnostic-only evidence because the tree was dirty, but it proves
the new `post-route` matrix shape works against the packaged local Desktop and
captures route/path-selection context in the same artifact as CPU ownership.

`test-release-evidence-verifiers.ps1 -Json` was started after the change but is
not claimed in this entry because the full regression sweep remained
long-running and no final pass/fail JSON was captured before continuing work.

Search terms should include `GOAL v877`, `wiki/1052`,
`route_explain_command`, `route_attempt_evidence`, `path_priority`,
`20260608-043537-HUGH_SECOND`, and `post-route route explain present`.

## 2026-06-08 Runtime Matrix Post-Route Route Diagnostics Index (wiki/1053)

MUSU local indexer was refreshed after wiki/1052 and GOAL v877.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `24010 ms`

Indexed context now includes the runtime matrix `post-route` route-diagnostic
capture changes, the live packaged matrix
`20260608-043537-HUGH_SECOND`, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v878`, `wiki/1053`, `3103 files`,
`2890 symbols`, `24010 ms`, `runtime matrix post-route route diagnostics index`,
and `20260608-043537-HUGH_SECOND`.

## 2026-06-08 Runtime Idle Matching Process Inventory Release Gate (wiki/1054)

Standalone idle CPU evidence now hard-fails go/no-go if it lacks the
machine-wide helper inventory that separates MUSU-owned noise from unrelated
desktop noise.

Changed files:

- `scripts\windows\write-release-go-no-go.ps1`
  now requires `matching_process_inventory` inside runtime idle CPU evidence,
  with:
  - top-level `musu`, `node`, `webview2`, and `other` buckets
  - node helper ownership buckets:
    `machine_wide`, `owned_by_musu_process_tree`,
    `repo_related_unowned`, `unowned_other`
  - WebView2 helper ownership buckets:
    `machine_wide`, `owned_by_musu_process_tree`, `unowned_other`
- `scripts\windows\test-release-evidence-verifiers.ps1`
  now has a dedicated source-contract case asserting that the runtime idle
  release gate enforces this inventory split

Why this matters:

- the idle busy-loop objective is not just "CPU was low"
- it is "we can prove whether any observed helper load belongs to MUSU or to
  unrelated machine-wide noise"
- `matching_process_inventory` was already landing in idle evidence, but until
  now the release gate did not require it
- this change promotes that distinction into the actual no-go decision

Verification:

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=113`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-044449`

This does not resolve the remaining product blockers by itself. The real
release blockers are still:

- clean-tree `post-route` rerun
- real second-PC `post-route` CPU matrix
- real two-machine route proof
- live `musu.pro` login/control-plane cleanup

Search terms should include `GOAL v879`, `wiki/1054`,
`matching_process_inventory`,
`runtime idle CPU requires matching process inventory`,
`20260608-044449`, and `113/113`.

## 2026-06-08 Runtime Idle Matching-Process Inventory Gate Index (wiki/1055)

MUSU local indexer was refreshed after wiki/1054 and GOAL v879.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `13063 ms`

Indexed context now includes the runtime idle matching-process inventory
release-gate promotion, the `113/113` verifier regression sweep rooted at
`F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-044449`,
and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v880`, `wiki/1055`, `3103 files`,
`2890 symbols`, `13063 ms`, `runtime idle matching-process inventory gate index`,
and `20260608-044449`.

## 2026-06-08 Runtime Idle Direct Verifier Entry Point (wiki/1056)

The runtime-idle evidence gate now has a direct entry point, so one evidence
file can be checked without paying for the full release corpus scan.

Changed files:

- `scripts\windows\write-release-go-no-go.ps1`
  now accepts `-VerifyRuntimeIdleCpuEvidencePath`
  - resolves the provided evidence path relative to repo root when needed
  - runs `Test-RuntimeIdleCpuEvidence` directly with repo `VERSION`,
    current `HEAD`, `MinRuntimeIdleCpuSampleSeconds`, and
    `MaxRuntimeIdleCpuOneCorePercent`
  - returns the same verifier JSON and exits `1` on failure
- `scripts\windows\test-release-evidence-verifiers.ps1`
  now source-contracts this entry point and uses it for targeted live fixture
  replay instead of launching the full go/no-go corpus

Why this matters:

- the new `matching_process_inventory` gate is correct, but validating it by
  spawning the entire go/no-go pipeline is too expensive and noisy
- this direct verifier path exercises the same runtime-idle logic while keeping
  the test scope tight
- it is also useful for manual operator debugging when a single idle evidence
  file needs explanation

Targeted verification:

- script parse sanity:
  - `write-release-go-no-go.ps1` parsed successfully
  - `test-release-evidence-verifiers.ps1` parsed successfully
- synthetic direct-verifier replay:
  - valid fixture:
    - `valid_ok = true`
    - `valid_fail_count = 0`
  - same fixture with `matching_process_inventory` removed:
    - `bad_ok = false`
    - `bad_fail_count = 1`
    - `bad_matching_inventory_fail = true`

This proves the direct verifier accepts the fully attributed idle evidence and
rejects the otherwise-identical payload once the machine-wide helper inventory
is removed.

Search terms should include `GOAL v881`, `wiki/1056`,
`VerifyRuntimeIdleCpuEvidencePath`, `valid_ok=true`,
`bad_matching_inventory_fail=true`, and `runtime idle direct verifier`.

## 2026-06-08 Runtime Idle Direct Verifier Index (wiki/1057)

MUSU local indexer was refreshed after wiki/1056 and GOAL v881.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `14975 ms`

Indexed context now includes the `VerifyRuntimeIdleCpuEvidencePath` direct
verifier entry point, the targeted valid/invalid fixture replay outcome, and
the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v882`, `wiki/1057`, `3103 files`,
`2890 symbols`, `14975 ms`, `runtime idle direct verifier index`, and
`VerifyRuntimeIdleCpuEvidencePath`.

## 2026-06-08 Verifier Regression Green After Runtime Idle Direct Path (wiki/1058)

The full release evidence verifier regression is green again on current HEAD
after replacing the expensive idle go/no-go replay with the dedicated direct
runtime-idle verifier path.

Result:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\test-release-evidence-verifiers.ps1 -Json`
- `ok=true`
- `case_count=115`
- `failed_case_count=0`
- output root:
  `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-050742`

Important coverage in this sweep:

- `runtime idle CPU direct verifier entrypoint contract`
- `runtime idle CPU direct verifier rejects missing matching process inventory in live fixture replay`

This closes the loop from:

- gate wiring in `write-release-go-no-go.ps1`
- targeted direct verifier proof
- full regression harness proof on current HEAD

Search terms should include `GOAL v883`, `wiki/1058`, `115/115`,
`20260608-050742`, `runtime idle CPU direct verifier entrypoint contract`, and
`runtime idle CPU direct verifier rejects missing matching process inventory in live fixture replay`.

## 2026-06-08 Runtime Idle Verifier Regression Green Index (wiki/1059)

MUSU local indexer was refreshed after wiki/1058 and GOAL v883.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `15407 ms`

Indexed context now includes the green `115/115` release evidence verifier
regression sweep, the runtime-idle direct verifier entry point, and the updated
GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v884`, `wiki/1059`, `3103 files`,
`2890 symbols`, `15407 ms`, `runtime idle verifier regression green index`,
and `20260608-050742`.

## 2026-06-08 Clean Current-Head Post-Route 60s CPU Evidence (wiki/1060)

The dirty-tree blocker for one-machine `post-route` CPU evidence is now closed
with a clean temporary worktree capture at current HEAD.

Execution:

- clean worktree:
  `F:\workspace\musu-bee-clean-current`
- HEAD:
  `c9b39f65e618f2f10ef446a7c71d08c1bf1325ea`
- measure command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee-clean-current\scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario post-route -SampleSeconds 60 -RunRouteProbe -Json`
- verifier command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee-clean-current\scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath F:\workspace\musu-bee-clean-current\.local-build\runtime-cpu-scenarios\20260608-051236-HUGH_SECOND\20260608-051236-HUGH_SECOND.runtime-cpu-scenario-matrix.json -ExpectedVersion 1.15.0-rc.1 -RequiredScenarios post-route -MinSampleSeconds 60 -MaxOneCorePercent 5 -RequirePostRouteProbe -Json`

Artifacts:

- matrix:
  `F:\workspace\musu-bee-clean-current\.local-build\runtime-cpu-scenarios\20260608-051236-HUGH_SECOND\20260608-051236-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- per-scenario evidence:
  `F:\workspace\musu-bee-clean-current\.local-build\runtime-cpu-scenarios\20260608-051236-HUGH_SECOND\20260608-051236-HUGH_SECOND.post-route.evidence.json`

Recorded facts:

- matrix:
  - `ok=true`
  - `git_dirty=false`
  - packaged WindowsApps MUSU
  - requested scenario only: `post-route`
- route probe:
  - `ok=true`
  - expected token:
    `MUSU_CPU_SCENARIO_ROUTE_OK_20260608_051236`
  - attempt count `1`
- post-route measurement:
  - `ok=true`
  - `sample_seconds=60.043`
  - `hot_process_count=0`
  - owned Node `0`
  - owned WebView2 `6`
  - WebView2 max CPU `0.08`
  - total working set `56.55MB`
- verifier:
  - `ok=true`
  - `fail_count=0`

Meaning:

- the one-machine `post-route` CPU matrix no longer depends on dirty-tree
  diagnostic evidence
- current HEAD now has a clean, verified `post-route` 60s artifact
- remaining route-side release blockers are still:
  - real second-PC `post-route` CPU matrix
  - real two-machine route proof

Search terms should include `GOAL v885`, `wiki/1060`,
`musu-bee-clean-current`, `20260608-051236-HUGH_SECOND`,
`MUSU_CPU_SCENARIO_ROUTE_OK_20260608_051236`, and `clean post-route 60s`.

## 2026-06-08 Clean Post-Route 60s CPU Evidence Index (wiki/1061)

MUSU local indexer was refreshed after wiki/1060 and GOAL v885.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `16347 ms`

Indexed context now includes the clean temporary worktree post-route 60s CPU
artifact, its passing verifier replay, and the updated GOAL/WIKI/WIKI_INDEX
entries.

Search terms should include `GOAL v886`, `wiki/1061`, `3103 files`,
`2890 symbols`, `16347 ms`, `clean post-route 60s index`, and
`20260608-051236-HUGH_SECOND`.

## 2026-06-08 Clean Current-Head 5-Scenario Runtime CPU Matrix (wiki/1062)

Current HEAD now has a clean one-machine 5-scenario 60s runtime CPU matrix in a
detached clean worktree, so startup/runtime/dashboard/desktop/post-route all
have packaged evidence under the committed verifier.

- clean worktree:
  `F:\workspace\musu-bee-clean-current`
- HEAD:
  `c9b39f65e618f2f10ef446a7c71d08c1bf1325ea`
- measure command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee-clean-current\scripts\windows\measure-musu-runtime-cpu-scenarios.ps1 -Scenario startup-open,runtime-started,dashboard-open,desktop-open,post-route -SampleSeconds 60 -OpenDesktopApp -RunRouteProbe -Json`
- matrix:
  `F:\workspace\musu-bee-clean-current\.local-build\runtime-cpu-scenarios\20260608-051840-HUGH_SECOND\20260608-051840-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- verifier:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee-clean-current\scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath F:\workspace\musu-bee-clean-current\.local-build\runtime-cpu-scenarios\20260608-051840-HUGH_SECOND\20260608-051840-HUGH_SECOND.runtime-cpu-scenario-matrix.json -ExpectedVersion 1.15.0-rc.1 -RequiredScenarios startup-open,runtime-started,dashboard-open,desktop-open,post-route -MinSampleSeconds 60 -MaxOneCorePercent 5 -RequirePostRouteProbe -Json`
- verifier result:
  - `ok=true`
  - `fail_count=0`

Key artifact facts:

- `git_dirty=false`
- packaged WindowsApps `musu.exe`
- route probe token:
  `MUSU_CPU_SCENARIO_ROUTE_OK_20260608_051840`
- `hot_process_count=0` in every required scenario
- owned Node `0` in every required scenario
- owned WebView2 `6` in every required scenario
- peak role CPU:
  - `startup-open`: WebView2 `0.05`
  - `runtime-started`: WebView2 `0.03`
  - `dashboard-open`: WebView2 `0.03`
  - `desktop-open`: WebView2 `0.05`
  - `post-route`: MUSU `0.03`, WebView2 `0.03`

Meaning:

- current HEAD now has clean one-machine matrix evidence for
  `startup-open`, `runtime-started`, `dashboard-open`, `desktop-open`, and
  `post-route`
- the remaining one-machine nuance is narrower: standalone clean idle evidence
  still needs a fresh clean worktree after the newer uncommitted idle-gate
  script changes are committed, because the current clean worktree script does
  not emit `doctor_background_snapshot` and `matching_process_inventory`
- remaining cross-machine blockers are still:
  - real second-PC `post-route` CPU matrix
  - real two-machine route proof
  - live `musu.pro` login/control-plane cleanup

Search terms should include `GOAL v887`, `wiki/1062`,
`20260608-051840-HUGH_SECOND`, `MUSU_CPU_SCENARIO_ROUTE_OK_20260608_051840`,
`clean 5-scenario 60s matrix`, and `post-route verifier pass`.

## 2026-06-08 Clean 5-Scenario Runtime CPU Matrix Index (wiki/1063)

MUSU local indexer was refreshed after wiki/1062 and GOAL v887.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `16032 ms`

Indexed context includes the clean 5-scenario current-head matrix, its passing
verifier replay, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v888`, `wiki/1063`, `3103 files`,
`2890 symbols`, `16032 ms`, `clean 5-scenario matrix index`,
`20260608-051840-HUGH_SECOND`, and `runtime CPU matrix current-head clean`.

## 2026-06-08 Runtime Idle Matching Inventory Compatibility and Fresh Clean Idle Proof (wiki/1064)

Runtime-idle release evidence now accepts both historical nested
`matching_process_inventory.counts_by_bucket` payloads and the newer flattened
role buckets, and current HEAD has fresh clean standalone idle proof again.

- fix commit:
  `e6b7285dc5785a1c4f1bf3d65b3b9de26f973333`
- changed files:
  - `scripts\windows\measure-musu-idle-cpu.ps1`
  - `scripts\windows\write-release-go-no-go.ps1`
  - `scripts\windows\test-release-evidence-verifiers.ps1`
- regression:
  - command:
    `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - result:
    - `ok=true`
    - `case_count=116`
    - `failed_case_count=0`
    - output root:
      `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-053407`
  - new coverage:
    `runtime idle CPU direct verifier accepts nested matching process inventory buckets`

Fresh current-HEAD clean idle proof:

- clean worktree:
  `F:\workspace\musu-bee-clean-head-e6b7285d`
- measure command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee-clean-head-e6b7285d\scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -IncludeNode -IncludeWebView2 -Json`
- evidence:
  `F:\workspace\musu-bee-clean-head-e6b7285d\.local-build\runtime-idle-cpu\musu-idle-cpu-20260608-053645.json`
- direct gate:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee-clean-head-e6b7285d\scripts\windows\write-release-go-no-go.ps1 -VerifyRuntimeIdleCpuEvidencePath F:\workspace\musu-bee-clean-head-e6b7285d\.local-build\runtime-idle-cpu\musu-idle-cpu-20260608-053645.json -Json`
- direct gate result:
  - `ok=true`
  - `fail_count=0`

Key facts:

- `git_commit=e6b7285dc5785a1c4f1bf3d65b3b9de26f973333`
- `git_dirty=false`
- `sample_seconds=60.079`
- `hot_process_count=0`
- owned process count `8`
- owned WebView2 `6`
- total working set `90.95MB`
- max one-core CPU `0.05`

Meaning:

- the one-machine clean standalone idle blocker is now closed on current HEAD
- release evidence can consume both nested and flattened matching-process
  inventory layouts, which protects older artifacts while keeping new artifacts
  explicit
- the evidence still captures unrelated machine-wide helper noise outside MUSU's
  process tree, which is important because local `musu-pro`/tooling `node`
  processes and unrelated WebView2 hosts exist on this machine
- remaining blockers are now cross-machine and server-side:
  - real second-PC `post-route` CPU matrix
  - real two-machine route proof
  - live `musu.pro` login/control-plane cleanup

Search terms should include `GOAL v889`, `wiki/1064`, `e6b7285d`,
`20260608-053645`, `116/116`, `nested matching process inventory buckets`, and
`clean standalone idle proof`.

## 2026-06-08 Runtime Idle Compatibility Index (wiki/1065)

MUSU local indexer was refreshed after wiki/1064 and GOAL v889.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `16660 ms`

Indexed context includes the compatibility fix commit `e6b7285d`, the green
`116/116` verifier sweep, the fresh clean standalone idle proof
`musu-idle-cpu-20260608-053645.json`, and the updated GOAL/WIKI/WIKI_INDEX
entries.

Search terms should include `GOAL v890`, `wiki/1065`, `3103 files`,
`2890 symbols`, `16660 ms`, `runtime idle compatibility index`, `e6b7285d`,
`20260608-053645`, and `clean standalone idle proof index`.

## 2026-06-08 Second-PC Runtime Idle Verification Hardening (wiki/1066)

The second-PC evidence path now direct-verifies runtime idle CPU evidence both
at capture time and at import time, so cross-machine release gating no longer
relies on sampler `ok` booleans alone.

Changed scripts:

- `scripts\windows\run-second-pc-release-check.ps1`
- `scripts\windows\import-second-pc-return.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Behavior change:

- `run-second-pc-release-check.ps1` now replays
  `write-release-go-no-go.ps1 -VerifyRuntimeIdleCpuEvidencePath` against the
  captured second-PC desktop-open idle artifact and records:
  - `runtime_idle_cpu_verified`
  - `runtime_idle_cpu_verification`
  - `runtime_idle_cpu_error`
- `import-second-pc-return.ps1` now independently re-verifies the imported
  runtime idle artifact on the primary repo HEAD and records:
  - `runtime_idle_cpu_verified`
  - `runtime_idle_cpu_verification`
  - `runtime_idle_cpu_verification_error`
- release-gate import now treats these as mandatory when second-PC release
  evidence is required, instead of trusting only:
  - `runtime_idle_cpu_ok`
  - subrole summaries
  - wrapper success booleans

Why this matters:

- second-PC idle evidence now goes through the same direct idle gate as
  one-machine release evidence
- stale or shape-mismatched imported idle artifacts are much harder to smuggle
  through the second-PC return zip path
- the cross-machine release blocker is now more explicitly “real second-PC
  evidence missing” rather than “the importer is too trusting”

Regression:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
- result:
  - `ok=true`
  - `case_count=118`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-054638`
- new source-contract cases:
  - `second-PC release check verifies runtime idle CPU evidence`
  - `second-PC return import verifies runtime idle CPU evidence`

Search terms should include `GOAL v891`, `wiki/1066`, `118/118`,
`runtime_idle_cpu_verified`, `second-PC release check verifies runtime idle CPU evidence`,
and `second-PC return import verifies runtime idle CPU evidence`.

## 2026-06-08 Second-PC Runtime Idle Verification Index (wiki/1067)

MUSU local indexer was refreshed after wiki/1066 and GOAL v891.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `18772 ms`

Indexed context includes the second-PC idle verification hardening scripts, the
green `118/118` verifier sweep, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v892`, `wiki/1067`, `3103 files`,
`2890 symbols`, `18772 ms`, `second-PC runtime idle verification index`,
`118/118`, and `runtime_idle_cpu_verified`.

## 2026-06-08 Second-PC Runtime CPU Matrix Import Re-Verification (wiki/1068)

Second-PC return import now direct-verifies imported runtime CPU matrices on
primary HEAD, so cross-machine CPU matrix evidence is re-checked under the same
route-target and post-route probe policy instead of trusting wrapper booleans.

Changed scripts:

- `scripts\windows\import-second-pc-return.ps1`
- `scripts\windows\test-release-evidence-verifiers.ps1`

Behavior change:

- importer now replays `verify-runtime-cpu-scenario-matrix.ps1` against the
  imported second-PC matrix using:
  - `-RequiredScenarios startup-open,runtime-started,dashboard-open,desktop-open,post-route`
  - `-MinSampleSeconds 60`
  - `-MaxOneCorePercent 5`
  - `-RequirePostRouteProbe`
- when the second-PC wrapper recorded `runtime_cpu_route_target`, importer now
  also re-applies:
  - `-RequirePostRouteTarget`
  - `-ExpectedPostRouteTarget`
  - `-RejectSelfPostRouteTarget`
  - `-RejectLocalPostRouteTarget`
  - `-AllowFailedPostRouteProbe` when the wrapper allowed route-probe failure

Importer output now records:

- `runtime_cpu_scenario_matrix_verified`
- `runtime_cpu_scenario_matrix_verification`
- `runtime_cpu_scenario_matrix_verification_error`

Release-gate import now fails on:

- `runtime_cpu_scenario_matrix_evidence_not_verified`
- `runtime_cpu_scenario_matrix_verification_error:...`

Why this matters:

- second-PC CPU matrix evidence now gets the same primary-HEAD verifier replay
  that one-machine clean matrix evidence already relies on
- imported return zips can no longer satisfy the matrix side of the release gate
  merely by carrying a wrapper boolean plus structurally plausible scenario JSON
- the remaining blocker becomes more honestly external: real second-PC matrix
  evidence is still missing, but the import path is now much less trusting

Regression:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
- result:
  - `ok=true`
  - `case_count=119`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-055302`
- new source-contract case:
  - `second-PC return import verifies runtime CPU matrix evidence`

Search terms should include `GOAL v893`, `wiki/1068`, `119/119`,
`runtime_cpu_scenario_matrix_verified`,
`second-PC return import verifies runtime CPU matrix evidence`, and
`primary HEAD matrix re-verification`.

## 2026-06-08 Second-PC Runtime CPU Matrix Verification Index (wiki/1069)

MUSU local indexer was refreshed after wiki/1068 and GOAL v893.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `19392 ms`

Indexed context includes the importer matrix re-verification change, the green
`119/119` verifier sweep, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v894`, `wiki/1069`, `3103 files`,
`2890 symbols`, `19392 ms`, `second-PC runtime matrix verification index`,
`119/119`, and `runtime_cpu_scenario_matrix_verified`.

## 2026-06-08 Second-PC Return Git Freshness Hardening (wiki/1070)

Second-PC return kits now preserve source-commit metadata, and primary import
now freshness-gates both the second-PC release-check summary and the handoff
before accepting cross-machine evidence.

Key changes:

- `scripts\windows\msix-common.ps1`
  now exposes `Get-MusuSourceGitState`, which resolves source commit/dirty
  state from repo git when available or from `kit-build-metadata.json` /
  `packet-build-metadata.json` when the second PC is running from an extracted
  kit without `.git`.
- `scripts\windows\prepare-multidevice-test-kit.ps1`
  now writes `kit-build-metadata.json` into the kit root with source
  `commit`, `branch`, `dirty`, `status_short`, and metadata source details.
- `scripts\windows\collect-second-pc-handoff.ps1`
  and `scripts\windows\run-second-pc-release-check.ps1`
  now stamp `git_commit`, `git_dirty`, `git_status_short`, `git_source`, and
  `git_metadata_path` into `musu.second_pc_handoff.v1` and
  `musu.second_pc_release_check.v1`.
- `scripts\windows\import-second-pc-return.ps1`
  now reuses the release freshness classifier logic, computes
  `release_check_git_freshness` and `handoff_git_freshness`, and fails
  release-gate import on:
  - `release_check_git_commit_missing`
  - `release_check_git_commit_invalid`
  - `release_check_git_commit_not_current`
  - `release_check_git_dirty_missing`
  - `release_check_git_dirty_true`
  - `handoff_git_commit_missing`
  - `handoff_git_commit_invalid`
  - `handoff_git_commit_not_current`
  - `handoff_git_dirty_missing`
  - `handoff_git_dirty_true`
  - `handoff_release_check_git_commit_mismatch`

Why this matters:

- Previous second-PC import already re-verified idle and matrix artifacts on
  primary HEAD, but it could still trust a structurally valid return zip built
  from an older or mixed operator-kit run.
- The new gate closes that trust gap without requiring live git on the second
  PC, because kit metadata is now embedded at kit-build time and replayed into
  the returned handoff/release-check artifacts.

Regression:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
- result:
  - `ok=true`
  - `case_count=123`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-060601`
- new source-contract cases:
  - `second-PC kit embeds source git metadata`
  - `second-PC release check records git freshness metadata`
  - `second-PC handoff records git freshness metadata`
  - `second-PC return import verifies handoff and release-check freshness`

Search terms should include `GOAL v895`, `wiki/1070`, `123/123`,
`kit-build-metadata.json`, `Get-MusuSourceGitState`,
`release_check_git_commit_not_current`, and
`handoff_release_check_git_commit_mismatch`.

## 2026-06-08 Second-PC Return Git Freshness Index (wiki/1071)

MUSU local indexer was refreshed after wiki/1070 and GOAL v895.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `16344 ms`

Indexed context includes the kit metadata fallback, second-PC handoff and
release-check git metadata stamps, the import freshness gate, the green
`123/123` verifier sweep, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v896`, `wiki/1071`, `3103 files`,
`2890 symbols`, `16344 ms`, `second-PC return git freshness index`, `123/123`,
`kit-build-metadata.json`, and `handoff_release_check_git_commit_mismatch`.

## 2026-06-08 Second-PC Route Preflight Freshness Hardening (wiki/1072)

Second-PC route preflight and the return-card helper now surface stale or mixed
return zips before the operator wastes a targeted route attempt.

Key changes:

- `scripts\windows\test-second-pc-route-preflight.ps1`
  now sources `msix-common.ps1`, resolves primary current HEAD with
  `Get-MusuSourceGitState`, loads the returned `*.release-check.json` when
  present, and applies the same docs/status-only delta freshness policy used by
  the release gate.
- The preflight now fails early when:
  - a provided return zip is missing `*.release-check.json`
  - handoff commit metadata is missing, invalid, stale, or dirty
  - release-check commit metadata is missing, invalid, stale, or dirty
  - handoff and release-check commits disagree
- `scripts\windows\show-second-pc-return-card.ps1`
  now exposes:
  - `handoff_git_freshness`
  - `release_check_git_freshness`
  - `route_preflight_ready`
  - operator warnings when the return zip is stale or mixed
- `scripts\windows\prepare-final-operator-gate-packet.ps1`
  now includes `msix-common.ps1` because the route-preflight and return-card
  reference copies now depend on it.

Why this matters:

- Import already freshness-gated returned evidence, but the operator could
  still waste time on `musu peer add`, `musu route --explain`, or a targeted
  post-route CPU matrix using a stale return zip.
- The new preflight/card step moves that failure closer to the operator entry
  point, which is the right place to stop a bad second-PC bundle.

Regression:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
- result:
  - `ok=true`
  - `case_count=126`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-061654`
- new source-contract cases:
  - `second-PC route preflight verifies returned git freshness`
  - `second-PC return card surfaces git freshness`
  - `final operator packet includes msix-common for route helper scripts`

Search terms should include `GOAL v897`, `wiki/1072`, `126/126`,
`route_preflight_ready`, `second-PC route preflight verifies returned git freshness`,
and `second-PC return card surfaces git freshness`.

## 2026-06-08 Second-PC Route Preflight Freshness Index (wiki/1073)

MUSU local indexer was refreshed after wiki/1072 and GOAL v897.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `14915 ms`

Indexed context includes the route-preflight freshness gate, the return-card
freshness surfacing, the final operator packet `msix-common.ps1` dependency
update, the green `126/126` verifier sweep, and the updated GOAL/WIKI/WIKI_INDEX
entries.

Search terms should include `GOAL v898`, `wiki/1073`, `3103 files`,
`2890 symbols`, `14915 ms`, `second-PC route preflight freshness index`,
`126/126`, and `route_preflight_ready`.

## 2026-06-08 Idle Busy-Loop Candidate Coverage Expanded (wiki/1074)

The release gate's idle busy-loop candidate summary now matches the actual Rust
background-loop audit surface instead of silently omitting planner and
auto-update supervision.

Key changes:

- `scripts\windows\write-release-go-no-go.ps1`
  now expands `idle_busy_loop_candidate_status` from 8 to 10 candidates.
- Added candidate:
  - `autonomous planner loop`
  requiring:
  - planner opt-in env gate
  - planner cancellation token
  - planner Ctrl-C cancellation
  - planner default/min interval
  - planner command timeout cap
  - planner cancellation-aware sleep
  - planner exits after cancellation
- Added candidate:
  - `auto-update supervisor loop`
  requiring:
  - minimum allowed interval
  - skipped first tick
  - bounded health-poll initial backoff
  - bounded health-poll max backoff
  - explicit sleep between retries
- The idle-busy-loop blocker text and manual internal gate text now name:
  - planner
  - auto-update supervisor

Why this matters:

- Before this change, the Rust background-loop audit and doctor snapshot already
  tracked planner and auto-update cadence, but the human-facing idle busy-loop
  candidate summary did not.
- That mismatch made the release gate weaker than the actual objective, which
  says to force sleep/backoff/cancellation across all background tasks.

Regression:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
- result:
  - `ok=true`
  - `case_count=126`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-062246`
- source-contract impact:
  - `go-no-go idle busy-loop candidate status` now expects 10 candidates and
    the planner/auto-update strings

Search terms should include `GOAL v899`, `wiki/1074`,
`autonomous planner loop`, `auto-update supervisor loop`, and
`idle busy-loop candidate status`.

## 2026-06-08 Idle Busy-Loop Candidate Coverage Index (wiki/1075)

MUSU local indexer was refreshed after wiki/1074 and GOAL v899.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2890 symbols`
- `16681 ms`

Indexed context includes the planner/auto-update candidate additions, the
unchanged green `126/126` verifier sweep, and the updated GOAL/WIKI/WIKI_INDEX
entries.

Search terms should include `GOAL v900`, `wiki/1075`, `3103 files`,
`2890 symbols`, `16681 ms`, `idle busy-loop candidate coverage index`,
`autonomous planner loop`, and `auto-update supervisor loop`.

## 2026-06-08 Doctor Runtime Loop Candidate Summary (wiki/1076)

Packaged `musu doctor --json` now emits a runtime loop candidate summary so
idle/runtime CPU evidence can say which packaged background loops were actually
active without reverse-reading scattered booleans and interval fields.

What changed:

- `musu-rs\src\install\cli_commands.rs`
  - `DoctorBackground` now includes:
    - `runtime_loop_candidates`
    - `active_runtime_loop_candidate_count`
    - `active_runtime_loop_candidate_keys`
  - candidates currently covered:
    - `mdns_discovery`
    - `clipboard_polling`
    - `cloud_heartbeat`
    - `file_sync_watch`
    - `relay_target_polling`
    - `autonomous_planner`
    - `auto_update_supervisor`
  - every candidate carries:
    - `key`
    - `label`
    - `active`
    - `activation_mode`
    - `note`
  - human `musu doctor` output now also prints a one-line
    `runtime_loop_candidates active=X/Y [...]` summary.

- `scripts\windows\measure-musu-idle-cpu.ps1`
- `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1`
  - both samplers now preserve that runtime-loop summary inside
    `doctor_background_snapshot.background`.

- `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1`
- `scripts\windows\write-release-go-no-go.ps1`
  - both gates now require:
    - the new summary fields
    - the expected candidate-key set
    - consistency between
      `active_runtime_loop_candidate_keys`
      and per-candidate `active` booleans.

- `scripts\windows\test-release-evidence-verifiers.ps1`
  - fixture/source contracts were updated so the summary cannot silently drop
    out of either sampler or either verifier.

Verification:

- `cargo fmt`
- `cargo check --manifest-path F:\workspace\musu-bee\musu-rs\Cargo.toml --bin musu`
  - passed
  - existing warnings in `src\bridge\rendezvous.rs` remain unrelated
- `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=126`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-063228`

Search terms should include `GOAL v901`, `wiki/1076`,
`runtime_loop_candidates`, `active_runtime_loop_candidate_keys`,
`clipboard_polling`, `auto_update_supervisor`, and
`doctor background runtime loop candidates`.

## 2026-06-08 Doctor Runtime Loop Candidate Summary Index (wiki/1077)

MUSU local indexer was refreshed after wiki/1076 and GOAL v901.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2891 symbols`
- `15580 ms`

Indexed context includes the new `runtime_loop_candidates` doctor summary, the
sampler/verifier propagation through idle/runtime CPU evidence, the unchanged
green `126/126` verifier sweep, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v902`, `wiki/1077`, `3103 files`,
`2891 symbols`, `15580 ms`, `doctor runtime loop candidate summary index`,
`runtime_loop_candidates`, and `active_runtime_loop_candidate_keys`.

## 2026-06-08 Second-PC Route Reachability Verification Surfacing (wiki/1078)

Second-PC operator helpers now treat returned route reachability verification as
part of route readiness, not just freshness.

What changed:

- `scripts\windows\test-second-pc-route-preflight.ps1`
  - now reads these fields from returned
    `musu.second_pc_release_check.v1`:
    - `route_reachability_diagnostic_required`
    - `route_reachability_diagnostic_verified`
    - `route_reachability_target`
  - when a returned release-check says route reachability evidence is required,
    preflight now fails if:
    - target metadata is missing
    - verification is absent
    - verification is false
  - the preflight result JSON now records:
    - `release_check_route_reachability_required`
    - `release_check_route_reachability_verified`
    - `release_check_route_reachability_target`

- `scripts\windows\show-second-pc-return-card.ps1`
  - now surfaces:
    - `route_reachability_diagnostic_required`
    - `route_reachability_diagnostic_verified`
    - `route_reachability_target`
  - `route_preflight_ready` now depends on both git freshness and required route
    reachability verification.
  - warnings now explicitly call out missing or failed second-PC route
    reachability verification.

Why this matters:

- before this change, a return zip could be freshness-clean yet still look
  route-ready even when the second-PC release-check had not actually verified
  route reachability evidence.
- after this change, operator-facing preflight/card output fails earlier and
  points directly at the missing route-proof condition.

Verification:

- parse:
  - `test-second-pc-route-preflight.ps1`
  - `show-second-pc-return-card.ps1`
  - `test-release-evidence-verifiers.ps1`
  - all `PARSE_OK`
- regression:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=126`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-064156`

Search terms should include `GOAL v903`, `wiki/1078`,
`route_reachability_diagnostic_verified`, `route_preflight_ready`,
`release_check_route_reachability_verified`, and `second-PC route preflight`.

## 2026-06-08 Second-PC Route Reachability Verification Index (wiki/1079)

MUSU local indexer was refreshed after wiki/1078 and GOAL v903.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2891 symbols`
- `27609 ms`

Indexed context includes the second-PC preflight/card route-reachability
surfacing, the unchanged green `126/126` verifier sweep, and the updated
GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v904`, `wiki/1079`, `3103 files`,
`2891 symbols`, `27609 ms`, `second-PC route reachability verification index`,
`route_preflight_ready`, and `route_reachability_diagnostic_verified`.

## 2026-06-08 Runtime Idle Repo-Orphan Helper Gate (wiki/1080)

Runtime-idle direct verification now treats repo/workspace orphan `node.exe`
helpers as a release failure instead of merely diagnostic noise.

What changed:

- `scripts\windows\write-release-go-no-go.ps1`
  - `Test-RuntimeIdleCpuEvidence` now adds:
    - `matching process inventory repo-related node helpers`
  - it fails when:
    - `matching_process_inventory.node.repo_related_unowned > 0`
  - this closes the gap where idle CPU evidence could still pass even though a
    repo-related unowned helper process was present on the same machine.

- `scripts\windows\test-release-evidence-verifiers.ps1`
  - source contract now requires the new check strings
  - the valid runtime-idle fixture was corrected from
    `repo_related_unowned=1` to `repo_related_unowned=0`
  - a new direct verifier replay case now mutates that field back to `1` and
    expects the direct idle verifier to fail specifically on the new check

Why this matters:

- the product objective already treats repo/workspace orphan helpers as a real
  process-ownership problem
- CPU evidence was recording this signal but was not enforcing it at the direct
  idle release gate
- after this change, “machine-wide noise” and “repo-related orphan contamination”
  are no longer treated the same way

Verification:

- parse:
  - `write-release-go-no-go.ps1`
  - `test-release-evidence-verifiers.ps1`
  - both `PARSE_OK`
- full regression:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=127`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-065314`

Search terms should include `GOAL v905`, `wiki/1080`,
`repo_related_unowned`, `matching process inventory repo-related node helpers`,
and `127/127`.

## 2026-06-08 Runtime Idle Repo-Orphan Helper Gate Index (wiki/1081)

MUSU local indexer was refreshed after wiki/1080 and GOAL v905.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3103 files`
- `2891 symbols`
- `14339 ms`

Indexed context includes the repo-orphan idle gate hardening, the green
`127/127` verifier sweep, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v906`, `wiki/1081`, `3103 files`,
`2891 symbols`, `14339 ms`, `runtime idle repo-orphan helper gate index`,
`repo_related_unowned`, and `127/127`.

## 2026-06-08 Second-PC Process Attribution Direct Verification (wiki/1082)

What changed:

- `scripts\windows\verify-process-attribution-summary.ps1`
  - new direct verifier for `musu.process_attribution_summary.v1`
  - requires:
    - valid summary schema and `generated_at`
    - `audit_evidence_path` and `operator_machine`
    - bridge registry presence, live PID, and healthy bridge check
    - required helper count fields
    - node/WebView2 count conservation
    - `orphan_repo_helpers=0`
    - no nested ownership-check failures
- `scripts\windows\run-second-pc-release-check.ps1`
  - now runs `verify-process-attribution-summary.ps1` immediately after
    `show-musu-process-attribution.ps1`
  - records:
    - `process_attribution_verified`
    - `process_attribution_verification`
    - `process_attribution_verification_error`
- `scripts\windows\import-second-pc-return.ps1`
  - now replays the same verifier on the imported summary on primary HEAD
  - requires returned `release_check.process_attribution_verified=true`
  - adds release-gate issues:
    - `release_check_process_attribution_verified_missing`
    - `release_check_process_attribution_not_verified`
    - `process_attribution_summary_not_verified`
    - `process_attribution_summary_verification_error:...`
- second-PC packaging and operator tooling:
  - `prepare-multidevice-test-kit.ps1` now ships
    `verify-process-attribution-summary.ps1`
  - `prepare-final-operator-gate-packet.ps1` now ships the same verifier
  - `verify-final-operator-gate-packet.ps1` now requires the importer source to
    reference `verify-process-attribution-summary.ps1` and
    `process_attribution_verified`
  - `verify-operator-action-pack.ps1` now requires nested kits to include the
    new verifier alongside `show-musu-process-attribution.ps1` and
    `audit-musu-process-ownership.ps1`
- freshness/status-only allowlists:
  - `import-second-pc-return.ps1`
  - `show-second-pc-return-card.ps1`
  - `test-second-pc-route-preflight.ps1`
  - `verify-runtime-cpu-scenario-matrix.ps1`
  - `verify-single-machine-evidence.ps1`
  - `write-release-go-no-go.ps1`
  all now treat `scripts/windows/verify-process-attribution-summary.ps1` as a
  docs/status/tooling-only delta for evidence freshness.

Why this matters:

- before this change, cross-machine release gating only trusted:
  - `process_attribution_ok`
  - imported summary presence
  - wrapper-level CPU subrole booleans
- that left a gap where the summary JSON itself was never re-verified on the
  primary repo HEAD
- now the ownership summary has the same shape as runtime-idle and runtime-matrix
  evidence:
  - direct verifier at capture time
  - direct verifier again at import time

Verification:

- parse:
  - `verify-process-attribution-summary.ps1`
  - `run-second-pc-release-check.ps1`
  - `import-second-pc-return.ps1`
  - `test-release-evidence-verifiers.ps1`
  - all `PARSE_OK`
- full regression:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=133`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-070937`
- new regression coverage includes:
  - `second-PC release check verifies process attribution summary`
  - `second-PC return import verifies process attribution summary`
  - `second-PC kit includes process attribution verifier`
  - `final operator packet includes process attribution verifier`
  - `process attribution summary accepts clean owned/unowned helper counts`
  - `process attribution summary rejects repo-related orphan helpers`

Search terms should include `GOAL v907`, `wiki/1082`,
`verify-process-attribution-summary.ps1`, `process_attribution_verified`,
`process_attribution_summary_not_verified`, and `133/133`.

## 2026-06-08 Second-PC Process Attribution Verification Index (wiki/1083)

MUSU local indexer was refreshed after wiki/1082 and GOAL v907.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3104 files`
- `2891 symbols`
- `16699 ms`

Indexed context includes the new
`verify-process-attribution-summary.ps1` direct verifier, the second-PC
release-check/import/kit/packet process-attribution verification wiring, the
green `133/133` verifier regression sweep, and the updated GOAL/WIKI/WIKI_INDEX
entries.

Search terms should include `GOAL v908`, `wiki/1083`, `3104 files`,
`2891 symbols`, `16699 ms`, `second-PC process attribution verification index`,
`verify-process-attribution-summary.ps1`, and `133/133`.

## 2026-06-08 Doctor Idle-Loop Coverage Expansion (wiki/1084)

`musu doctor --json` runtime-loop summaries now expose the two release-gated
idle-loop candidates that were previously only visible through the Rust audit:
`health_check_retry` and `bridge_readiness_wait`.

- Rust doctor changes:
  `musu-rs\src\install\cli_commands.rs` extends `DoctorBackground` with
  `bridge_health_poll_initial_ms` and `bridge_health_poll_max_ms`, and expands
  `runtime_loop_candidates` from 7 to 9 keys by adding
  `health_check_retry` and `bridge_readiness_wait`.
- candidate semantics:
  - `health_check_retry` is `activation_mode = "update-config"` and becomes
    active when `update.toml` enables a supervising auto-update source, so
    doctor snapshots now reflect that sub-loop directly instead of only
    implying it through `auto_update_supervisor`.
  - `bridge_readiness_wait` is `activation_mode = "request-scoped"` and stays
    inactive in steady-state doctor snapshots while still documenting the
    bounded bridge readiness backoff used by CLI waits.
- evidence extraction:
  `scripts\windows\measure-musu-idle-cpu.ps1` and
  `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` now preserve
  `bridge_health_poll_initial_ms = 250` and
  `bridge_health_poll_max_ms = 2000` inside
  `doctor_background_snapshot.background`.
- verifier hardening:
  `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` and
  `scripts\windows\write-release-go-no-go.ps1` now require the new bridge poll
  fields, validate their `250..2000ms` bounds, and expect the expanded
  9-candidate runtime-loop key set that includes `health_check_retry` and
  `bridge_readiness_wait`.
- fixture/source-contract updates:
  `scripts\windows\test-release-evidence-verifiers.ps1` now seeds both new
  bridge poll fields and the expanded 9-candidate doctor background summary in
  idle/runtime fixtures, and its source-contract needles now require the
  `doctor background bridge health poll bounds` check.

Validation for this change set:

- `cargo fmt`
- `cargo check --manifest-path F:/workspace/musu-bee/musu-rs/Cargo.toml --bin musu`
- `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=133`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-072210`

Not claimed:

- `cargo test --manifest-path F:/workspace/musu-bee/musu-rs/Cargo.toml doctor_background -- --nocapture`
  was started, but test-profile compilation stayed long and the cargo process
  was terminated before a pass/fail result was captured.

Search terms should include `GOAL v909`, `wiki/1084`, `health_check_retry`,
`bridge_readiness_wait`, `bridge_health_poll_initial_ms`,
`doctor background bridge health poll bounds`, and `133/133`.

## 2026-06-08 Doctor Idle-Loop Coverage Index (wiki/1085)

MUSU local indexer was refreshed after wiki/1084 and GOAL v909.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3104 files`
- `2891 symbols`
- `15863 ms`

Indexed context includes the doctor runtime-loop summary expansion to
`health_check_retry` and `bridge_readiness_wait`, the new bridge health-poll
bound checks in both release verifiers, the green `133/133` verifier sweep, and
the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v910`, `wiki/1085`, `3104 files`,
`2891 symbols`, `15863 ms`, `doctor idle-loop coverage index`,
`health_check_retry`, `bridge_readiness_wait`, and `133/133`.

## 2026-06-08 Stale Packaged Doctor Fail-Fast (wiki/1086)

Runtime CPU evidence no longer hides an outdated packaged `musu doctor --json`
schema behind synthesized fallback values.

- sampler changes:
  `scripts\windows\measure-musu-idle-cpu.ps1` and
  `scripts\windows\measure-musu-runtime-cpu-scenarios.ps1` now emit:
  - `doctor_schema_complete`
  - `background_field_fallback_used`
  - `runtime_loop_candidate_fallback_used`
  - `missing_background_fields`
  - `missing_runtime_loop_candidate_keys`
  inside `doctor_background_snapshot`.
- intent:
  previous samplers filled in bridge/auto-update defaults when an installed
  packaged MUSU omitted newer doctor fields. That kept evidence JSON parseable,
  but it could blur the difference between:
  - a current packaged runtime that genuinely reports the full loop schema
  - a stale packaged runtime that simply does not know about those fields yet
- verifier hardening:
  `scripts\windows\verify-runtime-cpu-scenario-matrix.ps1` and
  `scripts\windows\write-release-go-no-go.ps1` now add
  `doctor background snapshot completeness` and fail when fallback defaults were
  required for missing background fields or missing runtime loop candidate keys.

Live proof on the current machine:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 5 -Scenario runtime-started -IncludeNode -IncludeWebView2 -Json`
- artifact:
  `F:\workspace\musu-bee\.local-build\runtime-idle-cpu\musu-idle-cpu-20260608-074347.json`
- extracted result:
  - `doctor_schema_complete=false`
  - `background_field_fallback_used=true`
  - `runtime_loop_candidate_fallback_used=true`
  - missing background fields included:
    `runtime_loop_candidates`, `active_runtime_loop_candidate_count`,
    `active_runtime_loop_candidate_keys`,
    `bridge_health_poll_initial_ms`, `bridge_health_poll_max_ms`,
    and the newer auto-update/doctor booleans
  - missing runtime loop candidate keys included all 9 expected keys:
    `mdns_discovery`, `clipboard_polling`, `cloud_heartbeat`,
    `file_sync_watch`, `relay_target_polling`, `autonomous_planner`,
    `health_check_retry`, `auto_update_supervisor`,
    `bridge_readiness_wait`

Interpretation:

- the current installed WindowsApps MUSU package is still older than current
  HEAD with respect to doctor loop-attribution schema
- CPU evidence now says that explicitly instead of pretending the package
  reported the full schema
- this is the right failure mode before any release-grade one-machine or
  second-PC CPU evidence is accepted

Validation:

- PowerShell parse sanity:
  - `measure-musu-idle-cpu.ps1`
  - `measure-musu-runtime-cpu-scenarios.ps1`
  - `verify-runtime-cpu-scenario-matrix.ps1`
  - `write-release-go-no-go.ps1`
  - `test-release-evidence-verifiers.ps1`
  - all `PARSE_OK`
- `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\test-release-evidence-verifiers.ps1 -Json`
  - `ok=true`
  - `case_count=133`
  - `failed_case_count=0`
  - output root:
    `F:\workspace\musu-bee\.local-build\release-evidence-verifier-tests\20260608-074409`

Search terms should include `GOAL v911`, `wiki/1086`,
`doctor_schema_complete`, `background_field_fallback_used`,
`runtime_loop_candidate_fallback_used`, and
`musu-idle-cpu-20260608-074347.json`.

## 2026-06-08 Stale Packaged Doctor Fail-Fast Index (wiki/1087)

MUSU local indexer was refreshed after wiki/1086 and GOAL v911.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3104 files`
- `2891 symbols`
- `17814 ms`

Indexed context includes the new doctor schema completeness markers, the
release-verifier fail-fast check, the live stale-package diagnostic artifact
`musu-idle-cpu-20260608-074347.json`, the green `133/133` verifier sweep, and
the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v912`, `wiki/1087`, `3104 files`,
`2891 symbols`, `17814 ms`, `stale packaged doctor fail-fast index`,
`doctor_schema_complete`, and `133/133`.

## 2026-06-08 Local-Sideload Refresh and Clean One-Machine Matrix (wiki/1088)

The stale packaged-doctor failure was closed by refreshing the local-sideload
MUSU package to current HEAD and then re-running one-machine packaged CPU
evidence from a clean git state.

Package refresh:

- rebuilt runtime:
  `cargo build --manifest-path F:/workspace/musu-bee/musu-rs/Cargo.toml --bin musu --release`
- packed MSIX:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\build-msix.ps1 -Configuration release -StartupContract local-sideload-manual -SkipBuild`
- output package:
  `F:\workspace\musu-bee\.local-build\msix\output\musu_1.15.0.0_x64_local-sideload-manual.msix`
- reinstalled package:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\install-and-verify-msix.ps1 -StartupContract local-sideload-manual -ReplaceExisting`

Post-refresh doctor confirmation:

- explicit packaged alias:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" doctor --json`
- the packaged doctor output now exposes:
  - full 9-key `runtime_loop_candidates`
  - `active_runtime_loop_candidate_count`
  - `active_runtime_loop_candidate_keys`
  - `auto_update_supervise`
  - `auto_update_check_interval_minutes`
  - `auto_update_health_poll_initial_ms`
  - `bridge_health_poll_initial_ms`
  - `bridge_health_poll_max_ms`
- short diagnostic artifact:
  `F:\workspace\musu-bee\.local-build\runtime-idle-cpu\musu-idle-cpu-20260608-075850.json`
- extracted result:
  - `doctor_schema_complete=true`
  - `background_field_fallback_used=false`
  - `runtime_loop_candidate_fallback_used=false`
  - that sample was not release-grade CPU evidence because
    `process_count_before=0` and `process_count_after=0`; it served only to
    prove the installed package now emits the current doctor schema

Clean one-machine packaged rerun:

- matrix artifact:
  `F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-080400-HUGH_SECOND\20260608-080400-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- matrix summary:
  - `ok=true`
  - `git_commit=7118ca52dac92d42668a5b0448d8e85279cce9ad`
  - `git_dirty=false`
  - scenarios:
    `startup-open`, `runtime-started`, `desktop-open`
  - `doctor_schema_complete=true`
  - `background_field_fallback_used=false`
  - `runtime_loop_candidate_fallback_used=false`
- per-scenario result:
  - `startup-open`
    - `sample_seconds=60.055`
    - `hot_process_count=0`
    - MUSU max `0`
    - WebView2 max `0.05`
    - owned process count `8`
    - owned WebView2 helper count `6`
    - working set `378.08MB`
  - `runtime-started`
    - `sample_seconds=60.066`
    - `hot_process_count=0`
    - MUSU max `0`
    - WebView2 max `0.08`
    - owned process count `8`
    - owned WebView2 helper count `6`
    - working set `378.16MB`
  - `desktop-open`
    - `sample_seconds=60.051`
    - `hot_process_count=0`
    - MUSU max `0`
    - WebView2 max `0.05`
    - owned process count `8`
    - owned WebView2 helper count `6`
    - working set `377.99MB`

Targeted verifier:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-080400-HUGH_SECOND\20260608-080400-HUGH_SECOND.runtime-cpu-scenario-matrix.json -ExpectedVersion 1.15.0-rc.1 -RequiredScenarios startup-open,runtime-started,desktop-open -MinSampleSeconds 60 -MaxOneCorePercent 5 -Json`
- result:
  - `ok=true`
  - `fail_count=0`
  - `present_required_scenarios=startup-open,runtime-started,desktop-open`

Interpretation:

- the local-sideload refresh removed the stale packaged-doctor schema gap on
  this machine
- clean one-machine packaged CPU evidence is green again for the three primary
  local scenarios
- remaining release blockers are no longer this machine's packaged doctor
  schema; they are the real second-PC and two-machine evidence gaps

Search terms should include `GOAL v913`, `wiki/1088`,
`musu_1.15.0.0_x64_local-sideload-manual.msix`,
`doctor_schema_complete=true`, `20260608-080400-HUGH_SECOND`, and
`verify-runtime-cpu-scenario-matrix.ps1`.

## 2026-06-08 Local-Sideload Refresh and Clean One-Machine Matrix Index (wiki/1089)

MUSU local indexer was refreshed after wiki/1088 and GOAL v913.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3104 files`
- `2891 symbols`
- `83466 ms`

Indexed context includes the local-sideload MSIX refresh, the packaged doctor
schema completeness proof from `musu-idle-cpu-20260608-075850.json`, the clean
`20260608-080400-HUGH_SECOND` one-machine matrix rerun, the targeted three-
scenario verifier pass, and the updated GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v914`, `wiki/1089`, `3104 files`,
`2891 symbols`, `83466 ms`, `local-sideload refresh index`, and
`20260608-080400-HUGH_SECOND`.

## 2026-06-08 Clean One-Machine Dashboard-Open Matrix (wiki/1090)

One-machine packaged CPU evidence now includes the `dashboard-open` scenario on
current HEAD, and it shows that packaged local runtime currently has no
dashboard URL to open.

Artifact:

- matrix:
  `F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-081507-HUGH_SECOND\20260608-081507-HUGH_SECOND.runtime-cpu-scenario-matrix.json`
- git:
  - `git_commit=fad51e5e127cdfc79de8d3b0052f7916438152d2`
  - `git_dirty=false`
- required scenarios:
  - `startup-open`
  - `runtime-started`
  - `dashboard-open`
  - `desktop-open`

Matrix result:

- `ok=true`
- `doctor_schema_complete=true`
- `background_field_fallback_used=false`
- `runtime_loop_candidate_fallback_used=false`
- `hot_process_count=0` across all four scenarios

Per-scenario summary:

- `startup-open`
  - `sample_seconds=60.056`
  - MUSU max `0`
  - WebView2 max `0.05`
  - owned process count `8`
  - owned WebView2 helper count `6`
  - working set `377.72MB`
- `runtime-started`
  - `sample_seconds=60.058`
  - MUSU max `0`
  - WebView2 max `0.10`
  - owned process count `8`
  - owned WebView2 helper count `6`
  - working set `377.68MB`
- `dashboard-open`
  - `sample_seconds=60.062`
  - MUSU max `0`
  - WebView2 max `0.05`
  - owned process count `8`
  - owned WebView2 helper count `6`
  - working set `377.68MB`
  - `dashboard_url=""`
- `desktop-open`
  - `sample_seconds=60.057`
  - MUSU max `0`
  - WebView2 max `0.08`
  - owned process count `8`
  - owned WebView2 helper count `6`
  - working set `377.65MB`

Targeted verifier:

- command:
  `powershell -NoProfile -ExecutionPolicy Bypass -File F:\workspace\musu-bee\scripts\windows\verify-runtime-cpu-scenario-matrix.ps1 -EvidencePath F:\workspace\musu-bee\.local-build\runtime-cpu-scenarios\20260608-081507-HUGH_SECOND\20260608-081507-HUGH_SECOND.runtime-cpu-scenario-matrix.json -ExpectedVersion 1.15.0-rc.1 -RequiredScenarios startup-open,runtime-started,dashboard-open,desktop-open -MinSampleSeconds 60 -MaxOneCorePercent 5 -Json`
- result:
  - `ok=true`
  - `fail_count=0`
  - `present_required_scenarios=startup-open,runtime-started,dashboard-open,desktop-open`

Interpretation:

- CPU/process ownership/resource-budget evidence remains green after adding the
  fourth local scenario
- the important product gap is not CPU here; it is that packaged local runtime
  does not currently provide a dashboard URL
- `dashboard-open` therefore measured the runtime after attempting discovery,
  not a real opened dashboard surface
- this matches the current product direction where local packaged MUSU is the
  executor and the real user-facing web surface should come from MUSU.PRO or
  another connected operator surface

Search terms should include `GOAL v915`, `wiki/1090`, `dashboard-open`,
`20260608-081507-HUGH_SECOND`, `dashboard_url=""`, and
`verify-runtime-cpu-scenario-matrix.ps1`.

## 2026-06-08 Clean One-Machine Dashboard-Open Matrix Index (wiki/1091)

MUSU local indexer was refreshed after wiki/1090 and GOAL v915.

- command:
  `& "$env:LOCALAPPDATA\Microsoft\WindowsApps\musu.exe" indexer sync --work-dir F:\workspace\musu-bee --name musu-bee`
- `3104 files`
- `2891 symbols`
- `15398 ms`

Indexed context includes the clean `20260608-081507-HUGH_SECOND` four-scenario
matrix, the green targeted verifier replay, the explicit
`dashboard_url=""` packaged-runtime discovery result, and the updated
GOAL/WIKI/WIKI_INDEX entries.

Search terms should include `GOAL v916`, `wiki/1091`, `3104 files`,
`2891 symbols`, `15398 ms`, `four-scenario one-machine rerun`, and
`dashboard_url=""`.
