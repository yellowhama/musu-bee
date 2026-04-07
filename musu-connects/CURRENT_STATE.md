# musu-connects Current State

## 현재 목적

`musu-connects`를 `musu-port`와 분리된 peer-to-peer network plane으로 정의하고, 이후 구현이 field-level ambiguity 없이 진행되게 만든다.

## 현재 코드 상황

- 최소 Rust workspace scaffold가 생성됐다.
- `apps/musu-connectsd` entry와 `crates/musu-connects-core` domain crate가 추가됐다.
- core crate에는 route / peer / transport domain type baseline이 들어갔다.
- advertised/imported registry 타입이 추가됐다.
- local -> advertised -> imported route transform 함수가 추가됐다.
- peer session / health를 담는 baseline registry가 추가됐다.
- QUIC pair/control frame baseline이 추가됐다.
- pair handshake service가 추가됐다.
- discovery provider trait과 discovered peer registry가 추가됐다.
- advertised/imported registry merge/update API가 추가됐다.
- route sync service baseline이 추가됐다.
- Linux canonical toolchain 경로로 `cargo test -p musu-connects-core`가 통과한다.
- 현재 Linux proof는 `/home/hugh51/musu-functions/scripts/linux-rust-env.sh` 기준으로 재현 가능하다.
- `musu-port` adapter integration baseline은 이미 코드에 들어갔다.
  - `application/port_adapter.rs`에 export/import adapter 경계, default mapper, imported route apply service, merge policy, stale cleanup handoff, unit tests가 있다.
  - `lib.rs` export surface도 adapter/provider 타입을 밖으로 노출하도록 정리됐다.
- actual QUIC provider baseline은 코드에 이미 존재한다.
  - `application/quic_provider.rs`에 endpoint config, listener open, dial/accept, control bi-stream, session registry update, unit tests가 있다.
- first product demonstration도 runbook-only를 넘어 code-backed demo service가 추가됐다.
  - `application/product_demo.rs`가 exported route, imported projection, QUIC session, pairing session을 하나의 snapshot으로 묶는다.
- `apps/musu-connectsd`는 banner-only entry에서 live harness command를 제공하도록 확장됐다.
  - `live-harness`가 `musu-port /routes` JSON을 읽어 peer context 기반 `FirstProductDemoSnapshot` proof artifact를 생성한다.
  - canonical runner: `/home/hugh51/musu-functions/scripts/mus27-live-session-harness.sh`
  - positive artifact: `/home/hugh51/musu-functions/work/mus27-live-harness/musu-connects-live-proof.json`
  - blocked artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-blocked-peer/musu-connects-live-proof.json`
  - unverified artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-unverified-peer/musu-connects-live-proof.json`
  - positive runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness/musu-connects-runtime-transport-evidence.json`
  - blocked-peer runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-blocked-peer/musu-connects-runtime-transport-evidence.json`
  - unverified runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-unverified-peer/musu-connects-runtime-transport-evidence.json`
  - replay commands:
    - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh`
    - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario unverified-peer`
    - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario blocked-peer`
- 현재 lane 2 해석:
  - route-shape integration proof를 넘어 peer trust gate를 live harness에 직접 연결했다.
  - proof JSON에 `trustLevel`, `discoveryState`, `trustGateReason`, `importDecisionReason`, `transportEvidenceKind`, `sessionEvidenceMode`, `sessionRemoteAddrSource`가 명시된다.
  - runtime evidence JSON은 `effectiveTransportEvidenceKind`를 canonical semantic field로 사용한다.
  - runtime evidence JSON의 `transportEvidenceKind`는 canonical alias이며 `effectiveTransportEvidenceKind`와 동일하게 유지된다.
  - 이전 runtime-constant 의미는 `legacyRuntimeTransportEvidenceKind`로 명시되어 dual-truth를 제거했다.
  - `proofTransportEvidenceKind`는 하위 호환 alias로 남기되 canonical 값과 동일해야 한다.
  - `trustGateReason`은 peer trust/discovery verdict만, import collision/stale 결과는 `importDecisionReason`으로 분리해 기록한다.
  - verified session 증거는 `runtime-musu-port-http-route-plane-v1`이며 `sessionEvidenceMode=runtime-peer-authenticated`, `sessionRemoteAddrSource=quic-session-event.remote_addr`로 runtime/peer-authenticated semantics를 명시한다.
  - runtime route-plane 증거는 별도 JSON artifact로 분리 기록한다.
  - verified/unverified negative path 모두 `pairing_session_id=<none>`로 재현되고 trust gate suppression이 artifact에 남는다.
  - 이전 root lock chain(`MUS-55`~`MUS-63`)은 모두 `done`으로 닫혔고, `musu-connects` wave-2 packet chain(`MUS-102`~`MUS-105`)도 현재 `done`으로 닫혔다.
