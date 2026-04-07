# Backport-Later Checklist

작성일: 2026-04-01

## 목적

`MUSU-CRT` canonical 구현을 언제, 어떤 순서로 원본 repo로 가져갈지 최종 체크리스트를 고정한다.

## Backport 대상 우선순위

### 1. signaling thin slice

파일:

- `extracted/signaling/contract.ts`
- `extracted/signaling/adapter.ts`
- `extracted/signaling/bridge_handler.ts`
- `extracted/signaling/session_coordinator.ts`

원본 대응:

- `src-tauri/src/commands/webrtc.rs`
- `src/lib/tauri.ts`

### 2. local stream split

파일:

- `extracted/stream/local_frame_adapter.ts`
- `extracted/stream/frame_parser.ts`
- `extracted/stream/metrics_collector.ts`
- `extracted/stream/reconnect_policy.ts`
- `extracted/stream/local_stream_controller.ts`

원본 대응:

- `src/hooks/useRealtimeStream.ts`
- `src/hooks/useRealtimeStreamSupport.ts`

### 3. remote session controller

파일:

- `extracted/stream/remote_session_adapter.ts`
- `extracted/stream/remote_session_controller.ts`

원본 대응:

- `src/components/viewer/StreamViewer.tsx`
- `src-tauri/src/commands/webrtc.rs`

## 진입 조건

- canonical harness에서 state shape 확인
- transport-first 원칙 유지
- runtime refactor gate 문서화 완료
- 원본 repo에서 compile/runtime proof 가능

## 하지 말아야 할 것

- harness/mock과 무관한 production infra를 먼저 가져가지 않는다
- auth/identity/multi-peer room을 backport 첫 단계에 넣지 않는다
- `Musu-new`를 새 설계의 primary 구현 공간으로 되돌리지 않는다

## 마지막 판단 기준

backport는 "문서가 있다"가 아니라 아래가 충족될 때만 한다.

1. canonical code shape가 있다
2. harness proof가 있다
3. refactor gate가 닫혔다
4. 원본 대응 파일이 명확하다
