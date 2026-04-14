# MUSU Phase 4 로드맵 — 2026-04-14

> 작성: 2026-04-14 | 기준: Phase 1~3 완료 후 정성 평가 + 코드 오딧 기반

---

## 현재 상태 (Phase 3 완료 기준)

### 정성적 평가

| 항목 | 점수 | 상세 |
|------|------|------|
| **코어 연결성** | 8/10 | UI → musu-bridge 에이전트 라우팅 완성. WS 실시간 push 작동. LOCAL/REMOTE 토글 구현. |
| **멀티머신** | 6/10 | Tailscale 연결, peers OK. 원격 musu-port 127.0.0.1 바인딩 이슈 미해결. E2E 라우팅 미검증. |
| **UI 완성도** | 7/10 | DelegationChip, Pulse, PlanCard, cmd+K 완성. Company layer UI 없음. |
| **데이터 레이어** | 7/10 | company layer 4테이블 구현. musu-bridge 4 endpoints. 원격 동기화 미완. |
| **보안** | 7/10 | SSRF, error leak, XSS 픽스. CORS localhost 하드코딩, SQLite thread 잔존. |
| **테스트** | 7/10 | musu-core 231 pass. L4 parity 6/6. tsc 0 errors. build 0 errors. E2E 미작성. |
| **배포 준비도** | 5/10 | 로컬 데모 가능. musu.pro 올리기엔 결제/auth/인프라 미완. |

**종합: 67/100 — Beta-진입 직전**

---

## Phase 4 목표: "배포 가능한 MVP"

**정의**: musu.pro에서 실제 유저가 사용할 수 있는 상태.

### 성공 조건
1. 원격 머신 E2E 에이전트 라우팅 동작 (REMOTE 선택 → 응답 확인)
2. company 생성 → 에이전트 시딩 → 채팅 전체 플로우 작동
3. Paddle 결제 → Pro 구독 → 에이전트 사용 한도 변경
4. musu.pro 배포 후 5분 이내 TTFB 2초 미만

---

## Phase 4 태스크 목록

### P0 — 즉시 필요 (이번 세션)

#### 4-A: 원격 musu-port 0.0.0.0 바인딩 픽스
- **문제**: 원격(100.121.211.106) musu-port가 `127.0.0.1:1355` 바인딩 → 외부 접근 불가
- **해결**: `MUSU_PORT_MANAGER_HOST=0.0.0.0` 환경변수로 재시작
- **검증**: `ss -tlnp | grep 1355` → `0.0.0.0:1355`
- **담당**: 원격 머신 세션

#### 4-B: 원격 git pull + musu-bridge 재시작
- **문제**: 원격에 `cafa90c7` 커밋 없음 → `/api/companies` 404
- **해결**: `git pull origin main` → musu-bridge restart
- **검증**: `curl 100.121.211.106:8070/api/companies` → `[]`
- **담당**: 원격 머신 세션

#### 4-C: E2E 라우팅 검증
- musu-bee UI → REMOTE 선택 → CEO 채널 메시지 전송
- 원격(100.121.211.106:8070) CEO 응답 확인
- **검증**: 응답 텍스트 + delegation chain 표시
- **담당**: 로컬 세션 (UI 조작)

### P1 — 이번 주 내

#### 4-D: Company UI (musu-bee)
- company 목록 화면 (`/app/companies`)
- company 생성 폼 → `/api/companies` POST
- company 선택 → 해당 workspace 에이전트 채널 로드
- **예상**: 4h

#### 4-E: CORS 환경변수화 (musu-bridge)
- `server.py`: `allow_origins`를 `MUSU_BRIDGE_ALLOWED_ORIGINS` 환경변수로 변경
- 기본값: `http://localhost:3000,http://localhost:3001`
- **예상**: 30분

#### 4-F: musu-control MCP 검증
- Claude Code 재시작 후 `/mcp` → `musu-control` 24개 도구 확인
- `mcp__musu-control__list_agents` 직접 호출 테스트
- musu-bridge LocalBackend API 매핑 확인
- **예상**: 1h

#### 4-G: SQLite WAL + thread 안전성 (musu-core)
- `db.py`: `check_same_thread=False` → connection pool 또는 per-request connection
- WAL mode 명시적 활성화 확인
- **예상**: 2h

### P2 — 다음 스프린트

#### 4-H: Paddle 결제 연동
- **블로커**: Paddle 크레덴셜 수령 필요
- Pro/Team 플랜 checkout → webhook → subscription 상태 반영
- 에이전트 사용 한도 (Pro: 무제한, Free: 50/day)
- **예상**: 8h (블로커 해제 후)

#### 4-I: Auth + 온보딩 플로우
- Supabase auth → company 자동 생성 → 에이전트 시딩
- 첫 로그인 → company setup → CEO 채팅 시작
- **예상**: 6h

#### 4-J: musu.pro 프로덕션 배포
- Vercel 환경변수 설정
- musu-bridge 프로덕션 서버 (Railway/Fly.io)
- MUSU_BRIDGE_TOKEN 32자 이상 설정
- **예상**: 4h

#### 4-K: musu-connects wire closure (Phase 3.5)
- QUIC peer authentication 실제 구현
- NAT fallback 테스트
- **예상**: 8h

### P3 — 장기

#### 4-L: MUSU-CRT (원격 터미널)
- 현재: planning only
- **예상**: 20h+ (Phase 5)

#### 4-M: musu-supervisor 완성
- 프로세스 라이프사이클 관리
- Tauri 데스크탑 앱 통합
- **예상**: 16h+

---

## 코드 오딧 잔존 MEDIUM 이슈 (백로그)

| 이슈 | 파일 | 우선순위 |
|------|------|---------|
| 전역 `msgCounter` SSR 불일치 | AppShell.tsx | MEDIUM |
| textarea DOM 직접 제어 | ChatArea.tsx | LOW |
| `check_same_thread=False` | musu-core/db.py | MEDIUM (4-G에서 해결) |
| CORS origins 하드코딩 | musu-bridge/server.py | MEDIUM (4-E에서 해결) |
| Promise.all → allSettled | handleWikiCommand.ts | LOW |

---

## 멀티머신 아키텍처 현황

```
[로컬 WSL]                          [원격 hugh-main-1]
musu-bee :3001                      musu-portd :1355 (127.0.0.1 ← 픽스 필요)
musu-portd :1355 (0.0.0.0) ←→      musu-bridge :8070
musu-bridge :8070
   ↑                                    ↑
   └──── Tailscale (100.x.x.x) ────────┘
```

**다음 단계**: 원격 musu-port 0.0.0.0 바인딩 → E2E 라우팅 검증 → 양방향 peers 확인

---

## 인덱싱 상태

| 모듈 | 인덱스 | 상태 |
|------|--------|------|
| musu-bee | FTS5 SQLite | `/api/index-search` 연결됨 |
| musu-indexer | Go + Python MCP | 19 pytest pass |
| musu-control MCP | 24 tools | mcp-servers.json 등록됨 |

---

## 관련 문서

- 마스터 플랜: `~/.claude/plans/goofy-leaping-willow.md`
- 스펙 이력: `~/.claude/projects/-home-hugh51/memory/musu-specs.md` (SPEC-135~137)
- 오딧 결과: SPEC-137 (musu-specs.md)
- 멀티머신: `musu-port/OPERATOR_INGRESS_ACCEPTANCE.md`
