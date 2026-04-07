# 05 Port Integration Execution Prep

## 목표

`musu-port`와 실제로 연결할 때 필요한 adapter entry와 실행 순서를 준비한다.

## 참조 문서

- [/home/hugh51/musu-functions/musu-connects/MUSU_PORT_INTEGRATION.md](/home/hugh51/musu-functions/musu-connects/MUSU_PORT_INTEGRATION.md)
- [/home/hugh51/musu-functions/musu-connects/ROUTE_CONTRACT.md](/home/hugh51/musu-functions/musu-connects/ROUTE_CONTRACT.md)
- [/home/hugh51/musu-functions/musu-connects/TRANSPORT_AND_HEALTH_MODEL.md](/home/hugh51/musu-functions/musu-connects/TRANSPORT_AND_HEALTH_MODEL.md)

## 이번 단계 범위

- export surface
- import surface
- policy bridge
- stale cleanup handoff

## 제외 범위

- 실제 implementation coding
- supervisor lifecycle coding

## 구현 작업 목록

- adapter entry list 정의
- integration order 정리
- failure mode 정리
- backport-later boundary 정의

## 검증 방법

- 문서 리뷰
- `musu-port` contract 대응표 확인

## 보류 항목

- Windows/WSL bilingual adapter 구체 shape
- final runtime ownership

## 완료 기준

- 이후 구현 진입 순서를 backlog 수준으로 설명 가능
