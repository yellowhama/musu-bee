# Remaining Execution Plan 2026-04-03

## 목적

`musu-connects`의 남은 작업을 현재 코드 상태, 로컬 플랜 문서, live Paperclip 실행 상태를 기준으로 하나의 실행 계획으로 잠근다.

## 현재 코드 상태 요약

이미 구현된 것:

- core domain types
- advertised/imported registries
- local -> advertised -> imported transforms
- pairing service baseline
- discovery provider trait + discovered peer registry
- route sync service baseline
- port adapter integration baseline
- actual QUIC provider baseline
- code-backed first product demonstration snapshot

아직 비어 있거나 proof가 덜 닫힌 것:

- `08_port_adapter_integration` verification refresh
- alternate environment에서의 QUIC/provider proof rerun
- alternate environment에서의 first product demonstration proof rerun
- control-plane routine가 blocker를 다음 action으로 넘기는 운영 증명

현재 환경 blocker:

- 이 Linux 셸에서는 `cargo test`가 `cc` linker 부재로 막힌다.
- 기존 Windows proof는 존재한다.

## 남은 작업 리스트

### 1. `MUS-17` Port Adapter Integration Verification Refresh

목표:

- 이미 들어간 `musu-port` route adapter baseline을 검증 가능 상태로 잠근다.

현재 구현:

- export adapter trait
- import adapter trait
- default local route mapper
- imported route apply service
- route merge policy baseline
- stale cleanup handoff shape
- crate root export surface

남은 마감:

- Linux linker blocker를 제외한 검증 경로를 남긴다.
- alternate environment proof 또는 toolchain fix path를 문서와 control plane에 남긴다.

### 2. `MUS-18` Actual QUIC Provider Proof Refresh

목표:

- 이미 들어간 QUIC provider baseline을 proof까지 닫는다.

현재 구현:

- endpoint config type
- listener open baseline
- dial / accept baseline
- control bi-stream baseline
- session registry integration

남은 마감:

- alternate environment 또는 toolchain-fixed 환경에서 proof를 다시 남긴다.

### 3. `MUS-19` First Product Demonstration Proof Refresh

목표:

- `musu-port -> musu-connects -> imported route` 첫 demonstration을 proof까지 닫는다.

현재 구현:

- exported route sample
- imported route apply sample
- collision / trust / freshness demo rules
- proof/runbook 문서화
- code-backed `FirstProductDemoService`

남은 마감:

- alternate environment에서 full proof를 다시 남긴다.

### 4. Paperclip Autonomous Execution

목표:

- 위 3개 실행 패킷이 중간 수동 개입 없이 계속 진행되게 만든다.

현재 상태:

- engineer routine active
- CEO routine active

남은 일:

- routine 결과 추적
- blocked -> next action operating contract 확인
- issue sequencing이 실제로 이어지는지 확인

### 5. Verification And Proof Refresh

목표:

- 현재 환경 제약을 명시적으로 관리하면서 proof를 다시 남긴다.

세부 구현:

- Linux linker blocker 기록
- alternate environment proof refresh
- demo proof 문서화

## 실행 순서

1. `MUS-17` verification refresh
2. `MUS-18` proof refresh
3. `MUS-19` proof refresh
4. routine 결과 확인 및 follow-up 조정
5. verification/proof refresh 마감

## Paperclip 매핑

goal:

- `MUSU Connects QUIC Path`
- id: `82c47c61-ef25-4d1b-bf5e-f8893b642c15`

project:

- `musu-connects`
- id: `739006ad-b6fc-42cd-8e72-9bef6e59b0ea`

issues:

- `MUS-17` port adapter integration (`done`)
- `MUS-18` actual QUIC provider baseline (`done`)
- `MUS-19` first product demonstration (`done`)
- `MUS-21` linker-ready proof refresh (`done`)

root gate linkage:

- `MUS-52` lane-2 remediation subpacket (`in_progress`)
- `MUS-53` lane-2 CTO risk gate (`todo`)
- `MUS-45` lane-2 QA re-audit gate (`todo`)
- `MUS-27` lane-2 parent gate (`blocked`)

routines:

- `musu-connects execution loop`
  - id: `7833f039-8ae3-4b36-9ea2-ca5b3026b543`
  - `*/15 * * * *`
- `musu-connects CEO review loop`
  - id: `463a6944-9807-46fb-a465-3b1c37e274c6`
  - `*/30 * * * *`

## 참조 문서

- [MASTER_PLAN.md](/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/musu-connects/CURRENT_STATE.md)
- [TODO_EXECUTION_BOARD.md](/home/hugh51/musu-functions/musu-connects/TODO_EXECUTION_BOARD.md)
- [NEXT_TODO_2026-04-02.md](/home/hugh51/musu-functions/musu-connects/NEXT_TODO_2026-04-02.md)
- [PAPERCLIP_EXECUTION_SETUP_2026-04-03.md](/home/hugh51/musu-functions/musu-connects/PAPERCLIP_EXECUTION_SETUP_2026-04-03.md)
- [PAPERCLIP_AUTONOMY_PLAN_2026-04-03.md](/home/hugh51/musu-functions/musu-connects/PAPERCLIP_AUTONOMY_PLAN_2026-04-03.md)
