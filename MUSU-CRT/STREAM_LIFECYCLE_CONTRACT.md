# MUSU-CRT Stream Lifecycle Contract

작성일: 2026-04-01

## 목적

원본 MUSU의 stream lifecycle을 `MUSU-CRT` 기준으로 분리한다.

## source anchors

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)

## local lifecycle path

1. `startRealtimeStream(windowId, width, height, quality)`
2. polling loop with `getRealtimeFrame(windowId)`
3. frame/metadata parsing
4. metrics update
5. reconnect with backoff
6. `stopRealtimeStream(windowId)`

## remote lifecycle path

원격 CRT에서는 아래가 주 경로가 된다.

1. session bootstrap
2. signaling exchange
3. WebRTC stream attach
4. viewer state / quality update
5. reconnect / renegotiation
6. close

## state surface

- `frame`
- `error`
- `isActive`
- `termSessionId`
- `isMaxReconnects`
- `metrics`

## metrics

원본 hook는 아래 지표를 계산한다.

- fps
- frame size KB
- total MB
- reconnect count

## repro boundary

`MUSU-CRT`에서는 먼저 아래를 최소 contract로 본다.

- local frame lifecycle
- remote stream attach lifecycle
- metrics / reconnect
- stop / close semantics

## out of scope

- actual media codec control
- native capture backend detail
- clipboard side-channel

## 현재 결론

stream lifecycle은 WebRTC 자체보다 넓다.
또한 원본에는 `local polling path`와 `remote WebRTC path`가 공존한다.

즉 `MUSU-CRT`의 stream plane은:

- signaling plane과 분리해 보고
- local path와 remote path도 다시 분리해서 봐야 한다.
