# Musu Connects Planning Notes

## 목적

이 폴더는 `musu-connects`를 `musu-port`와 분리된 별도 프로젝트로 계획하고 설계하기 위한 작업 공간이다.

- `musu-port`와 코드를 섞지 않는다.
- 먼저 `musu-connects`의 제품 목적과 책임을 문서로 고정한다.
- 그 다음 `musu-port`와의 계약면을 별도 문서로 정리한다.

## 한 줄 요약

`musu-connects`는 기기 간 secure transport와 route advertisement를 담당하는 MUSU의 network plane이다.

## `musu-port`와의 관계

- `musu-port`: 로컬 ingress/control-plane
- `musu-connects`: peer 간 secure transport/network plane
- supervisor/warden: process lifecycle / sandbox / orchestration

즉, `musu-port`가 로컬 서비스 항구라면 `musu-connects`는 그 항구들을 기기 간 연결망으로 이어 주는 바깥 물길이다.

## 문서 구조

- `README.md`: 개요와 범위
- `MASTER_PLAN.md`: `musu-connects` 마스터 플랜
- `CURRENT_STATE.md`: 현재 planning/contract 상태
- `TODO_EXECUTION_BOARD.md`: active/queued 작업 보드
- `plans/`: 단계별 세부 플랜
- `MUSU_PORT_INTEGRATION.md`: `musu-port`와의 계약면 메모
- `ROUTE_CONTRACT.md`: local -> advertised -> imported route 계약
- `PEER_IDENTITY_AND_DISCOVERY.md`: peer identity/discovery 모델
- `ADVERTISEMENT_IMPORT_PLANE.md`: advertisement/import registry 모델
- `TRANSPORT_AND_HEALTH_MODEL.md`: transport/health 모델

## 현재 상태

2026-04-02 기준:

- planning baseline 문서는 완료
- 최소 Rust workspace scaffold 생성
- domain 타입 baseline 생성
- registry / transform / session registry baseline 생성
- Windows `cargo check` 통과
- Windows `cargo test` 통과
- QUIC pair/control baseline 생성
- discovery and route sync baseline 생성
- 다음 단계는 port adapter integration
- 상세 todo는 [NEXT_TODO_2026-04-02.md](/home/hugh51/musu-functions/musu-connects/NEXT_TODO_2026-04-02.md) 기준

## 현재 active

- discovery / route sync validation

## 핵심 문서

- [MASTER_PLAN.md](/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md)
- [CURRENT_STATE.md](/home/hugh51/musu-functions/musu-connects/CURRENT_STATE.md)
- [TODO_EXECUTION_BOARD.md](/home/hugh51/musu-functions/musu-connects/TODO_EXECUTION_BOARD.md)
- [MUSU_PORT_INTEGRATION.md](/home/hugh51/musu-functions/musu-connects/MUSU_PORT_INTEGRATION.md)

## 현재 결론

`musu-connects`는 buildable core domain scaffold, QUIC pair/control baseline, discovery/route sync baseline까지 들어갔다.
