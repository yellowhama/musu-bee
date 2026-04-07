# 24 Validation Automation And Windows Bridge Handoff

## 목표

남아 있는 product-shell 검증을 사람 기억이 아니라 재실행 가능한 스크립트와 runbook으로 고정한다.

## 원본 참조 파일

- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/port_manager.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src-tauri/src/commands/port_manager.rs`
- `/mnt/f/Aisaak/Projects/Musu-new/release/musu-desktop/src/hooks/usePortManager.ts`

## 이번 단계 범위

- WSL real MCP smoke를 permanent script로 고정
- Windows native shell smoke를 PowerShell harness로 자동화
- `TODO.md`, `MASTER_PLAN.md`, `MANUAL_VALIDATION_CHECKLIST.md`, `PARITY_REPORT.md`를 최신 truth로 정렬
- `musu-computer-tools` bridge를 generic Windows action runner로 확장

## 제외 범위

- `musu-connects`의 remote bridge / cross-device tunnel
- Tauri UI layer 자동화

## 구현 작업 목록

- `scripts/real-mcp-smoke.sh` 추가
- `scripts/windows-native-smoke.ps1` 추가
- real MCP smoke 결과를 manual validation 문서에 반영
- Windows native shell smoke를 실제 Windows shell에서 검증
- `musu-computer-tools/scripts/windows-bridge/run-windows-action.sh` 추가
- `musu-computer-tools/scripts/windows-bridge/run-musu-port-native-smoke.sh` 추가

## 검증 방법

- `bash -n scripts/real-mcp-smoke.sh`
- `scripts/real-mcp-smoke.sh` 실제 실행
- `./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `./scripts/linux-rust-env.sh cargo check`
- `musu-computer-tools/scripts/windows-bridge/run-musu-port-smoke.sh --force-direct`
- `musu-computer-tools/scripts/windows-bridge/run-musu-port-native-smoke.sh --force-direct --exe-path ...`

## 보류 항목

- sandbox 내부 direct `.exe` interop는 여전히 `UtilAcceptVsock ... accept4 failed 110`로 흔들린다
- helper mode 재사용 전 resident helper는 `start-helper.cmd`로 다시 올리는 운영 절차가 필요하다

## 완료 기준

- real MCP smoke가 문서와 스크립트 양쪽에 남아 있다
- Windows native shell smoke가 자동 harness와 체크리스트를 가진다
- Windows native shell smoke가 actual product shell에서 direct/helper/launcher 경로로 검증된다
- 남은 작업이 bridge 확장과 제품 범위 밖 항목으로만 정리된다
