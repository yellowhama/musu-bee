# PLAN 03: Stream Lifecycle Contract

## 목표

원본 MUSU의 realtime stream lifecycle을 `MUSU-CRT` 기준으로 분리한다.

## 범위

- start/poll/stop
- reconnect/backoff
- metrics
- stream state surface

## 현재 truth

- `useRealtimeStream`가 lifecycle contract의 중심이다.

## 작업 목록

1. source anchor 확인
2. lifecycle 단계 정리
3. state/metrics surface 정리
4. repro boundary 정리

## 완료 기준

- [STREAM_LIFECYCLE_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_LIFECYCLE_CONTRACT.md) 가 존재한다.
