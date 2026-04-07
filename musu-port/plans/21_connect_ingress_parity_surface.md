# 21 Connect Ingress Parity Surface

## 목표

원본 포트 매니저와 비교했을 때 아직 남아 있는
CONNECT ingress parity 차이를 정리하고, standalone `musu-port`에 필요한 범위만 구현한다.

## 배경

현재 remaining parity gap:

- `/audit/connect-denied`
- `/connect/{service}`
- connect denied detail audit sync

이건 `musu-connects`와는 별개로,
local ingress control-plane 자체의 parity 항목이다.

## 이번 단계 범위

- `/audit/connect-denied` surface
- connect allowlist policy 평가
- denied audit event buffering/persistence 연계
- 필요 시 `/connect/{service}` minimal tunnel surface

## 제외 범위

- remote peer tunnel
- full enterprise proxy policy
- UI polling bridge

## 구현 작업 목록

- original desktop connect policy flow 재분석
- minimal state/metrics contract 추가
- denied audit drain endpoint 추가
- parity report 갱신

## 검증 방법

- unit test
- parity integration test
- `cargo test -p musu-port-core`
- `cargo check`

## 완료 기준

- standalone 기준 connect ingress parity 남은 차이가 줄어든다
- `PARITY_REPORT.md`에 남는 차이가 더 작고 명확해진다

## 현재 상태

- `/audit/connect-denied`와 `?drain=true` buffer drain이 구현됐다
- `/connect/{service}` minimal decision surface가 구현됐다
- denied decision은 audit persistence에 기록된다
- 원본 desktop의 `high severity coverage gaps` blocker를 반영했다
- `/connect/{service}`는 `delivery_contract=connect_url_handoff` 계약으로 고정했다
- actual remote peer bridge는 `musu-connects` 범주로 분리했다
