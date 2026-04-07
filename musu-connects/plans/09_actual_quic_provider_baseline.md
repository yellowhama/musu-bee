# 09 Actual QUIC Provider Baseline

## 목표

문서상의 QUIC pair/control baseline을 실제 endpoint / dial / accept / control stream shape로 올린다.

## 참조 문서

- [SPEC.md](/home/hugh51/musu-functions/musu-connects/SPEC.md)
- [TRANSPORT_AND_HEALTH_MODEL.md](/home/hugh51/musu-functions/musu-connects/TRANSPORT_AND_HEALTH_MODEL.md)
- [MASTER_PLAN.md](/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md)

## 이번 단계 범위

- endpoint config type 보강
- listener open baseline
- dial / accept baseline
- control bi-stream shape
- session registry 연결

## 제외 범위

- production-grade crypto hardening
- relay / NAT traversal
- mDNS discovery provider

## 구현 작업 목록

1. transport application layer에 QUIC endpoint abstraction 추가
2. default config와 bind target shape 추가
3. dial / accept 결과를 session registry와 연결
4. control stream open shape를 최소 타입으로 고정
5. baseline unit test 추가

## 검증 방법

- `cargo test`
- endpoint/config unit test
- session update test

## 보류 항목

- production cert strategy
- multi-peer concurrent routing policy

## 완료 기준

`musu-connects`에 실제 QUIC provider entry가 존재하고, pair/control/session 흐름이 더 이상 문서-only가 아니게 된다.
