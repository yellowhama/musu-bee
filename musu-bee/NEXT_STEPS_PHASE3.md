# musu-bee Phase 3 — Next Steps

> 작성: 2026-05-26 | Neo-Brutalism UI 마이그레이션 및 Code Audit 완료 후
> 선행 조건: Phase 2의 기본 레이아웃 구성 완료

---

## 0. 2026-06-05 제품 로드맵 업데이트

현재 우선순위는 UI 대시보드 자체가 아니라 **설치된 로컬 MUSU 프로그램 + musu.pro control-plane + P2P mesh**를 분리해 완성하는 것이다.

- 로컬 MUSU 프로그램은 실제 실행 주체다. 파일 접근, 브라우저/앱 자동화, 셸 실행, AI 작업, peer mesh 통신은 각 기기에서 돌아가는 로컬 프로그램이 처리한다.
- `musu.pro`는 사용자 입력, 프로젝트/회의실, 디바이스 presence, rendezvous, route evidence, relay fallback lease를 담당한다. 기본 실행 서버나 기본 payload 경로가 아니다.
- `localhost`/`127.0.0.1` 대시보드는 같은 기기에서만 열리는 선택적 개발자/운영자 화면이다. 제품 UX는 사용자가 어디서든 `musu.pro`에 작업 주문을 넣고, 선택된 로컬 기기가 그 주문을 받는 형태로 간다.
- 여러 기기의 MUSU 프로그램은 `musu.pro`를 통해 처음 서로를 발견하고 후보 경로를 교환한 뒤, 가능하면 LAN/Tailscale/direct QUIC 순서로 P2P 연결한다. relay는 직접 경로 실패가 증명된 뒤에만 fallback으로 쓴다.
- 같은 프로젝트의 로컬 AI들은 `musu.pro`의 project room에서 presence, 토론, 결정, handoff, audit history를 공유할 수 있다. 그래도 실행과 큰 payload 이동은 로컬 프로그램/P2P mesh가 맡는다.

### Current Execution Order

1. 1기기 로컬 런타임 증명: 웹 대시보드 없이도 desktop/bridge가 정상이고 idle CPU 예산 안에 머무르는지 검증한다.
2. Web-to-local 작업 주문: `musu.pro` 입력을 선택된 로컬 프로그램이 outbound control connection으로 받는 계약을 만든다.
3. Rendezvous 후보 계약 강화: LAN/Tailscale/direct QUIC/relay 후보가 path selection에 필요한 public/NAT/relay metadata를 제공하도록 API와 테스트를 고정한다.
4. 2기기 증명: 같은 MUSU build를 두 번째 Windows PC에 설치한 뒤, web order -> rendezvous -> P2P route -> route evidence -> idle budget까지 통과시킨다.
5. Release-grade relay: Connect/Pro fallback은 QUIC/TLS 1.3 transport와 payload delivery proof가 준비되기 전까지 release blocker로 유지한다.

자세한 제품/프로토콜 경계는 `docs/P2P_CONTROL_PLANE.md`를 기준 문서로 본다.

---

## 1. 작업 중에 알게 된 것 (Lessons Learned)
- **Pencil Dev 연동의 중요성**: 코드로 UI를 맹목적으로 구성하는 것보다, `pencil_batch_design`과 같은 전문 GUI 디자인 툴을 통해 시각적 컨트랙트(`musu.pen`)를 먼저 확정하고 픽셀 퍼펙트한 렌더링을 확인한 후 코드로 포팅하는 것이 디테일(그림자 방향, 곡률, 여백 등)을 살리는데 압도적으로 효율적입니다.
- **Next.js 15 & ESLint 9 충돌**: 최신 생태계(Next 15)에서 제공되는 레거시 `next lint` 명령어는 ESLint 9의 Flat Config 환경 하의 React 플러그인과 순환 참조(Circular Reference) 구조 에러를 발생시킵니다. 인프라 측면의 마이그레이션이 필수적이라는 것을 확인했습니다.

## 2. 변경된 제품 스펙 (Product Spec Updates)
- **디자인 시스템 전면 개편**:
  - 기존의 `Deep Espresso` (다크 테마) 중심의 VibeCode Aesthetics에서 **Neo-Brutalism (Color Block Stack)** 스타일로 스펙을 전면 변경했습니다. (`DESIGN.md` 업데이트 완료)
  - **테마 키워드**: 순백색 캔버스, 순흑색 3px 보더, 4px Solid Shadow, 오렌지(`#FF9800`) 악센트 컬러, 모서리 반경(Border-radius) 0px.
- **컴포넌트 규격 변경**:
  - 헤더 영역(TopStrip, ChatArea Header 등)의 높이를 `64px`에서 `88px`로 상향 통일하여 시각적 개방감을 주었습니다.
  - Sidebar Nav Item의 활성 상태 UI를 "가로로 확장되는 오렌지색 블록" 형태로 변경했습니다.

## 3. 다음 단계 작업 목표 (Next Steps)

### TASK-C1: ESLint CLI 마이그레이션 (Infra)
**왜**: 현재 `npm run lint`가 순환 참조 버그로 인해 CI 파이프라인과 로컬 품질 검증을 방해하고 있습니다.
**실행**:
- `@next/codemod@canary next-lint-to-eslint-cli`를 적용.
- `eslint.config.js` 기반의 순수 Flat Config 구조로 강제 마이그레이션 하거나 `package.json`의 린트 스크립트를 재정의.

### TASK-C2: CSS Variable 리팩토링 (Tech Debt)
**왜**: 현재 `AppShell.tsx`, `ConsoleTopStrip.tsx` 등에 하드코딩된 inline-style(예: `borderBottom: "3px solid var(--border-default)"`)이 많습니다.
**실행**:
- 이들을 `globals.css`의 `.neo-card` 혹은 `.neo-header` 같은 유틸리티 클래스로 승격(Promote)시켜 재사용성을 높입니다.

### TASK-C3: Dashboard 및 NodesPanel 디자인 동기화 (UI)
**왜**: 메인 셸(Shell) 영역의 레이아웃은 Neo-Brutalism으로 성공적으로 전환되었으나, 그 내부에 렌더링되는 `NodesPanel` 내부의 개별 노드 카드나 버튼들이 아직 구형 디자인 스펙(얇은 테두리, 둥근 모서리)을 가지고 있을 가능성이 큽니다.
**실행**:
- Dashboard, NodesPanel 내부의 모든 하위 컴포넌트들에 `0px` border-radius와 `3px` solid border 룰을 일괄 적용합니다.

### TASK-C4: 모바일 레이아웃 최적화 (UX)
**왜**: 브루탈리즘의 두꺼운 보더와 그림자가 모바일 기기의 좁은 화면에서는 콘텐츠 가독성을 심각하게 해칠 수 있습니다.
**실행**:
- `max-width: 639px` 미디어 쿼리에서 굵은 선(3px -> 2px)과 그림자(4px -> 2px) 사이즈를 축소하는 CSS Fallback을 설계합니다.
