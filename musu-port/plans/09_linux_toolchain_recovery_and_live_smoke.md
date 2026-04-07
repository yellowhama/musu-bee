# 09 Linux Toolchain Recovery And Live Smoke

## 목표

현재 `musu-port`를 Windows `cargo` 우회 없이 WSL/Linux native Rust toolchain으로 빌드하고 실행한 뒤, 남아 있는 live smoke를 끝낸다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager_l4.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/port_manager.rs`

## 이번 단계 범위

- 현재 Codex shell의 Rust 환경 mismatch 분석
- Linux native `cargo`/`rustc` 활성화 또는 복구
- `musu-port` Linux build/test/run 경로 확정
- `/health`, `/routes`, `/discovery`, TCP promote, restart restore live smoke

## 제외 범위

- QUIC runner 구현
- UI 레이어 복제
- parity 차이 문서 최종 정리 자체

## 구현 작업 목록

- `HOME`, `PATH`, `CARGO_HOME`, `RUSTUP_HOME` 현재값을 기록한다
- `/home/hugh51/.cargo/bin`, `/home/hugh51/.rustup/toolchains` 실제 상태를 확인한다
- snap shell 기준 rustup home mismatch를 고치는 방법을 선택한다
- 필요 시 shell wrapper 또는 프로젝트 문서용 bootstrap 명령을 만든다
- Linux native `cargo check` / `cargo test` / `cargo run -p musu-portd`를 통과시킨다
- live smoke 대상 backend를 최소 fixture로 띄운다
- `/discovery` 응답과 unmanaged filtering을 재확인한다
- TCP promote 후 `/l4/runners`와 실제 payload forward를 확인한다
- 프로세스 재시작 후 promoted/ignored/audit persistence restore를 확인한다
- 결과를 `MASTER_PLAN.md`와 `TODO.md`에 반영한다

## 검증 방법

- `cargo --version`
- `rustc --version`
- `cargo check`
- `cargo test -p musu-port-core`
- `cargo run -p musu-portd`
- `curl http://127.0.0.1:<port>/health`
- `curl http://127.0.0.1:<port>/routes`
- `curl http://127.0.0.1:<port>/discovery`
- TCP echo smoke + `/l4/runners`
- restart 후 persistence restore 확인

## 보류 항목

- Linux native toolchain이 실제로 완전히 없는 경우, 설치와 복구 중 어느 쪽을 표준 경로로 삼을지 결정 필요
- sandbox 환경에서 loopback/network 제약이 계속 나오면 일부 smoke는 승인 후 escalated 실행으로 돌릴 수 있다
- QUIC/connect는 이 단계가 끝난 뒤 다시 범위를 잡는다

## 완료 기준

- 현재 Codex shell에서 Linux native `cargo`와 `rustc`가 안정적으로 동작한다
- Windows `cargo` 우회 없이 `musu-port`의 핵심 빌드/테스트가 돈다
- Linux 바이너리로 `/health`, `/routes`, `/discovery`, TCP promote smoke가 확인된다
- restart 후 persistence restore가 재현된다
- 남은 검증 블로커가 parity 문서화 수준으로 축소된다

## 진행 결과

- 완료
- 원인:
  - Linux toolchain 자체 부재가 아니라 Codex snap shell의 `HOME=/home/hugh51/snap/codex/34` 때문에 `rustup`이 잘못된 home을 보고 있었다
  - 추가로 snap root에는 `/usr/bin/cc`, `/usr/bin/ld`, `/usr/lib/x86_64-linux-gnu/*`가 직접 보이지 않아 hostfs toolchain wrapper가 필요했다
- 추가한 구현:
  - `.cargo/config.toml`
  - `scripts/linux-rust-env.sh`
  - `scripts/host-gcc-wrapper.sh`
  - `scripts/host-gxx-wrapper.sh`
- 확정된 실행 경로:
  - `./scripts/linux-rust-env.sh cargo check`
  - `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
  - `MUSU_PORT_MANAGER_PORT=24682 MUSU_PORT_SEED_SERVICES=/home/hugh51/musu-functions/musu-port/fixtures/sample_seed_services.json MUSU_PORT_STATE_DB=/tmp/musu-port-live-smoke-20260401.db ./scripts/linux-rust-env.sh cargo run -p musu-portd`
- 검증 결과:
  - Linux native `cargo check` 통과
  - Linux native `cargo test -p musu-port-core` 통과
  - `/health`, `/routes`, `/discovery` live smoke 통과
  - seeded HTTP alias proxy 통과
  - `tcp|python3|127.0.0.1|19092` promote 후 `tcp://127.0.0.1:37113` forward 통과
  - restart 후 promoted route / L4 runner / audit restore 통과
- 남은 후속 작업:
  - Phase 7 범위 확정
  - Phase 8 parity 문서와 fixture 비교 정리
