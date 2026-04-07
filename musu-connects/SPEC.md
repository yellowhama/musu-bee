# musu-connects Spec

## 목적

`musu-connects`는 MUSU 노드 사이의 QUIC 기반 P2P network plane이다.

핵심 책임:

1. peer discovery
2. pair / session establishment
3. local route advertisement
4. remote route import
5. reachability / freshness / reconcile 상태 관리

## 현재 구현 범위

### 완료

- route / peer / transport domain types
- advertised/imported registry baseline
- local -> advertised -> imported transform baseline
- QUIC pair/control frame baseline
- pairing service baseline

### 구현 완료, 재검증 대기

- discovery provider trait
- discovered peer registry
- advertised/imported registry merge/update API
- route sync service
- `musu-port /routes -> musu-connects proof artifact` live harness
- peer-aware live proof path
- positive / blocked / unverified negative scenario harness

### 아직 미구현

- 실제 QUIC endpoint open/dial
- 실제 mDNS discovery provider
- 실제 route sync control stream
- actual wire-level transport evidence artifact
- trust-gate reason과 import collision reason의 완전 분리

## 프로토콜 기준

### Transport

- 기본 transport: QUIC
- ALPN: `musu-connects/1`
- 기본 bind: `0.0.0.0:4433`

### Frame

- `pair_request`
- `pair_success`
- `error`
- `heartbeat`
- `route_sync_request`
- `route_sync_snapshot`

### Pairing baseline

- 입력: `peer_id`, `node_id`, `token`, `requested_at`
- 성공 시:
  - `PairSuccessPayload`
  - `SessionRegistry`에 connected session 추가
  - `HealthRecord`를 reachable/fresh로 초기화

### Route sync baseline

- local route는 advertised registry로 publish
- advertised snapshot은 imported registry로 merge
- import key baseline: `{peer_id}::{route_id}`

## 원본 코드 참조

- [ORIGINAL_CODE_REFERENCE_MAP.md](/home/hugh51/musu-functions/musu-connects/ORIGINAL_CODE_REFERENCE_MAP.md)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_swarm.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_swarm.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/infrastructure/discovery.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/infrastructure/discovery.rs)

## 현재 검증 상태

- Linux canonical verifier: 통과
  - `/home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo test -p musu-connects-core`
  - `39 passed`
- cross-repo live harness: 통과
  - positive command: `/home/hugh51/musu-functions/scripts/mus27-live-session-harness.sh`
  - unverified command: `/home/hugh51/musu-functions/scripts/mus27-live-session-harness.sh --scenario unverified-peer`
  - blocked-peer command: `/home/hugh51/musu-functions/scripts/mus27-live-session-harness.sh --scenario blocked-peer`
  - positive proof artifact: `/home/hugh51/musu-functions/work/mus27-live-harness/musu-connects-live-proof.json`
  - unverified proof artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-unverified-peer/musu-connects-live-proof.json`
  - blocked proof artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-blocked-peer/musu-connects-live-proof.json`
  - positive runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness/musu-connects-runtime-transport-evidence.json`
  - unverified runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-unverified-peer/musu-connects-runtime-transport-evidence.json`
  - blocked runtime evidence artifact: `/home/hugh51/musu-functions/work/mus27-live-harness-blocked-peer/musu-connects-runtime-transport-evidence.json`
  - proof artifact에는 `trustLevel`, `discoveryState`, `trustGateReason`, `importDecisionReason`, `transportEvidenceKind`, `sessionEvidenceMode`, `sessionRemoteAddrSource`, `runtimeEvidencePath`가 들어간다.
  - runtime evidence artifact의 canonical truth field는 `effectiveTransportEvidenceKind`다.
  - runtime evidence artifact의 `transportEvidenceKind`는 `effectiveTransportEvidenceKind`와 항상 동일한 alias로 유지한다.
  - runtime evidence artifact의 이전 runtime-constant 의미는 `legacyRuntimeTransportEvidenceKind`로 분리해 명시한다.
  - `proofTransportEvidenceKind`는 하위 호환 alias로 유지하며 canonical 값과 동일해야 한다.
  - `trustGateReason`은 peer trust/discovery verdict만 표현하고, alias/stale 같은 import merge 결과는 `importDecisionReason`에 남긴다.
  - verified 시나리오는 `transportEvidenceKind=runtime-musu-port-http-route-plane-v1`, `sessionEvidenceMode=runtime-peer-authenticated`, `sessionRemoteAddrSource=quic-session-event.remote_addr`로 runtime/peer-authenticated session semantics를 기록한다.
  - unverified/blocked 시나리오는 trust gate suppression(`transportEvidenceKind=trust-gate-suppressed`, `sessionEvidenceMode=not-generated`)로 명시한다.

## 다음 단계

1. `MUS-59` stale execution-lock unblock 처리
2. `MUS-53` CTO risk review gate 완료 후 `MUS-27` status transition
3. actual QUIC connection/provider baseline
4. route-sync control stream과 operator-laptop integration
