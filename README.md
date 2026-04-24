# musu-functions Root Index

## 목적

이 폴더는 새 `MUSU` 코드베이스이자, 현재 `musu_corp`가 실제로 만들고 있는 제품 프로젝트다.

이전 원본 모노리스인 [`/mnt/f/Aisaak/Projects/Musu-new`](/mnt/f/Aisaak/Projects/Musu-new)가 고치기 어렵고 책임 경계가 흐려져서, 기능군을 bounded context 단위로 분해해 여기서 다시 만들고 있다.

즉:

- [`/home/hugh51/musu-functions`](/home/hugh51/musu-functions) = 새 `MUSU` 본체
- [`/home/hugh51/musu_corp`](/home/hugh51/musu_corp) = 이 제품을 실제로 운영/도그푸딩하는 회사 인스턴스
- [`/mnt/f/Aisaak/Projects/Musu-new`](/mnt/f/Aisaak/Projects/Musu-new) = reference monolith

핵심 관계:

- `musu_corp`는 원래 MUSU가 가져야 할 `company / agents / governance / runtime` 개념을 먼저 강하게 도그푸딩하는 회사다.
- `musu-functions`는 그 회사가 실제로 만드는 제품 프로젝트다.
- 따라서 `musu_corp`에 지금 많이 들어가 있는 회사 기능은, 장기적으로 다시 `musu-functions`의 bounded context로 환원돼야 한다.

현재 MUSU 아키텍처 (2026-04-25):

| 모듈 | 역할 | 포트 |
|------|------|------|
| `musu-bridge` | FastAPI 서버, 에이전트 조율, 태스크 라우팅 | 8070 |
| `musu-core` | 에이전트/태스크/DB 추상화 (Python lib) | — |
| `musu-relay` | WebSocket relay, 기기 간 통신 (Railway) | 9900 |
| `musu-bee` | Next.js 웹 UI (로컬 앱, 채팅/태스크/비용) | 3001 |
| `musu-control` | MCP 서버 (Claude Code 통합) | — |
| `musu-port` | 로컬 ingress/control-plane | 1355 |
| `musu-worker` | 원격 명령 실행 | 9700 |

폐기/아카이브:
- `musu-connects` → `_archived/` (P2P QUIC mesh, relay로 대체)
- `musu-computer-tools` → `_archived/` (Windows bridge)
- Tauri 데스크톱 앱 → 폐기 (웹 기반으로 전환)

배포 구조:
- `musu.pro` (Vercel) = 랜딩, 로그인, 결제, 계정 관리
- `musu-bee` (localhost) = 실제 앱 (relay 통해 원격 접근 가능)
- `musu-relay` (Railway) = 기기 간 WebSocket tunnel

도그푸딩 기준 상위 문서:

- [DOGFOODING_PRODUCT_MODEL.md](/home/hugh51/musu-functions/DOGFOODING_PRODUCT_MODEL.md)
- [COMPANY_STRATEGY.md](/home/hugh51/musu-functions/COMPANY_STRATEGY.md)
- [docs/PRODUCT_CHARTER/README.md](/home/hugh51/musu-functions/docs/PRODUCT_CHARTER/README.md)
- [PRODUCT_STRATEGY.md](/home/hugh51/musu-functions/PRODUCT_STRATEGY.md)
- [MARKET_AND_REVENUE_MODEL.md](/home/hugh51/musu-functions/MARKET_AND_REVENUE_MODEL.md)
- [EXECUTION_STRATEGY.md](/home/hugh51/musu-functions/EXECUTION_STRATEGY.md)
- [WHAT_WE_CAN_DO_HERE_NOW.md](/home/hugh51/musu-functions/WHAT_WE_CAN_DO_HERE_NOW.md)
- [PRODUCT_CONTROL_SURFACE_MAP.md](/home/hugh51/musu-functions/PRODUCT_CONTROL_SURFACE_MAP.md)
- [WORKFORCE_PLANE_PRODUCTIZATION_MAP.md](/home/hugh51/musu-functions/WORKFORCE_PLANE_PRODUCTIZATION_MAP.md)
- [ROOT_PRODUCT_CONTROL_LAYER_MODEL.md](/home/hugh51/musu-functions/ROOT_PRODUCT_CONTROL_LAYER_MODEL.md)
- [ROOT_RUNTIME_CAPABILITY_MODEL.md](/home/hugh51/musu-functions/ROOT_RUNTIME_CAPABILITY_MODEL.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/CURRENT_STATE.md)
- [TODO_EXECUTION_BOARD.md](/home/hugh51/musu-functions/TODO_EXECUTION_BOARD.md)

## DDD 폴더명 기준

