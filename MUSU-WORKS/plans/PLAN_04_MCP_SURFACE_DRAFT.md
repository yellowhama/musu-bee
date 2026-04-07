# PLAN 04: MCP Surface Draft

## 목적

회사와 프로젝트 모델을 external consumer가 읽을 수 있는 MCP surface 후보로 정리한다.

## 입력

- [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- 기존 MUSU self-MCP 문서와 naming style

## 범위

- `musu_company_list`
- `musu_company_get_overview`
- `musu_company_get_org_chart`
- `musu_company_list_agents`
- `musu_company_list_capabilities`
- `musu_company_list_approvals`
- `musu_project_list`
- `musu_project_get_overview`
- `musu_project_list_attached_agents`
- `musu_project_list_pipelines`
- `musu_project_execute_approval_action`

## 완료 조건

- 최소 read surface가 정리돼 있다.
- 회사와 프로젝트의 read boundary가 명확하다.
- approval action이 어느 레벨에서 일어나는지 명확하다.
