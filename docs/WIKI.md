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
remain true because target-side relay polling/execution and release-grade
QUIC/TLS tunnel proof are still missing.

Canonical report:

- `docs\RELEASE_1_15_0_RC1_RELAY_PAYLOAD_QUEUE_API_2026_06_04.md`
