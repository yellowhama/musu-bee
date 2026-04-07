# CRT Transport Architecture

## 목표

`MUSU-CRT`의 transport 역할을 고정한다.

핵심 원칙은 단순하다.

- cross-computer CRT의 primary transport는 `WebRTC + WebSocket`
- `HTTP`는 bootstrap / metadata / local proof / fallback only

## 왜 이 구분이 필요한가

`MUSU-CRT` 작업공간에는 정적 viewer와 mock harness를 열기 위해 `python http.server`를 쓴다.

이건 개발 편의를 위한 파일 서빙일 뿐이고, 실제 제품 transport 구조를 뜻하지 않는다.

원격 CRT는 결국 아래를 만족해야 한다.

- 낮은 지연의 stream
- 양방향 control
- terminal/data relay
- reconnect / session status
- signaling exchange

이 요구에는 HTTP polling보다 `WebRTC`와 `WebSocket`이 맞다.

## 원본 코드 근거

- frontend stream path
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
- viewer
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)
- backend WebRTC commands
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

원본에서 보이는 transport 축은 크게 둘이다.

- local realtime frame path
  - `startRealtimeStream`
  - `getRealtimeFrame`
- remote WebRTC path
  - `webrtc_offer`
  - `webrtc_add_ice`
  - `webrtc_close`
  - `v4_webrtc_data_send`

즉 원본도 이미 local path와 remote path가 섞여 있다.
`MUSU-CRT`에서는 이 둘을 구분해서 읽어야 한다.

## 역할 분담

### HTTP

용도:

- local mock / harness proof
- bootstrap metadata fetch
- fixture loading
- diagnostics / fallback

비고:

- remote stream / remote control의 주 transport로 쓰지 않는다

### WebSocket

용도:

- signaling relay
- session control events
- reconnect / presence / state relay
- WebRTC unavailable 시 limited fallback control plane

### WebRTC

용도:

- primary remote stream
- low-latency remote interaction
- terminal/data channel
- remote input/control

## MUSU-CRT 권장 구조

1. bootstrap
   - HTTP 또는 WS로 최소 metadata/session description 확보
2. signaling
   - WS 기반 signaling 우선
   - 필요시 Tauri command bridge와 결합
3. stream
   - WebRTC primary
4. terminal/data
   - WebRTC data channel primary
   - WS fallback optional
5. diagnostics
   - HTTP/JSON debug endpoint 또는 local mock fixture 사용 가능

## 현재 harness 해석

- `viewer/`
  - screen tab repro proof
- `harness/signaling`
  - signaling contract proof
- `harness/stream-lifecycle`
  - stream lifecycle contract proof
- `harness/terminal-data-plane`
  - terminal/data plane contract proof

이 harness들은 모두 local proof artifact다.
원격 CRT transport 그 자체는 아니다.

## 다음 구현 우선순위

1. signaling extracted adapter를 `WS/WebRTC handshake` 기준으로 정리
2. stream adapter candidate에서 local frame polling과 remote WebRTC path를 분리
3. terminal/data plane에서 WebRTC data channel을 primary로 문서화
