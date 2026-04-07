# 22 Manual Validation Execution

## 목표

문서화된 Windows/WSL validation matrix를 실제 실행 기록으로 바꾼다.

## 이번 단계 범위

- WSL ext4 smoke 실행 기록 남기기
- Windows native shell smoke checklist 정리
- `/mnt/c` parity smoke checklist 정리

## 현재 상태

- WSL ext4 smoke: 2026-04-01 실행 완료
- `/mnt/c` parity: 2026-04-01 실행 완료
- discovery provider `linux`: 2026-04-01 실행 완료
- discovery provider `windows`: 2026-04-01 실행 완료
- discovery provider `both`: 2026-04-01 실행 완료
- real MCP server smoke: 2026-04-01 실행 완료 (`scripts/real-mcp-smoke.sh`)
- Windows native shell: 미실행

## 완료 기준

- 남은 수동 검증이 “무엇을 어떻게 확인할지” 수준이 아니라 “무엇이 확인됐고 무엇이 아직 안 됐는지”로 관리된다
