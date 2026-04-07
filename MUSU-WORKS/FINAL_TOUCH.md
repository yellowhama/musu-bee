# MUSU-WORKS Final Touch

## 목적

canonical docs와 최종 앱 구현이 어긋나는 부분을 마지막에 닫는다.

## 체크 항목

### domain parity

- 회사 정의가 구현과 일치하는가
- 프로젝트 ownership이 구현과 일치하는가
- agent attachment 모델이 실제 데이터 구조와 일치하는가

### schema parity

- `company_id`가 필요한 엔티티에 전부 들어갔는가
- `project_id`와 migration path가 보존됐는가
- attachment/session persistence가 문서와 구현에서 일치하는가
- role template와 policy baseline 구조가 일치하는가

### UI parity

- company overview가 있는가
- org chart가 있는가
- role template plane이 있는가
- approvals queue가 있는가
- project overview가 company 모델과 연결돼 있는가
- attached agents / live sessions가 보이는가

### MCP parity

- `musu_company_*` read surface가 구현됐는가
- `musu_project_*` read surface가 구현됐는가
- role template / session read surface가 구현됐는가
- approval action surface가 닫혔는가

### runtime proof

- sample company가 실제로 보이는가
- sample project가 실제로 연결되는가
- approval queue가 비어 있지 않은 상태를 재현할 수 있는가
- attached agent와 live session이 보이는가
- isolation/runtime note가 viewer와 문서에서 일치하는가

## 산출물

- final parity checklist
- discrepancy list
- follow-up backlog

## final parity checklist

### domain parity

- [x] 회사는 orchestration owner로 정의됐다
- [x] 프로젝트는 execution owner로 정의됐다
- [x] agent는 company-owned identity, project-attached execution unit으로 정의됐다

### schema parity

- [x] `company_id` 상위 context 방향이 정리됐다
- [x] `project_id` migration path가 유지됐다
- [x] attachment/session persistence 방향이 정리됐다
- [x] role template / policy baseline 구조 방향이 정리됐다

### UI parity

- [x] company overview shape가 있다
- [x] org chart shape가 있다
- [x] role template plane이 있다
- [x] approvals queue shape가 있다
- [x] project overview와 company 연결 shape가 있다
- [x] attached agents / live sessions viewer shape가 있다
- [ ] 브라우저 시각 렌더링 최종 확인

### MCP parity

- [x] `musu_company_*` read surface 초안이 있다
- [x] `musu_project_*` read surface 초안이 있다
- [x] role template / session read surface 초안이 있다
- [ ] approval action surface의 original app alignment 최종 확인

### runtime proof

- [x] sample company fixture가 있다
- [x] sample project fixture가 있다
- [x] approval queue fixture가 있다
- [x] attached agent / live session fixture가 있다
- [x] HTTP 기반 viewer proof가 있다
- [ ] original app runtime과의 시각/실행 parity 최종 closure

## discrepancy list

- 원본 MUSU에는 아직 `company`, `role template`, `attachment`, `session`이 first-class model로 없다.
- root viewer는 HTTP proof까지는 확보됐지만 브라우저 시각 증거는 아직 없다.
- approval action surface는 canonical draft가 있으나, company-level queue projection과 original action endpoints의 최종 접착은 남아 있다.

## follow-up backlog

### immediate

- root viewer visual confirmation
- original app company read model proof
- approval queue projection 설계 확정

### later

- `human_principals`
- `company_memories`
- project policy override persistence
- company-aware desktop navigation backport

## 현재 결론

이 문서는 모든 기능이 끝난 다음 만드는 문서가 아니라, 최종 앱과 canonical docs의 차이를 닫는 마지막 정리 문서다.
