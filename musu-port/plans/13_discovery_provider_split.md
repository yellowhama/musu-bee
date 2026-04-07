# 13 Discovery Provider Split

## 목표

`musu-port`의 discovery 계층을 Linux 전용 구현에서

- Linux/WSL provider
- Windows provider
- provider selection contract

구조로 분리한다.

## 원본 참조 문서

- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`
- `/home/hugh51/musu-functions/musu-port/plans/10_windows_wsl_bilingual_adapter_plan.md`
- `/home/hugh51/musu-functions/musu-port/plans/12_runtime_context_path_bridge_productization.md`

## 이번 단계 범위

- `discovery.rs`를 common facade로 재구성
- `discovery/linux.rs` 분리
- `discovery/windows.rs` 추가
- `MUSU_PORT_DISCOVERY_PROVIDER=auto|linux|windows|both` 추가
- `/health`에 selected discovery provider 표시

## 제외 범위

- Windows process owner lookup
- Windows native live smoke 완주
- `both` 모드 기본 활성화

## 구현 작업 목록

- runtime context 기반 provider selection
- Linux `ss` provider 유지
- Windows `netstat.exe` + `tasklist.exe` parser/provider 추가
- WSL interop launcher(`/init`, `/var/lib/snapd/hostfs/init`) bridge 내장
- provider parser/unit test 추가

## 검증 방법

- `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `./scripts/linux-rust-env.sh cargo check`
- unit test:
  - provider selection
  - Windows netstat/tasklist parsing

## 보류 항목

- snap-confined Codex 셸에서는 Windows interop live smoke가 vsock 제한으로 실패할 수 있음
- 실제 Windows native 런타임 smoke는 제품 shell에서 재검증 필요

## 완료 기준

- discovery 구현이 provider abstraction으로 분리된다
- Windows provider 코드와 parser tests가 들어간다
- 이후 단계에서 Windows process metadata provider를 별도 추가할 수 있는 구조가 된다
