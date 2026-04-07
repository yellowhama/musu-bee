# 17 Windows WSL Validation Matrix

## 목표

지금까지 구현된 productization slice를 실제 Windows/WSL 환경 매트릭스로 검증할 방법을 고정한다.

## 원본 참조 문서

- `/home/hugh51/musu-functions/BILINGUAL_RUNTIME_ARCHITECTURE.md`
- `/home/hugh51/musu-functions/musu-port/WINDOWS_WSL_ADAPTER_MATRIX.md`

## 이번 단계 범위

- Windows native shell
- WSL shell
- `/mnt/c`
- ext4

축 별 smoke checklist 정의

## 제외 범위

- 이 Codex snap shell 안에서의 강제 live smoke 완주

## 구현 작업 목록

- health endpoint 확인 항목 정리
- discovery provider live smoke 항목 정리
- metadata export path parity 항목 정리
- launcher contract 확인 항목 정리

## 검증 방법

- 문서 리뷰
- 가능 시 제품 shell에서 수동 smoke

## 보류 항목

- Codex snap vsock 제한

## 현재 상태

- WSL ext4 smoke는 2026-04-01에 실제 실행 결과를 남겼다
- `/mnt/c` parity는 2026-04-01에 실제 실행 결과를 남겼다
- discovery provider `linux` / `windows` / `both` matrix도 2026-04-01에 실행 결과를 남겼다
- Windows native shell은 제품 셸에서 따로 실행해야 한다
- 상세 checklist는 `MANUAL_VALIDATION_CHECKLIST.md`를 기준으로 관리한다

## 완료 기준

- 실제 제품 환경에서 어떤 순서로 최종 smoke를 해야 하는지 문서 한 장으로 설명 가능
