# PLAN 04: Terminal Data Plane

## 목표

원본 MUSU의 terminal/data channel bridge를 `MUSU-CRT` 기준으로 분리한다.

## 범위

- incoming data callback
- terminal session mapping
- outgoing data send
- bridge boundary

## 현재 truth

- `webrtc.rs`에 bridge의 핵심이 이미 존재한다.

## 작업 목록

1. incoming flow 정리
2. outgoing flow 정리
3. bridge ownership 정리
4. out-of-scope 정리

## 완료 기준

- [TERMINAL_DATA_PLANE_CONTRACT.md](/home/hugh51/musu-functions/MUSU-CRT/TERMINAL_DATA_PLANE_CONTRACT.md) 가 존재한다.
