# MUSU-CRT Spec

작성일: 2026-04-01

## 목적

`MUSU-CRT`는 원본 MUSE/MUSE-BEE의 CRT 축을 bounded context로 추출하기 위한 canonical spec 작업공간이다.

## 문제 정의

원본 코드에는 아래가 한 묶음처럼 섞여 있다.

- local realtime frame path
- WebRTC signaling path
- remote stream viewer UX
- terminal/data channel bridge
- screen tab / gallery interaction

`MUSU-CRT`의 목적은 이 기능을 transport와 plane 기준으로 다시 나누어 보는 것이다.

## 범위

포함:

- signaling contract
- stream lifecycle contract
- terminal/data plane contract
- screen tab repro
- mock harness
- canonical direct smoke
- remote session canonical harness
- extraction/backport boundary

제외:

- full production signaling server
- TURN/STUN infra
- auth / identity / multi-peer room
- actual native extraction implementation 완료

## transport spec

- `WebRTC`
  - primary remote stream and data transport
- `WebSocket`
  - signaling / control fallback
- `HTTP`
  - bootstrap / metadata / local proof / fallback only

## plane spec

### 1. signaling plane

명령:

- `webrtc_offer`
- `webrtc_add_ice`
- `webrtc_close`

주 책임:

- offer / answer 교환
- ICE candidate append
- session close

### 2. stream lifecycle plane

local path:

- `startRealtimeStream`
- `getRealtimeFrame`
- `stopRealtimeStream`

remote path:

- signaling 완료 후 WebRTC attach
- reconnect / quality / close

주 책임:

- frame attach
- metrics
- reconnect state

### 3. terminal / data plane

명령:

- `v4_webrtc_data_send`
- incoming data channel -> `terminal_send`

주 책임:

- terminal/data bridge
- data channel payload send/receive

### 4. viewer UX plane

주 책임:

- screen tab
- focused stream panel
- status/quality overlay
- remote control affordance

## canonical artifacts

- screen tab repro viewer
- signaling harness
- stream lifecycle harness
- terminal/data harness
- canonical harness
- canonical smoke script
- extracted signaling candidate
- remote session canonical panel

## current canonical proof state

- signaling thin slice: canonical proof complete
- local stream split: canonical proof complete
- remote session controller: canonical harness proof complete

## next extraction order

1. remote session controller backport timing decision
2. runtime-facing refactor/backport gate reaffirm
3. terminal/data bridge adapter
