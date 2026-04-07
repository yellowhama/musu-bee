# 04 Transport And Health

## 목표

peer 간 transport와 health/reconcile 모델을 고정한다.

## 참조 문서

- [/home/hugh51/musu-functions/musu-connects/TRANSPORT_AND_HEALTH_MODEL.md](/home/hugh51/musu-functions/musu-connects/TRANSPORT_AND_HEALTH_MODEL.md)
- [/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md](/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md)

## 이번 단계 범위

- session lifecycle
- reachability
- freshness
- stale cleanup

## 제외 범위

- production transport stack 선택 확정
- crypto 구현

## 구현 작업 목록

- lifecycle 상태 정의
- health signal 정의
- stale cleanup 규칙 정의
- reconnect/backoff 개요 정의

## 검증 방법

- 문서 리뷰
- advertisement/import plane과의 연결성 확인

## 보류 항목

- QUIC/tunnel 최종 선택
- heartbeat payload format

## 완료 기준

- transport와 health를 별도 plane이 아닌 한 흐름으로 설명 가능
