# PLAN 16: Scaffolding Preset Contract

## 목표

`회사 -> 프로젝트 -> 에이전트 -> memory` 구조를 한 번에 생성할 수 있는 preset contract를 문서 수준으로 고정한다.

## 범위

- preset 종류 정의
- 필수 디렉터리 구조 정의
- preset metadata 정의
- indexer 연결 포인트 정의

## 현재 truth

- 회사/프로젝트/역할/세션/memory architecture 문서는 있다.
- 하지만 실제로 생성 가능한 preset contract는 아직 없다.

## 입력 문서

- [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- [AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/AGENT_ROLE_TEMPLATES.md)
- [PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
- [COMPANY_AGENT_MEMORY_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/COMPANY_AGENT_MEMORY_ARCHITECTURE.md)

## 작업 목록

1. preset tiers 정의
2. 디렉터리 구조 정의
3. preset metadata 정의
4. indexer root 규칙 정의
5. canonical preset 문서화

## 완료 기준

- [SCAFFOLDING_PRESET_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-WORKS/SCAFFOLDING_PRESET_ARCHITECTURE.md) 가 생성된다.
- 최소 3개 preset tier가 정의된다.
- filesystem + memory + indexer 관점이 함께 정리된다.
