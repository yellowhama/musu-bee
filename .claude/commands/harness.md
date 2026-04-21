---
description: Run MUSU harness pipeline — CEO assigns task → CTO writes Sprint Contract → Engineer implements → QA scores (max 3 iterations)
argument-hint: Task description to assign
allowed-tools: ["Task", "Bash", "Read", "Write", "Edit", "mcp__musu-control__delegate_task", "mcp__musu-control__get_task_status", "mcp__musu-control__list_tasks"]
---

# /harness — MUSU 하네스 파이프라인

$ARGUMENTS 를 태스크로 받아 전체 CEO→CTO→Engineer→QA 파이프라인을 실행한다.

## 실행 순서

### 1. 준비

```bash
# 현재 상태 확인
rtk git status
rtk git log --oneline -5
```

docs/ 폴더가 있으면 아키텍처 문서를 먼저 읽는다:
- `docs/ARCHITECTURE.md` (있으면)
- `docs/ADR/` (있으면)
- `CLAUDE.md` (현재 폴더)

### 2. Sprint Contract 작성 (CTO 역할)

구현 전 **반드시** Sprint Contract를 작성한다. 파일로 저장:

```
.musu/sprint_contract_<timestamp>.json
```

형식:
```json
{
  "task": "<task description>",
  "scope": ["<what IS included>"],
  "out_of_scope": ["<what is NOT included>"],
  "acceptance_criteria": [
    "<criterion 1 — testable>",
    "<criterion 2 — testable>"
  ],
  "done_definition": "<one sentence — what does 'done' mean exactly>"
}
```

기준 작성 원칙:
- 각 기준은 pass/fail 판정 가능해야 함
- "잘 작동한다" ❌ → "GET /api/agents 200 반환 + items 배열 포함" ✅
- 최소 5개, 복잡한 태스크는 10개 이상

### 3. 구현 (Engineer 역할)

TDD 순서:
1. 테스트 먼저 작성 (red)
2. 최소 구현 (green)
3. 리팩터

Sprint Contract의 done_definition을 달성하면 커밋:
```bash
rtk git add <files>
rtk git commit -m "feat: <description>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### 4. QA 채점 (QA Lead 역할)

Sprint Contract 기준으로 4항목 채점:

| 항목 | 설명 |
|------|------|
| functionality | 기능이 의도대로 동작하는가 |
| correctness | 엣지케이스, 에러핸들링이 올바른가 |
| completeness | Sprint Contract 전 항목이 충족되는가 |
| code_quality | 코드 품질, 가독성, 패턴 일관성 |

각 항목 1~10점. **모든 항목 7점 이상이어야 통과**.

결과 파일 저장:
```
.musu/qa_result_<timestamp>.json
```

형식:
```json
{
  "pass": false,
  "scores": {
    "functionality": 8,
    "correctness": 6,
    "completeness": 7,
    "code_quality": 7
  },
  "feedback": "correctness: <구체적 문제 설명>",
  "iteration": 1
}
```

### 5. 재작업 루프

QA pass=false이면 피드백을 기반으로 Engineer가 수정.
**최대 3회** 반복. 3회 후에도 실패 시 → 중단하고 유저에게 에스컬레이션.

동일 에러 3회 반복 → 즉시 중단, 유저에게 보고.

### 6. 완료

QA pass=true이면:
```bash
rtk git log --oneline -3
```
결과 요약 출력.

## 출력 형식

완료 시:
```
✅ harness complete
  task: <task>
  iterations: <N>/3
  scores: functionality=X correctness=X completeness=X code_quality=X
  commits: <commit hashes>
```

실패 시:
```
❌ harness failed after <N> iterations
  blocker: <reason>
  last scores: ...
```
