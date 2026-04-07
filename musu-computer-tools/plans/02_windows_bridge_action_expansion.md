# Windows Bridge Action Expansion

## 목표

`musu-computer-tools`의 Windows bridge를 단일 smoke wrapper에서
재사용 가능한 action runner로 확장한다.

## 구현 범위

### Track 1. Generic WSL Runner

- `scripts/windows-bridge/run-windows-action.sh`
  - direct/helper/manual 모드 선택 공통화
  - action별 direct/helper/manual script path 주입
  - queue timeout / display name / manual fallback 안내 재사용

### Track 2. Existing Action Migration

- `scripts/windows-bridge/run-musu-port-smoke.sh`
  - 기존 분기 로직을 제거하고 generic runner 위로 이동
  - 기존 direct=`powershell_file`, helper=`cmd_file` contract 유지

### Track 3. New Action

- `scripts/windows-bridge/run-musu-port-native-smoke.ps1`
  - sibling repo `musu-port/scripts/windows-native-smoke.ps1` canonical wrapper
- `scripts/windows-bridge/run-musu-port-native-smoke.cmd`
  - Windows one-shot launcher
- `scripts/windows-bridge/run-musu-port-native-smoke.sh`
  - WSL-side bridge entrypoint
  - `--exe-path` Linux/Windows path 모두 허용

## 완료 기준

- generic runner가 helper self-test 같은 단순 action을 direct/helper 양쪽에서 처리한다.
- 기존 `run-musu-port-smoke.sh`가 regression 없이 동작한다.
- 새 native smoke wrapper가 `ExePath`를 받아 direct/helper/manual 경로로 실행 가능하다.
- README / runbook / handoff / TODO가 새 entrypoint를 가리킨다.
