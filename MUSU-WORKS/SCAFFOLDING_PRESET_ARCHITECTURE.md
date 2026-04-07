# Scaffolding Preset Architecture

작성일: 2026-04-01

## 목적

`회사 -> 프로젝트 -> 에이전트 -> memory -> runtime` 구조를 매번 손으로 만들지 않도록, MUSU용 스캐폴딩 프리셋의 canonical shape를 고정한다.

## 왜 필요한가

현재까지 문서화된 구조는 충분히 강하지만, 실제 사용 단계에선 아래를 한 번에 만들어줘야 한다.

- 회사 기본 폴더
- 프로젝트 작업공간
- 에이전트 역할 템플릿
- 메모리 카테고리 폴더
- 초기 mock/seed 데이터
- indexer 연결 포인트
- autonomous runtime state

이게 preset으로 없으면 초기 세팅 비용이 높고, 회사마다 구조가 흔들린다.

## preset이 만들어야 하는 것

### 1. Company Skeleton

- `company.yaml` 또는 `company.json`
- `memory/`
- `agents/`
- `projects/`
- `policies/`
- `playbooks/`
- `approvals/`
- `runtime/`

### 2. Agent Skeleton

각 agent role별로:

- `identity/`
- `skills/`
- `work_patterns/`
- `failure_patterns/`
- `improvement_notes/`

### 3. Project Skeleton

각 project별로:

- `workspace/`
- `memory/requirements/`
- `memory/decisions/`
- `memory/outputs/`
- `memory/issues/`
- `sessions/`
- `artifacts/`

### 4. Indexer Hooks

- `.musu_dev.db`가 붙을 root
- category metadata rule
- sync 대상 경로

### 5. Runtime Skeleton

- `runtime/contract.json`
- `runtime/queue_items.json`
- `runtime/lane_states.json`
- `runtime/worker_results.json`
- `runtime/handoff_queue.json`
- `runtime/blockers.json`
- `runtime/governance_reviews.json`

## preset 계층

### preset A. Minimal Company

목적:

- 빠른 회사 부트스트랩
- 회사 1개, 프로젝트 1개, 에이전트 3개

포함:

- `ceo`
- `builder`
- `reviewer`

### preset B. Delivery Team

목적:

- 실제 소프트웨어 작업용

포함:

- `ceo`
- `engineering_manager`
- `builder`
- `reviewer`
- `qa`
- `policy_officer`

### preset C. Research / R&D Team

목적:

- 탐색과 실험 중심

포함:

- `ceo`
- `research_lead`
- `builder`
- `design_partner`
- `qa`

## directory 예시

```text
alpha-labs/
  company.json
  memory/
    policy/
    playbook/
    decisions/
    audit_lessons/
  runtime/
    contract.json
    queue_items.json
    lane_states.json
    worker_results.json
    handoff_queue.json
    blockers.json
    governance_reviews.json
  agents/
    ceo/
      identity/
      skills/
      work_patterns/
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
      project.json
      workspace/
      memory/
        requirements/
        decisions/
        outputs/
        issues/
      sessions/
      artifacts/
```

## preset metadata

preset은 최소 아래를 가져야 한다.

- `preset_id`
- `display_name`
- `company_type`
- `default_roles`
- `default_project_types`
- `default_memory_categories`
- `default_policy_profiles`
- `default_indexer_roots`
- `default_runtime_lanes`

## 현재 코드와의 연결

### MUSU-WORKS

- 회사/프로젝트/역할/세션 계약이 이미 있다.
- 따라서 preset은 그 계약을 filesystem/seed 형태로 concretize 하면 된다.

### musu-indexer

- `musu-indexer`는 `.musu_dev.db`와 FTS5 search를 제공한다.
- preset은 indexer가 읽기 좋은 path/category shape를 같이 만들어야 한다.

### original MUSU

- backport 전에도 preset은 독립적으로 쓸 수 있다.
- 나중에 company/project read model이 생기면 preset metadata를 import할 수 있다.

## 구현 우선순위

1. preset contract 문서화
2. sample preset 파일 구조 mock 생성
3. seed manifest 정의
4. indexer category mapping 정의
5. 이후 CLI/scaffold command 고려

## 현재 결론

스캐폴딩 프리셋은 선택 기능이 아니라, 회사 모델을 반복 가능하게 만드는 핵심이다.

좋은 preset이 있으면:

- setup 비용이 줄고
- memory 구조가 흔들리지 않고
- indexer와 연결이 쉬워지고
- 업무 안정성과 자기 진화가 빨라진다.
