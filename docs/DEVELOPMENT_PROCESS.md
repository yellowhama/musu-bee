# MUSU 개발 프로세스 — 에이전트 팀 하네스

> 이 문서가 MUSU 개발 SSOT. 각 Phase는 이 프로세스를 따른다.

---

## 핵심 원칙 (Anthropic 하네스 이론 기반)

1. **생성자 ≠ 평가자** — Engineer가 구현, QA가 평가. self-eval 금지
2. **Sprint Contract 먼저** — "완료"를 구현 전에 명시
3. **Feature list (JSON)** — 세션 간 기억 상실 보완. passes 필드만 수정 가능
4. **루프 상한** — QA 실패 시 최대 3회 Engineer 재작업. 3회 후 에스컬레이션
5. **MUSU가 MUSU를 만든다** — musu-control MCP로 에이전트 팀에 위임

---

## 에이전트 팀 구성

| 에이전트 | 채널 | 역할 |
|---------|------|------|
| cto | `cto` | Sprint Contract 검토, 아키텍처 결정 |
| engineer | `engineer` | 기능 구현, 테스트 작성, 커밋 |
| qa | `qa` | 4기준 채점, pass/fail 반환 |
| cos | `cos` | 상태 추적, 문서 업데이트 |

---

## Phase 실행 순서

### 0. 세션 시작 오리엔테이션

새 세션 시작 시 반드시:

```
1. docs/MASTER_PLAN_2026-04-22.md 읽기 → 현재 Phase 확인
2. docs/phases/<phase_N>_feature_list.json 읽기 → 미완성 feature 확인
3. rtk git log --oneline -5 → 마지막 커밋 확인
4. musu-control: get_dashboard → 진행 중인 태스크 확인
```

### 1. Sprint Contract 작성

`/harness <task>` 실행 시:

```json
// .musu/sprint_contract_<timestamp>.json
{
  "phase": "Phase XX",
  "task": "<설명>",
  "scope": ["포함되는 것"],
  "out_of_scope": ["포함 안 되는 것 — 명시 필수"],
  "acceptance_criteria": [
    "<기준 1 — pass/fail 판정 가능>",
    "<기준 2>",
    "...최소 5개"
  ],
  "done_definition": "<한 문장으로 완료 정의>"
}
```

### 2. Engineer 에이전트 위임

```
musu-control → delegate_task(channel="engineer", instruction=<sprint_contract + feature_list>)
→ poll_tasks(task_id) until done
→ 결과 읽기
```

Engineer 위임 시 포함해야 하는 컨텍스트:
- Sprint Contract 전문
- Feature list 해당 항목
- 관련 파일 경로
- 테스트 실행 명령어

### 3. QA 에이전트 위임

```
musu-control → delegate_task(channel="qa", instruction=<sprint_contract + diff + test_results>)
→ poll_tasks(task_id) until done
→ qa_result.json 읽기
```

QA 채점 형식:
```json
{
  "pass": false,
  "scores": {
    "functionality": 8,
    "correctness": 6,
    "completeness": 7,
    "code_quality": 7
  },
  "feedback": "correctness: <구체적 문제>",
  "iteration": 1
}
```

**통과 기준: 모든 항목 7점 이상**

### 4. 재작업 루프

```
QA pass=false → Engineer에게 피드백 전달 → 재구현
최대 3회. 3회 실패 → 유저 에스컬레이션
동일 에러 3회 → 즉시 중단
```

### 5. Feature list 업데이트

```
통과한 feature의 passes → true
CoS에게: docs/phases/<phase>_feature_list.json 업데이트 위임
```

### 6. 완료 커밋

```bash
rtk git add <files>
rtk git commit -m "feat(phase-XX): <설명>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
rtk git push
```

---

## Feature List 규칙

> "feature를 삭제하거나 편집하는 것은 절대 허용되지 않는다. passes 필드만 수정 가능."

```json
{
  "phase": "Phase XX",
  "description": "...",
  "features": [
    {
      "id": "F001",
      "description": "...",
      "acceptance": ["기준1", "기준2"],
      "files": ["관련 파일들"],
      "passes": false
    }
  ]
}
```

---

## 현재 Phase 상태

| Phase | 상태 | Feature List |
|-------|------|-------------|
| Phase 49 (import 수정) | ✅ 완료 | — |
| Phase 50 (Paddle 사전) | ✅ 완료 | — |
| Phase 51 (Paddle 활성화) | ⏸ 크레덴셜 대기 | — |
| Phase 52 (VNC TTL) | ⬜ 대기 | `docs/phases/phase_52_feature_list.json` |
| Phase 53 (musu-core 테스트) | ⬜ 대기 | `docs/phases/phase_53_feature_list.json` |
| Phase 54A (Custom AI Company 백엔드) | ✅ 완료 | `docs/phases/phase_54a_feature_list.json` |
| Phase 57 (Company Scoping) | ✅ 완료 | — |

### Phase 57 요약 (Company Scoping, 2026-04-22)

- agents 테이블에 `company_id` 컬럼 추가 (Migration v14)
- 에이전트 해석: 회사 스코프 우선 → 글로벌(`company_id IS NULL`) 폴백
- 교차 회사 접근 차단 (get_by_name 보안 수정)
- `{short}-{role}` 네이밍: 템플릿에서 회사 에이전트 복제
- DelegateRequest, route_chat, route_message에 company_id 파라미터 추가
- heartbeat company_id 전달 수정
- 378 테스트 통과 (245 core + 133 bridge)
- 감사 문서: `docs/93_COMPANY_SCOPING_AUDIT_2026-04-22.md`
