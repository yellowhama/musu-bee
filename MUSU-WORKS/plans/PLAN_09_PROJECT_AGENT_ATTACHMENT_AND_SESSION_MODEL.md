# PLAN 09: Project Agent Attachment And Session Model

## 목표

회사 소속 agent가 프로젝트에 attach 되고 실제 session runtime으로 동작하는 방식을 canonical contract로 고정한다.

## 범위

- company-owned agent identity
- project attachment
- session lifecycle
- channel/runtime/mode model
- audit/approval touchpoints

## 현재 truth

- 원본 MUSU에는 agent registry, proxy, MCP route, action route가 있다.
- `project_id`와 audit/action 기록 축이 이미 존재한다.
- 외부 reference로 OpenClaw의 session/runtime 관점이 확보됐다.

## 입력 문서 / 코드

- [AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/AGENT_ROLE_TEMPLATES.md)
- [PERSISTENCE_SCHEMA_DRAFT.md](/home/hugh51/musu-functions/MUSU-WORKS/PERSISTENCE_SCHEMA_DRAFT.md)
- [PAPERCLIP_GSTACK_OPENCLAW_DEEP_DIVE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/PAPERCLIP_GSTACK_OPENCLAW_DEEP_DIVE_2026-04-01.md)
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/agents.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/proxy.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/mcp.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/src/crates/musu-prime/src/api/routes/actions.rs`

## 작업 목록

1. agent identity / attachment / session 엔티티 구분
2. attachment 상태 정의
3. session 상태 정의
4. channel/runtime/mode 정의
5. audit/approval integration point 정의
6. mock/viewer 반영 대상 식별

## 완료 기준

- [PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md) 가 생성된다.
- company/project/session 책임 경계가 명확해진다.
- session runtime을 original app backport와 연결할 anchor가 문서화된다.
- 다음 mock/viewer 확장 플랜을 정의할 수 있다.
