# musu-functions 다음 세션 준비 (2026-04-15h — Phase 15 완료)

## 이번 세션 완료 (Phase 15 — 보안/DX 잔여 마무리)

| 항목 | 상태 | 내용 |
|------|------|------|
| WS-1: musu-port WS 인증 | ✅ | `MUSU_PORT_TOKEN` Bearer 검증, backward compat |
| CORS-1: CORS/CSRF 통일 | ✅ | 단일 환경변수 `MUSU_BRIDGE_ALLOWED_ORIGINS` |
| MCP-DYN: /api/mcp/tools 동적화 | ✅ | AST 파싱 28개 tools + 22개 bee routes |
| SPEC-024~026 | ✅ | MUSU_FUNCTIONS_SPECS.md 업데이트 |

---

## 보안 점수 최종 평가

| 영역 | 이전 (8.5) | 현재 (9.0) | 변경 |
|------|-----------|-----------|------|
| 인증/인가 | 9.0 | 9.5 | WS-1 완료 |
| SSRF 방어 | 9.0 | 9.0 | 유지 |
| 데이터 안전성 | 8.5 | 8.5 | 유지 |
| 네트워크 노출 | 8.0 | 8.0 | 유지 |
| CORS/CSRF | 7.5 | 9.0 | 통합 완료 |
| **종합** | **8.5** | **9.0** | ✅ 목표 달성 |

---

## 잔여 이슈 (선택적 개선)

| ID | 심각도 | 내용 | 예상 공수 |
|----|--------|------|----------|
| SEC-HDR | Low | SecurityHeadersMiddleware 검토 (X-Frame-Options, CSP 등) | 1h |
| CORS-ENV | Low | `.env.example`에 `MUSU_PORT_TOKEN`, `MUSU_BRIDGE_ALLOWED_ORIGINS` 추가 | 5m |

---

## 다음 세션 후보

### Option A: TasksPanel 개선 (★★)
- 상태/채널 필터 드롭다운 UI
- 태스크 상세 보기 (output 전문)
- 폴링 주기 옵션

### Option B: WebSocket Push (★★★)
- 태스크 완료/실패 시 musu-port WS push 알림
- TasksPanel — polling 대신 WS 이벤트 구독

### Option C: musu.pro 배포 준비 (★★★)
- Docker Compose / systemd 서비스 파일
- 환경변수 프로덕션 체크리스트

---

## 현재 아키텍처 요약

```
musu-bridge  :8070  FastAPI  (28 endpoints + /api/mcp/tools 동적)
musu-port    :1355  WS       (MUSU_PORT_TOKEN Bearer 인증)
musu-bee     :3001  Next.js  (Tasks + Node + Chat 패널)
musu-control         MCP      (28 도구 — stdio)
musu-worker  :9700  Worker   (기본 127.0.0.1)
```

## 컨텍스트 복원용 파일

| 파일 | 내용 |
|------|------|
| `plans/MUSU_FUNCTIONS_SPECS.md` | 전체 스펙 이력 (SPEC-001~026) |
| `plans/SECURITY_AUDIT_2026-04-15.md` | 보안 감사 기록 |
| `plans/NEXT_SESSION_2026-04-15h.md` | 이 문서 |
| `musu-port/crates/musu-port-core/src/server.rs` | WS Bearer 인증 |
| `musu-bridge/csrf_guard.py` | CORS/CSRF 통합 |
| `musu-bridge/handlers.py` | MCP AST 파싱 |

---

*작성: 2026-04-15 | Phase 15 완료 | 보안 점수 9.0/10*
