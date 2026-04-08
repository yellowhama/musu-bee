# Deep Research Report — references_AI (2026-04-09)

목표: `\\wsl.localhost\\Ubuntu-22.04\\home\\hugh51\\references_AI`에서 MUSU가 “배워서 가져와야 하는 것”을 추출하고,
현재 MUSU 코드/운영 현실에 맞는 **마스터 플랜 + 세부 플랜**으로 재패킷팅한다.

## Executive Summary (CEO용)

MUSU가 당장 가져오면 ROI가 큰 레퍼런스는 4개다:

1. **rtk-ai**: “명령 출력 파서 3단계(Full/Degraded/Passthrough) + 토큰 포맷터”로 *AI 컨텍스트 비용을 시스템적으로 절감*.
2. **rtk-ai (learn)**: 실패→성공 커맨드 페어를 세션에서 뽑아 “CLI 교정 룰”을 생성해 *반복되는 실수를 자동으로 줄임*.
3. **CLI-Anything**: 앱/도구를 “에이전트 친화 CLI”로 감싸는 **하네스/세션/undo 모델** (GUI/외부툴 제어가 필요한 경우).
4. **gstack / openclaw**: 역할 기반(CEO/EM/QA/CSO…) 운영 모델과, CODEOWNERS/제한구역 같은 *안전한 협업 규칙*.

즉 MUSU의 다음 성장축은 “기능 추가”보다:
- **토큰 경제(출력 압축/요약)**
- **학습(반복 실패 패턴 → 룰화)**
- **하네스(외부 프로그램 제어를 CLI로 표준화)**
- **거버넌스(제한구역/승인/증거 패킷)**
로 정리된다.

## Findings (레퍼런스별 핵심)

### 1) rtk-ai — Token Economy / Output Parsing

관찰:
- RTK는 **도구별 파서(가능하면 JSON) → 부분 파싱(정규식) → 패스스루(절단)**의 3단계 모델을 표준화한다.
- 출력은 `TokenFormatter`로 *compact/verbose/ultra* 모드를 제공해 “필요한 만큼만” LLM에게 먹인다.

MUSU에 적용할 포인트:
- `remote_process` / `process` / `cli` 류 어댑터의 stdout/stderr를 그대로 흘리지 말고,
  **Canonical Result**(테스트/린트/빌드/의존성)로 변환해 축약한다.
- 실패 시에도 “전체 로그”가 아니라, **결정에 필요한 top-K 요약 + 재현 커맨드 + 아티팩트 경로**를 먼저 만든다.

### 2) rtk-ai — Learn (세션 기반 CLI 교정)

관찰:
- `rtk learn`은 JSONL 세션을 스캔해 “실패한 커맨드 → 곧바로 교정된 성공 커맨드” 페어를 잡아 룰로 만든다.
- 에러 유형(unknown flag, wrong path, permission denied 등)을 분류하고 confidence/occurrence로 필터링한다.

MUSU에 적용할 포인트:
- MUSU도 “운영 세션(스크립트 실행/worker 실행/배포/검증)”에서 반복되는 실수를 모아,
  **runbook / rules / preflight check**로 자동 승격할 수 있다.
- 특히 지금 같은 멀티노드 운영에서 자주 반복되는 실수:
  - 잘못된 repo 경로(`musu-bee` vs `musu-functions`)
  - 이미 떠있는 포트 재실행, 토큰 누락, 방화벽 오해

### 3) CLI-Anything — Harness / Session / Undo model

관찰:
- “모든 프로그램은 CLI로 감쌀 수 있다”는 철학.
- 에이전트가 안정적으로 쓸 수 있도록 JSON 출력, 세션 상태, undo/redo까지 모델링한다.
- 플랫폼(Claude/Codex/OpenCode 등)별로 플러그인/스킬로 배포한다.

MUSU에 적용할 포인트:
- MUSU의 `remote_process`는 범용이지만, “외부 프로그램 제어”는 아직 **하네스 표준**이 부족하다.
- `musu-computer-tools`가 이미 있는 만큼:
  - “하네스 스펙(명령군, 상태, undo, 아티팩트)”을 MUSU 스타일로 문서/템플릿화
  - 자주 쓰는 대상(예: 브라우저 QA, 배포/빌드, 디자인툴)부터 하네스화

### 4) gstack / openclaw — Roles + Governance

관찰:
- 역할 기반(CEO/EM/QA/CSO/Ship 등)으로 “계획→검증→배포→감사”를 반복한다.
- openclaw는 CODEOWNERS/보안 경계 같은 “수정 금지 표면”을 강하게 강조한다.

MUSU에 적용할 포인트:
- Paperclip 이슈를 “결정 1–2 + 체크리스트 + 검증 커맨드”로 패킷화한 방향(이미 진행 중)이 정답.
- 다음은 **제한구역(credential, auth, prod deploy)**을 코드/문서/런북 수준에서 더 명확히 하고,
  승인(approval) / 증거(artifact) 기반으로만 변경되게 만든다.

## Gap Map (MUSU 현재 대비 부족한 것)

1) 출력 축약 레이어가 없다 → 로그/출력 폭증이 곧 LLM 비용/혼선으로 전이됨.
2) “실수의 자동 학습”이 없다 → 같은 실수를 사람/에이전트가 반복.
3) 외부 프로그램 제어 하네스가 파편화 → 도구별 예외가 늘어남.
4) 제한구역/승인/증거 규칙이 일부만 자동화 → 운영 리스크가 잔존.

## Recommendation (실행 프로그램)

마스터 플랜: `plans/71_references_ai_learning_master_plan_2026-04-09.md`

세부 플랜:
- 출력/토큰 경제: `plans/72_token_economy_output_compaction_2026-04-09.md`
- 세션 학습/교정: `plans/73_session_learn_cli_corrections_2026-04-09.md`
- 하네스 전략: `plans/74_cli_anything_harness_strategy_2026-04-09.md`
- 거버넌스/제한구역: `plans/75_skill_marketplace_and_governance_2026-04-09.md`

## CEO에 필요한 결정(2개)

1) **Owner 지정:** 이 프로그램을 “CoS 단일 오너”로 고정할지 여부 (추천: YES).
2) **우선순위:** 이번 주는 “Output Compaction + Session Learn”을 Wave-1로 먼저 닫을지 여부 (추천: YES).

