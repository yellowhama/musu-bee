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

검증된 smoke:

- dashboard `http://127.0.0.1:3001`
- bridge `http://127.0.0.1:11041`
- task `72ff5cff-f122-496b-ad6a-6d7e55711bf4`
- output `MUSU_SMOKE_OK`
- repeatable script `scripts\windows\smoke-single-machine-beta.ps1` passed on dashboard `3000`
- script task `2d9e93b1-fb2f-4cd4-ab40-1147fea89a6d`
- script output `MUSU_SCRIPT_SMOKE_OK`; CLI route output `MUSU_SCRIPT_CLI_OK`

Multi-device state:

- `scripts\windows\smoke-multidevice-beta.ps1` exists for the second-PC test.
- `scripts\windows\prepare-multidevice-test-kit.ps1` builds a second-PC install/test zip with MSIX, public `.cer`, scripts, checksums, evidence verifier, and optional desktop shell bundles.
- `scripts\windows\verify-multidevice-evidence.ps1` validates the returned smoke evidence before release status changes.
- Latest generated kit: `.local-build\multi-device-test-kit\musu-multidevice-1.15.0-rc.1-20260529-044952.zip`.
- `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md` (wiki/519) is the current runbook.
- Full multi-machine readiness is still pending real second-machine execution.

Canonical references:

- `docs/RELEASE_1_15_0_RC1_QUAL_AUDIT_ROADMAP_2026_05_29.md` (wiki/518)
- `docs/MULTI_DEVICE_RELEASE_TEST_PLAN_1_15_0_RC1_2026_05_29.md` (wiki/519)
- `docs/BETA_RELEASE_CHECKLIST_1_15_0_RC1.md`

## 8. Microsoft Store Launch State (2026-05-29)

Partner Center enrollment approval cleared by operator report. This removes the account-verification blocker recorded on 2026-05-27, but it does **not** mean the app package or restricted startup capability has passed Microsoft certification.

Current Store path truth:

- product name reservation: next
- current-version Store-reviewed package: regenerated for `1.15.0-rc.1` as `musu_1.15.0.0_x64_store-reviewed-immediate-registration.msix`
- local-sideload release package: `musu_1.15.0.0_x64_local-sideload-manual.msix`, workflow passed packaged startup smoke
- current submission bundle: `.local-build\msix\submission-bundles\store-reviewed-20260529-033609`
- release candidate manifest: `.local-build\release-candidates\1.15.0-rc.1\release-candidate-manifest.json`
- release checksum file: `.local-build\release-candidates\1.15.0-rc.1\SHA256SUMS.txt`
- old 2026-05-27 package: template only (`1.13.0.0`, do not submit as current)
- Tauri shell: dedicated static runtime launcher/status shell now builds to `musu-bee/out`, bundles as MSI/NSIS through `npm run tauri:build`, and is audited as `desktop_shell_ready=True`; it is still not the full dashboard GUI
- Microsoft app certification: pending
- restricted startup capability review: pending

Promotion rule:

- Promote MUSU itself as the trusted Windows local AI operations node.
- Do not reuse unrelated product names from external launch notes.
- Measure page views → install attempts → installs → first launch → doctor ok → first task done.

Canonical reference:

- `docs/STORE_LAUNCH_AND_PROMOTION_PLAN_2026_05_29.md`
- `docs/DESKTOP_RELEASE_READINESS_AUDIT_2026_05_29.md` (wiki/520)

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
- `go test ./core/... ./crawl-ai/... ./marketer/... ./nurikun/...` passed for `core`, `crawl-ai`, `marketer`, and `nurikun`

Canonical reference:

- `docs/MUSU_SYSTEM_INTEGRATION_ASSESSMENT_2026_05_29.md`
