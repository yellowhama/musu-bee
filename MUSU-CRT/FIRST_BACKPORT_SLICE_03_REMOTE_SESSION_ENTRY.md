# Backport Slice 03 Remote Session Entry

작성일: 2026-04-02

## 목적

`Slice 3 - remote session controller`의 반영 범위와 진입 파일을 미리 고정한다.

## slice 이름

`Slice 3 - remote session controller`

## 반영 범위

포함:

- remote attach / close / state surface 정리
- local path와 remote path 경계 강화
- WebRTC session state를 viewer shell 바깥으로 끌어낼 준비

제외:

- signaling infra 재설계
- auth / relay / room orchestration
- viewer layout redesign

## 원본 진입 파일

frontend:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/components/viewer/StreamViewer.tsx)

backend:

- [/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs](/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/webrtc.rs)

canonical 참조:

- [/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/remote_session_adapter.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/remote_session_adapter.ts)
- [/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/remote_session_controller.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/stream/remote_session_controller.ts)
- [RUNTIME_REFACTOR_GATE.md](/home/hugh51/musu-functions/MUSU-CRT/RUNTIME_REFACTOR_GATE.md)
- [BACKPORT_EXECUTION_SEQUENCE.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_EXECUTION_SEQUENCE.md)

## 선행 조건

- slice 1 signaling: applied + proven
- slice 2 local stream split: applied + proven

## 검증 기준

- remote attach / close surface regression 없음
- viewer state transition regression 없음
- build / targeted test / runtime smoke 통과

## 현재 상태

entry note 준비 완료
실제 적용은 slice 2 smoke proof가 닫힌 뒤에만 시작한다
