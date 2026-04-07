# Windows Spawn Policy Alignment

## 목표

OpenClaw에서 확인한 wrapper/spawn 정책을 `musu-computer-tools` bridge에 코드 레벨로 고정한다.

핵심은 다음 셋이다.

- direct fast path는 PowerShell entrypoint만 허용
- helper/manual 경로는 wrapper type을 분류해서 실행
- 실행 결과와 fallback 이유를 audit trail에 남김

## 배경

현재 bridge는 direct/helper/manual 3경로를 이미 갖고 있지만,
왜 특정 경로가 선택됐는지와 wrapper가 어떤 타입인지가 결과물에 남지 않는다.

이 상태에서는:

- raw `cmd.exe /c` wrapper가 우연히 섞여도 이유를 추적하기 어렵고
- helper/manual fallback이 정책인지 우연인지 구분이 약하고
- 다음 세션이 실행 경로를 다시 해석해야 한다.

## 이번 단계 범위

- `run-windows-action.sh` preflight spawn policy 추가
- `enqueue-powershell.sh` request metadata 확장
- helper result payload에 resolution metadata 포함
- action audit JSONL 추가
- README / runbook / TODO / handoff 정렬

## 설계

### 1. direct는 PowerShell script만 허용

- `direct_script`는 `.ps1`이어야 한다.
- `.cmd/.bat`를 direct 경로로 밀어 넣으면 policy reject 한다.

### 2. helper kind는 entrypoint 타입과 일치해야 한다

- `.ps1` -> `powershell_file`
- `.cmd/.bat` -> `cmd_file`
- mismatch면 preflight reject 한다.

### 3. manual wrapper는 "raw wrapper manual only"로 분류한다

- manual `.cmd/.bat`는 허용
- 하지만 audit에 wrapper classification과 수동 recovery 이유를 남긴다.

### 4. 실행 표면을 JSONL로 남긴다

위치:

- `.windows-bridge/state/action-audit.jsonl`

이벤트 예:

- `resolution_selected`
- `resolution_attempt_failed`
- `resolution_fallback`
- `resolution_completed`
- `manual_guidance`
- `policy_rejected`

## 완료 기준

- action runner가 direct/helper/manual 선택 이유를 audit에 남긴다.
- helper result JSON에 resolution metadata가 포함된다.
- direct에 `.cmd/.bat`를 넣으면 local preflight에서 즉시 거부된다.
