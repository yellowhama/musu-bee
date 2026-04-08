# Detail Plan — Skill Marketplace + Governance (gstack/openclaw pattern) (2026-04-09)

레퍼런스:
- `references_AI/gstack` (역할 기반 운영 스킬)
- `references_AI/openclaw-full` (CODEOWNERS/제한구역/수정 표면 규율)

## Goal

MUSU 운영에서 “누구나 맡아도 안전하게” 되게 만드는 규칙을 명문화/자동화한다.

## Scope

- restricted surfaces 정의(예: credentials, auth boundary, prod deploy)
- 승인/증거 패킷 표준(이미 진행 중인 unblock pack 확장)
- (가능하면) CODEOWNERS 유사 정책을 MUSU 작업흐름에 반영

## Checklist

1) Restricted surface 목록을 문서로 고정
2) 해당 변경은 “approval + artifact” 없이는 진행 불가로 정책화
3) 운영자 역할(CEO/CoS/CTO/QA/Engineer)의 책임 범위를 1페이지로 고정

## Exit Criteria

- “보안/배포/크리덴셜” 관련 변경은 항상 동일한 체크리스트/검증 커맨드를 따른다.

