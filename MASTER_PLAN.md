# musu-functions Master Plan

## 목표

`musu-functions`의 완성 정의는 명확하다.

- 카페의 노트북에서 집의 여러 데스크탑을 동시에 쓴다.
- 각 데스크탑은 서로 다른 GPU 역할을 맡는다.
- 사용자는 원격 화면을 보고 작업물을 확인하고 다음 지시를 내린다.
- 시스템은 on-prem 보호 경계를 유지한 채 route, session, workload, governance를 통합한다.

즉 이 저장소의 목적은 "여러 개인 컴퓨터를 하나의 보호된 on-prem AI operation처럼 쓰게 하는 제품"을 완성하는 것이다.

## 완성 조건

최종 완료는 아래 여섯 조건이 모두 닫혀야만 인정한다.

1. `musu-port`가 각 머신의 로컬 ingress/control plane을 안정적으로 관리한다.
2. `musu-connects`가 기기 간 secure transport와 route exchange를 실제 wire-level evidence까지 포함해 제공한다.
3. `MUSU-CRT`가 operator가 체감하는 remote session/read surface를 일관된 health/trust/freshness 의미로 보여준다.
4. `MUSU-WORKS`가 queue/lane/worker/handoff/blocker/governance를 실제 workload routing에 연결한다.
5. Paperclip 기반 자율운영이 issue-bound execution으로 계속 굴러가고, run hygiene가 깨끗하다.
6. `노트북 -> 5070 Ti 데스크탑 -> 4060 Ti 데스크탑` 대표 시나리오가 replay 가능한 artifact 체인으로 증명된다.

## 현재 기준선

### `musu-port`

- 루트에서 가장 구현 밀도가 높은 모듈이다.
- local control-plane baseline은 충분히 올라와 있다.
- 남은 큰 일은 Windows/WSL parity, operator ingress verification, 실제 사용 머신 관점 runbook 정리다.

### `musu-connects`

- peer-aware route import proof와 live harness는 이미 있다.
- proof field도 `trustGateReason` / `importDecisionReason` / `sessionEvidenceMode`로 정리됐다.
- 아직 actual wire-level peer-authenticated transport proof는 닫히지 않았다.
- 지금 증거는 operator-visible proof + simulated session evidence까지가 사실상 상한이다.

### `MUSU-CRT`

- lane-2 proof를 읽는 operator read path와 lane-3 smoke/coherence artifact는 있다.
- 하지만 최종 제품 의미의 integrated remote surface는 아직 아니다.
- 남은 핵심은 remote session health, trust, freshness를 operator 화면과 runtime attach lifecycle까지 일관되게 닫는 것이다.

### `MUSU-WORKS`

- company/project/agent/runtime contract baseline은 있다.
- preset generator, contract seed, viewer/read model까지는 올라와 있다.
- 남은 핵심은 이 계약을 실제 issue-bound workload routing, approval/escalation, blocker handling과 연결하는 것이다.

### 자율운영

- `2026-04-03 21:21 KST` 기준 Paperclip control plane은 살아 있다.
- `http://127.0.0.1:3100/api/health`는 `status=ok`, `version=2026.325.0`를 반환한다.
- root aligned active run은 `MUS-146` 중심으로 관측된다 (`9a780f36...`).
- `MUS-151 backlog + running` mismatch는 run `f47a6af1...` cancel로 정리됐다.
- lane anomaly는 현재 window에서 `0`이며, `MUS-150`/`MUS-151`은 backlog parked 상태를 유지한다.
- cross-project orchestration traffic(`MUS-130`, `MUS-161`, `MUS-8`)은 별도 telemetry로 분리 추적한다.
- 다만 heartbeat-runs projection에서 `issueId` 대신 `contextSnapshot.issueId`를 확인해야 하는 field consistency debt가 남아 있다.

## 현재 판단

이 저장소는 "기초 scaffold 단계"를 이미 지났다.

지금 필요한 것은 새 baseline을 더 만드는 일이 아니라, 이미 있는 lane proof들을 실제 제품 완성 경로로 다시 묶는 일이다.

- 이전 root closeout tranche는 역사적으로 유효하다.
- 하지만 그것이 곧 repo completion은 아니다.
- 따라서 이제부터는 closeout 문서를 유지하되, 새 master plan 아래에서 completion waves를 다시 연다.

## 남은 구현 파동

### Wave A. Scope Reset And Execution Re-entry

