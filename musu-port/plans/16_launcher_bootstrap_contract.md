# 16 Launcher Bootstrap Contract

## 목표

`.exe` / ELF / AppImage` 중 현재 컨텍스트에 맞는 실행 파일 계약을 고정하고,
현재 런타임이 어떤 실행 파일을 선호하는지 health surface에서 보이게 한다.

## 원본 참조 문서

- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`
- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`

## 이번 단계 범위

- executable layout 자동 탐지
- env override:
  - `MUSU_PORT_INSTALL_ROOT`
  - `MUSU_PORT_WINDOWS_BIN`
  - `MUSU_PORT_LINUX_BIN`
  - `MUSU_PORT_APPIMAGE_BIN`
- `/health`에 preferred executable / candidates / interop launcher surface 추가

## 제외 범위

- 실제 launcher binary 제작
- installer/packager 자동화
- start menu/tray registration

## 구현 작업 목록

- current exe 기반 install root 추론
- executable candidate enumeration
- preferred executable resolution
- WSL interop launcher surface 추가

## 검증 방법

- `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `./scripts/linux-rust-env.sh cargo check`

## 보류 항목

- Windows native launcher live smoke
- MSI/AppImage packaging layout

## 완료 기준

- health surface에서 현재 preferred executable 계약을 확인할 수 있다
- env override 기반 install layout 계약이 코드에 존재한다
