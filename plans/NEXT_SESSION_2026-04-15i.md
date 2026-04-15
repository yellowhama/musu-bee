# musu-functions 다음 세션 준비 (2026-04-15i — Phase 16 완료)

## 이번 세션 완료 (Phase 16 — 실시간화 + 프로덕션 준비 + UI 개선)

| 항목 | 상태 | 내용 |
|------|------|------|
| 16A: SSE Push + TasksPanel 실시간화 | ✅ | musu-bridge SSE 엔드포인트, EventSource 교체, polling 폴백 |
| 16B: TasksPanel 기능 개선 | ✅ | 상태/채널 필터, 카드 클릭 상세보기, Load more 페이지네이션 |
| 16C: 프로덕션 배포 인프라 | ✅ | systemd 2개, 설치 스크립트, bridge.env.example, PRODUCTION.md |
| 16D: CSS 변수 + DESIGN.md 토큰 | ✅ | globals.css 토큰 추가, TasksPanel 색상 CSS 변수화 |
| SPEC-027~030 | ✅ | MUSU_FUNCTIONS_SPECS.md 업데이트 |

---

## 현재 아키텍처 요약

```
musu-bridge  :8070  FastAPI  (28 endpoints + GET /api/tasks/events SSE)
musu-port    :1355  WS       (MUSU_PORT_TOKEN Bearer 인증)
musu-bee     :3001  Next.js  (Tasks live + Node + Chat 패널)
musu-control         MCP      (28 도구 — stdio, AST 동적 조회)
musu-worker  :9700  Worker   (기본 127.0.0.1)
```

---

## 코드 상태

### 변경 파일 목록 (Phase 16)

| 파일 | 내용 |
|------|------|
| `musu-bridge/server.py` | _task_event_queues + _broadcast_task_event + GET /api/tasks/events |
| `musu-bee/src/app/api/bridge-tasks/events/route.ts` | 신규 SSE 프록시 |
| `musu-bee/src/components/TasksPanel.tsx` | SSE + 필터 + 상세보기 + 페이지네이션 + CSS 변수 |
| `musu-bee/src/app/globals.css` | DESIGN.md CSS 토큰 추가 |
| `scripts/systemd/musu-bridge.service` | 신규 systemd 서비스 |
| `scripts/systemd/musu-port.service` | 신규 systemd 서비스 |
| `scripts/install-musu-bridge-service.sh` | 신규 설치 스크립트 |
| `scripts/systemd/bridge.env.example` | Bridge 환경변수 예시 |
| `.env.example` | MUSU_PORT_TOKEN, MUSU_BRIDGE_ALLOWED_ORIGINS 추가 |
| `docs/PRODUCTION.md` | 신규 배포 체크리스트 |

---

## 검증 방법

```bash
# SSE 연결 테스트
curl -N -H "Authorization: Bearer $MUSU_BRIDGE_TOKEN" \
  http://localhost:8070/api/tasks/events
# → data: {"type": "connected"}

# musu-bee 빌드 확인
cd musu-bee && pnpm build

# systemd 설치
bash scripts/install-musu-bridge-service.sh
```

---

## 잔여 이슈 (선택적 개선)

| ID | 심각도 | 내용 | 예상 공수 |
|----|--------|------|----------|
| SEC-HDR | Low | SecurityHeadersMiddleware (X-Frame-Options, CSP, HSTS) | 1h |
| WS-MSG-AUTH | Low | WS 연결 후 첫 메시지에도 token 재검증 | 30m |
| SSE-AUTH | Low | /api/tasks/events에 Bearer 인증 추가 (현재 무인증) | 20m |
| UI-NODE | Low | NodePanel DESIGN.md 색상 적용 | 1h |

---

## 다음 세션 후보

### Option A: musu.pro 라이브 배포 (★★★)
- PRODUCTION.md 체크리스트 따라 실제 서버 배포
- systemd 서비스 설치 + nginx 설정
- MUSU_BRIDGE_TOKEN / MUSU_PORT_TOKEN 프로덕션 값 설정

### Option B: Layer 2 메신저 UI (★★★)
- 현재 ChatArea는 단순 WS 채팅 → 팀 메신저 UI로 업그레이드
- 멀티 채널 사이드바 (Slack 스타일)
- 메시지 스레딩, 파일 첨부 UI 계획

### Option C: musu-scanner + cron 강화 (★★)
- topology scan 결과를 TasksPanel과 연동
- scanner 결과 musu-bridge로 push

### Option D: SSE-AUTH + SEC-HDR 잔여 보안 (★★)
- /api/tasks/events Bearer 인증 추가
- SecurityHeadersMiddleware 구현

---

## 컨텍스트 복원용 파일

| 파일 | 내용 |
|------|------|
| `plans/MUSU_FUNCTIONS_SPECS.md` | 전체 스펙 이력 (SPEC-001~030) |
| `plans/NEXT_SESSION_2026-04-15i.md` | 이 문서 |
| `musu-bridge/server.py` | SSE 이벤트 큐 + /api/tasks/events |
| `musu-bee/src/components/TasksPanel.tsx` | 필터 + SSE + 페이지네이션 |
| `musu-bee/src/app/globals.css` | CSS 변수 SSOT |
| `docs/PRODUCTION.md` | 배포 체크리스트 |

---

*작성: 2026-04-15 | Phase 16 완료 | 제품 준비도 9.2/10*