- 다음 운영 기준은 wave-2 close 이후 done-context run drift를 우선 정리하는 것이다.
- Paperclip project `musu-connects`의 project-local 실행 단위는 모두 `done` 상태다.
  - `MUS-17`: port adapter integration (`done`)
  - `MUS-18`: actual QUIC provider baseline (`done`)
  - `MUS-19`: first product demonstration (`done`)
  - `MUS-21`: linker-ready proof refresh (`done`)
- 현재 `musu-connects` 프로젝트 자체 active execution은 없고, drift 정리는 control-plane hygiene packet(`MUS-110`)에서 추적 중이다.
- engineer / CEO routine은 이미 붙어 있다. 남은 것은 routine이 blocker를 다음 action으로 실제로 넘기게 만드는 운영 확인이다.
- `musu-port`와의 관계는 이미 고정돼 있다.
  - `musu-port` = 로컬 ingress/control-plane
  - `musu-connects` = peer discovery / secure transport / route advertisement-import
- 즉 planning baseline은 닫혔고, 이제는 contract-backed implementation scaffold 단계다.

## 이미 확보된 것

- [README.md](/home/hugh51/musu-functions/musu-connects/README.md)
- [MASTER_PLAN.md](/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md)
- [MUSU_PORT_INTEGRATION.md](/home/hugh51/musu-functions/musu-connects/MUSU_PORT_INTEGRATION.md)
- [plans/01_port_contract_freeze.md](/home/hugh51/musu-functions/musu-connects/plans/01_port_contract_freeze.md)
- [ROUTE_CONTRACT.md](/home/hugh51/musu-functions/musu-connects/ROUTE_CONTRACT.md) payload 예시 반영
- [PEER_IDENTITY_AND_DISCOVERY.md](/home/hugh51/musu-functions/musu-connects/PEER_IDENTITY_AND_DISCOVERY.md) payload 예시 반영
- [ADVERTISEMENT_IMPORT_PLANE.md](/home/hugh51/musu-functions/musu-connects/ADVERTISEMENT_IMPORT_PLANE.md) registry/lifecycle 반영
- [TRANSPORT_AND_HEALTH_MODEL.md](/home/hugh51/musu-functions/musu-connects/TRANSPORT_AND_HEALTH_MODEL.md) session/health 규칙 반영
- [MUSU_PORT_INTEGRATION.md](/home/hugh51/musu-functions/musu-connects/MUSU_PORT_INTEGRATION.md) adapter entry/failure mode 반영
- Rust workspace scaffold
  - [/home/hugh51/musu-functions/musu-connects/Cargo.toml](/home/hugh51/musu-functions/musu-connects/Cargo.toml)
  - [/home/hugh51/musu-functions/musu-connects/apps/musu-connectsd/src/main.rs](/home/hugh51/musu-functions/musu-connects/apps/musu-connectsd/src/main.rs)
  - [/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/lib.rs](/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/lib.rs)
  - [/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/domain/registries.rs](/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/domain/registries.rs)
  - [/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/domain/transforms.rs](/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/domain/transforms.rs)
  - [/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/domain/transport.rs](/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/domain/transport.rs)
  - [/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/domain/protocol.rs](/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/domain/protocol.rs)
  - [/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/pairing.rs](/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/pairing.rs)
  - [/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/discovery.rs](/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/discovery.rs)
  - [/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/route_sync.rs](/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/route_sync.rs)

