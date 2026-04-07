# MUSU-AS-MCP Final Touch

## 목표

`MUSU-AS-MCP`에서 먼저 만든 self-MCP surface를 최종 앱 기능과 대조해 마지막 정리, 정합성 검증, shipping polish를 수행한다.

이 문서는 "새 기능을 여기서 또 만들자"가 아니라, 기능이 다 붙은 뒤 최종 앱 기준으로 무엇을 다시 맞춰야 하는지 정리하는 final pass 문서다.

## 대상 프로젝트

- [`/home/hugh51/musu-functions/MUSU-AS-MCP`](/home/hugh51/musu-functions/MUSU-AS-MCP)
- [`/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop`](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop)

## 참조 문서

- [`/home/hugh51/musu-functions/MUSU-AS-MCP/MASTER_PLAN.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/MASTER_PLAN.md)
- [`/home/hugh51/musu-functions/MUSU-AS-MCP/TODO_EXECUTION_BOARD.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/TODO_EXECUTION_BOARD.md)
- [`/home/hugh51/musu-functions/MUSU-AS-MCP/ORIGINAL_DESKTOP_BACKPORT_MAP.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/ORIGINAL_DESKTOP_BACKPORT_MAP.md)
- [`/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_ALIGNMENT.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/PENCIL_DEV_ALIGNMENT.md)
- [`/home/hugh51/musu-functions/MUSU-AS-MCP/DESIGNING_FOR_SELF_MCP.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/DESIGNING_FOR_SELF_MCP.md)

## 이번 단계 범위

- 최종 앱 기능 목록과 canonical MCP surface를 대조
- 빠진 surface, mismatch, naming drift, payload drift 정리
- consumer proof와 runtime proof를 최종 앱 기준으로 다시 닫기
- 디자인/self-MCP 관점의 마지막 polish 항목 정리
- backport 우선순위 확정

## 제외 범위

- 초기 발명 단계의 새 비전 논의
- unrelated feature 개발
- `musu-port`, `musu-connects`의 독립 로드맵

## Final Touch Checklist

### 1. Final App Feature Inventory

최종 앱 기준으로 아래를 다시 적는다.

- 실제 view 목록
- 실제 panel 목록
- 실제 actionable component 목록
- 실제 screenshot target 후보
- 실제 route reason/source 모델

질문:

- canonical `MUSU-AS-MCP` surface가 최종 앱 기능을 빠짐없이 설명하는가

### 2. MCP Surface Parity

현재 canonical tools:

- `desktop__musu_app_get_editor_state`
- `desktop__musu_app_get_layout_snapshot`
- `desktop__musu_app_get_native_screenshot`
- `desktop__musu_app_get_problem_nodes`
- `desktop__musu_app_get_semantic_snapshot`

확인 항목:

- tool 이름이 최종 앱 기준으로 자연스러운가
- payload 필드가 실제 앱에서 채워질 수 있는가
- synthetic placeholder를 실제 runtime source로 바꿔야 하는 부분은 무엇인가
- giant snapshot 잔재가 남아 있지 않은가

### 3. Runtime Truth Reconciliation

확인 항목:

- Layer A pass
- Layer B pass
- semantic snapshot timeout closure 여부
- `listener_ready`
- runtime diagnostics visibility

### 4. Consumer Proof Finalization

확인 항목:

- Codex CLI
- Claude Code
- Gemini CLI

남겨야 하는 증거:

- config
- fresh session tools/list
- first tools/call
- endpoint/port

### 5. Design Final Touch

확인 항목:

- 최종 앱 화면이 [`DESIGNING_FOR_SELF_MCP.md`](/home/hugh51/musu-functions/MUSU-AS-MCP/DESIGNING_FOR_SELF_MCP.md) 원칙을 따르는가
- `editor_state` 요약이 가능한가
- `layout_snapshot(max_depth=0/1)`로 구조가 읽히는가
- screenshot target이 자연스러운가
- problem nodes를 실제로 추출 가능하게 설계됐는가

### 6. Backport Closure

확인 항목:

- harness에서 검증된 surface 중 실제로 원본 앱에 넣을 것 확정
- 미반영 항목 목록 고정
- synthetic contract와 real runtime contract의 차이 기록

## 구현 작업 목록

1. 최종 앱 기능 inventory 문서화
2. canonical MCP surface와 1:1 매핑표 작성
3. payload drift 목록 작성
4. consumer proof 증거 수집
5. final app runtime proof 수집
6. design polish checklist 완료
7. backport closure note 작성

## 검증 방법

- 최종 앱에서 `tools/list`
- 최종 앱에서 각 canonical tool raw JSON 비교
- consumer별 fresh session proof
- 화면별 `editor_state` / `layout_snapshot` / `problem_nodes` 점검

## 보류 항목

- 아직 최종 앱에 없는 synthetic screenshot contract
- 실제 native screenshot bridge 방식
- semantic snapshot 완전 wrapper화 시점

## 완료 기준

- "최종 앱 기능"과 "canonical MCP surface" 사이의 차이가 문서로 0 또는 명시적 known gap 상태다
- consumer proof가 최종 앱 기준으로 다시 확보된다
- design/self-MCP final polish 항목이 닫힌다
- 이 문서만 보면 마지막 통합 단계에서 무엇을 해야 하는지 바로 실행 가능하다
