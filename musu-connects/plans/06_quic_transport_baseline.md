# 06 QUIC Transport Baseline

## 목표

`musu-connects`의 기본 transport를 QUIC P2P로 고정하고, 최소 session / pair / control frame baseline을 만든다.

## 참조 문서

- [MASTER_PLAN.md](/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md)
- [TRANSPORT_AND_HEALTH_MODEL.md](/home/hugh51/musu-functions/musu-connects/TRANSPORT_AND_HEALTH_MODEL.md)
- [ORIGINAL_CODE_REFERENCE_MAP.md](/home/hugh51/musu-functions/musu-connects/ORIGINAL_CODE_REFERENCE_MAP.md)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_swarm.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_swarm.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_work_execution.rs](/mnt/f/Aisaak/Projects/Musu-new/crates/hive_link/tests/quic_work_execution.rs)

## 이번 단계 범위

- QUIC transport crate dependency 결정
- pair request / success frame shape
- control stream baseline
- session registry 연동

## 제외 범위

- relay
- NAT traversal 완성
- production crypto policy 확정

## 구현 작업 목록

1. `quinn` 의존성 추가
2. 최소 frame enum / envelope 추가
3. pair handshake service 추가
4. QUIC connection acceptance/client dial baseline 추가
5. session registry 연동 테스트 추가

## 검증 방법

- `cargo check`
- `cargo test`
- pair handshake unit/integration baseline

## 보류 항목

- mTLS 세부 정책
- invite code / token 발급 방식

## 완료 기준

- QUIC session open + pair + session registry update가 테스트로 설명 가능하다.
