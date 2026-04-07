# PLAN 02: Persistence Schema Draft

## 목적

회사와 프로젝트 모델을 실제 DB/entity 수준으로 내린다.

## 입력

- [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- [plans/PLAN_01_COMPANY_DOMAIN_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_01_COMPANY_DOMAIN_MODEL.md)
- 원본 코드의 `project_id`, `audit`, `approval`, `workspace_root` 축

## 범위

1. `companies`
2. `company_agents`
3. `company_policies`
4. `company_capabilities`
5. `company_approvals`
6. `projects`
7. `project_agent_attachments`
8. `project_pipelines`
9. `project_runs`
10. `project_memories`

## 완료 조건

- 최소 테이블 목록이 고정돼 있다.
- foreign key 방향이 명확하다.
- 회사/프로젝트/agent attachment 관계가 모호하지 않다.
- 원본 코드의 `project_id`와 연결되는 migration path를 적어 둘 수 있다.
