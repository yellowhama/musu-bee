# Backport Slice Strategy

작성일: 2026-04-02

## 목적

`MUSU-CRT` canonical 산출물을 원본 repo에 한 번에 전부 반영하지 않고, 작은 bounded slice로 나눠서 옮기는 전략을 고정한다.

여기서 `slice`는 아래를 만족하는 최소 반영 단위다.

- 변경 책임이 하나로 설명된다
- 대응 원본 파일이 명확하다
- build / targeted test / runtime smoke로 검증 가능하다
- 실패 시 영향 범위를 국소화할 수 있다

## 현재 판단

현재는 `Go-ready` 상태다.

확보된 증거:

- canonical implementation complete
- canonical harness proof complete
- original repo `cargo build` pass
- original repo `mcp/health` pass
- original repo targeted `cargo test` pass

즉 이제 남은 건 기술 검증이 아니라, 어떤 slice부터 넣을지 순서를 고정하는 일이다.

## slice 원칙

1. signaling 먼저
   - transport entry를 가장 먼저 얇게 만든다
2. local path next
   - 기존 realtime frame path를 더 읽기 쉬운 구조로 나눈다
3. remote controller later
   - WebRTC attach / session state는 마지막에 올린다
4. viewer UX는 마지막
   - UI는 runtime/controller 경계가 안정된 뒤에만 따라간다

## 제안 slice

### Slice 1: signaling thin slice

반영 대상:

- `extracted/signaling/adapter.ts`
- `extracted/signaling/bridge_handler.ts`
- `extracted/signaling/session_coordinator.ts`

원본 대응:

- `src-tauri/src/commands/webrtc.rs`
- `src/lib/tauri.ts`

목표:

- signaling command boundary를 얇게 만든다
- bridge callback 책임을 분리한다
- 상태 / close semantics를 command body 밖으로 끌어낸다

검증:

- `cargo build -p musu-desktop`
- targeted `cargo test`
- `mcp/health`

### Slice 2: local stream split

반영 대상:

- `extracted/stream/local_frame_adapter.ts`
- `extracted/stream/frame_parser.ts`
- `extracted/stream/metrics_collector.ts`
- `extracted/stream/reconnect_policy.ts`
- `extracted/stream/local_stream_controller.ts`

원본 대응:

- `src/hooks/useRealtimeStream.ts`
- 필요 시 support helper 파일

목표:

- local polling / frame parse / metrics / reconnect를 분리한다
- hook shell의 책임을 줄인다

검증:

- frontend build
- local stream smoke
- existing viewer regression 없음

### Slice 3: remote session controller

반영 대상:

- `extracted/stream/remote_session_adapter.ts`
- `extracted/stream/remote_session_controller.ts`

원본 대응:

- `src/components/viewer/StreamViewer.tsx`
- `src-tauri/src/commands/webrtc.rs`

목표:

- remote attach / close / state surface를 명시한다
- local path와 remote path를 분리한다

검증:

- WebRTC signaling regression 없음
- session attach / close smoke

## 하지 말아야 할 것

- slice 1에서 viewer redesign까지 같이 넣지 않는다
- slice 1에서 auth / multi-peer room / relay infra를 같이 넣지 않는다
- canonical harness 코드를 그대로 복붙하지 않는다

## 현재 추천

첫 backport slice는 `Slice 1: signaling thin slice`가 맞다.

이유:

- 변경 범위가 가장 작다
- 원본 대응 파일이 적다
- build/test 증거가 이미 확보돼 있다
- 이후 local/remote split의 기반이 된다
