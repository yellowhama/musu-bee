# MUSU-CRT Signaling Extracted Candidate

작성일: 2026-04-01

## 목적

`MUSU-CRT`에서 first extracted slice로 signaling-only candidate를 고정한다.

## 추출 파일

- [extracted/signaling/contract.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/contract.ts)
- [extracted/signaling/mock_adapter.ts](/home/hugh51/musu-functions/MUSU-CRT/extracted/signaling/mock_adapter.ts)

## 경계

포함:

- `offer`
- `addIce`
- `close`

제외:

- actual stream lifecycle
- data channel terminal bridge
- UI overlay/state

## 왜 이게 첫 후보인가

- command boundary가 이미 원본에서 분리돼 있다.
- frontend wrapper와 backend command 사이 계약이 비교적 안정적이다.
- stream/terminal보다 coupling이 낮다.
- transport-first 관점에서도 `WebRTC + WebSocket` 진입점으로 가장 먼저 고정할 수 있다.

## 다음 단계

이후 실제 추출을 한다면 아래 순서를 권장한다.

1. signaling adapter
2. stream lifecycle adapter
3. terminal/data bridge adapter
