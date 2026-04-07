# PLAN 00: Source Baseline

## 목표

원본 MUSU의 WebRTC / realtime stream / terminal viewer 축을 `MUSU-CRT` 작업공간 기준으로 다시 매핑한다.

## 범위

- source anchor 수집
- frontend / backend plane 구분
- 다음 세부 플랜의 진입점 정의

## 현재 truth

- 원본 MUSU에는 이미 WebRTC command와 stream viewer가 있다.
- 아직 `MUSU-CRT`에서는 구조화된 source map만 생긴 상태다.

## 작업 목록

1. command catalog 확인
2. tauri wrapper 확인
3. stream viewer 확인
4. realtime hook 확인
5. backend command 확인
6. source map 작성

## 완료 기준

- [CRT_SOURCE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_SOURCE_MAP.md) 가 존재한다.
- `signaling`, `stream`, `terminal/data` 3 plane이 구분된다.
