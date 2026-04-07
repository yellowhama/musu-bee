# MUSU-AS-MCP Relation To musu-port

## 목적

이 문서는 `/home/hugh51/musu-functions/MUSU-AS-MCP` 작업 공간을 읽고,
그 내용을 `musu-port` 관점에서 어떻게 해석해야 하는지 고정하기 위한 메모다.

중요한 전제:

- `MUSU-AS-MCP`는 별도 작업 공간이다.
- 그 폴더 안의 구현/계획은 여기서 수정하지 않는다.
- 여기서는 `musu-port`와 맞닿는 계약면만 정리한다.

## 먼저 결론

`MUSU-AS-MCP`는 `musu-port`의 대체물이 아니다.

역할은 이렇게 나뉜다.

- `musu-port`: 서비스/연결의 ingress control-plane
- `MUSU-AS-MCP`: MUSU Desktop 자체를 MCP server surface로 노출하는 AI-native application surface

즉 `MUSU-AS-MCP`는 `musu-port`가 관리할 수 있는 여러 서비스 중 하나이자,
장기적으로는 가장 중요한 AI-native service candidate다.

## MUSU-AS-MCP에서 읽힌 핵심 사실

`MUSU-AS-MCP` 문서 기준으로 현재 고정된 정의는 아래다.

1. MUSU Desktop 자체가 MCP 서버여야 한다.
2. 외부 CLI/IDE consumer가 그 surface를 실제로 사용해야 한다.
3. surface는 Layer A와 Layer B로 나뉜다.
4. giant semantic snapshot 하나보다 purpose-built tool decomposition이 장기 방향이다.

현재 확인된 대표 surface:

- Layer A
  - `/mcp/health`
  - `initialize`
  - `tools/list`
- Layer B
  - `get_current_view`
  - `get_ui_state`
  - `list_actionables`
  - `execute_action`
  - `get_semantic_snapshot` 또는 그 분해된 read tools

MCP-only harness 기준 기본 포트는 `8793`이지만,
이 값은 reference일 뿐 `musu-port` 쪽 계약으로 하드코딩하면 안 된다.

## musu-port 입장에서 이게 의미하는 것

### 1. MUSU-AS-MCP는 "AI-native service"다

`musu-port`가 관리하는 대상은 단순한 웹 서버나 TCP daemon만이 아니다.

MUSU-AS-MCP가 보여주는 건 다음이다.

- AI가 직접 소비하는 MCP server surface
- health / tools/list / bounded read tools를 가진 application endpoint
- human UI와 agent UI를 동시에 가진 hybrid endpoint

따라서 `musu-port`는 장기적으로 MCP endpoint도 1급 시민으로 다뤄야 한다.

### 2. raw port가 아니라 stable ingress가 필요하다

`MUSU-AS-MCP` 문서에는 harness 기본 포트 `8793`이 나오지만,
실제 제품 계약은 `8793`이 아니다.

`musu-port` 관점의 올바른 계약은 아래다.

- consumer는 raw port를 외우지 않는다
- consumer는 stable alias 또는 managed ingress로 접근한다
- local port는 기기/실행 문맥에 따라 바뀔 수 있다

즉:

- 잘못된 계약: `http://127.0.0.1:8793/mcp`
- 올바른 계약: `device_id + service alias + translator/device profile`

### 3. Layer A는 health-checked ingress 후보다

`/mcp/health`는 `musu-port` 관점에서 좋은 probe target이다.

의미:

- route promotion 시 health 확인 가능
- discovery 후 MCP-like endpoint 식별에 활용 가능
- `musu-connects`와 붙으면 cross-device advertisement의 최소 heartbeat로도 활용 가능

즉 MCP server는 `musu-port`에서 단순 HTTP service가 아니라
`AI-native health contract를 가진 service`로 볼 수 있다.

### 4. Layer B는 port-manager가 직접 구현할 대상이 아니다

`get_ui_state`, `get_layout_snapshot`, `get_native_screenshot` 같은 Layer B tool은
`MUSU-AS-MCP` 또는 MUSU Desktop의 책임이다.

`musu-port` 책임은 여기까지다.

- 해당 MCP server를 발견/승격/관리한다
- stable alias로 노출한다
- health / audit / metadata / route identity를 붙인다
- local 또는 cross-device ingress로 연결한다

즉 `musu-port`는 MCP tool surface 자체를 구현하는 곳이 아니라,
그 surface가 안정적으로 보이고 연결되게 만드는 ingress layer다.

