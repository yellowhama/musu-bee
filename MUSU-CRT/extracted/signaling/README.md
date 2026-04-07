# MUSU-CRT Extracted Signaling Candidate

이 디렉터리는 `MUSU-CRT`에서 첫 번째 실제 추출 후보인 signaling slice를 담는다.

## 목적

원본 MUSU의 WebRTC signaling surface를 viewer/UI와 분리해, 독립 adapter boundary로 보는 연습용 슬라이스다.

## 파일

- `contract.ts`
  - extracted signaling contract
- `mock_adapter.ts`
  - mock answer/add_ice/close adapter

## 현재 범위

- `offer`
- `addIce`
- `close`

## 비범위

- 실제 WebRTC stack
- TURN/STUN orchestration
- auth/identity
