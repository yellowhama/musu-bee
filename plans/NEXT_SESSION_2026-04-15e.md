# musu-functions 다음 세션 준비 (2026-04-15 최종 — 감사 후)

## 이번 세션 완료 (Phase 12B+C)

| 항목 | 상태 | 커밋 |
|------|------|------|
| BUG-1: LocalBackend.create_agent() | ✅ | `c171174c` |
| W2: channel 파라미터 검증 | ✅ | `c171174c` |
| W4: 플랫폼 감지 (non-Linux 경고) | ✅ | `c171174c` |
| W6: asyncio 300초 타임아웃 | ✅ | `c171174c` |
| Phase 12B: list_tasks MCP 도구 | ✅ | `c171174c` |
| Phase 12B: cancel_task MCP 도구 | ✅ | `c171174c` |
| Phase 12C: bridge-tasks 프록시 라우트 | ✅ | `c171174c` |
| Phase 12C: TasksPanel.tsx | ✅ | `c171174c` |
| Phase 12C: AppShell tasks 채널 라우팅 | ✅ | `c171174c` |

---

## 정성적 평가 (Phase 12B+C 완료)

### 종합 점수: **9.5/10**

| 영역 | 점수 | 비고 |
|------|------|------|
| 인간 편의성 | 9.5/10 | Tasks UI + seed fix + 플랫폼 감지 |
| AI 오케스트레이터 | 10/10 | 28개 MCP 도구 완비, list/cancel 가능 |
| 운영 안정성 | 9.5/10 | 타임아웃/검증/시드 완성, 소수 감사 잔여 |

**-0.5 잔여 이유:**
- TasksPanel 폴링 주기 3초 (aggressive — 사용자 조정 불가)
- bridge-tasks 프록시에 쿼리 파라미터 화이트리스트 없음
- MCP 도구 예외 처리가 `except Exception:` 으로 너무 광범위

---

## 코드 감사 결과 (Phase 12B+C 기준)

### False Positive (실제 문제 없음)

| ID | 내용 | 판정 이유 |
|----|------|----------|
| F1 | handlers.py SQL injection (sync_*) | parameterized query 사용, 에이전트 오판 |
| F2 | TasksPanel XSS (task.summary) | React 기본 escaping으로 안전 |
| F3 | cli.py linux2 플랫폼 체크 | Python 3.3+ 이상에서 "linux" 고정, 문제 없음 |

### 수정 완료

| ID | 내용 | 커밋 |
|----|------|------|
| BUG-1 | create_agent() 없음 | `c171174c` |
| W1 | terminal 상태 덮어쓰기 | Phase 12A |
| W2 | channel 검증 | `c171174c` |
| W3 | systemd 경로 쿼트 | Phase 12A |
| W4 | 플랫폼 감지 | `c171174c` |
| W6 | 타임아웃 | `c171174c` |

### 잔여 이슈 (Phase 13 대상)

| ID | 심각도 | 내용 | 수정 난이도 |
|----|--------|------|-----------|
| A1 | Medium | bridge-tasks/route.ts: 쿼리 파라미터 화이트리스트 없음 | 쉬움 (15분) |
| A2 | Medium | bridge-tasks/[id]/route.ts: task_id UUID 검증 없음 | 쉬움 (10분) |
| A3 | Medium | TasksPanel: useEffect fetchTasks dependency 순환 가능성 | 쉬움 (10분) |
| A4 | Low | MCP 도구: `except Exception:` → 구체적 예외로 교체 | 보통 |
| A5 | Low | 202 응답에 Location 헤더 없음 (RFC 7231) | 쉬움 |
| A6 | Low | /api/tasks/delegate 감사 로깅 없음 | 쉬움 |
| W5 | Low | DB 실패 시 task 고아화 (엣지케이스) | 복잡 |

### 수정 우선순위 (다음 세션 초반에 빠르게 처리)

**A1+A2** — bridge-tasks 프록시 하드닝 (25분):
```typescript
// route.ts: 화이트리스트
const ALLOWED_PARAMS = new Set(["status", "limit", "before_id", "channel"]);
req.nextUrl.searchParams.forEach((value, key) => {
  if (ALLOWED_PARAMS.has(key)) url.searchParams.set(key, value);
});

// [id]/route.ts: UUID 검증
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
```

**A3** — TasksPanel useEffect 수정 (10분):
```typescript
// useCallback에 [] 의존성 고정 (이미 적용됨 — 재확인 필요)
```

---

## 다음 세션 후보

### Option A: 감사 잔여 수정 A1-A3 (★★★) — 빠른 완성
- A1 쿼리 파라미터 화이트리스트
- A2 UUID 검증
- A3 useEffect 안전화
- A5 202 Location 헤더
- **예상 시간: 1시간**

### Option B: TasksPanel 개선 (★★)
- 상태/채널 필터 드롭다운 UI
- 태스크 상세 보기 (output 전문)
- 폴링 주기 조정 옵션 (3s → 5s/10s)
- 커서 기반 페이지네이션

### Option C: 새 기능 — WebSocket Push (★★★)
- 태스크 완료/실패 시 musu-port WS로 push 알림
- TasksPanel — polling 대신 WS 이벤트 구독
- 실시간 알림 → unread 뱃지

### Option D: Paperclip AI 운영 연동 강화 (★★)
- 실제 Paperclip CEO 에이전트가 list_tasks/cancel_task 사용하도록 MCP 연결 확인
- musu-bridge 재시작 없이 MCP 도구 테스트

---

## 현재 MCP 도구 목록 (28개)

```
기존 24개 (agents, tasks, messages, companies, nodes, mesh)

Phase 11:
25. delegate_task(channel, instruction, sender_id)
26. get_task_status(task_id)

Phase 12B:
27. list_tasks(status, channel, limit, before_id)
28. cancel_task(task_id)
```

---

## 컨텍스트 복원용 파일 위치

| 파일 | 내용 |
|------|------|
| `plans/MUSU_FUNCTIONS_SPECS.md` | 전체 스펙 이력 (SPEC-001~015) |
| `plans/NEXT_SESSION_2026-04-15e.md` | 이 문서 |
| `musu-bridge/server.py` | 27개 엔드포인트, 타임아웃 래퍼 |
| `musu-bridge/handlers.py` | task/message/node 핸들러 |
| `musu-control/src/musu_control/server.py` | 28개 MCP 도구 |
| `musu-bee/src/components/TasksPanel.tsx` | Tasks 패널 UI |

---

*작성: 2026-04-15 | Phase 12B+C 완료 + 감사 완료 | 운영 안정성 9.5/10*
