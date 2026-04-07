# PLAN 21 - Backport Slice Strategy

## 목표

`MUSU-CRT` canonical 산출물을 원본 repo에 어떤 순서로, 어떤 검증 게이트를 거쳐 반영할지 slice 기준으로 고정한다.

## 완료 기준

- `BACKPORT_SLICE_STRATEGY.md` 작성
- slice 1 / 2 / 3 정의
- 첫 slice 추천안 명시
- 각 slice별 검증 기준 명시

## 범위

- signaling thin slice
- local stream split
- remote session controller

## 비범위

- 실제 backport 코드 적용
- viewer redesign
- auth / relay / multi-peer 확장

## 출력물

- [BACKPORT_SLICE_STRATEGY.md](/home/hugh51/musu-functions/MUSU-CRT/BACKPORT_SLICE_STRATEGY.md)

## 현재 결론

첫 backport slice는 signaling thin slice다.
