# Company Agent Memory Architecture

작성일: 2026-04-01

## 핵심 아이디어

`musu-indexer`의 `.musu_dev.db`와 검색/MCP surface를 `회사 -> 에이전트 -> 프로젝트` memory 체계에 연결하면 두 가지가 가능해진다.

1. 업무 안정성
2. 스스로 진화

## 왜 가능한가

현재 `/home/hugh51/musu-functions`에는 이미 다음 축이 있다.

- `musu-indexer`
  - SQLite FTS5 기반 `.musu_dev.db`
  - `search_codebase`, `sync_workspace`, `log_action`
- `MUSU-WORKS`
  - 회사/프로젝트/역할/세션 계약
- `references/openclaw-npm-*`
  - memory runtime / memory search / embedding provider / storage 관련 축

즉 memory를 0에서 상상할 필요가 없다. 이미:

- 인덱싱
- FTS 검색
- action log
- memory runtime 레퍼런스

가 있다.

## 제안 구조

### 1. Company Memory

회사 전체가 공유하는 운영 기억.

카테고리:

- `policy`
- `playbook`
- `role_handbook`
- `company_decisions`
- `capability_catalog`
- `audit_lessons`

용도:

- 모든 프로젝트의 공통 안정성 기준
- 신규 agent가 빠르게 기준을 상속
- 잘된 방식과 사고 대응 절차 축적

### 2. Agent Memory

각 agent 폴더와 역할에 묶인 장기 기억.

카테고리:

- `identity`
- `role`
- `skills`
- `preferences`
- `work_patterns`
- `failure_patterns`
- `improvement_notes`

용도:

- builder는 구현 습관 축적
- reviewer는 리스크 패턴 축적
- qa는 재현/검증 패턴 축적
- policy_officer는 승인/예외 패턴 축적

### 3. Project Memory

프로젝트별 실행 기억.

카테고리:

- `requirements`
- `decisions`
- `outputs`
- `artifacts`
- `runbooks`
- `known_issues`
- `local_conventions`

용도:

- 프로젝트마다 다른 규칙과 작업 문맥 유지
- 같은 프로젝트에서 다시 실행할 때 안정성 상승

### 4. Session Memory

세션 단기 scratchpad.

카테고리:

- `active_findings`
- `temporary_plan`
- `pending_questions`
- `work_trace`

용도:

- 현재 세션에만 필요한 임시 상태
- 종료 시 project/agent/company memory로 승격 가능

## 폴더 기반 mental model

에이전트마다 폴더를 두고 그 아래에 메모리를 주는 구조는 자연스럽다.

예:

```text
company/
  alpha-labs/
    memory/
      policy/
      playbook/
      decisions/
    agents/
      builder/
        identity/
        skills/
        work_patterns/
        failure_patterns/
      reviewer/
        identity/
        skills/
        review_patterns/
    projects/
      desktop-mcp/
        memory/
          requirements/
          decisions/
          outputs/
          issues/
        sessions/
          sess_desktop_build/
```

하지만 핵심은 파일 구조 그 자체보다, 이걸 `musu-indexer`가 `.musu_dev.db`로 읽어줘야 한다는 점이다.

## 인덱서와 연결하는 방법

### 현재 인덱서 truth

근거:

- [`musu-indexer/README.md`](/home/hugh51/musu-functions/musu-indexer/README.md)
- `src/musu_indexer/core.py`

현재 확인된 것:

- project root마다 `.musu_dev.db`
- SQLite FTS5
- `files` table
- `search_index` virtual table
- `log_action`

해석:

- 회사 root 또는 agent/project root를 하나의 index root로 잡을 수 있다.
- memory 문서는 일반 문서처럼 index 가능하다.
- category/path metadata를 더 넣으면 `policy`, `role`, `project`, `skill` 단위 검색이 가능하다.

## memory category 제안

### 회사 기준

- `company/policy`
- `company/playbook`
- `company/decision`
- `company/audit`

### 에이전트 기준

- `agent/identity`
- `agent/role`
- `agent/skill`
- `agent/pattern`
- `agent/improvement`

### 프로젝트 기준

- `project/requirement`
- `project/decision`
- `project/output`
- `project/issue`
- `project/runbook`

### 세션 기준

- `session/finding`
- `session/trace`
- `session/question`

## 왜 업무 안정성이 올라가나

### 1. 같은 실수를 반복하지 않음

failure pattern과 audit lesson이 role/agent/project memory로 축적되기 때문이다.

### 2. 역할별 기준이 고정됨

reviewer는 reviewer답게, qa는 qa답게 기억을 상속받는다.

### 3. 프로젝트 문맥 손실이 줄어듦

requirements, decisions, local conventions가 project memory에 남기 때문이다.

### 4. 승인과 정책이 explainable 해짐

왜 막혔는지, 어떤 예외가 허용됐는지가 company policy memory에 남기 때문이다.

## 왜 스스로 진화가 가능해지나

### 1. agent별 개선 노트 축적

각 agent가 자신만의 work pattern과 failure pattern을 누적할 수 있다.

### 2. session에서 project/agent/company memory로 승격

좋은 해결책은 장기 기억으로 승격하고, 나쁜 패턴은 경고 패턴으로 승격할 수 있다.

### 3. skill과 직업이 memory category를 결정

`builder`, `reviewer`, `qa`, `policy_officer` 같은 직업/역할이 memory selection rule을 만들 수 있다.

## 권장 데이터 모델

### 최소 테이블 후보

- `company_memories`
- `agent_memories`
- `project_memories`
- `session_memories`
- `memory_promotions`

### 최소 필드

- `id`
- `scope_kind`
- `scope_id`
- `category`
- `title`
- `content`
- `source`
- `importance`
- `created_at`
- `updated_at`

추가 후보:

- `embedding_ref`
- `search_tags`
- `promoted_from_session_id`

## 인덱서와 DB 전략

### 전략 A. 파일 우선 + 인덱서 동기화

- memory를 폴더/파일로 보관
- `musu-indexer`가 `.musu_dev.db`에 색인

장점:

- 단순함
- 사람도 바로 읽을 수 있음

### 전략 B. 앱 DB 우선 + 인덱서 projection

- app DB가 canonical
- indexer가 search projection만 관리

장점:

- 정규화 쉬움
- UI/MCP와 연결 쉬움

권장:

- 초기엔 A
- 제품화 단계에서 B 또는 hybrid

## 현재 결론

회사를 중심으로:

- company memory
- agent memory
- project memory
- session memory

를 카테고리화해서 주고, 이를 `musu-indexer`와 연결하면:

- 업무 안정성
- 자기 개선
- 역할별 일관성

이 실제로 가능해진다.
