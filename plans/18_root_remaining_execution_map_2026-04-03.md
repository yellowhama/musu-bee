# Root Remaining Execution Map

## 목표

`musu-functions` 루트 목표를 남은 패킷 기준으로 다시 고정한다. 기준은 "카페 노트북에서 집의 두 GPU 머신을 하나의 보호된 on-prem AI operation처럼 쓴다"다.

## 현재 게이트 상태

1. lane 1
   - 상태: `done`
   - 기준: toolchain normalization / verifier 완료
2. lane 2
   - 상태: QA gate 완료, CTO risk gate/lock-clear 대기
   - 기준 이슈: `MUS-49` -> `MUS-52` -> `MUS-45` -> `MUS-59` -> `MUS-53` -> `MUS-27`
3. lane 3
   - 상태: QA packet 완료, Sev-2 remediation 대기
   - 기준 이슈: `MUS-47` -> `MUS-48` -> `MUS-58` -> `MUS-28`
4. lane 4
   - 상태: `in_review`
   - 기준 이슈: `MUS-29`

## 남은 작업 순서

1. `MUS-49` implementation evidence post
   - verified command:
     - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh`
   - negative command:
     - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario unverified-peer`
   - required artifacts:
     - `musu-connects-live-proof.json`
     - `musu-connects-runtime-transport-evidence.json`
     - `mus27-live-harness-manifest.json`
2. `MUS-59` / `MUS-53` lane-2 unblock + risk review
   - stale execution lock을 정리하고 CTO risk review를 거쳐 `MUS-27` status transition을 준비한다
   - output: `MUS-27` parent unblock or reopen recommendation
4. `MUS-58` lane-3 remediation
   - stale/withdrawn 상태가 healthy remote session으로 보이지 않게 coherence를 수정
   - issue output: `MUS-28` unblock ready
5. `MUS-55` operator laptop integration
   - lane 2 route plane + lane 3 CRT surface를 한 operator flow로 연결
   - laptop에서 remote read/control artifact를 같은 session으로 본다
6. `MUS-56` dual-GPU scenario proof
   - strong GPU: generation
   - support GPU: vision QA / tagging
   - laptop: operator review / next-step dispatch
7. `MUS-60` closeout ops packet
   - acceptance bundle skeleton, replay table, risk register를 합성한다
8. `MUS-61` root acceptance regression audit
   - root closeout bundle을 QA 관점에서 replay/audit 한다
9. `MUS-57` root acceptance / closeout
   - final closeout verdict와 root closure recommendation을 게시한다

## 패킷별 산출물

1. lane-2 close
   - code: `musu-connects` harness / proof / tests
   - docs: root + `musu-connects` current state / todo board
   - board: `MUS-49` comment, `MUS-52`, `MUS-45`, `MUS-59`, `MUS-53`
2. lane-3 close
   - code: CRT smoke path replayable artifact
   - docs: CRT state + root board
   - board: `MUS-48` verdict, `MUS-58`, `MUS-28` unblock
3. operator integration
   - code: operator read/control path glue
   - docs: operator runbook
   - board: `MUS-55`
4. dual-GPU scenario
   - code/config: workload routing and artifact handoff contract
   - docs: final scenario runbook
   - board: `MUS-56`
5. root closeout
   - docs: acceptance checklist, security/ops notes, artifact index
   - board: `MUS-60`, `MUS-61`, `MUS-57`, resume `MUS-25`

## 완료 기준

- `MUS-27`, `MUS-28`이 모두 blocked 에서 빠진다.
- `MUS-29`가 lane-4 contract artifact를 남긴다.
- operator laptop integration packet이 실제 operator flow를 재현한다.
- dual-GPU scenario proof가 하나의 chain으로 재현된다.
- `MUS-25`가 close 가능한 acceptance bundle을 가진다.
