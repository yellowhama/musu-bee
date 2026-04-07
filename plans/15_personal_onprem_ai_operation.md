# Personal On-Prem AI Operation

## 목표

`musu-functions` 전체를 "여러 개인 컴퓨터를 하나의 보호된 on-prem AI operation으로 묶는 시스템"으로 완성하는 루트 실행 계획을 고정한다.

대표 사용자 시나리오:

- 사용자는 카페의 노트북에 앉아 있다.
- 집에는 `5070 Ti`가 있는 강한 GPU 데스크탑과 `4060 Ti`가 있는 보조 GPU 데스크탑이 있다.
- 강한 GPU 머신은 생성 workload를 돌린다.
- 보조 GPU 머신은 vision QA, tagging, 품질 확인을 맡는다.
- 노트북은 얇은 control surface로 접속해 화면을 보고, 작업물을 확인하고, 다음 작업을 배치한다.

## 대상 프로젝트

- `musu-port`
- `musu-connects`
- `MUSU-CRT`
- `MUSU-WORKS`
- `MUSU-AS-MCP`

## 참조 문서

- `/home/hugh51/musu-functions/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/plans/18_root_remaining_execution_map_2026-04-03.md`
- `/home/hugh51/musu-functions/plans/19_wave2_operator_laptop_integration_2026-04-03.md`
- `/home/hugh51/musu-functions/plans/20_wave3_dual_gpu_scenario_proof_2026-04-03.md`
- `/home/hugh51/musu-functions/plans/21_root_acceptance_closeout_2026-04-03.md`
- `/home/hugh51/musu-functions/plans/22_wave2_lane3_remote_session_health_coherence_2026-04-03.md`
- `/home/hugh51/musu-functions/plans/23_closeout_ops_acceptance_bundle_index_2026-04-03.md`
- `/home/hugh51/musu-functions/plans/24_root_acceptance_regression_audit_2026-04-03.md`
- `/home/hugh51/musu-functions/plans/25_lane2_proof_semantics_cleanup_2026-04-03.md`
- `/home/hugh51/musu-functions/musu-port/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/musu-connects/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/MUSU-CRT/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/MUSU-WORKS/MASTER_PLAN.md`
- `/home/hugh51/musu-functions/PAPERCLIP_OPERATIONS/README.md`

## 참고 레퍼런스 스택

`musu-connects`와 루트 system slice를 설계할 때 아래 오픈소스 계열을 아키텍처 레퍼런스로 삼는다.

- secure transport / NAT traversal
  - `Tailscale` / `Headscale`
  - `Nebula`
- discovery / peer state sync
  - `Syncthing`
  - `HashiCorp Serf`
- route / capability exchange
  - `HashiCorp Consul`
  - `NATS Services`

레퍼런스 사용 원칙:

- 그대로 베끼지 않는다.
- `musu-port`와 `musu-connects`의 분리 원칙을 유지한다.
- 레퍼런스는 transport/discovery/catalog 패턴을 배우는 근거로만 쓴다.

## 이번 단계 범위

- 루트 제품 정의를 repo 전체 기준으로 다시 고정
- Paperclip에 루트 goal/project/issues를 만든다
- 첫 end-to-end product slice의 시스템 경계를 정한다
- 이후 세부 구현 플랜을 어떤 순서로 열지 정한다

## 제외 범위

- 범용 퍼블릭 SaaS 멀티테넌시
- 불특정 외부 사용자 온보딩
- `musu-computer-tools` 단일 capability 확장만을 MVP로 보는 해석
- 원본 monolith 전체 parity를 한 번에 닫는 일

## 구현 작업 목록

1. 루트 goal/project를 `musu-functions` 전체 완성 기준으로 생성한다.
2. 루트 execution issues를 아래 네 트랙으로 나눈다.
   - system contract and toolchain normalization
   - `musu-port + musu-connects` cross-device route plane
   - `MUSU-CRT` realtime remote surface
   - `MUSU-WORKS` autonomous operation and safety/governance
3. `musu-port`에서 각 머신의 managed ingress, device profile, service identity를 canonical node surface로 읽는다.
4. `musu-connects`에서 각 node의 route advertisement/import, peer trust, session health를 live transport로 닫는다.
5. `MUSU-CRT`에서 operator laptop이 remote screen/session/artifact를 실시간으로 확인하고 개입할 수 있게 한다.
6. `MUSU-WORKS`에서 작업 배치, 결과 handoff, blocker escalation, approval/safety를 자동 운영 contract로 묶는다.
7. 대표 시나리오 proof를 만든다.
   - `5070 Ti` 생성
   - `4060 Ti` vision QA/tagging
   - 노트북 operator review/control

## 2026-04-03 실행 레인 재시퀀싱

현재 Paperclip 루트 프로젝트 상태(07:34 KST 동기화):

