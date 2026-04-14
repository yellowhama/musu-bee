# musu-functions 다음 세션 준비 (2026-04-15f — 보안 감사 완료)

## 이번 세션 완료 (Phase 13 — 보안 강화)

| 항목 | 상태 | 내용 |
|------|------|------|
| A-1: 시작 토큰 강제 | ✅ | `MUSU_BRIDGE_TOKEN` 미설정 시 `sys.exit(1)` |
| SSRF-2: accept_pair URL 검증 | ✅ | `_validate_external_url()` + `accept_pair()` 호출 |
| SSRF-1: follow_redirects=False | ✅ | handlers.py 4개 httpx 호출 전부 |
| CONC-1: 동시 태스크 캡 | ✅ | `_MAX_CONCURRENT_TASKS=20`, 초과 시 429 |
| SYNC-1: SyncPushRequest 제한 | ✅ | `Annotated[List[dict], Field(max_length=2000)]` |
| W-HOST: worker 기본 바인딩 | ✅ | `"0.0.0.0"` → `"127.0.0.1"` |
| DB-PERM: SQLite 0600 | ✅ | `os.chmod(db_path, 0o600)` |
| 보안 감사 문서 | ✅ | `plans/SECURITY_AUDIT_2026-04-15.md` |
| awesome-design-md 클론 | ✅ | `references/awesome-design-md/` |
| MUSU_FUNCTIONS_SPECS.md | ✅ | SPEC-016~019 추가 |

---

## 정성적 평가 (Phase 13 완료)

### 종합 점수: **8.5/10**

| 영역 | 점수 | 비고 |
|------|------|------|
| 인증/인가 | 9.0/10 | 토큰 강제, UUID 검증, rate limit 캡 |
| SSRF 방어 | 9.0/10 | URL 검증, follow_redirects=False |
| 데이터 안전성 | 8.5/10 | DB 0600, SyncPush 제한, 매개변수화 SQL |
| 네트워크 노출 | 8.0/10 | worker 127.0.0.1, bridge 토큰 강제 |
| **미완료: WS-1** | -0.5 | musu-port :1355 WS 인증 없음 (Rust) |

---

## 잔여 이슈 (Phase 14 대상)

| ID | 심각도 | 내용 | 예상 공수 |
|----|--------|------|----------|
| WS-1 | High | musu-port WS(:1355) 인증 없음 — `Authorization: Bearer` 헤더 검증 | 2-3h (Rust) |
| CORS-1 | Low | CORS origin 리스트와 CSRF 목록 불일치 가능성 확인 | 30m |
| SEC-HDR | Low | SecurityHeadersMiddleware 검토 (X-Frame-Options, CSP 등) | 1h |

---

## 다음 세션 후보

### Option A: WS-1 — musu-port 인증 (★★★) — 보안 완성
- `musu-port/main.rs` WebSocket upgrade에서 `Bearer` 토큰 검증
- `MUSU_PORT_TOKEN` 환경변수 읽기
- 예상: 3시간 (Rust WS 미들웨어 패턴 리서치 포함)
- 완료 시 **보안 점수 9.0/10** 달성

### Option B: TasksPanel 개선 (★★)
- 상태/채널 필터 드롭다운 UI
- 태스크 상세 보기 (output 전문)
- 폴링 주기 옵션 (3s → 5s/10s)
- 커서 기반 페이지네이션

### Option C: WebSocket Push (★★★)
- 태스크 완료/실패 시 musu-port WS로 push 알림
- TasksPanel — polling 대신 WS 이벤트 구독
- 실시간 알림 → unread 뱃지

### Option D: awesome-design-md 통합 (★★)
- `references/awesome-design-md/design-md/` 내용 탐색
- musu-bee UI 컴포넌트 개선에 적용
- 특히 TasksPanel, NodePanel 디자인 개선

---

## 현재 아키텍처 요약

```
musu-bridge  :8070  FastAPI  (27 endpoints, 인증 강제, SSRF 방어)
musu-port    :1355  WS       (인증 없음 — WS-1 잔여)
musu-bee     :3001  Next.js  (Tasks 패널 + Node 패널 + Chat)
musu-control         MCP      (28 도구)
musu-worker  :8080  Worker   (기본 127.0.0.1)
```

## 컨텍스트 복원용 파일

| 파일 | 내용 |
|------|------|
| `plans/MUSU_FUNCTIONS_SPECS.md` | 전체 스펙 이력 (SPEC-001~019) |
| `plans/SECURITY_AUDIT_2026-04-15.md` | 보안 감사 전체 결과 |
| `plans/NEXT_SESSION_2026-04-15f.md` | 이 문서 |
| `musu-bridge/server.py` | 27개 엔드포인트, 토큰 강제, 태스크 캡 |
| `musu-bridge/handlers.py` | SSRF 방어 완료 |
| `musu-control/src/musu_control/server.py` | 28개 MCP 도구 |
| `musu-bee/src/components/TasksPanel.tsx` | Tasks 패널 UI |
| `references/awesome-design-md/` | VoltAgent 디자인 레퍼런스 |

---

*작성: 2026-04-15 | Phase 13 보안 강화 완료 | 보안 점수 8.5/10*
