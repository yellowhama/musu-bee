# MUSU-CRT Source Map

작성일: 2026-04-01

## 목적

원본 MUSU에서 `CRT` 축을 구성하는 핵심 파일을 한 곳에 모아본다.

## frontend

### command surface

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts)

핵심 command:

- `webrtc-offer`
- `webrtc-add-ice`
- `webrtc-close`

### tauri invoke wrappers

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)

핵심 함수:

- `startRealtimeStream(...)`
- `getRealtimeFrame(...)`
- `webrtcOffer(...)`
- `webrtcAddIce(...)`
- `webrtcClose(...)`
- `sendWebRtcData(...)`

### viewer

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)

관심사:

- WebRTC stage overlay
- metrics overlay
- reconnect / restart UI
- remote control toolbar

### realtime stream hook

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)

관심사:

- `startRealtimeStream`
- `getRealtimeFrame`
- `stopRealtimeStream`
- reconnect/backoff
- metrics 계산

## backend

### tauri commands

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

핵심 command:

- `webrtc_offer`
- `webrtc_add_ice`
- `webrtc_close`
- `v4_webrtc_data_send`

핵심 동작:

- offer answer exchange
- remote ICE 추가
- 세션 종료
- data channel payload 전송
- 수신 data channel -> terminal bridge

## 현재 결론

`MUSU-CRT`에서 먼저 분리해서 볼 핵심 plane은 세 개다.

1. signaling plane
2. realtime stream plane
3. terminal/data plane

그리고 transport 역할은 둘로 나눠 읽어야 한다.

- local realtime frame path
  - `startRealtimeStream`
  - `getRealtimeFrame`
- remote CRT path
  - `webrtc_offer`
  - `webrtc_add_ice`
  - `webrtc_close`
  - `v4_webrtc_data_send`