루트 폴더명은 제품 마케팅 이름이 아니라 `bounded context` 또는 `capability context` 기준으로 읽는다.

- `musu-port`
  - DDD 의미: ingress / control-plane context
  - 책임: 로컬 서비스 노출, route, alias, promote, ignore, metadata
- `musu-connects`
  - DDD 의미: network / transport context
  - 책임: peer discovery, secure transport, route advertisement/import
- `musu-computer-tools`
  - DDD 의미: computer interaction support context
  - 책임: 컴퓨터 제어 도구와 MCP 보조 실행기
- `MUSU-CRT`
  - DDD 의미: realtime collaboration terminal context
  - 책임: WebRTC signaling, stream viewer, remote terminal/data channel
- `MUSU-AS-MCP`
  - DDD 의미: self-observation / self-control MCP context
  - 책임: MUSU Desktop self-MCP, Layer A/B, native-app inspection/action
- `MUSU-WORKS`
  - DDD 의미: company operations context
  - 책임: 회사, 프로젝트, 에이전트, 세션, 메모리, approval, preset
- `musu-indexer`
  - DDD 의미: knowledge indexing / retrieval context
  - 책임: codebase indexing, search, memory retrieval, FTS5 search
- `viewer`
  - DDD 의미: proof UI context
  - 책임: mock/projection proof UI

짧게 보면 새 `MUSU`는 이렇게 나뉜다:

- `port` = ingress
- `connects` = network
- `crt` = realtime stream + remote terminal
- `as-mcp` = self-mcp
- `works` = company ops
- `indexer` = knowledge retrieval
- `viewer` = read-only projection

상위 제품 제약:

- [BILINGUAL_RUNTIME_ARCHITECTURE.md](/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md)

루트 기준 문서:

- [MASTER_PLAN.md](/home/hugh51/musu-functions/MASTER_PLAN.md)
- [plans/README.md](/home/hugh51/musu-functions/plans/README.md)

모듈별 마스터 플랜:

- [musu-port/MASTER_PLAN.md](/home/hugh51/musu-functions/musu-port/MASTER_PLAN.md)
- [musu-connects/MASTER_PLAN.md](/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md)
- [MUSU-CRT/MASTER_PLAN.md](/home/hugh51/musu-functions/MUSU-CRT/MASTER_PLAN.md)
- [MUSU-AS-MCP/MASTER_PLAN.md](/home/hugh51/musu-functions/MUSU-AS-MCP/MASTER_PLAN.md)
- [MUSU-WORKS/MASTER_PLAN.md](/home/hugh51/musu-functions/MUSU-WORKS/MASTER_PLAN.md)

## 현재 상태

2026-04-02 기준:

- `musu-port`
  - standalone parity를 상당 부분 재현했다.
  - local ingress/control-plane 기준선이 있다.
- `musu-connects`
  - buildable Rust workspace가 올라왔다.
  - QUIC pair/control baseline과 discovery/route sync baseline이 들어갔다.
  - Windows `cargo check` / `cargo test`가 통과했다.
- `MUSU-CRT`
  - canonical harness와 remote session baseline까지 올라왔다.
- `MUSU-AS-MCP`
  - self-MCP canonical surface를 별도 workspace에서 정리했다.
- `MUSU-WORKS`
  - 회사/프로젝트/에이전트/메모리/preset 모델을 정리했다.
- `musu-indexer`
  - memory/search plane reference로 유지 중이다.
- `musu_corp`
  - 회사 runtime, queue, watchdog, supervisor, Codex/BitNet workforce split까지 도그푸딩이 상당히 진행됐다.
  - 이제 이 회사 기능을 `musu-functions`의 정식 제품 capability로 다시 나눠 넣는 단계가 필요하다.

즉 이 폴더는 더 이상 “계획만 하는 곳”이 아니라, 새 `MUSU`를 구성하는 실제 모듈 코드베이스다.

그리고 현재 상위 전략은:

1. `musu_corp`로 먼저 회사 운영을 도그푸딩한다
2. 그 운영에서 검증된 기능을 `musu-functions` 안의 정식 capability로 분해한다
3. 회사 인스턴스에 과도하게 들어간 기능은 다시 제품 쪽으로 환원한다

## 운영 원칙

- 루트 마스터 플랜은 프로젝트 간 우선순위와 의존성을 관리한다.
- 실제 구현은 각 프로젝트 폴더의 마스터 플랜과 세부 플랜 문서에서 진행한다.
- 새 작업은 먼저 문서에 반영하고, 그 다음 코드로 진행한다.
- 원본 [`Musu-new`](/mnt/f/Aisaak/Projects/Musu-new)는 참고용으로만 보고, 새 구현은 가능한 한 이 루트 아래에서 진행한다.
