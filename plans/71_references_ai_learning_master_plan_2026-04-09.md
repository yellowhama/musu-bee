# Master Plan — references_AI Learnings → MUSU Program (2026-04-09)

목표: `/home/hugh51/references_AI`에서 검증된 패턴을 MUSU에 “운영 가능”한 형태로 흡수한다.
중심축은 기능 추가가 아니라 **토큰 경제 + 세션 학습 + 하네스 + 거버넌스**다.

## Scope

In-scope:
- command/test/build 출력의 표준 요약/축약 레이어
- 반복되는 CLI 실수의 자동 학습(룰/런북/프리플라이트)
- 외부 프로그램 제어 하네스의 표준화(세션/undo/아티팩트)
- 제한구역(보안/승인/배포) 표준화

Out-of-scope (이번 파동):
- 새로운 UI/대시보드 대규모 개발
- 새로운 provider 전환(결제/LLM) 같은 사업적 결정 변경

## Program Decisions (pick 1–2)

1) **Owner:** Chief of Staff 단일 오너(추천) vs 다중 오너.
2) **Wave-1 focus:** Output Compaction + Session Learn(추천) vs Harness 우선.

## Waves

### Wave 1 — Token Economy / Output Compaction (RTK 패턴)

세부 플랜: `plans/72_token_economy_output_compaction_2026-04-09.md`

Exit criteria:
- `remote_process`/`process`류 결과가 “raw 로그”가 아니라 canonical summary를 기본으로 제공
- 실패 시에도 top-K 핵심 + 재현 커맨드 + 아티팩트 경로가 먼저 나온다

### Wave 2 — Session Learn / CLI Corrections (RTK learn 패턴)

세부 플랜: `plans/73_session_learn_cli_corrections_2026-04-09.md`

Exit criteria:
- 반복 실패 패턴 10개를 룰/런북으로 승격
- 운영 runbook이 자동 업데이트되는 경로(수동 승인 포함)가 생김

### Wave 3 — Harness Standardization (CLI-Anything 패턴)

세부 플랜: `plans/74_cli_anything_harness_strategy_2026-04-09.md`

Exit criteria:
- 최소 1개 외부 프로그램(또는 복잡한 도구)을 “세션/undo/아티팩트” 포함 하네스로 닫음

### Wave 4 — Governance / Restricted Surfaces (gstack/openclaw 패턴)

세부 플랜: `plans/75_skill_marketplace_and_governance_2026-04-09.md`

Exit criteria:
- 제한구역 변경은 approval + artifact 없이는 merge/배포 불가
- 운영 상 “어디를 건드리면 위험한지”가 문서/정책으로 고정

## Evidence / Reporting

- 연구 요약 리포트: `docs/REPORT_2026-04-09_references_AI_deep_research.md`
- Paperclip CEO 보고는 MUS-1016 umbrella comment에 “결정 1–2 + 실행 체크리스트 + 검증 커맨드”로만 남긴다.

