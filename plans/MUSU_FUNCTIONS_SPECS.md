# musu-functions 스펙 이력

**경로**: `/home/hugh51/musu-functions/`
**저장소**: `yellowhama/musu-bee` (공개 이름)

---

## Phase 1: 기초 인프라

### SPEC-001: musu-core LocalBackend + DB 스키마
- SQLite WAL 모드 + route_executions, agents, tasks, messages 테이블
- `agents.py` AgentRegistry, `tasks.py` TaskQueue 분리 구현
- `backends/local.py` 얇은 facade

### SPEC-002: musu-bridge FastAPI 서버
- `POST /api/route` — synchronous agent routing
- Bearer 토큰 미들웨어, CORS 설정
- `handlers.py` route_chat() 분리

### SPEC-003: musu-bee Next.js UI 기초
- AppShell + Sidebar + ChatArea 컴포넌트
- useChat hook — WS 연결 + 메시지 관리

---

## Phase 2: 회사 레이어 + 멀티머신

### SPEC-004: Company Layer (Phase 2D)
- `/api/companies` CRUD — GET/POST/PUT/DELETE
- DB: companies, company_role_templates, company_project_index, company_approvals_queue
- CompanyPanel.tsx + AppShell 통합
- 커밋: Phase 2D 완료

### SPEC-005: MCP 24개 도구 (musu-control)
- `musu-control/src/musu_control/server.py` — FastMCP 기반 24개 도구
- `PAPERCLIP_API_URL=http://localhost:8070/api` 연결
- `~/.claude/mcp-servers.json` 등록

### SPEC-006: 멀티머신 Mesh (Phase 3)
- `~/.musu/nodes.toml` peer 설정
- `mesh_router.py` — reload(), add_node(), health check
- `GET /api/admin/nodes`, `POST /api/admin/pair`
- 원격 노드 폴백 (health check → local fallback)

### SPEC-007: mDNS 자동 발견 (Phase 9C)
- `discovery.py` — zeroconf mDNS advertise + scan
- `GET /api/admin/discovered` — 발견된 피어 목록
- NodePanel 자동 발견 섹션

---

## Phase 3: 비동기 태스크 (Phase 11-12)

### SPEC-008: 비동기 태스크 위임 (Phase 11)
- `POST /api/tasks/delegate` — 202 Accepted + task_id 즉시 반환
- `GET /api/tasks/{task_id}` — 상태 폴링
- `route_executions` 테이블 + `retry_count` 컬럼
- DB: v5 migration (retry_count), v6 migration (created_at 인덱스)
- `_active_tasks: dict[str, asyncio.Task]` module-level 트래킹
- MCP 도구: `delegate_task()`, `get_task_status()` (총 26개)
- 커밋: `6c4135c1` (Phase 11)

### SPEC-009: 태스크 목록 + 취소 (Phase 12A)
- `GET /api/tasks` — status/channel 필터, cursor pagination (before_id)
- `DELETE /api/tasks/{task_id}` — asyncio 취소 + DB cancelled
- `musu-bridge init --service --user` — systemd 서비스 파일 자동 생성
- 감사 수정: idx_route_executions_created 인덱스 (v6 migration)
- W1: cancel_task_record — terminal 상태 덮어쓰기 방지
- W3: systemd 경로 쿼트 (WorkingDirectory="{path}")
- 커밋: Phase 12A 완료

---

## Phase 4: 완성 (Phase 12B+C) — 커밋 `c171174c`

### SPEC-010: BUG-1 — LocalBackend.create_agent() 추가
- **파일**: `musu-core/src/musu_core/backends/local.py`
- **문제**: `cmd_seed()`가 호출하는 `create_agent()` 메서드 없음 → AttributeError
- **수정**: `create_agent(agent_id, name, role, adapter_type, adapter_config)` wrapper 추가
  → `self.agents.create()` 위임

