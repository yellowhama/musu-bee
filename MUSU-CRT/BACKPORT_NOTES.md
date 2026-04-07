# MUSU-CRT Backport Notes

작성일: 2026-04-01

## 목적

`MUSU-CRT`에서 분리한 contract와 harness를 원본 MUSU에 다시 연결할 때의 최소 기준을 적는다.

## backport-ready slices

1. signaling surface
   - `webrtc_offer`
   - `webrtc_add_ice`
   - `webrtc_close`
2. stream lifecycle surface
   - start/poll/stop
   - reconnect/metrics
3. terminal/data bridge
   - incoming callback
   - outgoing data send
4. screen tab shell
   - grouping
   - thumbnail gallery
   - focused stream panel

## 현재 결론

`MUSU-CRT`는 원본 MUSU의 CRT 축을 대체하는 것이 아니라, refactor/backport 단위를 더 명확하게 잘라주는 보조 작업공간이다.
