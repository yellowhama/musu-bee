# musu-connects Master Plan

## 목표

`musu-connects`는 MUSU의 cross-device network plane이다.

핵심 역할:

1. peer discovery
2. secure pairing / session establishment
3. local route advertisement
4. remote route import
5. freshness / trust / health / reconcile 관리

즉 `musu-port`가 로컬 ingress/control plane이면, `musu-connects`는 그 ingress들을 기기 간 연결망으로 확장하는 layer다.

## 현재 코드 상태 요약

이미 들어간 것:

- core domain types
- advertised/imported registries
- local -> advertised -> imported transforms
- pairing service baseline
- discovery provider trait + discovered peer registry
- route sync service baseline

아직 비어 있는 것:

- alternate environment verification proof
- live multi-machine demo proof
- control-plane routine가 blocker를 다음 action으로 넘기는 운영 증명

따라서 현재 저장소의 중심 결손은 "문서"가 아니라 "adapter/provider execution"이다.

## 제품 판단

`musu-connects`는 단순 transport 실험이 아니다.

MUSU 전체 구조는 아래 3단으로 봐야 한다.

1. `musu-port`: 로컬 service ingress/control plane
2. `musu-connects`: cross-device route/network plane
3. `MUSU-CRT`: 사용자가 체감하는 remote runtime surface

이 중 `musu-connects`가 비어 있으면 MUSU는 single-machine tool에 머무른다.

## 실행 원칙

- `musu-port`와 책임을 섞지 않는다.
- local route 소유권은 `musu-port`에 남긴다.
- `musu-connects`는 advertisement/import/session/trust를 담당한다.
- supervisor/warden lifecycle은 나중 계층에 남긴다.
- 현재 최우선은 첫 product path를 닫는 것이다.
- 그리고 이 실행은 Paperclip routine/heartbeat로 계속 이어져야 한다.

## 단계별 상태

### Phase 0-7. Planning + core scaffold

상태: 완료

포함 범위:

- contract 문서 고정
- core Rust workspace
- discovery / pairing / route sync baseline

### Phase 8. Port Adapter Integration

상태: in progress, implementation baseline landed

목표:

- `musu-port` route shape를 `musu-connects` application layer와 연결한다.

핵심 작업:

- export adapter trait
- default local route mapper
- import adapter trait
- merge policy baseline
- stale cleanup handoff shape

남은 마감:

- 구현 baseline 위에 검증 proof를 다시 남긴다.
- Linux linker blocker와 alternate validation path를 명시적으로 기록한다.

### Phase 9. Actual QUIC Provider Baseline

상태: implementation landed, proof refresh pending

목표:

- 실제 QUIC endpoint / dial / accept / control stream의 첫 baseline을 만든다.

핵심 작업:

- endpoint config type
- listener open baseline
- dial/accept baseline
- control bi-stream open shape
- session registry integration

현재 구현:

- endpoint config type
- listener open baseline
- dial/accept baseline
- control bi-stream baseline
- session registry integration

남은 마감:

- alternate environment에서 proof를 다시 남긴다.

### Phase 10. First Product Demonstration

상태: runbook and code-backed demo landed

목표:

- `musu-port -> musu-connects -> imported route` 첫 end-to-end demonstration을 만든다.

핵심 작업:

- exported route sample
- imported route application sample
- collision/freshness/trust demo rules
- proof/runbook 문서화

현재 구현:

- runbook 문서
- `FirstProductDemoService` code path
- end-to-end logic snapshot test

남은 마감:

- live multi-machine proof를 남긴다.

### Phase 11. Paperclip Autonomous Execution

상태: parallel control-plane track

목표:

- `musu-connects` execution packet을 Paperclip이 routine/heartbeat 기반으로 계속 밀게 만든다.

핵심 작업:

- engineer execution routine
- CEO unblock/review routine
- issue plan document 유지
- blocked 시 다음 행동 규칙 명시

완료 기준:

- `MUS-17/18/19`가 수동 깨우기 없이도 heartbeat/routine으로 계속 진행된다.

### Phase 12. Verification And Demo Proof

상태: after phases 8-11

목표:

- toolchain 제약을 넘어서 실제 검증/증명 artifact를 남긴다.

핵심 작업:

- Linux linker blocker 기록
- 가능한 환경에서 cargo proof 갱신
- product demo proof 문서화

완료 기준:

- 구현, 운영, proof가 한 세트로 남는다.

## 바로 다음 액션

1. wave-2 close 상태(`MUS-102`~`MUS-105` 모두 `done`)를 유지하고 done-context run drift를 제거한다.
2. control-plane CoS follow-up `MUS-110` 결과(`RUN_STATE_DRIFT_MUS103_GATE`)를 수집한다.
3. run-state truth가 안정화되기 전에는 `musu-connects` 신규 구현 packet을 열지 않는다.

## 현재 active / queued

### Active

- 없음 (`musu-connects` 프로젝트 open issue = 0)

### Queued / Blocked by dependency

- run-hygiene follow-up
  - Paperclip issue: `MUS-110` (control-plane project)
  - assignee: `Chief of Staff`
  - 상태: `in_progress` (`activeRun=queued`)
