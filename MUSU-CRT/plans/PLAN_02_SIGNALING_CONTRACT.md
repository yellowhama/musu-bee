# PLAN 02: Signaling Contract

## 목표

원본 MUSU의 WebRTC signaling plane을 `MUSU-CRT` 기준으로 독립 문서로 고정한다.

## 범위

- offer
- add ice
- close
- frontend wrapper
- backend command boundary

## 현재 truth

- signaling surface는 원본에서 이미 독립 command/tauri wrapper를 가진다.

## 작업 목록

1. source anchor 확인
2. command shape 정리
3. frontend wrapper 정리
4. boundary/out-of-scope 정리

## 완료 기준

- [SIGNALING_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_CONTRACT.md) 가 존재한다.
