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
- current machine-readable single-machine evidence exists at `docs\evidence\single-machine\1.15.0-rc.1\20260531-212651-HUGH_SECOND.evidence.json` on commit `a89f6dd`; release audit reports `single_machine_verified=true`

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
- `smoke-multidevice-beta.ps1` now writes `musu.multidevice_smoke_evidence.v1` with release version, operator machine, and started/completed timestamps.
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
- `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md` (wiki/519)
- `docs/SECOND_PC_MSIX_INSTALL_OPERATOR_RUNBOOK_2026_05_31.md` (focused second-PC MSIX install evidence checklist)
- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`

## 8. Microsoft Store Launch State (2026-05-29)

Partner Center enrollment approval cleared by operator report. This removes the account-verification blocker recorded on 2026-05-27, but it does **not** mean the app package or restricted startup capability has passed Microsoft certification.

Current Store path truth:

- product name reservation: next
- current-version Store-reviewed package: regenerated for `1.15.0-rc.1` as `musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix`; artifact-level desktop entrypoint now passes because the MSIX launches `musu-desktop.exe`, keeps `musu.exe` as the CLI alias, keeps `musu-startup.exe` as the startup task, and no longer describes itself as a runtime-only package. Installed-package evidence is still blocked until the fixed MSIX is reinstalled on the primary and second PC.
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
- mDNS LAN auto-discovery is opt-in through `MUSU_ENABLE_MDNS=1`; this mitigates a Windows/Tailscale adapter failure where logged-in bridge `/health` could time out after the initial `musu up` probe. Store-candidate smoke/release paths keep this disabled unless mDNS has its own current regression evidence.
- Universal clipboard polling is opt-in through `MUSU_ENABLE_CLIPBOARD_SYNC=1`; it is disabled by default for privacy and idle CPU control.
- Runtime idle CPU/resource budget is now a release blocker in `write-release-go-no-go.ps1`. Use `scripts\windows\measure-musu-idle-cpu.ps1 -SampleSeconds 60 -Scenario desktop-open -RequireOwnedWebView2 -MaxOneCorePercent 5 -MaxOwnedProcessCount 16 -MaxOwnedWebView2ProcessCount 8 -MaxTotalWorkingSetMb 1024 -IncludeNode -IncludeWebView2 -FailOnHot -Json` on primary and second PC with MUSU packaged desktop open and idle; public beta requires two machine samples, at least one MUSU runtime process, at least one MUSU-owned WebView2 process, <=5% of one logical CPU, owned process count <=16, owned WebView2 count <=8, and total owned working set <=1024MB. The sampler defaults to MUSU-owned descendants plus repo-related helpers, records `helper_process_scope`, uses native Windows parent-process lookup instead of WMI/CIM, and leaves `-IncludeUnrelatedHelpers` for whole-machine diagnostics.
- MSIX desktop entrypoint is now a release blocker in `write-release-go-no-go.ps1`. Artifact-level evidence `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-224328-HUGH_SECOND.store-msix-desktop-artifact.evidence.json` passes for the regenerated Store MSIX; old runtime-only evidence remains at `docs\evidence\msix-desktop-entrypoint\1.15.0-rc.1\20260531-214327-HUGH_SECOND.store-msix-runtime-only.evidence.json`. Use `scripts\windows\audit-msix-desktop-entrypoint.ps1 -StartupContract store-reviewed-immediate-registration -ExpectedApplicationExecutable musu-desktop.exe -RequireInstalledPackage -Json` after reinstall; installed-package evidence still fails on `HUGH_SECOND` because the current installed package launches `musu.exe` and lacks `musu-desktop.exe`.
- Process ownership is now a separate release gate in `write-release-go-no-go.ps1`. Use `scripts\windows\audit-musu-process-ownership.ps1 -FailOnProblem -Json` while MUSU is open; it writes `musu.process_ownership_audit.v1`, requires one live MUSU runtime, verifies bridge registry PID plus `/health`, counts Node.js/WebView2 only when they are MUSU descendants, and rejects repo-related orphan helpers. Current HUGH_SECOND audit passed at `.local-build\process-ownership\musu-process-ownership-20260531-201339.json`: `musu_runtime=1`, `owned_node=0`, `owned_webview2=0`, `machine_wide_node=1`, `machine_wide_webview2=13`, `orphan_repo_helpers=0`.
- Startup single-instance is now a separate release gate in `write-release-go-no-go.ps1`. Use `scripts\windows\audit-musu-startup-single-instance.ps1 -RepeatCount 3 -FailOnProblem -Json`; it writes `musu.startup_single_instance_audit.v1`, calls `musu up --json` repeatedly, requires one stable bridge PID, rejects repeated bridge spawning, and embeds process ownership evidence. Current HUGH_SECOND audit passed at `docs\evidence\startup-single-instance\1.15.0-rc.1\20260531-203635-HUGH_SECOND.evidence.json`: three calls reused bridge PID 31208, `after_musu_runtime=1`, `repeated_spawn_count=0`.
- Frontend idle polling hardening now includes shared `useLowDutyPolling` coverage for device discovery, service health, processes, nodes, doctor status, fleet/company/machine pages, tasks/approvals/goals/projects/issues/costs panels, inbox polling, and canvas data/flow polling. The helper prevents overlapping requests, aborts in-flight fetches on unmount, pauses low-priority polling while hidden, and applies capped failure backoff. Fleet/company/machine pages use 30s safety-net polling plus SSE wakeups instead of 5s fixed intervals.
- Writer task admission no longer uses a 50ms polling wait while queued tasks are capped by global/per-channel limits. `musu-rs/src/writer/runner.rs` now waits on `tokio::sync::Notify` with a 1s safety recheck, reducing scheduler wakeups under backlog; a queued-task CPU sample is still required before this can close the operator's idle busy-loop report.
- `musu.pro` must evolve from registry-only discovery into registry + rendezvous + relay/tunnel control. Direct LAN/manual peers remain valid, but the Store/public multi-device setup story needs assisted path selection and route evidence (`lan`, `tailscale`, `direct_quic`, `relay`, or `failed`); wiki/524 locks the API/evidence contract.
- Multi-device release evidence now requires `musu.route_evidence.v1`; legacy manual HTTP bearer routing can be captured for debugging, but it does not pass the public release gate without route kind, handshake timing, peer identity verification, hardened encryption, payload transit truth, and success result.
- 2026-05-29 live `musu.pro` public metadata check now passes for `/privacy` and `/support`
- MSIX install evidence scripts exist: `scripts\windows\capture-msix-install-evidence.ps1`, `scripts\windows\verify-msix-install-evidence.ps1`, and `scripts\windows\record-msix-install-evidence.ps1`
- `write-release-go-no-go.ps1` now auto-detects valid MSIX install evidence under `docs\evidence\msix-install\<version>\*.evidence.json` or `.local-build\msix-install\*.evidence.json`
- MSIX install evidence must match the current release version, include operator machine/user, pass non-future `recorded_at`, match installed/artifact versions, and include passing capture checks from `capture-msix-install-evidence.ps1`
- support mailbox evidence scripts exist: `scripts\windows\verify-support-mailbox-evidence.ps1` and `scripts\windows\record-support-mailbox-verification.ps1`
- release support mailbox source of truth: root `SUPPORT_EMAIL` contains `musu@musu.pro`; release scripts read it through `scripts\windows\release-config.ps1`, and public Next pages use `musu-bee/src/lib/contact.ts`
- `write-release-go-no-go.ps1` now auto-detects valid support mailbox evidence under `docs\evidence\support-mailbox\<version>\*.evidence.json` or `.local-build\support-mailbox\*.evidence.json`
- `write-release-go-no-go.ps1` includes `musu@musu.pro inbox delivery verification` in `manual_external_gates`, not only as a blocker
- `write-release-go-no-go.ps1` no longer accepts `-AssumeSupportMailboxVerified`; support mailbox readiness must be evidence-backed
- support mailbox evidence must match the current release version, use an explicit `musu-...` verification token, come from a sender distinct from `musu@musu.pro`, and pass timestamp order/future checks
- `write-release-go-no-go.ps1 -SkipPublicMetadata` is diagnostic-only for offline checks; skipping live privacy/support metadata verification adds a blocker and cannot produce public release readiness
- Store release evidence scripts exist: `scripts\windows\verify-store-release-evidence.ps1` and `scripts\windows\record-store-release-verification.ps1`; Store release evidence records explicit Partner Center product name reservation state and timestamp, the final completion runner requires `-StoreProductNameReservedAt`, and the direct recorder now refuses to infer that timestamp from submission time
- Store submission bundle verification exists: `scripts\windows\verify-store-submission-bundle.ps1`; `prepare-store-submission-bundle.ps1` now writes `SHA256SUMS.txt`, `audit-desktop-release-readiness.ps1` verifies the latest bundle, and `prepare-operator-action-pack.ps1` refuses to build from an invalid Store submission bundle. The regenerated bundle `.local-build\msix\submission-bundles\store-reviewed-20260531-224352` verifies with `ok=true`, `fail_count=0` at the artifact level.
- `write-release-go-no-go.ps1` now treats Store approval as an evidence-backed blocker and auto-detects valid evidence under `docs\evidence\store-release\<version>\*.evidence.json` or `.local-build\store-release\*.evidence.json`
- `complete-final-operator-gates.ps1` can record MSIX install, multi-device, support mailbox, and Store release evidence in one final command; smoke evidence for this path is intentionally written only to `.local-build\msix-install-complete-smoke` and `.local-build\store-release-complete-smoke`
- The final operator packet's completion command includes `-FailOnNotReady`; packet verification fails if the final command can finish with exit 0 while blockers remain
- `write-release-go-no-go.ps1` treats a dirty git worktree as a public release blocker, not a warning; final readiness requires committed changes plus a regenerated manifest with `manifest_git.dirty=false`
- `verify-final-operator-gate-packet.ps1` now fails stale packets if their bundled go/no-go script still treats dirty git state as a warning, or if the bundled packet verifier lacks the same dirty-git blocker check
- `prepare-final-operator-gate-packet.ps1` refuses dirty git state and writes `packet-build-metadata.json`; packet verification requires a valid source commit and clean git metadata
- `verify-final-operator-gate-packet.ps1` also fails stale packets whose bundled multi-device verifier lacks schema, version, and completion-time checks, whose bundled support evidence path lacks version/token/sender checks, or whose Store recorder/verifier can infer reservation time or omit timestamp safety checks
- `verify-final-operator-gate-packet.ps1` also inspects each bundled second-PC kit for the local-sideload MSIX, public signing cert, install/verify script, MSIX install evidence capture/verify/record scripts, second-PC handoff collector, multi-device smoke script, multi-device evidence verify/record scripts, second-PC return importer, return-archive instructions, and README instructions for both install evidence and multi-device evidence capture.
- multi-device evidence now defaults verification to the repo `VERSION`, requires operator user metadata, and requires `remote_addr` to include a port; stale packets without this endpoint-shape gate fail verification
- `write-release-candidate-manifest.ps1` writes manifest/checksum files atomically with retry, avoiding locked-file failures when final handoff status and go/no-go are run concurrently.
- Indexer refreshed after support mailbox correction, current single-machine evidence, operator handoff card, final qualitative audit, post-audit single-machine refresh, second-PC kit verifier hardening, doctor-timeout smoke refresh, second-PC return card, smoke harness process-capture hardening, operator action pack scripts, post-action-pack single-machine evidence refresh, handoff status action-pack verification, the second-PC release-check wrapper, beta checklist current-evidence pointer correction, `musu-system` 2026-05-30 recheck, Store submission bundle verifier, post-verifier single-machine refresh, second-PC return archive flow, second-PC return archive single-machine refresh, second-PC return importer, post-importer single-machine evidence refresh, post-preview-fallback single-machine evidence refresh, current status audit, mDNS health hardening, post-mDNS single-machine evidence refresh, second-PC MSIX install operator runbook, runtime hardening roadmap, relay-control roadmap, frontend polling hardening, `musu.pro` P2P control-plane spec, runtime stabilization execution plan, post-route-evidence single-machine refresh, owned-process CPU measurement hardening, post-idle-CPU single-machine refresh, process ownership audit gate, post-process-ownership single-machine evidence refresh, startup single-instance gate, post-startup-gate single-machine evidence refresh, runtime resource-budget evidence, post-resource-budget single-machine evidence, MSIX desktop-entrypoint audit, low-duty frontend polling, writer admission wakeups, generated Tauri lint exclusion, and MSIX desktop artifact fix: `musu indexer sync --work-dir F:\workspace\musu-bee --name musu-bee` indexed 1026 files and 1906 symbols on 2026-05-31 after the MSIX desktop artifact fix; searches should include `store-msix-desktop-artifact`, `store-reviewed-20260531-224352`, `source-fresh release build OOM`, `RequireInstalledPackage`, `musu-desktop.exe`, `msix_desktop_entrypoint_verified`, `runtime idle CPU`, `desktop-open`, `RequireOwnedWebView2`, `musu.pro relay control`, `p2p rendezvous`, `route evidence`, `busy loop`, and the earlier `wiki 522`/`wiki 523`/`wiki 524`/`wiki 525`/`wiki 526` release-gate terms.
- support mailbox DNS exists: `Resolve-DnsName -Type MX musu.pro` returns `smtp.google.com`; actual delivery remains unverified until evidence is recorded
- GitHub Actions deployment/test infrastructure was repaired for the current Rust/Next repo shape: Node 22+, JavaScript actions forced onto Node 24 runtime, no deleted Python dirs, no deleted `musu-port`, Linux Rust CI includes Wayland/PipeWire/GBM native dependencies, legacy likely-required check names preserved, and Store metadata Playwright smoke for `/privacy` + `/support`
- Final handoff contract: after the last documentation/code commit, regenerate the final operator packet from clean current HEAD and verify it. Regenerate/verify the operator action pack only after installed desktop-entrypoint and runtime CPU evidence pass, even though the regenerated Store submission bundle now passes artifact verification. Final operator packet generation/verification includes wiki/522 current status, wiki/523 runtime hardening, wiki/524 P2P control-plane spec, wiki/525 runtime stabilization execution plan, and wiki/526 MSIX desktop entrypoint audit. Public desktop release remains blocked until installed `msix_desktop_entrypoint_verified`, runtime idle CPU evidence, real second-PC multi-device route evidence, `musu@musu.pro` inbox delivery evidence, and Partner Center/Microsoft Store release evidence are recorded.
- `musu doctor` bridge health timeout was raised from 3s to 10s after the release smoke found a false negative: direct `/health` and dashboard doctor were ok, while CLI doctor timed out on Windows loopback.
- Current single-machine evidence: `docs\evidence\single-machine\1.15.0-rc.1\20260531-212651-HUGH_SECOND.evidence.json` on commit `a89f6dd`, dashboard output `MUSU_RELEASE_SMOKE_OK`, CLI route `MUSU_CLI_ROUTE_OK`, dashboard task `0cdd096c-626d-46ee-95e4-c347805016d8`, bridge `http://127.0.0.1:9818`, `doctor_overall=warn` only because the smoke binary is not the installed WindowsApps/MSIX alias.
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
- `docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md`
- `docs/STORE_SUBMISSION_METADATA_2026_05_29.md`
- `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md` (wiki/520)
- `docs/RELEASE_FINAL_OPERATOR_GATES_2026_05_29.md`

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
