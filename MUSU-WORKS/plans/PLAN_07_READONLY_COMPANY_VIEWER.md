# PLAN 07: Read-Only Company Viewer

## 목적

`MUSU-WORKS`의 문서와 mock fixtures를 사람이 바로 읽고 검증할 수 있는 read-only company viewer를 만든다.

## 왜 지금 하는가

현재는 domain, schema, UI, MCP, mock payload가 전부 문서와 JSON으로 흩어져 있다. 다음 단계로 넘어가기 전에, 이 canonical contract가 실제 화면 구조로 읽히는지 확인할 최소 viewer가 필요하다.

## 입력

- [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- [PERSISTENCE_SCHEMA_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/PERSISTENCE_SCHEMA_DRAFT.md)
- [UI_INFORMATION_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/UI_INFORMATION_ARCHITECTURE.md)
- [MCP_SURFACE_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/MCP_SURFACE_DRAFT.md)
- [mock/company_alpha.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/company_alpha.json)
- [mock/org_chart_alpha.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/org_chart_alpha.json)
- [mock/projects_alpha.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/projects_alpha.json)
- [mock/approvals_alpha.json](/home/hugh51/musu-functions/MUSU-WORKS/mock/approvals_alpha.json)

## 범위

### 1. company overview viewer

- header
- org health summary
- approvals summary
- active projects list

### 2. org chart viewer

- hierarchy tree 또는 grouped list
- role / status / reports_to 표시

### 3. approvals viewer

- pending approval list
- kind / target project / requester / summary 표시

### 4. projects viewer

- project cards
- workspace root
- status
- current pipeline stage

## 산출물

- read-only mock viewer 파일
- sample rendering screenshot or usage notes
- next-step notes for interactive version

## 완료 조건

- mock fixtures만으로 viewer가 렌더링된다.
- company / org / approvals / projects가 한 눈에 보인다.
- 이후 원본 desktop UI에 이식할 때 필요한 블록이 명확해진다.
