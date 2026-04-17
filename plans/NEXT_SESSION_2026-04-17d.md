# 다음 세션 TODO — Phase 14+15 완료 후 (2026-04-17d)

> 작성: 2026-04-17 | Phase 14+15 musu-control MCP 완전 연결 완료 기준

---

## 현재 스택 상태

| 서비스 | 상태 | 포트 |
|--------|------|------|
| musu-bridge | ✅ running | :8070 |
| musu-control MCP | ✅ 35도구 전원 연동 | Claude Code |
| musu-port | ✅ running | :1355 |
| musu-bee | 확인 필요 | :3001 |

---

## 완료된 것들 (이번 세션)

- ✅ SPEC-167: issues/issue_comments 테이블 + LocalBackend 14개 메서드
- ✅ SPEC-168: musu-bridge 17개 신규 라우트 (issues, heartbeat-runs, approvals, projects, goals, costs)
- ✅ SPEC-169: test_agent_control.py 26 cases (전 통과)
- ✅ P0 기술 부채: LocalBackend.update_agent() + set_agent_status() 리팩토링
- ✅ LLM wiki 76번, musu-specs SPEC-167~169 업데이트
- ✅ commit + push (3 커밋)

---

## P0 — 즉시 해야 할 것

### 1. musu-control MCP 전체 도구 실 동작 확인
이제 모든 엔드포인트가 구현됐으므로 실제 MCP 도구 호출 테스트가 필요.

```bash
# 브리지 살아있나
curl -s http://localhost:8070/health

# 에이전트 목록
TOKEN=$(cat ~/.musu/bridge_token)
curl -s http://localhost:8070/api/agents -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; a=json.load(sys.stdin); print(len(a),'agents')"

# Issues 생성 → 조회 → checkout → 댓글 E2E
COMPANY_ID="f27a9bd2-688a-450b-98b4-f63d24b0ab50"
ISSUE_ID=$(curl -s -X POST "http://localhost:8070/api/companies/$COMPANY_ID/issues" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Production bug","priority":"critical"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Created issue: $ISSUE_ID"
curl -s "http://localhost:8070/api/issues/$ISSUE_ID" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### 2. musu-control MCP 도구 직접 호출 검증
```bash
# Claude Code에서
# list_issues(company_id="f27a9bd2-688a-450b-98b4-f63d24b0ab50")
# create_issue(company_id=..., title="test", priority="medium")
# get_costs_summary(company_id=...)
# list_approvals(company_id=...)
```

---

## P1 — 이번 주 안에

### 3. route_executions company_id 필터링 (비용 멀티 테넌트 지원)
**현재 문제**: `get_costs_summary(company_id)` / `get_costs_by_agent(company_id)` 가
company_id를 무시하고 전역 집계 반환 (route_executions에 company_id 없음).

**옵션 A**: route_executions에 company_id 컬럼 추가 + migration
**옵션 B**: channel → agent → company 역추적 JOIN
**권장**: 옵션 A (단순, 명확)

```sql
-- migration
ALTER TABLE route_executions ADD COLUMN company_id TEXT;
```

### 4. MUSU_TOKEN 활성화 + peer-status 검증
musu.pro에서 토큰 발급 → `~/.musu/bridge_token` 설정 → peer discovery 동작 확인

### 5. Plan 232 — Workspace Registry Followthrough
- 실제 workspace object 서버 백업
- selected company → app action 전파
- `paperclip-phase5-status.md` 참고

---

## P2 — 다음 스프린트

### 6. musu-connects SyncOrchestrator 통합 완성
- `main.rs`에 SyncOrchestrator 연결 (bridge_proxy.rs에는 이미 연결됨)
- QUIC peer discovery → SyncOrchestrator 피어 목록 자동 공급
- E2E: 2-node sync 테스트 (로컬 + hugh-main-1)

### 7. Issues 필터 테스트 + IssueCreateRequest status 옵션
감사에서 발견된 미커버 케이스:
- `GET /api/companies/{id}/issues?status=open&assignee_id=xxx` 실제 필터 동작
- IssueCreateRequest에 status 필드 추가 여부 결정

### 8. activity 엔드포인트 company_id 필터링
현재 global audit log 반환. company_id 기반 필터 구현 필요.
옵션 A: audit 테이블에 company_id 추가
옵션 B: route_execution의 channel → agent → company 역추적

---

## 체크 커맨드

```bash
# 브리지 상태
curl -s http://localhost:8070/health

# 에이전트 14개 있나
TOKEN=$(cat ~/.musu/bridge_token)
curl -s http://localhost:8070/api/agents -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(len(json.load(sys.stdin)), 'agents')"

# 전체 엔드포인트 smoke test
COMPANY_ID="f27a9bd2-688a-450b-98b4-f63d24b0ab50"
for path in "issues" "approvals" "projects" "goals" "costs/summary" "costs/by-agent" "heartbeat-runs" "activity"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8070/api/companies/$COMPANY_ID/$path" -H "Authorization: Bearer $TOKEN")
  echo "$STATUS $path"
done

# musu-core 테스트
musu-bridge/.venv/bin/python3 -m pytest musu-bridge/tests/ musu-core --tb=no -q
```

---

## 감사 이슈 트래킹

| 이슈 | 우선순위 | 상태 |
|------|----------|------|
| route_executions company_id 필터링 | P1 | ❌ 미구현 |
| checkout_issue rowcount 명시화 | P3 | 기술 부채 |
| list_issues 필터 E2E 테스트 | P2 | ❌ 미구현 |
| goals 실제 DB 테이블 (현재 stub) | P3 | 결정 필요 |
