# Runtime Refactor Gate

작성일: 2026-04-01

## 목적

runtime-facing refactor/backport로 넘어가기 전에 필요한 gate를 고정한다.

## Gate 1. signaling slice 고정

필수 산출물:

- [SIGNALING_ADAPTER_SLICE_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/SIGNALING_ADAPTER_SLICE_MAP.md)

확인점:

- wrapper surface가 독립적으로 보이는가
- backend command surface가 thin adapter로 재정의 가능한가
- terminal/data callback이 다음 분리 대상으로 명시됐는가

## Gate 2. stream path split 고정

필수 산출물:

- [STREAM_PATH_SPLIT_MAP.md](/home/hugh51/musu-functions/MUSU-CRT/STREAM_PATH_SPLIT_MAP.md)

확인점:

- local polling path와 remote WebRTC path가 구분됐는가
- metrics / reconnect / parser가 별도 후보 단위로 식별됐는가

## Gate 3. transport-first consistency

필수 산출물:

- [CRT_TRANSPORT_ARCHITECTURE.md](/home/hugh51/musu-functions/MUSU-CRT/CRT_TRANSPORT_ARCHITECTURE.md)

확인점:

- `HTTP fallback / WS+WebRTC primary`가 master/current/todo/spec에 반영됐는가

## Gate 4. runtime proof 범위 제한

runtime refactor/backport 이전에는 아래를 하지 않는다.

- production signaling infra 구현
- auth/identity 도입
- multi-peer room orchestration

## 결론

위 gate가 닫히기 전에는 runtime-facing refactor/backport로 넘어가지 않는다.
