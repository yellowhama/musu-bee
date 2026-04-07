# Backport Slice 01 Signaling Proof

작성일: 2026-04-02

## 목적

`Slice 1 - signaling thin slice`가 원본 repo에 실제로 반영 가능한 상태를 넘어서, 이미 적용된 코드와 검증 결과가 서로 맞아떨어진다는 점을 기록한다.

## 적용 확인

backend:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)
  - `webrtc_offer` 내부의 incoming data callback inline 구현이 제거됐다
  - `super::webrtc_bridge::build_incoming_data_handler(...)`로 thin boundary가 생겼다
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc_bridge.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc_bridge.rs)
  - terminal forward bridge 책임이 별도 helper로 분리됐다
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/mod.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/mod.rs)
  - `webrtc_bridge` 모듈 export가 추가됐다

frontend:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
  - `webrtcOffer`, `webrtcAddIce`, `webrtcClose` wrapper surface는 이미 stable entry로 존재한다
  - slice 1에서는 runtime contract 변경 없이 기존 wrapper를 entry로 유지한다

## 검증 결과

### build

- original repo `cargo build -p musu-desktop`: pass

### targeted test

- `cargo test -p musu-desktop mcp_broker::builtin::tests:: -- --nocapture`
- 결과: `8 passed; 0 failed`

### runtime health

- `http://127.0.0.1:8792/mcp/health`
- 결과:

```json
{
  "service": "musu-broker",
  "status": "ok",
  "version": "0.1.0"
}
```

## 판단

`Slice 1 - signaling thin slice`는 `ready`가 아니라 `applied + proven` 상태로 본다.

즉 다음 active slice는 `Slice 2 - local stream split`이다.
