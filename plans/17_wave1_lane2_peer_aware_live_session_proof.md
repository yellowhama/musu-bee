# Wave 1 Lane 2 Peer-Aware Live Session Proof

## 목표

`MUS-27`과 `MUS-35`의 현재 lane 2 proof를 "route-shape integration"에서 "peer-aware live session proof"로 끌어올린다.

## 대상 프로젝트

- `musu-port`
- `musu-connects`

## 참조 문서

- `/home/hugh51/musu-functions/plans/15_personal_onprem_ai_operation.md`
- `/home/hugh51/musu-functions/musu-connects/SPEC.md`
- `/home/hugh51/musu-functions/musu-connects/CURRENT_STATE.md`
- `/home/hugh51/musu-functions/scripts/mus27-live-session-harness.sh`

## 이번 단계 범위

- live harness가 실제로 어떤 것을 증명하고 무엇을 아직 증명하지 못하는지 경계를 고정
- peer trust gate와 session context가 proof path에 실제로 들어가도록 harness를 확장
- lane 2 blocker를 route-shape proof 부족이 아니라 peer-aware proof 부족으로 재정의

## 제외 범위

- CRT lane 3 구현
- home network NAT traversal 실제 배포
- multi-machine production relay

## 구현 작업 목록

1. `musu-connectsd live-harness`에 peer context 입력을 추가한다.
   - trust level
   - discovery state
   - source peer/device identity
2. `FirstProductDemoService` 또는 새 lane-2 proof service에서 `import_snapshot_for_peer_with_local_aliases` 경로를 실제로 태운다.
3. proof artifact에 아래를 명시적으로 남긴다.
   - peer trust context
   - discovery state
   - import decision
   - freshness/import state
   - session metadata
4. negative proof를 최소 1개 추가한다.
   - blocked peer -> suppressed
   - unverified peer -> suppressed
5. `musu-port` route JSON -> `musu-connects` proof artifact -> operator-visible manifest까지 한 번에 재현되는 runbook을 남긴다.
6. lane 2 완료 기준과 lane 3 착수 기준을 문서에 고정한다.

## 검증 방법

- `cd /home/hugh51/musu-functions/musu-connects && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo test -p musu-connects-core`
- `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh`
- `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario unverified-peer`
- blocked/unverified peer 입력으로 suppressed proof artifact 생성 확인
- proof JSON에 trust/freshness/import state가 함께 기록되는지 확인

## 보류 항목

- 실제 cross-device QUIC endpoint open/dial을 언제 lane 2 proof에 포함할지
- trust source를 pairing token, device profile, user approval 중 어디에 둘지

## 완료 기준

- lane 2 proof가 더 이상 hard-coded trusted peer snapshot이 아니다.
- peer trust / discovery state / import decision이 proof artifact에 실측으로 남는다.
- `MUS-27` blocker가 해소되고 lane 3 착수 기준이 문서와 코드에서 일치한다.

## 2026-04-03 구현 메모

- code acceptance는 로컬에서 충족됐다.
- 남은 단계는 `MUS-45` QA gate verdict와 root board sync다.