## 현재 판단

- `musu-connects`의 핵심은 "컴퓨터를 연결한다"가 아니라 "다른 기기의 `musu-port`와 runtime을 가져와서 local managed surface처럼 쓰게 한다"는 점이다.
- 따라서 가장 먼저 고정해야 하는 것은 transport 구현이 아니라 route contract와 peer identity다.
- 이 경계가 안 고정되면 이후 discovery, advertisement, health, import 로직이 전부 흔들린다.
- 다만 그 경계는 이제 충분히 고정됐고, QUIC session baseline의 첫 컷도 들어갔다.
- discovery와 route sync service baseline까지는 이미 올라갔다.
- 다음 컷은 `musu-port` adapter용 application layer와 실제 QUIC connection/provider shape를 잇는 것이다.
- 제품 관점에서는 이 두 컷이 닫혀야 `musu-port -> musu-connects -> imported route` 첫 demonstration이 가능하다.

## 즉시 다음 단계

1. `MUS-103/104/105`의 `done + activeRun=null` 상태를 유지 검증한다.
2. `MUS-110` (`in_progress`, `activeRun=queued`) 결과를 수집해 최종 gate close를 대기한다.
3. `musu-connects`는 새 구현 packet을 열지 않고 run-state truth가 안정화될 때까지 maintenance-only로 유지한다.

## live execution state

- Paperclip goal/project/issue setup은 [PAPERCLIP_EXECUTION_SETUP_2026-04-03.md](/home/hugh51/musu-functions/musu-connects/PAPERCLIP_EXECUTION_SETUP_2026-04-03.md)에 기록한다.
- wave-2 planning parent `MUS-96`은 `done`이다.
- `MUS-102`, `MUS-103`, `MUS-104`, `MUS-105`는 현재 모두 `done`이다.
- `MUS-103`은 terminal line(`MUSU_CONNECTS_W2_2_EVIDENCE: GO`) 수용 상태이고 `activeRun=null`이다.
- `MUS-104`는 `activeRun=null`로 정리된 상태다.
- `MUS-105`는 현재 `done`이며 `activeRun=null`로 정리됐다.
- CoS drift follow-up packet `MUS-110`은 board-side unblock 이후 `in_progress`로 전환됐고 현재 owner run이 `queued` 상태다.
- lock/gate artifact는 아래 문서에 고정했다.
  - [WAVE2_LOCK_AND_GATE_RUNBOOK_2026-04-03.md](/home/hugh51/musu-functions/musu-connects/WAVE2_LOCK_AND_GATE_RUNBOOK_2026-04-03.md)
  - [WAVE2_CLOSE_ORDER_CONTRACT_2026-04-03.md](/home/hugh51/musu-functions/musu-connects/WAVE2_CLOSE_ORDER_CONTRACT_2026-04-03.md)
  - [plans/14_wave2_execution_hygiene_ceo_eng_retro_2026-04-03.md](/home/hugh51/musu-functions/musu-connects/plans/14_wave2_execution_hygiene_ceo_eng_retro_2026-04-03.md)

## 현재 결론

`musu-connects`는 core domain scaffold, QUIC provider baseline, discovery/route sync baseline, port adapter integration, and code-backed demo까지 확보했고 wave-2 chain(`MUS-102`~`MUS-105`)도 상태상 닫혔다. 현재 남은 실행은 기능 개발이 아니라 done-context run-state drift 정리다.

## 실행 보드

- active/queued 순서는 [TODO_EXECUTION_BOARD.md](/home/hugh51/musu-functions/musu-connects/TODO_EXECUTION_BOARD.md)를 기준으로 관리한다.
