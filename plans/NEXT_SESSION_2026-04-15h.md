# musu-functions 다음 세션 준비 (2026-04-15h — Phase 15 완료)

## 이번 세션 완료 (Phase 15 — 보안/DX 잔여 마무리)

| 항목 | 상태 | 내용 |
|------|------|------|
| WS-1: musu-port WS 인증 | ✅ | `MUSU_PORT_TOKEN` Bearer 검증, backward compat |
| CORS-1: CORS/CSRF 통일 | ✅ | 단일 환경변수 `MUSU_BRIDGE_ALLOWED_ORIGINS` |
| MCP-DYN: /api/mcp/tools 동적화 | ✅ | AST 파싱 28개 tools + 22개 bee routes |
| SPEC-024~026 | ✅ | MUSU_FUNCTIONS_SPECS.md 업데이트 |
| 코드 감사 | ✅ | 9.8/10, 블로커 없음 |

---

## 정성적 평가 (Phase 13~15 누적)

### 종합 점수: **9.0/10**

| 영역 | 점수 | 근거 |
|------|------|------|
| **인증/인가** | 9.5/10 | 토큰 강제(bridge), Bearer WS(port), 파일 폴백, dev 모드 |
| **SSRF 방어** | 9.0/10 | URL 검증, follow_redirects=False |
| **CORS/CSRF** | 9.0/10 | 단일 환경변수 통합, 기본값 통일 |
| **데이터 안전성** | 8.5/10 | DB 0600, SyncPush 제한, 매개변수화 SQL |
| **네트워크 노출** | 8.5/10 | worker 127.0.0.1, bridge 토큰 강제 |
| **DX/설치** | 8.5/10 | install.sh, .env.example, start-bridge 강화 |
| **MCP 디스커버리** | 8.5/10 | 동적 AST 파싱 (runtime 조회는 미구현) |

### 이번 세션 특이사항
- Phase 13~15 보안 점수 5.5 → 9.0 달성 (목표 초과)
- WSL 메모리 크래시 해결 (llama-server -c 65536 → 8192)
- musu-scanner cron flock+timeout 적용
- DESIGN.md 9섹션 디자인 시스템 완성
- install.sh + .env.example 원클릭 설치 체계 구축

---

## 코드 감사 결과 (Phase 15)

**감사 점수: 9.8/10**

| 파일 | 상태 | 비고 |
|------|------|------|
| config.rs | ✅ 10/10 | auth_token 필드, MUSU_PORT_TOKEN 읽기 |
| state.rs | ✅ 10/10 | 초기화 정확 |
| server.rs | ✅ 10/10 | HeaderMap + 401, None=패스 |
| csrf_guard.py | ✅ 10/10 | 환경변수 기반, 빈 Origin 허용 유지 |
| server.py | ⚠️ 9/10 | CORS에만 localhost:1355 (의도적 설계) |
| handlers.py | ✅ 10/10 | AST 패턴 정확, 폴백 안전 |

**블로커 없음. 배포 가능.**

---

## 잔여 이슈 (선택적 개선)

| ID | 심각도 | 내용 | 예상 공수 |
|----|--------|------|----------|
| SEC-HDR | Low | SecurityHeadersMiddleware (X-Frame-Options, CSP, HSTS) | 1h |
| CORS-ENV | Trivial | `.env.example`에 `MUSU_PORT_TOKEN`, `MUSU_BRIDGE_ALLOWED_ORIGINS` 추가 | 5m |
| WS-MSG-AUTH | Low | WS 연결 후 첫 메시지에도 token 재검증 (선택적 강화) | 30m |

---

## 다음 세션 후보

### Option A: TasksPanel 개선 (★★)
- 상태/채널 필터 드롭다운 UI
- 태스크 상세 보기 (output 전문)
- 폴링 주기 옵션 (3s → 5s/10s)
- 커서 기반 페이지네이션

### Option B: WebSocket Push (★★★)
- 태스크 완료/실패 시 musu-port WS push 알림
- TasksPanel — polling 대신 WS 이벤트 구독
- 실시간 알림 + unread 뱃지

### Option C: musu.pro 프로덕션 배포 준비 (★★★)
- systemd 서비스 파일 완성 (`musu-bridge.service`, `musu-port.service`)
- 환경변수 체크리스트 (MUSU_PORT_TOKEN, MUSU_BRIDGE_TOKEN 필수 확인)
- Nginx 리버스 프록시 설정
- `.env.example` CORS_ENV + WS token 항목 추가

### Option D: musu-bee UI 개선 (★★)
- DESIGN.md 기반 전체 컴포넌트 리뷰
- NodePanel 디자인 개선
- TasksPanel → DESIGN.md 색상 적용

---

## 현재 아키텍처 요약

```
musu-bridge  :8070  FastAPI  (28 endpoints, CORS/CSRF 통합, /api/mcp/tools 동적)
musu-port    :1355  WS       (MUSU_PORT_TOKEN Bearer 인증 선택적)
musu-bee     :3001  Next.js  (Tasks + Node + Chat 패널)
musu-control         MCP      (28 도구 — stdio, AST로 동적 조회)
musu-worker  :9700  Worker   (기본 127.0.0.1)
```

## 컨텍스트 복원용 파일

| 파일 | 내용 |
|------|------|
| `plans/MUSU_FUNCTIONS_SPECS.md` | 전체 스펙 이력 (SPEC-001~026) |
| `plans/SECURITY_AUDIT_2026-04-15.md` | 보안 감사 기록 |
| `plans/NEXT_SESSION_2026-04-15h.md` | 이 문서 |
| `musu-port/crates/musu-port-core/src/server.rs` | WS Bearer 인증 (line 937~) |
| `musu-bridge/csrf_guard.py` | CORS/CSRF 통합 |
| `musu-bridge/handlers.py` | MCP AST 파싱 (line 537~) |
| `musu-bee/DESIGN.md` | UI 디자인 시스템 SSOT |
| `install.sh` | 원클릭 설치 |

---

*작성: 2026-04-15 | Phase 15 완료 | 보안 점수 9.0/10*