### SPEC-011: W2 — GET /api/tasks channel 파라미터 검증
- **파일**: `musu-bridge/server.py`
- **동작**: `?channel=nonexistent` → 400 `{"detail": "Unknown channel: 'nonexistent'"}`
- channel_map 조회 후 미존재 채널 → HTTPException(400)

### SPEC-012: W4 — 플랫폼 감지 (systemd non-Linux 경고)
- **파일**: `musu-bridge/cli.py`
- **동작**: `sys.platform != "linux"` → stderr 경고 + return 1
- macOS/Windows에서 systemd 파일 생성 시도 차단

### SPEC-013: W6 — 태스크 타임아웃 300초
- **파일**: `musu-bridge/server.py`, `musu-bridge/handlers.py`
- `asyncio.wait_for(route_chat(...), timeout=300)` — 5분 후 자동 fail
- 타임아웃 시: `cancel_task_record(task_id, error="timeout after 300s")`
- `cancel_task_record`에 `error: str = "cancelled"` 파라미터 추가

### SPEC-014: Phase 12B — MCP 도구 완성 (총 28개)
- **파일**: `musu-control/src/musu_control/server.py`
- `list_tasks(status, channel, limit, before_id)` — 위임 태스크 목록 조회
- `cancel_task(task_id)` — 위임 태스크 취소
- 파라미터 전달: `params` dict → `/api/tasks` GET 쿼리스트링
- 에러: bridge 400 응답 → `_tool_error(detail)` 반환

### SPEC-015: Phase 12C — musu-bee Tasks 패널
- **파일 3개 신규**:
  - `musu-bee/src/app/api/bridge-tasks/route.ts` — GET 프록시
  - `musu-bee/src/app/api/bridge-tasks/[id]/route.ts` — DELETE 프록시
  - `musu-bee/src/components/TasksPanel.tsx` — 폴링 UI
- **파일 수정**:
  - `AppShell.tsx` — `tasks` 채널 → `TasksPanel` 조건부 렌더링
- **TasksPanel 기능**:
  - 3초 자동 폴링 (`useEffect` + `setInterval`)
  - 상태별 색상: pending(gray), running(blue), done(green), failed(red)
  - Cancel 버튼 — `DELETE /api/bridge-tasks/{task_id}`
  - 빈 상태 메시지, 에러 표시

---

## 현재 전체 API 목록 (Phase 12B+C 완료)

```
# 태스크 관리 (Phase 11-12)
POST   /api/tasks/delegate          202 → {task_id, status, channel}
GET    /api/tasks                   → [{task_id, status, summary, ...}]
GET    /api/tasks/{task_id}         → {task_id, status, summary, output, error}
DELETE /api/tasks/{task_id}         → {cancelled: task_id}

# 라우팅
POST   /api/route                   → {response, agent_id, agent_name}

# 에이전트/채널
GET    /api/agents
GET    /api/channels

# 메시지 히스토리
GET    /api/messages?session_id=
GET    /api/messages/{id}
DELETE /api/messages/{id}

# 감사
GET    /api/audit

# 회사 레이어
GET/POST   /api/companies
GET/PUT/DELETE /api/companies/{id}

# 노드 관리
GET    /api/admin/node-info
POST   /api/admin/pair
POST   /api/admin/pair/accept
GET    /api/admin/nodes
DELETE /api/admin/nodes/{name}
GET    /api/admin/discovered

# 동기화
GET    /api/sync/companies
GET    /api/sync/messages
POST   /api/sync/push

# 표준
GET    /.well-known/agent.json
GET    /health
```

## MCP 도구 목록 (28개)

```
기존 24개 (에이전트, 태스크, 메시지, 회사, 노드 관리)

Phase 11:
+ delegate_task(channel, instruction, sender_id)
+ get_task_status(task_id)

Phase 12B:
+ list_tasks(status, channel, limit, before_id)
+ cancel_task(task_id)
```

---

*최종 업데이트: 2026-04-15 | Phase 12B+C 완료*
