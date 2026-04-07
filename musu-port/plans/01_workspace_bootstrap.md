# 01 Workspace Bootstrap

## 목표

`musu-port`를 원본과 독립적으로 빌드/실행 가능한 Rust workspace로 만든다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/Cargo.toml`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/main.rs`

## 이번 단계 범위

- workspace 루트 생성
- core crate 생성
- binary crate 생성
- env/config 로딩
- health/routes skeleton
- 빌드 검증

## 제외 범위

- TCP/QUIC runner
- discovery
- SQLite persistence
- websocket bridge

## 구현 작업 목록

- workspace `Cargo.toml` 추가
- `crates/musu-port-core` 생성
- `apps/musu-portd` 생성
- 최소 config 타입 추가
- 기본 metrics 타입 추가
- `run_server()` 진입점 추가
- `/health`, `/routes` 추가
- 실행용 `main.rs` 추가

## 검증 방법

- `cargo check`
- `cargo run -p musu-portd`
- `curl /health`
- `curl /routes`

## 보류 항목

- tracing 포맷 세부 조정
- config 파일 포맷 확정

## 완료 기준

- 이 폴더에서만 독립 빌드 가능
- 서버가 떠 있고 health 응답 가능

## 현재 결과

- 완료
- 실제 산출물:
  - workspace 루트 `Cargo.toml`
  - `crates/musu-port-core`
  - `apps/musu-portd`
- 검증:
  - `wsl-windows-exec`를 통해 `cargo check` 통과
  - `24680` 포트에서 `/health`, `/routes` 응답 확인
