# Detail Plan — Harness Standardization (CLI-Anything pattern) (2026-04-09)

레퍼런스: `references_AI/CLI-Anything` (하네스 생성, 세션 상태, undo/redo, JSON 출력).

## Goal

MUSU가 “외부 프로그램/복잡 도구”를 제어해야 할 때,
매번 ad-hoc 스크립트가 아니라 **표준 하네스 스펙**으로 닫는다.

## Harness Spec (MUSU 제안)

- 명령군(group) + 명령(command)
- 상태(state) 조회: `status`
- 세션(session): open/close, history, undo/redo
- 출력: JSON first (인간용 텍스트는 보조)
- 아티팩트: 출력 파일/스크린샷/로그 경로를 표준 필드로 반환

## Wave-1 Candidate Targets (택 1)

- 브라우저 QA(스크린샷/DOM 상태/네트워크 이벤트)
- 배포/빌드(artifact 수집 포함)
- 디자인 툴(예: Pencil) 반복 작업

## Exit Criteria

- 대상 1개를 하네스로 닫고, MUSU `remote_process`에서 호출해도 일관된 JSON 결과를 받는다.

