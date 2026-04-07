# PLAN 07: Refactor Entry Slicing

## 목표

원본 MUSU에서 `MUSU-CRT` 관점으로 실제 refactor를 시작할 때의 진입 순서를 고정한다.

## 범위

- signaling first
- stream second
- terminal/data third

## 현재 truth

- mock repro와 extracted candidate는 이미 있다.
- 이제 남은 건 실제 원본 진입 순서를 고정하는 일이다.

## 작업 목록

1. 원본 진입 순서 문서화
2. 첫 cut list 정리
3. why signaling first 근거 정리

## 완료 기준

- [ORIGINAL_REFACTOR_ENTRY_SLICING.md](/home/hugh51/musu-functions/MUSU-CRT/ORIGINAL_REFACTOR_ENTRY_SLICING.md) 가 존재한다.
