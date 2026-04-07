# Root Planning Rules

이 폴더는 `musu-functions` 루트 차원의 세부 플랜 문서를 두는 곳이다.

## 문서 구조

- 루트의 단일 현재 계획은 `/home/hugh51/musu-functions/MASTER_PLAN.md`가 가진다.
- 이 폴더의 `NN_<slug>_YYYY-MM-DD.md` 문서는 그 master plan 아래의 개별 execution packet이다.
- 즉 `MASTER_PLAN.md`는 현재 전략이고, `plans/*.md`는 그 전략을 실행 가능한 작업 단위로 자른 기록이다.

## 언제 세부 플랜을 만든다

다음 중 하나면 세부 플랜을 먼저 만든다.

- root scope를 다시 열거나 재정의할 때
- 둘 이상의 모듈을 함께 건드릴 때
- acceptance 기준을 새로 정의해야 할 때
- 문서가 아니라 실제 구현 packet을 시작할 때
- Paperclip TODO/issue를 새로 열기 전에 범위를 먼저 고정해야 할 때

## 파일명 규칙

- `NN_<slug>_YYYY-MM-DD.md`

예:

- `15_personal_onprem_ai_operation.md`
- `22_wave2_lane3_remote_session_health_coherence_2026-04-03.md`
- `32_scope_reset_and_execution_reentry_2026-04-03.md`

번호는 역사 순서다. 과거 번호를 재사용하지 않는다.

## 세부 플랜 최소 구성

모든 root detail plan은 아래 항목을 포함한다.

- 목표
- 현재 truth
- 대상 모듈 / 파일
- 범위
- 제외 범위
- 구현 작업 목록
- 검증 명령
- 기대 artifact / evidence
- 리스크 / 보류 항목
- 완료 기준
- 다음 handoff 또는 TODO 연결

## 운영 규칙

- root 레벨 새 작업은 코드보다 세부 플랜 문서를 먼저 만든다.
- 한 세부 플랜은 한 bounded objective만 가진다.
- 세부 플랜이 끝나면 최소한 아래 세 문서는 같은 truth로 같이 갱신한다.
  - `/home/hugh51/musu-functions/CURRENT_STATE.md`
  - `/home/hugh51/musu-functions/TODO_EXECUTION_BOARD.md`
  - 필요하면 `/home/hugh51/musu-functions/MASTER_PLAN.md`
- closeout 문서는 역사 기록으로 유지하되 현재 roadmap source-of-truth로 취급하지 않는다.
- 프로젝트 내부 단일 모듈 작업은 가능하면 각 프로젝트 내부 `plans/`에서 처리하고, 루트 `plans/`는 cross-project packet과 root re-entry packet만 둔다.
