# Extraction Implementation Progress

작성일: 2026-04-01

## 이번 턴 구현

### signaling

- thin adapter 후보 추가
  - [extracted/signaling/adapter.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/adapter.ts)
- bridge handler 후보 추가
  - [extracted/signaling/bridge_handler.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/bridge_handler.ts)
- 원본 코드 refactor cut 반영
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc_bridge.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc_bridge.rs)
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

### stream

- stream split 후보 폴더 추가
  - [extracted/stream/README.md](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/README.md)
- local adapter
  - [extracted/stream/local_frame_adapter.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/local_frame_adapter.ts)
- parser
  - [extracted/stream/frame_parser.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/frame_parser.ts)
- metrics
  - [extracted/stream/metrics_collector.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/metrics_collector.ts)
- reconnect
  - [extracted/stream/reconnect_policy.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/reconnect_policy.ts)
- remote path placeholder
  - [extracted/stream/remote_session_adapter.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/remote_session_adapter.ts)
- 원본 코드 refactor cut 반영
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStreamSupport.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStreamSupport.ts)
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)

## 의미

이제 `MUSU-CRT`는 문서와 mock만 있는 상태가 아니라,
원본 코드에서 어떤 얇은 adapter와 분리 단위를 가져와야 하는지 코드 shape까지 가진 상태다.

또한 첫 refactor cut이 실제 원본 MUSU 코드에도 들어가서,
`MUSU-CRT`와 원본 사이의 거리가 문서-only 단계는 아니게 됐다.
