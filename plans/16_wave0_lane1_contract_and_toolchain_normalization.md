# Wave 0 Lane 1 Contract And Toolchain Normalization

## 목표

`MUS-26`을 문서 수준이 아니라 실제 실행 가능한 루트 산출물로 바꾼다. 즉 `musu-functions` 전체에서 code-health와 host-toolchain-health를 분리해 재현 가능한 검증 경로를 만든다.

## 대상 프로젝트

- `musu-port`
- `musu-connects`
- `MUSU-AS-MCP`
- `musu-indexer`

## 참조 문서

- `/home/hugh51/musu-functions/plans/15_personal_onprem_ai_operation.md`
- `/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/WAVE0_LANE1_GATE_A_VERIFICATION_CONTRACT_2026-04-03.md`
- `/home/hugh51/musu-functions/musu-port/plans/09_linux_toolchain_recovery_and_live_smoke.md`

## 이번 단계 범위

- 루트 공통 Rust/toolchain shim 추가
- `musu-port`, `musu-connects`를 공통 linker/runtime 설정에 묶기
- Gate A 검증을 한 번에 돌리는 루트 스크립트 추가
- `MUS-26`이 바로 실행 가능한 todo 집합이 되도록 보드와 운영 문서 정리

## 제외 범위

- lane 2 route plane 구현
- CRT remote surface 통합
- multi-machine live demo proof

## 구현 작업 목록

1. 루트 `scripts/linux-rust-env.sh`를 만든다.
   - `~/.cargo/bin` 우선
   - 실제 사용자 home과 Rust toolchain 경로 고정
2. 루트 `host-gcc-wrapper.sh`, `host-gxx-wrapper.sh`를 만든다.
3. `musu-port/.cargo/config.toml`을 루트 wrapper로 재포인팅한다.
4. `musu-connects/.cargo/config.toml`을 추가해 동일한 linker/runtime 정책을 적용한다.
5. 루트 `scripts/verify-wave0-lane1.sh`를 만든다.
   - A1 `MUSU-AS-MCP` syntax check
   - A2 `musu-indexer` compileall
   - B1/B2 negative control
   - B3-B6 canonical cargo check/test
6. `musu-connects`의 기본 warning noise를 줄여 canonical check output을 정리한다.
7. 루트 TODO/운영 문서와 `MUS-26` plan 문서를 동기화한다.

## 검증 방법

- `/home/hugh51/musu-functions/scripts/verify-wave0-lane1.sh`
- `/home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo --version`
- `cd /home/hugh51/musu-functions/musu-connects && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo test -p musu-connects-core --no-run`
- `cd /home/hugh51/musu-functions/musu-port && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo test -p musu-port-core --no-run`

## 보류 항목

- Paperclip heartbeat runtime PATH를 완전히 루트 shim 기준으로 통일할지 여부
- root verification script를 cron/routine에 직접 연결할지 여부

## 완료 기준

- `MUS-26`이 "문서로 설명 가능한 lane"이 아니라 "스크립트로 재현 가능한 lane"이 된다.
- `musu-port`와 `musu-connects`가 같은 Rust/toolchain normalization 경로를 쓴다.
- Gate A verification contract의 positive/negative control이 루트 스크립트로 한 번에 확인된다.
