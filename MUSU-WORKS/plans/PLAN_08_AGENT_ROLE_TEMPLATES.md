# PLAN 08: Agent Role Templates

## 목표

`GStack`식 역할 분리와 `PaperClip`식 회사 소유 구조를 합쳐, `MUSU-WORKS`의 회사 agent role template contract를 고정한다.

## 범위

- base roles 정의
- role fields 정의
- role-to-capability mapping 정의
- role-to-approval/policy mapping 정의

## 현재 truth

- 회사/프로젝트 상위 모델은 이미 문서화돼 있다.
- 원본 MUSU에는 `agent registry`, `proxy`, `mcp`, `actions` 축이 있다.
- 아직 `역할 템플릿`은 독립 문서로 고정되지 않았다.

## 입력 문서 / 코드

- [HOW_A_COMPANY_SHOULD_BE_BUILT.md](/home/hugh51/musu-functions/MUSU-WORKS/HOW_A_COMPANY_SHOULD_BE_BUILT.md)
- [PAPERCLIP_GSTACK_OPENCLAW_DEEP_DIVE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/PAPERCLIP_GSTACK_OPENCLAW_DEEP_DIVE_2026-04-01.md)
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/mcp.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs`

## 작업 목록

1. 필수 role 목록 확정
2. role fields와 ownership 규칙 정의
3. role별 capability/policy/approval 범위 정의
4. role 문서를 canonical doc로 고정
5. viewer/mock에 반영할 필드 식별

## 완료 기준

- [AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/AGENT_ROLE_TEMPLATES.md) 가 생성된다.
- 최소 6개 이상의 role template가 정의된다.
- role과 company/project/session 레이어의 관계가 명시된다.
- 다음 plan인 session model로 자연스럽게 이어진다.
