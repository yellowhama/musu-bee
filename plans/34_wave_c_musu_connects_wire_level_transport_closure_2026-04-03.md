# Wave C: musu-connects Wire-level Transport Closure

## 목표

현재 lane-2 proof의 `simulated session evidence`를 actual peer-authenticated wire transport evidence로 교체한다.

## 현재 Truth

- route import proof는 이미 있다.
- `trustGateReason`, `importDecisionReason`, `sessionEvidenceMode` 의미도 정리됐다.
- 하지만 session transport는 아직 `simulated-quic-provider`다.
- 이 상태에서는 operator-visible proof는 가능해도 real peer-authenticated wire proof라고 부를 수 없다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/quic_provider.rs`
- `/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/product_demo.rs`
- `/home/hugh51/musu-functions/musu-connects/crates/musu-connects-core/src/application/route_sync.rs`
- `/home/hugh51/musu-functions/musu-connects/apps/musu-connectsd/src/main.rs`
- `/home/hugh51/musu-functions/scripts/mus27-live-session-harness.sh`
- `/home/hugh51/musu-functions/work/mus27-live-harness/*`

## 범위

1. actual transport/session evidence capture path를 추가한다.
2. proof JSON과 runtime evidence JSON의 관계를 acceptance-ready 형태로 정리한다.
3. peer-authenticated session evidence가 trust/discovery/import state와 모순 없이 기록되게 만든다.

## 제외 범위

- NAT traversal production hardening
- global relay/DERP/TURN 구현
- CRT UI integration
- workload routing/governance

## 구현 작업 목록

1. current `product_demo`와 `quic_provider` 경계를 actual transport path 기준으로 재검토한다.
2. session evidence와 exported-route remote address source를 runtime에서 직접 수집한다.
3. harness를 positive / blocked / unverified 시나리오 모두 actual transport semantics로 맞춘다.
4. proof schema와 fixture를 업데이트한다.
5. replay runbook과 open risk register를 갱신한다.

## 검증 명령

- `cd /home/hugh51/musu-functions/musu-connects && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo test -p musu-connects-core`
- `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh`
- `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario unverified-peer`
- `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh --scenario blocked-peer`

## 기대 Artifact / Evidence

- actual wire/session transport evidence artifact
- updated proof fixture
- replayable positive/unverified/blocked artifact chain
- risk register separating done scope from hardening backlog

## 리스크 / 보류 항목

- local single-host proof와 full NAT proof는 다르다.
- proof semantics를 급하게 바꾸면 CRT와 docs가 바로 drift할 수 있다.

## 완료 기준

- `sessionEvidenceMode`가 simulated가 아니라 actual runtime evidence를 설명한다.
- trust/discovery/import/session 증거가 하나의 acceptance narrative로 이어진다.
- CRT packet이 이 artifact를 source-of-truth로 사용할 수 있다.

## 다음 Handoff

- 다음 packet은 `MUSU-CRT` integrated operator surface다.
