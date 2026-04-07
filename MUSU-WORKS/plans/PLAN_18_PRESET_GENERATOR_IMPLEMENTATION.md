# PLAN 18: Preset Generator Implementation

## 목표

`회사 -> 프로젝트 -> 에이전트 -> memory` 스캐폴딩을 문서와 mock tree에서 끝내지 않고, 실제로 반복 생성 가능한 generator로 내린다.

## 범위

- preset generator CLI 스크립트
- `minimal_company`, `delivery_team`, `research_rd` preset tier 지원
- company / agent / project / memory / runtime / policy / approval / indexer manifest 생성
- example preset 출력 디렉터리 생성

## 현재 truth

- [SCAFFOLDING_PRESET_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/SCAFFOLDING_PRESET_ARCHITECTURE.md) 에 preset contract가 있다.
- [plans/PLAN_16_SCAFFOLDING_PRESET_CONTRACT.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_16_SCAFFOLDING_PRESET_CONTRACT.md) 와 [plans/PLAN_17_SCAFFOLDING_PRESET_MOCKS.md](/home/hugh51/musu-functions/MUSU-WORKS/plans/PLAN_17_SCAFFOLDING_PRESET_MOCKS.md) 는 완료됐다.
- `delivery-team-alpha` sample tree는 있지만, 반복 생성기는 아직 없다.

## 입력 문서

- [SCAFFOLDING_PRESET_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/SCAFFOLDING_PRESET_ARCHITECTURE.md)
- [AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/AGENT_ROLE_TEMPLATES.md)
- [PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
- [COMPANY_AGENT_MEMORY_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_AGENT_MEMORY_ARCHITECTURE.md)

## 작업 목록

1. generator 입력 contract 정의
2. preset tier별 role / project defaults 고정
3. company / agent / project / memory tree 생성 로직 구현
4. example preset 3종 생성
5. 문서 status와 실행 보드 갱신

## 완료 기준

- `MUSU-WORKS` 안에 preset generator 스크립트가 추가된다.
- `minimal-company-alpha`, `delivery-team-alpha`, `research-rd-alpha` example preset이 존재한다.
- example manifest JSON이 파싱 가능하다.
- 마스터 플랜과 TODO 보드가 generator 기준으로 갱신된다.
