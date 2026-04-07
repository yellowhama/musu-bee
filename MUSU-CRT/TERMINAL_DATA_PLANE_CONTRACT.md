# MUSU-CRT Terminal Data Plane Contract

작성일: 2026-04-01

## 목적

원본 MUSU에서 WebRTC data channel과 terminal bridge가 어떻게 연결되는지 분리한다.

## source anchor

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/LiveView.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/lighthouse/LiveView.tsx)

## 핵심 흐름

1. WebRTC session이 생성된다.
2. data channel message callback이 등록된다.
3. backend는 webrtc session id와 terminal session id를 매핑한다.
4. 수신 data는 base64로 변환되어 terminal send command로 전달된다.
5. 반대 방향 전송은 `v4_webrtc_data_send`가 담당한다.

## commands

### incoming

- on data channel message
- resolve terminal session
- `terminal_send(...)`

### outgoing

- `v4_webrtc_data_send(webrtcSessionId, dataBase64)`

## boundary

terminal/data plane은 아래 둘 사이의 bridge다.

- WebRTC data channel
- terminal session transport

## out of scope

- terminal renderer UI
- terminal permission model
- cross-peer auth

## 현재 결론

`MUSU-CRT`의 terminal/data plane은 viewer UI보다 backend bridge 성격이 더 강하다.
따라서 extracted harness를 만들 때도 stream plane과 별도 슬라이스로 분리하는 편이 맞다.
