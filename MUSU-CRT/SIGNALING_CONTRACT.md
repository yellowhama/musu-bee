# MUSU-CRT Signaling Contract

작성일: 2026-04-01

## 목적

원본 MUSU의 WebRTC signaling surface를 `MUSU-CRT` 기준으로 분리한다.

## source anchors

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

## commands

### `webrtc_offer`

입력:

- `webrtcSessionId`
- `windowId`
- `offerSdp`
- `clientIceCandidates`

출력:

- `answer_sdp`
- `host_ice_candidates`

역할:

- offer/answer 교환 시작
- host 측 ICE 수집 결과 반환

### `webrtc_add_ice`

입력:

- `webrtcSessionId`
- `iceCandidateJson`

역할:

- remote ICE 후보 추가

### `webrtc_close`

입력:

- `webrtcSessionId`

역할:

- 해당 WebRTC 세션 종료

## frontend wrapper

원본 frontend는 tauri wrapper로 command를 감싼다.

- `webrtcOffer(...)`
- `webrtcAddIce(...)`
- `webrtcClose(...)`

즉 `MUSU-CRT` 기준 signaling plane은 browser WebRTC API 직호출이 아니라, frontend wrapper -> tauri command -> backend signaling adapter 흐름이다.

## current contract boundary

`MUSU-CRT`에서 고정할 boundary:

1. session id ownership
2. offer/answer payload shape
3. ice candidate append flow
4. close semantics

## out of scope

- TURN/STUN 상세 정책
- multi-peer room orchestration
- remote auth/identity

## 현재 결론

signaling plane은 이미 원본 MUSU 안에서 독립 command surface를 가진다.
따라서 extracted harness의 첫 후보는 `webrtc_offer/add_ice/close` contract다.
