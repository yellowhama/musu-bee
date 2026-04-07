# First Backport Slice Signaling Entry

작성일: 2026-04-02

## 목적

원본 repo에 가장 먼저 반영할 signaling thin slice의 진입 파일, 반영 범위, 검증 순서, rollback 기준을 고정한다.

## slice 이름

`Slice 1 - signaling thin slice`

## 반영 범위

포함:

- frontend signaling wrapper 정리
- backend `webrtc_offer / webrtc_add_ice / webrtc_close` thin boundary 정리
- incoming data callback의 bridge responsibility 분리 지점 명시
- session close / error / state semantics를 command body 바깥으로 빼기 위한 entry 준비

제외:

- viewer UX 변경
- local stream parse / metrics / reconnect split
- remote session controller 적용
- auth / room / relay / multi-peer 확장

## 원본 진입 파일

frontend:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/tauri.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/lib/commandCatalog.ts)

backend:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

canonical 참조:

- [SIGNALING_ADAPTER_SLICE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_ADAPTER_SLICE_MAP.md)
- [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/adapter.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/adapter.ts)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/bridge_handler.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/bridge_handler.ts)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/session_coordinator.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/session_coordinator.ts)

## 실제 반영 단위

### 1. backend command boundary

목표:

- `webrtc_offer` body에서 signaling 책임과 bridge 책임을 구분한다
- offer / addIce / close 흐름을 읽기 쉬운 thin entry로 만든다

변경 한계:

- Tauri command 이름은 바꾸지 않는다
- runtime behavior는 그대로 유지한다

### 2. frontend wrapper boundary

목표:

- offer / addIce / close wrapper를 signaling entry로 명시한다
- 이후 coordinator layer를 얹을 수 있게 shape를 맞춘다

변경 한계:

- consumer-facing command 이름은 바꾸지 않는다
- stream hook / viewer는 건드리지 않는다

## 검증 순서

1. Windows build

```powershell
cd F:\Aisaak\Projects\Musu-new\release\musu-desktop
cargo build -p musu-desktop
```

2. targeted test

```powershell
cd F:\Aisaak\Projects\Musu-new\release\musu-desktop
cargo test -p musu-desktop mcp_broker::builtin::tests:: -- --nocapture
```

3. runtime health

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8792/mcp/health"
```

4. CRT smoke

- app launch 후 기존 stream viewer regression 없는지 확인
- WebRTC command surface 이름 regression 없는지 확인

## rollback 기준

아래 중 하나면 즉시 slice를 되돌린다.

- `cargo build` 실패
- targeted `cargo test` 실패
- `mcp/health` 실패
- `webrtc_offer / add_ice / close` surface regression
- signaling과 무관한 viewer regression 발생

## 성공 기준

- signaling code가 얇은 진입점으로 읽힌다
- bridge callback 분리 지점이 명시된다
- 기존 runtime surface 이름과 behavior는 유지된다
- 다음 slice인 local stream split으로 자연스럽게 넘어갈 수 있다

## 다음 slice

다음은 `Slice 2 - local stream split`이다.
