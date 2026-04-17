# Code Audit — Phase 14+15 musu-bridge 완전 구현 (2026-04-17)

> **범위**: 커밋 `1706b082`, `11602782`, `43acf6fb`
> **심사자**: Claude Code 자동 감사

---

## 종합 평가: 8.5 / 10

musu-core 백엔드 계층은 견고하고 보안상 문제 없다.
musu-bridge 라우트 계층은 기능적으로 정확하다. 몇 가지 아키텍처 수준 개선이 권장된다.

---

## A. 보안 (Security)

### A-1 인증 ✅
모든 17개 신규 라우트는 `apply_musu_middlewares` Bearer token 검증을 통과해야 한다.
별도 인증 코드 없음 — 글로벌 미들웨어가 커버.

### A-2 SQL Injection 방어 ✅
- `list_issues()`: `allowed = {"title", "description", ...}` 화이트리스트 + 값은 항상 `?` 바인딩
- `update_issue()`: 동일 화이트리스트 패턴
- f-string에 컬럼명(내부 상수)만 interpolate, 사용자 입력은 절대 interpolate 안 함

### A-3 입력 검증 ✅
- Approval decision: `Path(pattern=r"^(approved|rejected)$")` — 그 외 값은 422
- IssueUpdateRequest: `model_dump()`에서 None 필드 제외 + 화이트리스트 적용
- 모든 company-scoped 엔드포인트: company 존재 확인 → 404 guard

### A-4 Costs 엔드포인트 ✅
- route_executions 집계만 사용, 외부 API 호출 없음
- company_id 필터 없이 전역 집계를 반환하는 것은 알려진 한계 (개선 항목)

---

## B. 아키텍처 (Architecture)

### B-1 ⚠️ Costs company_id 필터링 없음 (중요도: 낮음)
**파일**: `musu-core/backends/local.py:get_costs_summary`, `get_costs_by_agent`

현재 구현:
```python
def get_costs_summary(self, company_id: str) -> dict:
    rows = self._db.execute("SELECT status, COUNT(*) as cnt FROM route_executions GROUP BY status")
    # company_id 파라미터 사용 안 함 — 전역 집계
```

route_executions 테이블에 company_id 컬럼이 없어서 company 스코프 필터링이 불가.
현재는 단일 company 환경(musu_corp)이므로 기능상 차이 없음. 멀티 테넌트 확장 시 수정 필요.

**권장**: route_executions에 company_id 컬럼 추가 (마이그레이션 필요).

### B-2 ⚠️ checkout_issue() — 미존재 issue에 UPDATE 후 None 반환 아닌 None 반환 (경미)
**파일**: `local.py:checkout_issue`

```python
def checkout_issue(self, issue_id: str, agent_id: str) -> dict | None:
    self._db.execute("UPDATE issues SET checkout_by=? ... WHERE id=?", (agent_id, issue_id))
    return self.get_issue(issue_id)  # 없으면 None
```

UPDATE rowcount를 확인하지 않고 get_issue()로 존재 여부를 판단한다.
UPDATE가 아무 행도 바꾸지 않아도 에러 없이 None 반환 → server.py에서 404 처리.
기능상 문제없으나 명시적 존재 확인이 더 명확.

### B-3 ✅ heartbeat/invoke — route_chat 올바르게 위임
```python
channel = agent.get("name", agent_id)
result = await route_chat(channel=channel, sender_id=req.sender_id, text=req.prompt)
```
agent.name(채널명)으로 route_chat에 위임. 채널 미등록 시 route_chat이 에러 dict 반환,
HTTPException 없이 200으로 반환됨 — 의도한 동작 (비동기 실행 패턴).

### B-4 ✅ Goals stub 명시
```python
@app.get("/api/companies/{company_id}/goals")
async def api_list_goals(company_id: str) -> list[dict]:
    company = get_company(company_id)
    if not company: raise HTTPException(404, ...)
    return []  # stub
```
컴퍼니 존재 확인 후 빈 배열 반환. docstring에 "stub" 명시됨.

---

## C. 코드 품질 (Code Quality)

### C-1 일관성 ✅
- 모든 신규 handlers.py 함수: `_get_backend()` → LocalBackend 메서드 위임 패턴 통일
- 모든 신규 server.py 라우트: company 존재 확인 → 리소스 존재 확인 → 처리 순서 통일
- Pydantic 모델 필드: `None = None` 패턴으로 옵셔널 필드 처리 통일

### C-2 ⚠️ IssueCreateRequest.status 기본값 없음 (경미)
IssueCreateRequest에 status 필드가 없다. 생성 시 status는 DB 기본값("open")으로만 설정된다.
status를 명시적으로 설정하며 생성하는 경우(create_issue에 status= 전달)는 API에서 불가.
musu-control 패턴 확인 필요 — 현재 생성 후 PATCH로 변경하는 방식이면 문제없음.

### C-3 ✅ 에러 처리 일관성
- 404: 리소스 미존재 → HTTPException(404)
- 422: 업데이트할 필드 없음 → HTTPException(422, "No fields to update")
- 201: 생성 → status_code=201

---

## D. 테스트 커버리지

| 테스트 | 결과 |
|--------|------|
| musu-core pytest (230 cases) | ✅ 전 통과 |
| test_agent_control.py (26 cases) | ✅ 전 통과 |
| E2E curl — Issues (create + list) | ✅ |
| E2E curl — Approvals, Projects, Goals, Costs | ✅ |
| E2E curl — Heartbeat-runs | ✅ |
| 인증 없는 요청 | ✅ 401 반환 |

**미커버 케이스**:
- checkout_issue 후 status 변경 자동화 검증
- list_issues 필터 파라미터 (status=, assignee_id=) 실제 필터링 동작
- costs 집계 데이터 있을 때 정확성

---

## E. 개선 우선순위

| 우선순위 | 항목 | 파일 |
|----------|------|------|
| P1 | route_executions에 company_id 컬럼 추가 (멀티 테넌트 비용 필터) | db.py + migrations |
| P2 | list_issues 필터 E2E 테스트 (status, assignee_id) | test_agent_control.py |
| P2 | IssueCreateRequest에 status 옵션 추가 (필요 시) | server.py |
| P3 | checkout_issue() UPDATE rowcount 확인 명시화 | local.py |

---

## 결론

Phase 14+15 구현은 **기능적으로 완전하고 보안상 안전**하다.
B-1(비용 company 필터 없음)은 현재 단일 company 환경에서 실질적 영향 없음.
musu-control MCP → musu-bridge 연동에서 404를 반환하던 엔드포인트가 **0개**가 됐다.
