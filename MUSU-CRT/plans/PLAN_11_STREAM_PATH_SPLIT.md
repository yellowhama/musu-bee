# PLAN 11: Stream Path Split

## 목표

`useRealtimeStream`를 local polling path와 remote WebRTC path로 분리해서 읽는 기준을 고정한다.

## 범위

- local frame adapter
- frame parser
- metrics collector
- reconnect policy
- remote session adapter

## 작업 목록

1. local polling path 정리
2. remote WebRTC path 정리
3. 분리 단위 후보 정리
4. 다음 extraction 순서 문서화

## 완료 기준

- [STREAM_PATH_SPLIT_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_PATH_SPLIT_MAP.md) 가 존재한다.
