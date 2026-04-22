# 코드 감사 — Phase 57 Company Scoping — 2026-04-22

> 작성: 2026-04-22 | Phase 57 company_id 스코핑 구현 완료 후 전체 감사

---

## 변경 요약

Phase 57은 에이전트 시스템에 회사(company) 단위 격리를 도입한다. 모든 에이전트에 `company_id` 컬럼이 추가되고, 에이전트 해석(resolution) 시 회사 범위 우선 → 글로벌 폴백 순서를 따른다. 회사 간 에이전트 접근은 차단된다.

---

## 수정된 P1 이슈

### P1-1: heartbeat company_id 누락

- **문제**: `invoke_heartbeat`에서 company_id를 전달하지 않아 하트비트가 항상 글로벌 에이전트로 해석됨
- **영향**: 회사별 에이전트가 있어도 하트비트 활동이 글로벌 에이전트에 기록됨
- **수정**: heartbeat 호출 시 active workspace의 `company_id`를 전달하도록 변경
- **검증**: 회사 컨텍스트에서 하트비트 실행 → 해당 회사 에이전트로 정확히 라우팅 확인

### P1-2: get_by_name 보안 수정 (교차 회사 접근 차단)

- **문제**: `get_by_name` 폴백 로직이 다른 회사의 에이전트를 반환할 가능성 존재
- **영향**: 회사 A의 요청이 회사 B의 에이전트 정보를 받을 수 있음 (정보 유출)
- **수정**: 폴백은 `company_id IS NULL` (글로벌/템플릿)만 허용. 다른 회사 에이전트 접근 완전 차단
- **검증**: 교차 회사 해석 테스트 → 404 반환 확인

---

## 변경 파일

| 파일 | 변경 유형 | 핵심 변경 |
|------|----------|----------|
| `musu-core/migrations.py` | 스키마 | v14: agents.company_id 컬럼 + 인덱스 |
| `musu-core/agents.py` | 로직 | AgentRegistry에 company_id 지원, get_by_name 보안 수정 |
| `musu-core/router.py` | 로직 | route_chat/route_message에 company_id 파라미터 추가 |
| `musu-core/backend_abc.py` | 인터페이스 | BackendABC에 company_id 파라미터 추가 |
| `musu-core/local_backend.py` | 구현 | LocalBackend company_id 필터링 구현 |
| `musu-bridge/server.py` | API | DelegateRequest.company_id, /api/companies/{id}/agents |
| `musu-control/server.py` | MCP | delegate_task, list_agents에 company_id 파라미터 |

---

## 남은 P2 항목

| 항목 | 우선순위 | 설명 | 예상 공수 |
|------|---------|------|----------|
| seed_agents.py 업데이트 | P2 | 시드 스크립트가 템플릿 에이전트를 올바르게 생성하도록 수정 | 30분 |
| 대시보드 필터링 | P2 | vibecode-town 대시보드에서 active company로 필터링 | 2시간 |
| 삭제 정책 | P2 | 회사 삭제 시 에이전트 cascade 동작 정의 | 1시간 |
| 에이전트 이전 | P3 | 회사 간 에이전트 이동 (현재 필요 없음) | — |

---

## 테스트 결과

```
musu-core:   245/245 pass (2026-04-22)
musu-bridge: 133/133 pass (2026-04-22)
합계:        378/378 pass
```

주요 테스트 커버리지:
- 회사 생성 + 템플릿 에이전트 복제
- 에이전트 해석: 회사 우선 → 글로벌 폴백
- 교차 회사 접근 차단 (보안)
- heartbeat 회사 컨텍스트 전달
- `{short}-{role}` 네이밍 규칙

---

## 다음 Phase 권장사항

### 즉시 실행 가능 (P2)
1. `seed_agents.py`를 v14 스키마에 맞게 업데이트 — 기존 시드 데이터가 `company_id = NULL`로 들어가도록 명시
2. vibecode-town 대시보드에 company 필터 드롭다운 추가 — `GET /api/companies` → 선택 → workspace PUT

### 중기 (Phase 58+)
3. 회사 삭제 API + cascade 정책 — `DELETE /api/companies/{id}` → 소속 에이전트 일괄 삭제 or soft-delete
4. 에이전트 CRUD UI — vibecode-town에서 회사별 에이전트 추가/수정/삭제

### 장기
5. 에이전트 권한 세분화 — 회사 내에서도 역할별 접근 제어 (admin vs member)
6. 회사 간 에이전트 공유 모델 — 마켓플레이스형 (필요 시)

---

## 결론

Phase 57 company scoping은 보안 우선 설계로 구현되었다. P1 이슈 2건 (heartbeat, 교차 회사 접근) 모두 수정 완료. 378개 테스트 전체 통과. 에이전트 해석 로직은 회사 → 글로벌 폴백만 허용하며, 회사 간 정보 유출 경로는 차단되었다. P2 항목은 기능 완성도 개선이며 보안 리스크 없음.
