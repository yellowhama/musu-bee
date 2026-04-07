# Backport-Later Policy

작성일: 2026-04-01

## 원칙

`MUSU-CRT`의 canonical 구현 공간은 [`/home/hugh51/musu-functions/MUSU-CRT`](/home/hugh51/musu-functions/MUSU-CRT)다.

원본 제품 repo인 [`/mnt/f/Aisaak/Projects/Musu-new`](/mnt/f/Aisaak/Projects/Musu-new)은 아래 용도로만 본다.

- source truth 확인
- API / command surface 비교
- 나중 backport 대상 확인

## 지금 하지 않는 것

- `Musu-new`를 구현 주 작업공간으로 쓰지 않는다
- 새 설계나 새 리팩터링을 먼저 `Musu-new`에 넣지 않는다
- runtime proof가 닫히기 전에는 backport를 기본 경로로 삼지 않는다

## 지금 하는 것

1. `MUSU-CRT`에서 contract를 만든다
2. `MUSU-CRT`에서 extracted candidate code를 만든다
3. `MUSU-CRT`에서 harness/mock/viewer로 shape를 검증한다
4. 그 다음에만 원본으로 backport cut을 정한다

## backport 진입 조건

- signaling slice가 `MUSU-CRT`에서 안정화됨
- stream local/remote split이 `MUSU-CRT`에서 안정화됨
- runtime refactor gate가 닫힘

## 결론

앞으로 `MUSU-CRT`에서 구현하고,
`Musu-new`는 compare / verify / backport-later 대상으로만 쓴다.
