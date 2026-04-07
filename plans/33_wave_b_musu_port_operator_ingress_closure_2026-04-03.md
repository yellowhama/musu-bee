# Wave B: musu-port Operator Ingress Closure

## 목표

`musu-port`를 "로컬 control-plane baseline"에서 "실제 operator machine이 신뢰하고 쓸 수 있는 ingress surface"로 끌어올린다.

## 현재 Truth

- `musu-port`는 Linux parity, discovery, promote/ignore, metadata, coverage, MCP probe까지 구현돼 있다.
- 실제 제품 관점에서 남은 핵심은 Windows/WSL parity와 operator ingress verification이다.
- 현재 문서와 검증은 많지만, operator laptop 시나리오 기준 canonical acceptance packet은 아직 없다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/musu-port/apps/musu-portd`
- `/home/hugh51/musu-functions/musu-port/crates/musu-port-core`
- `/home/hugh51/musu-functions/musu-port/scripts/linux-rust-env.sh`
- `/home/hugh51/musu-functions/musu-port/scripts/real-mcp-smoke.sh`
- `/home/hugh51/musu-functions/musu-port/scripts/windows-native-smoke.ps1`
- `/home/hugh51/musu-functions/musu-port/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/musu-port/PARITY_REPORT.md`

## 범위

1. operator 관점 canonical ingress verification runbook을 만든다.
2. Windows main + WSL2 경계에서 path/runtime/launcher/health 계약을 재검증한다.
3. `musu-port` acceptance를 이후 `musu-connects` wire proof에서 바로 쓸 수 있는 형태로 정리한다.

## 제외 범위

- `musu-connects` actual wire transport 구현
- cross-device route import 구현
- CRT operator surface 구현
- company workload routing 구현

## 구현 작업 목록

1. 현재 `musu-port` artifact와 smoke path를 operator ingress 기준으로 재분류한다.
2. Windows/WSL parity gap을 코드와 runbook 관점에서 식별한다.
3. 필요한 경우 ingress/runtime display/launcher 관련 contract surface를 보강한다.
4. canonical replay 명령을 `operator machine acceptance` 중심으로 다시 적는다.
5. acceptance artifact manifest를 만든다.
6. `CURRENT_STATE`, `TODO_EXECUTION_BOARD`, 관련 module state를 갱신한다.

## 검증 명령

- `cd /home/hugh51/musu-functions/musu-port && ./scripts/linux-rust-env.sh cargo test -p musu-port-core`
- `cd /home/hugh51/musu-functions/musu-port && ./scripts/real-mcp-smoke.sh`
- Windows shell에서 `./scripts/windows-native-smoke.ps1`

## 기대 Artifact / Evidence

- operator ingress acceptance manifest
- Windows/WSL parity note
- canonical replay command set
- 필요한 경우 corrected runtime/launcher contract evidence

## 리스크 / 보류 항목

- Windows-native verification은 현재 실행 환경이 제한될 수 있다.
- proof를 문서만으로 닫으면 이후 `musu-connects`에서 다시 ambiguity가 생긴다.

## 완료 기준

- `musu-port`가 operator ingress 기준으로 무엇이 proven이고 무엇이 남았는지 명확해진다.
- Windows/WSL parity와 runtime launcher contract가 acceptance packet 수준으로 정리된다.
- 다음 wave인 `musu-connects` wire-level transport closure가 이 packet을 직접 입력으로 사용할 수 있다.

## 다음 Handoff

- 다음 packet은 `musu-connects` wire-level transport closure다.
