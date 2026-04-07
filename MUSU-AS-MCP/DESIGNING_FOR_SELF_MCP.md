# Designing For Self-MCP

## 목적

MUSU Desktop을 단순히 "예쁜 앱"이 아니라 "자기 자신을 읽고 조작할 수 있는 MCP product surface"로 설계하기 위한 디자인 원칙을 고정한다.

이 문서는 UI/UX 디자인, 정보 구조, 컴포넌트 설계, 상호작용 설계를 모두 self-MCP 기준으로 맞추는 용도다.

## 한 줄 원칙

> 사람이 보기 좋은 화면이어야 할 뿐 아니라, MCP consumer가 읽고 조작하기 쉬운 화면이어야 한다.

## 왜 필요한가

일반 앱 디자인은 보통 사람 사용성만 본다.

하지만 MUSU는 다르다.

- 사람이 직접 쓴다
- 외부 CLI/IDE consumer도 붙는다
- 앱이 자기 자신을 읽는다
- action surface가 MCP로 노출된다

즉 MUSU 디자인은 아래 두 요구를 동시에 만족해야 한다.

1. human-facing UI
2. agent-facing UI surface

## 핵심 설계 원칙

### 1. giant page보다 읽기 가능한 surface를 만든다

피해야 하는 것:

- 화면 전체가 하나의 거대한 자유형 canvas
- 의미 없는 장식 요소가 구조를 덮는 레이아웃
- hierarchy가 불명확한 mixed panel

권장:

- 분명한 영역 분리
- navigation / main / complementary 영역 구분
- bounded subtree로 읽을 수 있는 정보 구조

질문:

- 이 화면을 `layout_snapshot(max_depth=1)`로 읽으면 구조가 보이는가

### 2. 현재 컨텍스트를 항상 작게 요약 가능해야 한다

모든 주요 화면은 `get_editor_state` 수준의 작은 summary로 설명 가능해야 한다.

예:

- 지금 어느 view인가
- 어떤 project/workspace인가
- 어떤 panel이 active인가
- 어떤 object/component가 focus 상태인가

피해야 하는 것:

- 현재 맥락이 화면 전체를 훑어야만 보이는 구조
- selection/focus/active state가 암묵적인 구조

### 3. actionable surface를 드러내야 한다

MCP에서 action을 실행하려면 UI에도 action boundary가 명확해야 한다.

권장:

- 버튼, 카드, 패널, 탭에 stable id 개념
- action label이 사람이 읽어도 명확함
- component가 자기 action을 설명 가능함

좋은 예:

- `settings-button`
- `project-card-primary`
- `open_settings`
- `open_project`

나쁜 예:

- 시각적으로만 버튼처럼 보이지만 구조적으로 정체가 모호한 요소
- hover 없이는 action 의미를 알 수 없는 아이콘-only UI

### 4. layout은 bounded depth로 설명 가능해야 한다

Pencil의 `snapshot_layout`처럼 depth-limited read가 가능해야 한다.

권장:

- top-level regions가 명확함
- 각 region 내부 child 구조가 1~2 depth 안에서 파악 가능
- 깊은 중첩은 필요할 때만 사용

피해야 하는 것:

- 의미 없이 중첩된 wrapper div/component
- visual grouping과 semantic grouping이 다른 구조

### 5. 구조 정보와 시각 검증을 분리한다

디자인할 때부터 아래 둘을 섞지 않는 것이 좋다.

- 구조 read
- screenshot proof

의미:

- layout은 텍스트/트리/metadata로 읽히게 한다
- visual quality는 screenshot으로 본다

이 원칙이 있어야 giant snapshot API를 피할 수 있다.

### 6. 문제 상태를 node 수준으로 설명 가능해야 한다

Pencil의 `problemsOnly`처럼 문제가 node 단위로 보이는 구조가 좋다.

예:

- clipped
- overlap
- crowded_near_edge
- narrow_panel
- hidden_action

질문:

- 이 화면에서 layout 문제를 특정 node에 귀속시킬 수 있는가

### 7. view 전환 이유가 추적 가능해야 한다

MUSU는 self-MCP라서 현재 view뿐 아니라 "왜 여기 왔는가"도 중요하다.

권장:

- route reason
- route source
- active intent
- focus transfer signal

즉 디자인도 단순한 정적 화면이 아니라 state transition을 설명 가능한 구조여야 한다.

### 8. 장식보다 의미를 우선한다

시각적으로 멋져도 MCP 관점에서 읽기 어려우면 장기적으로 독이 된다.

권장:

- decorative layer가 의미 layer를 침범하지 않음
- semantic label과 visual label이 일치
- panel과 control의 역할이 직관적

## 화면 설계 체크리스트

새 화면이나 섹션을 디자인할 때 아래를 본다.

### A. Editor State Check

- 이 화면을 10개 이하 필드로 요약할 수 있는가
- active project/workspace/view가 명확한가
- focus 대상이 있는가
- 사용자가 지금 뭘 할 수 있는지 한 줄로 설명 가능한가

### B. Layout Snapshot Check

- top-level 영역이 3~6개 안쪽인가
- `max_depth=0`에서 전체 구조가 보이는가
- `max_depth=1`에서 주요 child가 보이는가
- wrapper가 과도하지 않은가

### C. Actionables Check

- 주요 인터랙션 요소에 stable id를 줄 수 있는가
- action label이 명확한가
- icon-only control이 과도하지 않은가
- hidden action이 너무 많지 않은가

### D. Screenshot Check

- 특정 panel/target을 screenshot으로 따로 검증할 수 있는가
- 시각 proof가 필요한 요소가 구조 read에 섞여 있지 않은가

### E. Problem Nodes Check

- layout 문제를 노드 단위로 기술할 수 있는가
- "문제 있음"이 아니라 "어떤 노드가 왜 문제인지" 설명 가능한가

## 추천 정보 구조

좋은 기본 구조:

- `navigation`
- `main`
- `complementary`
- `toolbar`
- `status`

좋은 패턴:

- 왼쪽 navigation
- 중앙 primary work area
- 오른쪽 assistant/inspector
- 상단 global toolbar
- 하단 status/feedback

이 구조는 사람에게도 익숙하고 MCP `layout_snapshot`에도 잘 맞는다.

## 컴포넌트 설계 규칙

### stable id

모든 핵심 컴포넌트는 stable id를 가질 수 있어야 한다.

예:

- `settings-button`
- `workspace-switcher`
- `assistant-panel`
- `project-card-primary`

### explicit label

시각 label과 semantic label을 최대한 맞춘다.

### explicit action

각 컴포넌트는 최소한 아래 중 하나를 설명할 수 있어야 한다.

- route
- open
- toggle
- submit
- inspect
- select

## 피해야 할 안티패턴

- giant all-in-one canvas
- depth가 깊은 wrapper forest
- context를 숨기는 floating UI
- 의미 없는 glass/blur/ornament 남발
- hover 없이는 action 의미를 알 수 없는 UI
- screenshot 없이는 구조를 해석할 수 없는 화면
- 구조 read와 visual proof가 한 API에 섞이는 설계

## MUSU용 실전 질문

새 디자인 시안이 나오면 아래를 묻는다.

1. 이 화면의 `editor_state`는 무엇인가
2. 이 화면의 top-level regions는 무엇인가
3. `layout_snapshot(max_depth=0)` 결과를 어떻게 기대하는가
4. actionables는 무엇이며 stable id를 붙일 수 있는가
5. 문제 node를 어떤 기준으로 표시할 수 있는가
6. screenshot proof는 어떤 target 단위로 잘라야 하는가
7. 이 화면이 giant semantic snapshot 없이도 읽히는가

## 디자인 산출물 규칙

앞으로 디자인 문서나 시안 설명에는 가능하면 아래를 같이 붙인다.

- `editor_state summary`
- `top-level layout regions`
- `actionables`
- `problem node candidates`
- `screenshot targets`

즉 디자인 설명도 self-MCP surface를 전제로 써야 한다.

## 결론

MUSU 디자인은 단순 UI 디자인이 아니다.

> MCP consumer가 읽고 조작하기 쉬운 구조를 먼저 만들고, 그 위에 사람 친화적 시각 디자인을 얹는 방식이 맞다.

이 원칙이 잡혀야 Pencil-style decomposition과 MUSU self-MCP가 실제 제품 설계로 이어진다.