목표:

- 이전 closeout tranche와 현재 repo completion scope를 분리한다.
- root 문서, board, live automation truth를 하나로 맞춘다.
- issue-null run과 post-close drift를 분류하고 다음 execution queue를 연다.

종료 기준:

- `MASTER_PLAN`, `CURRENT_STATE`, `TODO_EXECUTION_BOARD`가 같은 현실을 말한다.
- 첫 상세 플랜과 다음 queue가 문서로 고정된다.
- run hygiene를 어떤 packet에서 닫을지 명확해진다.

### Wave B. `musu-port` Operator Ingress Closure

목표:

- operator machine에서 보는 ingress/control surface를 실제 사용 기준으로 닫는다.
- Windows/WSL adapter와 runtime parity를 검증 가능한 단위로 정리한다.

종료 기준:

- operator ingress 관련 canonical replay가 있다.
- Windows/WSL parity와 failure mode가 문서와 artifact로 정리된다.

### Wave C. `musu-connects` Wire-level Transport Closure

목표:

- simulated session evidence를 넘어 actual peer-authenticated transport proof를 만든다.
- QUIC/wire/session 증거를 route proof와 분리 없이 설명 가능하게 만든다.

종료 기준:

- session evidence가 simulated가 아니라 실제 transport evidence로 기록된다.
- NAT/relay fallback risk register가 열린 가정으로 분리된다.

### Wave D. `MUSU-CRT` Integrated Operator Surface

목표:

- operator가 보는 remote view가 trust/freshness/health/session 상태와 모순 없이 동작하게 만든다.
- read-only projection을 넘어서 실제 live surface attach path까지 닫는다.

종료 기준:

- operator 화면 상태와 lane-2/3 artifact 의미가 일치한다.
- stale/degraded/blocked 상태가 화면에서 과장되거나 누락되지 않는다.

### Wave E. `MUSU-WORKS` Autonomous Workload Closure

목표:

- queue/lane/worker/handoff/blocker/governance 계약을 실제 dual-machine workload에 연결한다.
- approval/escalation/morning review/board decision consumer를 runtime path에 묶는다.

종료 기준:

- scenario workload가 실제 issue-bound execution path를 따른다.
- blocker와 approval 흐름이 artifact로 남는다.

### Wave F. End-to-End Acceptance

목표:

- 카페 노트북, 강한 GPU 데스크탑, 보조 GPU 데스크탑 3자 시나리오를 replay 가능한 최종 증거로 묶는다.

종료 기준:

- 생성, vision QA/tagging, operator review/control이 하나의 체인으로 증명된다.
- 남은 리스크는 "아직 안 만든 것"이 아니라 "후속 hardening"만 남는다.

## 세부 플랜 규칙

- 새 root execution packet을 열기 전 반드시 `plans/NN_<slug>_YYYY-MM-DD.md` 문서를 먼저 만든다.
- 각 세부 플랜은 하나의 bounded objective만 가진다.
- 세부 플랜은 구현 범위와 제외 범위를 동시에 써야 한다.
- 세부 플랜에는 target modules/files, replay commands, expected artifacts, acceptance, handoff가 포함되어야 한다.
- 세부 플랜 수행 후에는 `CURRENT_STATE.md`와 `TODO_EXECUTION_BOARD.md`를 같은 truth로 갱신한다.
- 이전 closeout 문서는 삭제하지 않는다. 다만 새 master plan보다 우선하지도 않는다.

## 즉시 실행 순서

1. `38_ops_run_to_issue_hygiene_after_control_plane_recovery_2026-04-03.md`
   - run queue cleanup 완료 후 projection debt를 추적하고 close 조건을 고정
2. `musu-connects` wire-level transport proof detail plan
   - simulated session evidence를 actual transport evidence로 교체
3. `MUSU-CRT` integrated operator surface detail plan
   - remote session health/trust/freshness coherence와 live attach surface closure
4. `MUSU-WORKS` autonomous workload routing detail plan
   - issue-bound execution과 blocker/approval contract 연결
5. end-to-end acceptance detail plan
   - dual-GPU + cafe laptop 최종 scenario close

## 현재 결론

`musu-functions`는 이미 쓸만한 조각들을 많이 가진 상태다. 부족한 것은 조각 수가 아니라, completion order와 acceptance discipline이다.

이 master plan의 목적은 그것을 다시 하나의 제품 완성 경로로 묶는 것이다.
