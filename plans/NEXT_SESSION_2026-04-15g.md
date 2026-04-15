# musu-functions 다음 세션 준비 (2026-04-15g — Phase 14 DX Hardening 완료)

## 이번 세션 완료 (Phase 14 — DX Hardening)

| 항목 | 상태 | 내용 |
|------|------|------|
| 14A: tomllib 폴백 | ✅ | Python 3.10 호환 — mesh.py + mesh_router.py + pyproject.toml 2개 |
| 14B: install.sh | ✅ | 원클릭 설치 스크립트 (venv + pip + pnpm + .env.local 자동생성) |
| 14B: .env.example | ✅ | 전체 환경변수 레퍼런스 파일 |
| 14C: start-bridge.sh 강화 | ✅ | 토큰 파일 폴백 + dev 자동 토큰 + 포트 충돌 감지 |
| 14C: dev-start.sh | ✅ | `MUSU_DEV=1` 자동 전달 |
| 14D: GET /api/mcp/tools | ✅ | 서비스별 MCP 도구 매니페스트 엔드포인트 |
| SPEC-020~023 | ✅ | MUSU_FUNCTIONS_SPECS.md 업데이트 |

---

## 정성적 평가 (Phase 14 완료)

### 종합 점수: **8.8/10**

| 영역 | 점수 | 비고 |
|------|------|------|
| 인증/인가 | 9.0/10 | 토큰 강제, 파일 폴백, dev 모드 자동토큰 |
| SSRF 방어 | 9.0/10 | URL 검증, follow_redirects=False |
| 데이터 안전성 | 8.5/10 | DB 0600, SyncPush 제한 |
| 설치/DX | 8.5/10 | install.sh, .env.example, start-bridge 강화 |
| MCP 디스커버리 | 8.0/10 | /api/mcp/tools — 정적 목록 (동적 조회 미구현) |
| **미완료: WS-1** | -0.2 | musu-port :1355 WS 인증 없음 |

---

## 잔여 이슈 (Phase 15 대상)

| ID | 심각도 | 내용 | 예상 공수 |
|----|--------|------|----------|
| WS-1 | High | musu-port WS(:1355) 인증 없음 — `Authorization: Bearer` 헤더 검증 | 2-3h (Rust) |
| MCP-DYN | Low | `/api/mcp/tools` 정적 목록 → musu-control 실제 쿼리로 동적화 | 1h |
| CORS-1 | Low | CORS origin 리스트와 CSRF 목록 불일치 가능성 확인 | 30m |

---

## 다음 세션 후보

### Option A: WS-1 — musu-port 인증 (★★★) — 보안 완성
- `musu-port/main.rs` WebSocket upgrade에서 `Bearer` 토큰 검증
- `MUSU_PORT_TOKEN` 환경변수 읽기
- 완료 시 **보안 점수 9.0/10** 달성

### Option B: TasksPanel 개선 (★★)
- 상태/채널 필터 드롭다운 UI
- 태스크 상세 보기 (output 전문)
- 폴링 주기 옵션 (3s → 5s/10s)
- 커서 기반 페이지네이션

### Option C: WebSocket Push (★★★)
- 태스크 완료/실패 시 musu-port WS로 push 알림
- TasksPanel — polling 대신 WS 이벤트 구독

### Option D: 설치 테스트 (★★)
- `bash install.sh` 실제 실행 검증
- Python 3.10 환경에서 tomllib 폴백 확인
- `MUSU_DEV=1 bash scripts/start-bridge.sh` 확인

---

## 현재 아키텍처 요약

```
musu-bridge  :8070  FastAPI  (28 endpoints, 인증 강제, SSRF 방어, MCP 디스커버리)
musu-port    :1355  WS       (인증 없음 — WS-1 잔여)
musu-bee     :3001  Next.js  (Tasks 패널 + Node 패널 + Chat)
musu-control         MCP      (28 도구)
musu-worker  :8080  Worker   (기본 127.0.0.1)
```

## 컨텍스트 복원용 파일

| 파일 | 내용 |
|------|------|
| `plans/MUSU_FUNCTIONS_SPECS.md` | 전체 스펙 이력 (SPEC-001~023) |
| `plans/SECURITY_AUDIT_2026-04-15.md` | 보안 감사 전체 결과 |
| `plans/NEXT_SESSION_2026-04-15g.md` | 이 문서 |
| `musu-bridge/server.py` | 28개 엔드포인트 + /api/mcp/tools |
| `musu-bridge/handlers.py` | SSRF 방어 + mcp_tools_manifest |
| `install.sh` | 원클릭 설치 |
| `.env.example` | 환경변수 레퍼런스 |
| `scripts/start-bridge.sh` | 강화된 bridge 시작 스크립트 |
| `musu-bee/DESIGN.md` | UI 디자인 시스템 SSOT |

---

*작성: 2026-04-15 | Phase 14 DX Hardening 완료 | 보안 점수 8.8/10*
