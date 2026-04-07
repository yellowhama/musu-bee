# PLAN 10: Signaling Adapter Slice

## 목표

원본 MUSU에서 떼어낼 최소 signaling adapter 슬라이스를 코드 레벨로 고정한다.

## 범위

- frontend wrapper surface
- backend command surface
- incoming data callback의 분리 대상 식별

## 작업 목록

1. wrapper surface anchor 재확인
2. backend command anchor 재확인
3. `webrtc_offer` 내부 callback을 별도 bridge 대상로 명시
4. 최소 slice 문서화

## 완료 기준

- [SIGNALING_ADAPTER_SLICE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_ADAPTER_SLICE_MAP.md) 가 존재한다.
