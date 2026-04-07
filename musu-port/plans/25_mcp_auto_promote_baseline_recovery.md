# 25 MCP Auto Promote Baseline Recovery

## 목표

`musu-port`의 현재 red 상태를 먼저 닫는다.

구체적으로는 `cargo test -p musu-port-core`에서 깨진
`mcp_candidates_can_auto_promote_from_device_profile_policy`
회귀를 root-cause 기준으로 정리하고, auto-promote 정책을 다시 고정한다.

## 현재 관측 상태

2026-04-02 재검증 결과:

- `./scripts/linux-rust-env.sh cargo check` 통과
- `./scripts/linux-rust-env.sh cargo test -p musu-port-core` 실패
  - failing test:
    - `mcp_candidates_can_auto_promote_from_device_profile_policy`
  - failure:
    - `route alias did not appear: mcp-auto-promo`

현재 코드상 의심 지점:

- `state.rs`
  - `auto_promote_mcp_candidates`
  - `auto_promote_requires_template`
  - `match_device_service_template`
  - `classify_ai_native_endpoints`
- `parity_verification.rs`
  - auto-promote test fixture가 현재 discovery/runtime behavior와 어긋났을 가능성

## 조사 가설

우선 확인해야 할 가설은 두 가지다.

### 가설 1. 구현이 stricter해졌고 test fixture가 낡았다

- auto-promote는 "template가 하나라도 있으면 matching template 필수"로 동작한다.
- 그런데 test의 spawned MCP server는 실제 process name이 `python3`가 아니다.
- 따라서 template alias `mcp-auto-promo`가 적용되지 않고 promote 자체가 skip된다.

### 가설 2. intended policy가 바뀌었는데 gating이 과도하다

- device profile의 MCP health hint와 successful MCP probe만으로도 auto-promote 가능해야 한다.
- 지금은 template match까지 강제해서 valid MCP endpoint도 promote하지 못한다.

이번 phase에서 해야 할 일은 이 둘 중 어느 정책이 맞는지 먼저 고정하는 것이다.

## 결정된 정책

- `service_templates`가 비어 있지 않으면 auto-promote는 matching template가 있는 MCP endpoint에만 적용한다.
- profile-level MCP hint는 classify/probe의 입력으로는 충분하지만, known service truth가 정의된 기기에서는 promotion gate를 대체하지 않는다.
- 따라서 이번 회귀의 수정 방향은 implementation 완화가 아니라 test fixture를 실제 matching 조건으로 고정하는 것이다.

## 범위

이번 단계에서 포함:

- failing test의 root cause 확정
- auto-promote policy decision 문서화
- 구현 또는 test fixture 수정
- full `musu-port-core` test baseline 재검증
- 관련 문서/TODO/MASTER_PLAN 갱신

이번 단계에서 제외:

- helper lifecycle productization
- 새 Windows action 추가
- `musu-connects` 통합

## 구현 작업 목록

### Track 1. Root Cause Capture

- failing test를 단독 재현 가능한 상태로 고정
- discovery payload / classification source / suggested alias / template match 여부를 추적
- auto-promote 이전 단계에서 endpoint가 어떻게 보이는지 확인

### Track 2. Policy Decision

- 아래 둘 중 하나를 명확히 선택
  - template가 존재하면 matching template 필수
  - MCP probe 성공이면 template 없이도 auto-promote 허용
- 선택 이유를 `MASTER_PLAN.md`와 phase 문서에 기록

### Track 3. Implementation Alignment

- 선택한 정책에 맞게 `state.rs` 경로 수정
- alias selection / stray endpoint filtering / classification source consistency 확인

### Track 4. Regression Coverage

- 다음 케이스를 test로 고정
  - matching template가 있을 때 alias/template가 적용됨
  - template mismatch일 때 promote 안 함 또는 promote 허용
    - 정책에 따라 expected outcome 고정
  - stray MCP endpoint가 의도치 않게 같이 promote되지 않음
  - profile-level MCP health hint와 deep probe가 auto-promote에 주는 영향

## 검증 방법

- `./scripts/linux-rust-env.sh cargo test -p musu-port-core --test parity_verification mcp_candidates_can_auto_promote_from_device_profile_policy -- --nocapture`
- `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `./scripts/linux-rust-env.sh cargo check`
- 필요 시 `./scripts/real-mcp-smoke.sh` 회귀 확인

## 완료 기준

- failing parity test가 green으로 복구된다
- full `musu-port-core` test suite가 green이다
- auto-promote policy가 문서와 코드에서 일치한다
- 다음 phase가 helper lifecycle productization으로 자연스럽게 이어진다
