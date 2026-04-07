# musu-connects Original Code Reference Map

## 목적

`musu-connects`를 허공에서 설계하지 않고, 원본 `Musu-new`의 네트워크/mesh 구현 anchor를 보면서 다음 단계를 정하기 위한 맵이다.

## 핵심 판단

- `musu-connects`는 `HiveLink`의 QUIC mesh 패턴에서 가장 많이 배운다.
- `musu-port`와의 로컬 route surface는 이미 `musu-functions/musu-port` 쪽에서 정리돼 있으므로,
  `musu-connects`는 `peer discovery -> pair -> session -> route sync`에 집중하면 된다.

## 주요 참조 파일

### QUIC session / control frame

- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_swarm.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_swarm.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_work_execution.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_work_execution.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_auth_session.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_auth_session.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/infrastructure/session.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/infrastructure/session.rs)

### Discovery

- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/infrastructure/discovery.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/infrastructure/discovery.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/docs/TRIPLE_AI_SYSTEM.md](/mnt/f/Aisaak/Projects/Musu-new/docs/TRIPLE_AI_SYSTEM.md)

### Peer pool / route selection

- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/interfaces/quic/peer_client.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/src/interfaces/quic/peer_client.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_mesh_e2e.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_mesh_e2e.rs)

## `musu-connects`로 가져올 것

- QUIC bi-stream 중심 control channel
- pair/handshake frame 흐름
- peer/session registry 감각
- discovery와 peer pool 분리

## `musu-connects`가 그대로 가져오지 않을 것

- HiveLink의 AI job/work execution opcode
- full mesh executor semantics
- gateway client / LLM registry / file/terminal surface

## 다음 단계

1. QUIC transport baseline
2. discovery and route sync baseline
3. `musu-port` adapter integration
