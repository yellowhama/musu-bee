# Signaling Adapter Slice Map

작성일: 2026-04-01

## 목적

원본 MUSU에서 실제로 떼어낼 최소 signaling adapter 슬라이스를 코드 레벨로 고정한다.

## 원본 anchor

- frontend wrapper
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
- backend command
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)
- command catalog
  - [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts)

## 최소 슬라이스

### frontend side

- `webrtcOffer(...)`
- `webrtcAddIce(...)`
- `webrtcClose(...)`

이 셋은 UI와 분리 가능한 wrapper surface다.

### backend side

- `webrtc_offer(...)`
- `webrtc_add_ice(...)`
- `webrtc_close(...)`

여기서 핵심 의존성은 `hive_link::infrastructure::webrtc::*`다.

## 현재 coupling

가장 큰 결합점은 `webrtc_offer(...)` 안에 들어간 incoming data message callback이다.

현재 이 callback은:

1. `relay_buffers`에서 terminal session을 찾고
2. data를 base64로 바꾼 뒤
3. `terminal_send(...)`로 넘긴다

즉 signaling command 안에 terminal/data bridge가 일부 섞여 있다.

## 첫 분리 원칙

첫 cut에서는 signaling adapter와 bridge callback을 문서상으로는 분리해서 본다.

- signaling adapter
  - offer / addIce / close
- bridge callback
  - incoming data -> terminal resolution / send

## 추천 추출 순서

1. wrapper surface를 독립 module contract로 정리
2. backend command surface를 thin adapter로 재정의
3. incoming data callback을 별도 bridge handler 후보로 이동

## 결론

첫 실제 추출은 `webrtc_offer/add_ice/close` command surface부터 시작하되,
`webrtc_offer` 내부 callback은 같은 파일에 남겨두지 말고 다음 단계에서 분리할 대상으로 명시해야 한다.
