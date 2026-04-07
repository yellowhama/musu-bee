# Manual Validation Checklist

## 목적

`musu-port`의 남은 productization 검증을

- 지금 이 환경에서 실제로 확인한 것
- Windows/WSL 제품 셸에서 따로 확인해야 하는 것

으로 분리한다.

## 현재 상태 요약

2026-04-01 기준:

- WSL ext4 smoke: 완료
- `/mnt/c` parity smoke: 완료
- Windows native shell smoke: 완료
- discovery provider matrix smoke: 완료
- real MCP server smoke: 완료

## 완료된 수동 검증

### WSL ext4 smoke

실행 환경:

- runtime: `wsl`
- filesystem: `linux_native`
- `MUSU_PORT_DATA_ROOT=/tmp/musu-port-validation/data`
- `MUSU_DEVICE_ID=validation-wsl`

확인 결과:

- `/health`
  - `device_profile_loaded=true`
  - `device_profile_matches_device_id=true`
  - `device_profile_guidance_hints=2`
  - `discovery_provider=linux`
- `/routes`
  - seed alias `validation-api` 확인
- `/discovery`
  - unmanaged `python3:24712` endpoint 확인
  - fake MCP endpoint `python3:24713`가 `service_class=mcp_server` / `classification_source=mcp_health_probe`로 분류됨
- `/connect/validation-api`
  - disabled mode에서 `403` + denied decision 반환 확인
  - preview mode 전환 후 `200` + `connect_url` 반환 확인
- `/audit/connect-denied`
  - denied event 조회 확인
  - `?drain=true` 후 empty buffer 확인
- `/metadata/export`
  - ext4 data root 아래 metadata report 생성 확인
  - `/metadata/export/history` 반영 확인

### `/mnt/c` path parity smoke

실행 환경:

- runtime: `wsl`
- filesystem: `wsl_windows_mount`
- `MUSU_PORT_DATA_ROOT=/mnt/c/Temp/musu-port-validation-1038/data`
- `MUSU_DEVICE_ID=validation-mntc`

확인 결과:

- `/health`
  - `data_root=/mnt/c/Temp/musu-port-validation-1038/data`
  - `device_profile_path=/mnt/c/Temp/musu-port-validation-1038/data/device-profiles/validation-mntc.json`
  - `device_profile_loaded=true`
  - `device_profile_validation_action=warn`
  - `device_profile_valid=true`
- `/coverage`
  - `metadata_dual_path_status.roundtrip_ready=true`
  - `metadata_dual_path_status.data_root.windows=C:\\Temp\\musu-port-validation-1038\\data`
- `/metadata/export`
  - `/mnt/c/.../metadata-report-*.json` 생성 확인
  - `/metadata/export/history` count `1` 확인

### discovery provider matrix

실행 결과:

- `linux`
  - `selected=linux`
  - `discovery_count=27`
- `windows`
  - `selected=windows`
  - `discovery_count=0`
- `both`
  - `selected=both`
  - `discovery_count=26`

### real MCP server smoke

실행 환경:

- script: `scripts/real-mcp-smoke.sh`
- MCP server: `../MUSU-AS-MCP/server.py`
- runtime: `wsl`
- filesystem: `linux_native`

확인 결과:

- raw MCP
  - `/mcp/health` `ok=true`
  - `initialize` result 확인
  - `tools/list` result 확인
  - `tool_count=10`
- `musu-port`
  - `/discovery`에서 실제 MCP listener가 `service_class=mcp_server`, `agent_facing=true`, `classification_source=mcp_health_probe`로 분류됨
  - `suggested_alias=musu-as-mcp` 확인
  - `POST /promote`로 `musu-as-mcp` route 생성 확인
  - `POST /connect/mode { preview }` 후 `GET /connect/musu-as-mcp` 허용 decision 확인
  - `delivery_contract=connect_url_handoff`
  - `bridge_owner=musu-port`
  - promote audit event 확인

### Windows native shell smoke

실행 경로:

- direct Windows smoke:
  - `winexec.sh + powershell.exe`
  - `musu-computer-tools/scripts/windows-bridge/run-musu-port-smoke.ps1`
- helper fallback smoke:
  - `musu-computer-tools/scripts/windows-bridge/windows-bridge-helper.ps1`
  - `musu-computer-tools/scripts/windows-bridge/run-musu-port-smoke.sh --force-helper`
- Windows `.cmd` entrypoint:
  - `musu-computer-tools/scripts/windows-bridge/start-helper.cmd`
  - `musu-computer-tools/scripts/windows-bridge/run-musu-port-smoke.cmd`
- Windows bridge action runner:
  - `musu-computer-tools/scripts/windows-bridge/run-windows-action.sh`
  - `musu-computer-tools/scripts/windows-bridge/run-musu-port-native-smoke.sh`

확인 결과:

- build / launch:
  - Visual Studio Developer PowerShell 진입 성공
  - Windows native `cargo build -p musu-portd` 성공
  - `musu-portd.exe` 기동 성공
- runtime:
  - `runtime_context=windows`
  - `filesystem_context=windows_native`
  - `binary_kind=windows_exe`
  - `preferred_executable_kind=windows_exe`
  - `device_profile_loaded=true`
  - `discovery_provider=windows`
- API smoke:
  - `/health` 성공
  - `/routes` 성공
  - `/discovery` 성공
  - `/connect/windows-validation-api` preview mode 허용 확인
  - `/coverage.metadata_dual_path_status.roundtrip_ready=true`
  - `/metadata/export` 성공
- artifact 예시:
  - helper fallback `data_root=C:\Users\empty\AppData\Local\Temp\musu-port-win-smoke-f02bf53fa0d045aa865312a9b408a227`
  - helper fallback metadata report:
    - `C:\Users\empty\AppData\Local\Temp\musu-port-win-smoke-f02bf53fa0d045aa865312a9b408a227\reports\port-manager\metadata\metadata-report-1775061638628994800.json`
- launcher UX:
  - `start-helper.cmd` 실행 후 helper heartbeat PID가 새 값으로 갱신됨
  - helper self-test queue request가 성공으로 반환됨
  - `run-musu-port-smoke.cmd`를 Windows `Start-Process -Wait`로 실행했을 때 종료 코드 `0` 확인
- action runner:
  - `run-windows-action.sh`로 `helper-selftest.ps1` direct self-test 성공
  - `windows-bridge-helper.ps1 -RunOnce -SingleRequestPath`로 named parameter forwarding 수정 검증
  - `run-musu-port-smoke.sh --force-direct` 회귀 통과
  - `run-musu-port-native-smoke.sh --force-direct --exe-path <built musu-portd.exe>` 성공

## 남은 수동 검증

### 1. `/mnt/c` vs ext4 path parity

상태:

- ext4: 확인 완료
- `/mnt/c/...`: 확인 완료
- `MUSU_DEVICE_PROFILE_PATH` runtime normalization: 확인 완료

### 2. discovery provider matrix

상태:

- `linux`: 확인 완료
- `windows`: 확인 완료
- `both`: 확인 완료

### 3. real MCP server smoke

상태:

- `scripts/real-mcp-smoke.sh` 기준 확인 완료

## 환경 제한 메모

- Codex snap sandbox 안에서는 local bind/connect가 막혀 있어서 live smoke는 sandbox 밖 실행이 필요했다.
- real MCP smoke는 sandbox 밖에서 실행 가능한 script로 고정했다.
- Windows native shell smoke는 sandbox 밖 `winexec.sh + powershell.exe`, helper fallback queue, `.cmd` launcher 경로까지 모두 검증했다.
