# musu-bee Phase 3 — Next Steps

> 작성: 2026-05-26 | Neo-Brutalism UI 마이그레이션 및 Code Audit 완료 후
> 선행 조건: Phase 2의 기본 레이아웃 구성 완료

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
