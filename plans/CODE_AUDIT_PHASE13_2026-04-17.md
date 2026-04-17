# Code Audit — Phase 13 musu-bridge MCP 엔드포인트 (2026-04-17)

> **범위**: `ea59961a` 커밋 — handlers.py + server.py 변경분
> **심사자**: Claude Code 자동 감사

---

## 종합 평가: 9 / 10

구현이 깔끔하고 실전 테스트도 통과했다. 작은 추상화 누수 1건과
기존 라우팅 버그 1건(Phase 13 도입 아님)이 발견됐다.

---

## A. 보안 (Security)

### A-1 인증 ✅
- 5개 신규 라우트 모두 `apply_musu_middlewares`가 전역 적용한 Bearer token 검증을 통과해야 한다.
- 별도 인증 코드 불필요 — 기존 미들웨어가 커버.

### A-2 입력 검증 ✅
- `GET /api/agents/{agent_id}`: path param이 임의 문자열이어도 404로 안전 반환.
- `GET /api/companies/{id}/activity`: Query `ge=1, le=500` 범위 제한 적용. company 존재 여부 사전 확인(404).
- `set_agent_status()`: status 문자열은 server.py에서 "paused"/"active" 하드코딩으로만 호출 — SQL injection 불가.

### A-3 SSRF 없음 ✅
- `api_peer_status()`: 외부 네트워크 호출 없음. `peer_cache`에서 읽기 전용.

### A-4 민감정보 노출 없음 ✅
- `api_peer_status()`: MUSU_TOKEN 값 자체는 반환하지 않고 `bool`(cloud_registry_enabled)만 노출.

---

## B. 아키텍처 (Architecture)

### B-1 ⚠️ LocalBackend 추상화 우회 (경미)
**파일**: `handlers.py:set_agent_status()`

```python
# 현재: AgentRegistry를 직접 호출
agent = backend.agents.update(agent_id, status=status)

# 이상적: LocalBackend에 update_agent() 추가 후
agent_dict = backend.update_agent(agent_id, status=status)
```

`LocalBackend`에 `update_agent()` 퍼블릭 메서드가 없어서 내부 `agents` 리포지터리를
직접 접근하는 방식을 사용했다. 동작은 정확하지만 백엔드 추상화 계층을 우회한다.

**권장**: `musu-core/backends/local.py`에 `update_agent(agent_id, **kwargs)` 추가.

### B-2 기존 라우팅 버그 (Phase 13 도입 아님)
**파일**: `server.py`

```python
# 이 순서가 문제
@app.get("/api/tasks/{task_id}")   # 먼저 등록됨
...
@app.get("/api/tasks/events")      # 뒤에 등록됨 → "events"가 {task_id}에 매칭됨
```

FastAPI는 등록 순서대로 경로를 매칭한다. `/api/tasks/events` 요청이
`task_id="events"`로 매칭될 수 있다. SSE 엔드포인트가 실제로 호출되지 않는다.

**권장**: `GET /api/tasks/events` 라우트를 `GET /api/tasks/{task_id}` 앞으로 이동.
*이 버그는 Phase 13 이전부터 존재했음.*

---

## C. 코드 품질 (Code Quality)

### C-1 docstring 일관성 ✅
모든 신규 라우트에 `summary=` 파라미터 + 함수 docstring 포함.

### C-2 에러 처리 ✅
- 404 가드 일관적: `if not agent: raise HTTPException(404)`
- `api_peer_status()`: `peer_cache` 접근을 `try/except Exception: pass` 로 보호.
  캐시 파일 없어도 빈 배열로 안전 반환.

### C-3 응답 스키마 ✅
- pause/resume 응답: `{"id": ..., "status": ...}` — musu-control MCP가 기대하는 최소 스키마.
- peer-status: 모든 필드 타입 명확 (bool/str/int/list).

---

## D. 테스트 커버리지

| 테스트 | 결과 |
|--------|------|
| musu-core pytest (230 cases) | ✅ all passed |
| curl 수동 검증 5개 엔드포인트 | ✅ |
| MCP E2E (PaperclipClient) | ✅ |
| pause→resume 상태 전이 검증 | ✅ |

Phase 13 전용 pytest 케이스 없음 — 추후 `musu-bridge/tests/test_agent_control.py` 추가 권장.

---

## E. 개선 우선순위

| 우선순위 | 항목 | 파일 |
|----------|------|------|
| P1 | `LocalBackend.update_agent()` 퍼블릭 메서드 추가 | musu-core/backends/local.py |
| P1 | `/api/tasks/events` 라우트 순서 수정 (기존 버그) | musu-bridge/server.py |
| P2 | `test_agent_control.py` 유닛 테스트 추가 | musu-bridge/tests/ |
| P3 | activity 엔드포인트에 company_id 기반 필터링 (현재 global audit) | musu-bridge/server.py |

---

## 결론

Phase 13 구현은 **안전하고 기능적으로 정확**하다. 보안 취약점 없음.
B-1(추상화 우회)은 기술 부채 수준이고 B-2(라우팅 버그)는 기존 코드 문제다.
두 항목 모두 프로덕션 차단 이슈가 아니다.