## 정리된 책임 분리

### MUSU-AS-MCP 책임

- MCP protocol surface
- tool family definition
- Layer A / Layer B contract
- semantic snapshot 또는 decomposition strategy
- consumer proof

### musu-port 책임

- MCP server endpoint discovery
- alias / promote / ignore / persistence
- stable ingress 부여
- health / audit / metadata 연계
- device-local 또는 cross-device route 표면화

### musu-connects 책임

- device-to-device transport
- remote route advertisement/import
- peer identity / trust / secure tunnel

## `musu-port`에 필요한 해석 규칙

### 1. MCP endpoint를 service class로 인식해야 한다

장기적으로 `musu-port`는 아래 정도의 분류가 필요하다.

- 일반 HTTP service
- TCP/QUIC ingress service
- MCP/AI-native service

이 분류는 protocol 추가라기보다 metadata classification에 가깝다.

즉 transport는 HTTP여도,
service 성격은 `mcp_server`로 표시할 수 있어야 한다.

### 2. 기기별 profile이 canonical contract다

`MUSU-AS-MCP`가 어느 포트에서 열릴지, 어떤 launcher로 뜰지,
health probe를 어디로 날릴지는 기기별로 달라질 수 있다.

그래서 `musu-port`는 아래를 하드코딩하면 안 된다.

- 특정 PC의 home path
- 특정 포트 번호
- 특정 설치 위치
- 특정 launcher 경로

대신 계약은 아래다.

- 각 기기는 `device_id`를 가진다
- `device_id`마다 runtime translator profile을 둔다
- AI/consumer는 그 profile과 stable alias를 기준으로 행동한다

### 3. default는 reference이지 truth가 아니다

예를 들어 아래는 모두 reference일 뿐이다.

- harness 기본 포트 `8793`
- `/mcp/health`
- local `127.0.0.1`

이 값들은 "초기 가이드"로는 유용하지만,
제품 계약은 반드시 `device profile + discovery + promote`를 통해 확정돼야 한다.

## 권장 통합 방식

### Phase 1. Local MCP Service Classification

`musu-port`가 discovered endpoint를 볼 때 아래 힌트를 읽게 한다.

- `/mcp/health` 응답 여부
- `initialize` / `tools/list`가 붙는지
- service metadata에 `mcp`, `agent`, `desktop-control` 같은 tag가 있는지

이 단계 목적은 "MCP endpoint 후보를 별도 분류"하는 것이다.

### Phase 2. Stable Alias Promotion

발견된 MCP endpoint를 promote할 때는 일반 alias와 별도로
AI consumer가 읽기 쉬운 naming rule을 갖는 편이 맞다.

예:

- `musu-mcp`
- `desktop-mcp`
- `mcp-<device-id>`
- `musu-desktop-<device-id>`

중요한 건 alias가 포트보다 stable identity여야 한다는 점이다.

### Phase 3. Device-Aware Profile Binding

promotion이나 bootstrap 때 아래를 `device_id` 기준으로 읽는다.

- launch command
- health path
- transport kind
- Windows/WSL translator hints
- export/report root

즉 `musu-port`는 "기기마다 다른 연결 방법"을 hardcoded branch가 아니라
profile binding으로 받아야 한다.

### Phase 4. Cross-Device Advertisement

`musu-connects`가 붙으면
local MCP service는 remote device에도 advertisement될 수 있다.

그때 `musu-port`가 넘겨야 할 핵심 identity는 아래다.

- `device_id`
- `service alias`
- `service class = mcp_server`
- probe/health metadata
- connect policy hints

## immediate backlog for musu-port

이 문서를 기준으로 `musu-port`에 바로 필요한 후속 작업은 아래다.

1. device profile 문서 계약에 `mcp service template`를 추가
2. health/probe layer에 `mcp-like endpoint classification` 추가
3. metadata/report에 `service class` 또는 `agent-facing` classification 추가
4. 필요 시 `MUSU-AS-MCP` endpoint auto-promote rule을 별도 optional feature로 설계
5. `musu-connects` advertisement contract에 `mcp_server` service class 반영

## 한 줄 요약

`MUSU-AS-MCP`는 `musu-port`가 대신 구현해야 할 것이 아니라,
`musu-port`가 안정적으로 발견하고 승격하고 연결해 줘야 하는 대표적인 AI-native service surface다.