- 완료(`done`): [MUS-26](/MUS/issues/MUS-26), [MUS-27](/MUS/issues/MUS-27), [MUS-28](/MUS/issues/MUS-28), [MUS-29](/MUS/issues/MUS-29), [MUS-45](/MUS/issues/MUS-45), [MUS-46](/MUS/issues/MUS-46), [MUS-47](/MUS/issues/MUS-47), [MUS-48](/MUS/issues/MUS-48), [MUS-49](/MUS/issues/MUS-49), [MUS-55](/MUS/issues/MUS-55), [MUS-58](/MUS/issues/MUS-58), [MUS-59](/MUS/issues/MUS-59), [MUS-62](/MUS/issues/MUS-62), [MUS-63](/MUS/issues/MUS-63), [MUS-65](/MUS/issues/MUS-65), [MUS-68](/MUS/issues/MUS-68), [MUS-69](/MUS/issues/MUS-69), [MUS-71](/MUS/issues/MUS-71), [MUS-72](/MUS/issues/MUS-72), [MUS-73](/MUS/issues/MUS-73)
- 진행(`in_progress`): [MUS-56](/MUS/issues/MUS-56), [MUS-57](/MUS/issues/MUS-57), [MUS-60](/MUS/issues/MUS-60)
- 대기(`todo`): 없음
- 블록(`blocked`): [MUS-25](/MUS/issues/MUS-25), [MUS-61](/MUS/issues/MUS-61)

파형별 상태 판단:

1. Wave 0/1/2 핵심 게이트는 닫힘
   - lane1/2/3/4 핵심 구현/게이트 패킷은 `done`으로 정리됨
2. 현재 병목은 closeout 체인과 최종 머지 게이트
   - `MUS-60` closeout evidence bundle
   - `MUS-61` QA regression verdict
   - `MUS-56` wave-3 parent close line
   - `MUS-57` root acceptance close
   - `MUS-25` parent release
3. 별도 운영 병목
   - comment-triggered blocked-context run이 즉시 생성될 수 있어 stale run metadata가 빠르게 변한다
   - 해당 항목은 `UNBLOCK_NOTE_2026-04-03_HEARTBEAT_CANCEL_PERMISSION.md`에서 run-id 단위로 추적/정리한다

실행 순서는 아래처럼 고정한다.

### Chain A: Root Closeout (현재 우선순위)

1. `MUS-60` (Chief of Staff)
   - acceptance artifact index + replay table + risk register를 증거 경로 포함 형태로 고정
2. `MUS-61` (QA Lead)
   - `MUS-60` 산출물 입력 후 regression audit GO/NO-GO verdict 게시
3. `MUS-57` (CEO 2)
   - QA verdict 기반 final scenario closeout 확정
4. `MUS-25` (CEO 2)
   - parent program unblock/close

### Chain B: Wave-3 Dual-GPU

1. `MUS-73` (Founding Engineer, done)
   - `MUS-71` harness chain-id continuity remediation 완료
2. `MUS-71` (Founding Engineer, done)
   - CTO review gate 확정 완료
3. `MUS-72` (QA Lead, done)
   - wave-3 replay gate `WAVE3_QA_GATE: GO` 게시 완료
4. `MUS-56` (Chief of Staff, in_progress)
   - child gate done 상태를 반영한 parent packet close line(`WAVE3_GATE`) 고정이 마지막 남은 작업

## blocker -> next action 매핑 (2026-04-03)

1. root closeout evidence 미완료
   - owner: Chief of Staff (`MUS-60`)
   - next action: artifact index/replay/risk register를 `MUS-61` 입력 포맷으로 고정
2. wave-3 parent close line 미고정
   - owner: Chief of Staff (`MUS-56`)
   - next action: child done gate(`MUS-71`, `MUS-72`) 링크를 포함한 `WAVE3_GATE` close line 고정
3. root QA final verdict 미획득
   - owner: QA Lead (`MUS-61`)
   - next action: GO/NO-GO를 issue comment로 고정하고 `MUS-57`로 전달
4. root program acceptance gate 대기
   - owner: CEO 2 (`MUS-57`, `MUS-25`)
   - next action: `MUS-56` + `MUS-61` QA verdict 반영 후 closeout/parent release 실행
5. stale heartbeat run 재발 감시
   - owner: Chief of Staff
   - 상태: comment-triggered blocked-context run(`5814ad88`, MUS-25)은 CoS가 cancel 완료
   - next action: 재발 시 즉시 cancel 후, cancel 실패 시 `UNBLOCK_NOTE_2026-04-03_HEARTBEAT_CANCEL_PERMISSION.md` 경로로 승격

## 검증 방법

- 루트 Paperclip project에서 issue와 plan document가 live로 보인다.
- `musu-port`는 각 머신을 식별 가능한 node ingress로 드러낸다.
- `musu-connects`는 node 간 advertised/imported route를 실제 세션 기준으로 보여준다.
- `MUSU-CRT`는 laptop에서 remote runtime surface를 본다.
- `MUSU-WORKS`는 workload handoff와 blocker routing을 자동 운영 규칙으로 남긴다.
- 최종 proof는 "카페 노트북에서 집 GPU 2대를 역할 분담으로 돌린다"는 하나의 시나리오로 재현된다.

## 보류 항목

- cloud relay가 필요한지 여부
- NAT traversal과 home network exposure 정책
- artifact store의 canonical 위치
- real-time screen sharing과 terminal/data plane의 우선 통합 순서
- safety boundary를 `MUSU-WORKS`와 다른 runtime layer 중 어디에 둘지

## 완료 기준

- 루트 목표가 `musu-functions` 전체 완성 기준으로 문서와 Paperclip 양쪽에서 일치한다.
- 첫 end-to-end slice가 문서로 고정되고 실제 구현 todo로 분해돼 있다.
- 각 세부 실행은 별도 플랜 문서를 만들면서 진행한다.
- 자동 운영의 기준이 "루트 project의 todo를 Paperclip routine/issue 흐름으로 계속 민다"로 바뀐다.
