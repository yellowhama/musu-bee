# PLAN 10: Role And Session Aware Mocks

## 목표

기존 `MUSU-WORKS` mock fixture를 정적 company/org/project 수준에서 멈추지 않고, role template, project attachment, active session, isolation/runtime 메타데이터를 포함하는 canonical mock set으로 확장한다.

## 범위

- role template fixture 추가
- project attachment/session fixture 추가
- company/project summary counts 갱신
- MCP example payload에 role/session-aware fields 반영

## 현재 truth

- 회사/프로젝트/승인/org chart mock은 이미 있다.
- 역할 템플릿 문서와 attachment/session 문서는 추가됐다.
- viewer는 아직 role/session 없는 정적 control plane에 가깝다.

## 입력 문서

- [AGENT_ROLE_TEMPLATES.md](/home/hugh51/musu-functions/MUSU-WORKS/AGENT_ROLE_TEMPLATES.md)
- [PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md](/home/hugh51/musu-functions/MUSU-WORKS/PROJECT_AGENT_ATTACHMENT_AND_SESSION_MODEL.md)
- [PAPERCLIP_GSTACK_OPENCLAW_DEEP_DIVE_2026-04-01.md](/home/hugh51/musu-functions/MUSU-WORKS/PAPERCLIP_GSTACK_OPENCLAW_DEEP_DIVE_2026-04-01.md)

## 작업 목록

1. role template fixture 추가
2. project attachment/session fixture 추가
3. company/project mock에 summary counts 반영
4. mcp surface examples에 role/session fields 반영
5. root viewer가 읽을 수 있도록 데이터 shape 고정

## 완료 기준

- 새로운 mock file들이 추가된다.
- 기존 mock company/project payload가 role/session summary를 포함한다.
- viewer 확장에 필요한 필드가 모두 fixture에 들어 있다.

