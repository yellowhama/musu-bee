# Workforce Plane Productization Map

## 목적

`Codex = manager`, `BitNet = employee` 구조를 회사 전용 운영 규칙이 아니라 제품 runtime capability로 다시 정리한다.

## source proof

- `musu_corp` Codex/BitNet company model
- queue worker assignment
- persistent BitNet employee service

## product interpretation

이 구조는 단순 사람 조직도가 아니라, MUSU 제품이 가져야 할 `multi-worker runtime policy`다.

즉 제품 관점에서는:

- `Codex`
  - planning / strategy / approval / complex execution
- `BitNet`
  - triage / reporting / summary / cheap repeat work

를 맡는 worker plane으로 읽는다.

## target owner

- 1차 owner: `musu-functions` 루트 runtime capability
- policy/domain 연결:
  - queue family and governance: `MUSU-WORKS`

## product capability components

### 1. worker profiles

- provider-backed manager worker
- low-cost local employee worker

### 2. worker routing

- queue family별 primary/fallback worker
- risk / cost / reasoning depth 기준 routing

### 3. resident services

- persistent BitNet employee service
- future persistent manager/agent services

### 4. result and review coupling

- worker result
- retryable / blocked / approval
- board / morning review feedback

## not final product owners

- 실제 company-specific queue assignments
- 실제 board decision logs
- 실제 overnight reports

이건 여전히 `musu_corp` 같은 company instance에 남는 것이 맞다.

## first productization cut

1. workforce model language 고정
2. worker profile/routing를 제품 runtime capability로 분리
3. resident low-cost worker service를 공용 infra로 분류
