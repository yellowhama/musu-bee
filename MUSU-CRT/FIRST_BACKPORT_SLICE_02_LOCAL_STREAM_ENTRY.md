# Backport Slice 02 Local Stream Entry

작성일: 2026-04-02

## 목적

`Slice 2 - local stream split`의 원본 진입 파일, 반영 범위, 검증 순서, proof gap을 고정한다.

## slice 이름

`Slice 2 - local stream split`

## 현재 상태

현재 원본 repo에는 local stream split 관련 코드가 일부 이미 들어가 있다.

확인된 적용 상태:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)
  - parser / metrics / reconnect / frame build 로직이 helper import로 분리됨
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStreamSupport.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStreamSupport.ts)
  - local path support helper가 별도 파일로 존재

즉 상태는 `not untouched`, `applied candidate`다.

## 반영 범위

포함:

- local polling loop shell 유지
- raw frame parse 분리
- metrics collector 분리
- reconnect policy 분리
- frame object build 분리

제외:

- remote WebRTC session controller
- viewer UI 변경
- signaling command boundary 변경
- auth / relay / room 확장

## 원본 진입 파일

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStream.ts)
- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStreamSupport.ts](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/useRealtimeStreamSupport.ts)

canonical 참조:

- [STREAM_PATH_SPLIT_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_PATH_SPLIT_MAP.md)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/local_frame_adapter.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/local_frame_adapter.ts)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/frame_parser.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/frame_parser.ts)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/metrics_collector.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/metrics_collector.ts)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/reconnect_policy.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/reconnect_policy.ts)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/local_stream_controller.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/local_stream_controller.ts)

## 검증 순서

1. frontend build

```powershell
cd F:\Aisaak\Projects\Musu-new\release\musu-desktop
npm run build
```

또는 repo 기준 frontend build command를 사용한다.

2. desktop build

```powershell
cd F:\Aisaak\Projects\Musu-new\release\musu-desktop
cargo build -p musu-desktop
```

3. local stream smoke

- stream viewer 진입
- frame 수신
- reconnect / metrics surface regression 없음 확인

## proof gap

현재 확보된 것은 backend 중심 proof다.

아직 명시적으로 닫히지 않은 것:

- frontend build proof
- local stream viewer smoke proof

즉 `Slice 2`는 `applied candidate, proof pending`으로 기록한다.

## 성공 기준

- helper 분리가 유지된다
- hook shell은 local polling orchestration만 남는다
- local stream viewer regression이 없다
- 다음 slice인 remote session controller와 경계가 더 선명해진다
