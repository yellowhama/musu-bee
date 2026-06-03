# MUSU (Multi-Machine AI Control Plane) Wiki

## 1. 아키텍처 개요 (Architecture Overview)

MUSU는 단일 기기를 넘어 다수의 머신(Fleet)을 **단일 컴퓨터처럼 제어**하기 위해 설계된 멀티머신 바인딩 및 오케스트레이션 플랫폼입니다. 사용자는 복잡한 네트워크나 터미널 세팅 없이, 중앙의 AI 에이전트(무수집사)를 통해 모든 기기를 관리합니다.

- **Frontend (`musu-bee`)**: Next.js 기반의 메인 대시보드. Antigravity IDE 방식의 3단 레이아웃을 통해 최적의 AI 작업 경험을 제공합니다.
- **Backend (`musu-rs`)**: Rust 기반의 MCP (Model Context Protocol) 시스템. 각 원격 기기와 P2P 연결 및 명령 프록시 역할을 수행합니다.

## 2. 3-Column Antigravity Layout
가장 현대적이고 직관적인 AI 코딩/조작 환경을 위해 도입된 핵심 UI 아키텍처입니다.

1. **Left Panel (네비게이션 뷰)**: 현재 시스템의 문맥(Context)을 제공. 연결된 기기 상태, 속해있는 프로젝트, 대화 기록 등을 관리.
2. **Center Panel (메인 작업 공간)**: `Dev`, `Town`, `Butler` 3가지 모드로 변환되며, 작업의 결과물을 시각적으로 렌더링하는 거대한 뷰포트.
3. **Right Panel (AI Console)**: 메인 오케스트레이터인 AI와 실시간으로 통신하는 채팅 컨트롤 패널.

## 3. 핵심 철학 (Design Philosophy)
- **Generative UI**: AI가 텍스트로만 대답하는 것을 넘어, 상황에 맞는 컴포넌트(차트, 로그, 애니메이션)를 화면에 스스로 렌더링합니다.
- **Neo-Brutalism (Color Block Stack)**: VibeCode Aesthetics에서 한 단계 진화하여, 순백색 배경과 완전한 흑색(`#000000`), 강렬한 오렌지(`#FF9800`) 악센트를 활용합니다. 3px의 굵은 실선과 4px 그림자, 곡률 0px의 날카로운 모서리를 통해 극단적인 대비와 구조적 명확성을 제공합니다. 
- **개발자와 초보자의 통합**: 하드코어 `Dev` 모드부터 아무 지식 없이도 쓸 수 있는 `Butler` 모드까지 모두 지원합니다.

## 4. 인덱스 (Index)
- [Design Spec](./DESIGN.md): 세부 UI/UX 스펙 및 테마 가이드
- [Deploy Guide](./DEPLOY.md): 배포 가이드라인
- [P2P Control Plane](./P2P_CONTROL_PLANE.md): `musu.pro`가 실행 서버가 아니라 작업 주문, rendezvous, route evidence, relay fallback을 담당하는 연결 plane이라는 제품/프로토콜 경계
- [Next Steps](./NEXT_STEPS_PHASE3.md): 다음 단계 작업 목표
- [Code Audit](./CODE_AUDIT_2026-05-26.md): 가장 최근의 코드 오딧 보고서
