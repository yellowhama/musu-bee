# Lane-2 Proof Semantics Cleanup

## 목표

lane-2 proof artifact의 의미론을 실제 필드 이름과 맞춘다. 특히 `trustGateReason`과 simulated session metadata가 operator/QA에 오해를 주지 않게 정리한다.

## 문제

1. `trustGateReason`이 trust gate verdict와 import collision/stale reason을 섞어 표현할 수 있다.
2. positive proof의 simulated session metadata가 peer-specific endpoint/session 입력을 충분히 반영하지 않는다.

## 범위

1. trust gate verdict와 import merge reason 분리
   - 예: `trustGateReason`
   - 예: `importDecisionReason`
2. simulated session metadata 정리
   - peer endpoint source 명시
   - simulated 값과 real 값의 경계 명시
3. regression test 추가
   - local alias conflict
   - cross-peer alias conflict
   - trusted+degraded route

## 제외 범위

- actual QUIC wire proof 구현
- CRT lane-3 UI 변경
- dual-GPU scenario routing

## 완료 기준

- `trustGateReason`은 trust/discovery verdict만 표현한다.
- collision/stale reason은 별도 필드로 남는다.
- simulated session artifact가 peer input과 어떻게 연결되는지 QA가 헷갈리지 않는다.

## 2026-04-03 진행 결과

- `trustGateReason`과 `importDecisionReason`을 proof artifact에서 분리했다.
- simulated session metadata를 `sessionEvidenceMode`, `sessionRemoteAddrSource`로 명시했다.
- replay 확인:
  - `cd /home/hugh51/musu-functions/musu-connects && /home/hugh51/musu-functions/scripts/linux-rust-env.sh cargo test -p musu-connects-core product_demo -- --nocapture`
  - `cd /home/hugh51/musu-functions && ./scripts/mus27-live-session-harness.sh /tmp/mus27-proof-nextstep-2`

## 다음 컷

- lane-2 proof 의미론 정리 이후 우선순위는 [22_wave2_lane3_remote_session_health_coherence_2026-04-03.md](/home/hugh51/musu-functions/plans/22_wave2_lane3_remote_session_health_coherence_2026-04-03.md)다.
- actual wire-level QUIC/session proof는 별도 implementation packet으로 남는다.
