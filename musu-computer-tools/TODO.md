# MUSU Computer Tools TODO

## Windows Bridge Productization

이 저장소 기준 Windows bridge 표준화를 위한 실행 backlog다.

### 이번 턴에서 구현 완료

- [x] `musu-computer-tools` 기준 상세 실행 계획 문서 추가
- [x] interop blocked 세션용 표준 운영 문서 추가
- [x] WSL-side interop probe script 추가
- [x] WSL-side PowerShell request queue writer/waiter 추가
- [x] `musu-port` Windows smoke용 bridge entrypoint 추가
- [x] Windows resident helper 및 one-click launcher 추가
- [x] README에 Windows bridge 흐름 링크 추가

### 검증 완료

- [x] direct Windows smoke 실행 성공
- [x] helper heartbeat / queue self-test 성공
- [x] helper fallback Windows smoke 실행 성공
- [x] 최종 성공 JSON/log artifact를 handoff 문서와 `musu-port` validation 문서에 반영

## Windows Bridge Action Expansion

- [x] generic WSL action runner `run-windows-action.sh` 추가
- [x] `run-musu-port-smoke.sh`를 generic runner 위로 migration
- [x] `musu-port` Windows native smoke용 bridge wrapper 추가
- [x] action expansion plan / README / runbook 링크 반영
- [x] generic runner regression 검증
- [x] native smoke wrapper live 검증

### 선택 검증 완료

- [x] Explorer/`Start-Process` 기준 `scripts/windows-bridge/start-helper.cmd` 재기동 확인
- [x] Explorer/`Start-Process` 기준 `scripts/windows-bridge/run-musu-port-smoke.cmd` 종료 코드 `0` 확인

### 운영 원칙

- [x] direct `.exe` interop가 살아 있으면 그 경로를 우선 사용
- [x] direct interop가 죽어 있으면 Windows helper queue로 위임
- [x] helper도 없으면 Windows one-shot launcher로 바로 fallback

## Next Phase Backlog

마스터 플랜:

- `MASTER_PLAN.md`

### Gate 0. Baseline Recovery

- [x] `musu-port` parity regression(`mcp_candidates_can_auto_promote_from_device_profile_policy`) root cause 확정
- [x] auto-promote policy decision을 `musu-port` 코드/문서/test에 반영
- [x] `./scripts/linux-rust-env.sh cargo test -p musu-port-core` green 재고정

### Phase 03. Helper Lifecycle Productization

- [x] helper `status`/`restart`/`stop` 운영 스크립트 표준화
- [x] stale heartbeat 정리 규칙 고정
- [x] resident helper vs one-shot helper 상태 surface 정리

### Phase 04. WSL Interop Diagnostics

- [x] interop diagnostic script 추가
- [x] WSL/runtime/version/evidence snapshot 출력 고정
- [x] 대표 오류 시그니처별 분류 기준 문서화

### Phase 05. Action Catalog Expansion

- [x] smoke 외 다른 Windows action 후보 목록화
- [x] generic runner request kind/catalog 정리
- [x] 새 action 1개 이상 bridge 위에 추가

### Phase 06. Spec / Index Sync

- [x] spec/doc/code index sync 루틴 스크립트화
- [x] ignore pattern/runbook 정리

### Phase 07. OpenClaw Pattern Adoption

- [x] OpenClaw Windows/WSL 사용 방식 조사
- [x] 비교 리포트 작성
- [x] comparative architecture phase 문서 추가
- [x] helper를 Windows startup-managed runtime으로 승격하는 install 모델 설계
- [x] Windows spawn/wrapper policy alignment 설계
- [x] split-host browser/network-bound action 분리 설계

### Phase 10. Split-Host Browser Boundary

- [x] browser/CDP split-host detailed plan 추가
- [x] WSL-side `probe-browser-cdp.sh` 초안 추가
- [x] browser standard/catalog draft 문서 추가
- [x] initial browser inventory draft 추가
- [x] Windows-side browser launch bootstrap 표준화
- [x] browser/CDP inventory를 실제 use case 기준으로 확장

### Phase 08. Helper Service Install

- [x] helper install/uninstall/status surface 구현
- [x] Scheduled Task install path 구현
- [x] Startup folder fallback 구현
- [x] install state + runtime state 통합 status surface 구현
