# 다음 세션 TODO — Phase 13 완료 후 (2026-04-17c)

> 작성: 2026-04-17 | Phase 13 musu-bridge MCP 갭 채우기 완료 기준

---

## 현재 스택 상태

| 서비스 | 상태 | 포트 |
|--------|------|------|
| musu-bridge | ✅ running | :8070 |
| musu-control MCP | ✅ 등록됨 | Claude Code |
| musu-port | ✅ running | :1355 |
| musu-bee | 확인 필요 | :3001 |

---

## P0 — 즉시 해야 할 것

### 1. musu-bridge tests/ — Agent Control 유닛 테스트 추가
**왜**: Phase 13에서 추가한 5개 엔드포인트에 자동화 테스트 없음.
pause→resume 상태 전이, 404 케이스, company activity guard 검증 필요.

```bash
# 새 파일
musu-bridge/tests/test_agent_control.py
```

테스트 항목:
- `GET /api/agents/{id}` → 200 / 404
- `POST /api/agents/{id}/pause` → status="paused"
- `POST /api/agents/{id}/resume` → status="active"
- `GET /api/companies/{id}/activity` → 200 / 404 company
- `GET /api/admin/peer-status` → schema 검증

### 2. LocalBackend.update_agent() 퍼블릭 메서드 추가
**왜**: `set_agent_status()`가 `backend.agents.update()` 내부 리포지터리를 직접 호출 중.
**파일**: `musu-core/src/musu_core/backends/local.py`

```python
def update_agent(self, agent_id: str, **kwargs) -> dict[str, Any] | None:
    agent = self.agents.update(agent_id, **kwargs)
    return _agent_to_dict(agent) if agent else None
```

### 3. /api/tasks/events 라우팅 버그 수정
**왜**: `GET /api/tasks/{task_id}`가 먼저 등록되어 있어 `/api/tasks/events`가 task_id="events"로 매칭됨.
**파일**: `musu-bridge/server.py`
**수정**: `api_task_events` 라우트를 `api_get_task` 앞으로 이동.

---

## P1 — 이번 주 안에

### 4. Plan 232 — Workspace Registry Followthrough
- 실제 workspace object 서버 백업 (현재 route/auth 전용)
- selected company → 더 많은 app action 전파
- `server-only` 보호 전략 재정립

참고: `paperclip-phase5-status.md`

### 5. musu-control MCP — 전체 도구 실 동작 확인
현재 구현된 musu-control 도구 28개 중 실제로 musu-bridge와 통신 성공하는 것만 확인됨:
- ✅ list_agents, get_agent, pause_agent, resume_agent
- ✅ list_tasks, delegate_task, get_task_status, cancel_task
- ✅ get_dashboard, get_activity, get_org_chart
- ❓ list_issues, create_issue, update_issue, checkout_issue (Issues 백엔드 확인 필요)
- ❓ get_costs_summary, get_costs_by_agent (비용 추적 구현 여부)
- ❓ list_approvals, resolve_approval

```bash
PAPERCLIP_API_URL=http://localhost:8070/api \
PAPERCLIP_API_KEY=$(cat ~/.musu/bridge_token) \
python3 -c "import asyncio, sys; sys.path.insert(0,'musu-control/src'); ..."
```

### 6. MUSU_TOKEN 활성화 + peer-status 검증
- musu.pro에서 토큰 발급
- `~/.musu/bridge_token` → musu-bridge `.env` `MUSU_TOKEN=` 설정
- musu-bridge 재시작 → `GET /api/admin/peer-status` 확인

---

## P2 — 다음 스프린트

### 7. musu-connects SyncOrchestrator 통합 완성
- `main.rs`에 SyncOrchestrator 연결 (bridge_proxy.rs에는 이미 연결됨)
- QUIC peer discovery → SyncOrchestrator 피어 목록 자동 공급
- E2E: 2-node sync 테스트 (로컬 + hugh-main-1)

### 8. activity 엔드포인트 company-scope 강화
현재 `GET /api/companies/{id}/activity`는 global audit log를 반환한다.
company_id 기반 필터링이 실제로 없음.
옵션 A: audit 테이블에 company_id 컬럼 추가
옵션 B: route_execution의 channel → agent → company 역추적 join

---

## 체크 커맨드

```bash
# 브리지 살아있나
curl -s http://localhost:8070/health

# 에이전트 14개 있나
curl -s http://localhost:8070/api/agents -H "Authorization: Bearer $(cat ~/.musu/bridge_token)" | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'agents')"

# 새 엔드포인트 동작
TOKEN=$(cat ~/.musu/bridge_token)
curl -s "http://localhost:8070/api/admin/peer-status" -H "Authorization: Bearer $TOKEN"

# musu-core 테스트
musu-bridge/.venv/bin/python3 -m pytest musu-core --tb=no -q
```
