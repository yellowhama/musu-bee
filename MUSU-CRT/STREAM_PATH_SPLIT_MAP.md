# Stream Path Split Map

작성일: 2026-04-01

## 목적

원본 MUSU의 stream plane에서 `local polling path`와 `remote WebRTC path`를 분리해 본다.

## 원본 anchor

- local stream hook
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)
- tauri wrapper
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
- viewer
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)
- backend WebRTC commands
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

## Path A: local polling path

구성:

- `startRealtimeStream(...)`
- `getRealtimeFrame(...)`
- frame parser
- metrics collector
- reconnect loop
- `stopRealtimeStream(...)`

특징:

- local/native capture 중심
- polling loop 기반
- viewer state와 강하게 연결

## Path B: remote WebRTC path

구성:

- signaling bootstrap
- offer / answer
- ICE append
- WebRTC attach
- data channel
- session close

특징:

- cross-computer CRT path
- polling보다 session/control 중심
- WebRTC transport 중심

## 현재 문제

`StreamViewer` 관점에서는 이 두 path가 "한 viewer 경험"으로 보이지만,
추출/리팩터링 관점에서는 adapter 책임이 다르다.

## 추천 분리 단위

1. `local_frame_adapter`
   - start / poll / stop
2. `stream_frame_parser`
   - raw frame -> metadata/payload
3. `stream_metrics_collector`
   - fps / size / totalMB / reconnects
4. `reconnect_policy`
   - retry/backoff
5. `remote_session_adapter`
   - WebRTC attach / close / state

## 결론

다음 단계에서는 `useRealtimeStream`를 통째로 떼어내려 하지 말고,
먼저 local path와 remote path를 분리하는 read map부터 고정해야 한다.
