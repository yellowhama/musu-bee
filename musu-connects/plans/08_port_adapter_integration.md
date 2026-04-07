# 08 Port Adapter Integration

## 목표

`musu-port` export/import surface와 `musu-connects` application layer를 연결할 준비를 끝낸다.

## 참조 문서

- [MUSU_PORT_INTEGRATION.md](/home/hugh51/musu-functions/musu-connects/MUSU_PORT_INTEGRATION.md)
- [ROUTE_CONTRACT.md](/home/hugh51/musu-functions/musu-connects/ROUTE_CONTRACT.md)
- [/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/route.rs](/home/hugh51/musu-functions/musu-port/crates/musu-port-core/src/route.rs)

## 이번 단계 범위

- port export adapter trait
- port import adapter trait
- default local route mapper
- imported route apply service
- route merge policy baseline
- stale cleanup handoff shape

## 제외 범위

- 실제 `musu-port` crate 직접 통합
- supervisor/warden orchestration

## 구현 작업 목록

1. application layer adapter trait 추가
2. local route export service 추가
3. imported route apply service 추가
4. merge policy 테스트 추가
5. crate root export surface 정리

## 검증 방법

- `cargo test`
- adapter/service unit test
- Linux linker blocker 발생 시 exact error 기록

## 보류 항목

- 원본 `musu-port` 직접 연결 시점

## 완료 기준

- `musu-port`와 연결될 application layer 경계가 코드와 테스트로 설명 가능하다.
- linker blocker가 있으면 control plane과 로컬 문서에 같은 상태가 기록된다.
