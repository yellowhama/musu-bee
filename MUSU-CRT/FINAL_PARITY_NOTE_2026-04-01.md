# MUSU-CRT Final Parity Note

작성일: 2026-04-01

## 목적

`MUSU-CRT`에서 만든 contract, repro, harness가 원본 MUSU와 어떤 관계인지 마지막으로 정리한다.

## 확보된 것

- 원본 CRT source map
- screen tab source analysis
- screen tab repro viewer
- signaling contract
- stream lifecycle contract
- terminal/data plane contract
- extracted harness plan
- signaling-only extracted candidate
- harness smoke proof

## 아직 원본과 동일하지 않은 것

- 실제 WebRTC 세션 연결
- 실제 thumbnail polling/runtime capture
- terminal attach와 clipboard/input delegation
- backend signaling adapter의 독립 runtime 추출

## 현재 결론

`MUSU-CRT`는 원본 MUSU의 CRT 축을 완전히 대체하는 구현이 아니다.

하지만 아래는 이미 닫혔다.

- bounded context 이름
- source anchor
- plane 분리
- screen tab shell repro
- first extracted candidate

즉 이후 원본 refactor/backport는 이 작업공간을 기준으로 더 작은 단위로 진행할 수 있다.
