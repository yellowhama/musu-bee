# PLAN 22 - First Backport Slice Signaling

## 목표

원본 repo에 가장 먼저 반영할 bounded slice를 signaling thin slice로 고정하고, 진입 파일과 검증 순서를 준비한다.

## 대상

- `webrtc.rs`
- frontend signaling bridge entry
- bridge callback 분리 지점

## 입력 근거

- [SIGNALING_ADAPTER_SLICE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_ADAPTER_SLICE_MAP.md)
- [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)
- [BACKPORT_LATER_CHECKLIST.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_LATER_CHECKLIST.md)

## 작업 순서

1. 원본 대응 파일 다시 고정
2. bridge handler responsibility cut 재확인
3. build / targeted test / health 검증 순서 고정
4. 실제 적용 전 체크리스트 작성

## 완료 기준

- 첫 slice entry files 고정
- 검증 명령 고정
- rollback 관점 기록

## 출력물

- first slice entry note
- updated todo board

## 결과

- [FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md](/home/hugh51/musu-functions/MUSU-CRT/FIRST_BACKPORT_SLICE_SIGNALING_ENTRY.md)
