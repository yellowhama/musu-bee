# Wave D: MUSU-CRT Integrated Operator Surface

## 목표

operator가 보는 remote surface를 lane-2/3 proof와 같은 의미 체계로 동작하게 만들고, read-only projection을 넘어 live attach path까지 닫는다.

## 현재 Truth

- lane-2 proof를 읽는 read path와 lane-3 smoke/coherence artifact는 있다.
- `remoteSessionHealth` coherence는 한번 정리됐지만, 아직 제품 의미의 integrated live surface는 아니다.
- 현재는 operator projection과 real attach lifecycle 사이에 여전히 틈이 있다.

## 대상 모듈 / 파일

- `/home/hugh51/musu-functions/MUSU-CRT/viewer/app.js`
- `/home/hugh51/musu-functions/MUSU-CRT/viewer/index.html`
- `/home/hugh51/musu-functions/MUSU-CRT/tools/mus28_crt_remote_read_proof.mjs`
- `/home/hugh51/musu-functions/MUSU-CRT/tools/mus58_remote_session_health_matrix.mjs`
- `/home/hugh51/musu-functions/MUSU-CRT/tools/mus55_operator_context_compose.mjs`
- `/home/hugh51/musu-functions/scripts/mus28-crt-remote-smoke.sh`
- `/home/hugh51/musu-functions/scripts/mus55-operator-oneflow-harness.sh`

## 범위

1. operator surface state machine을 trust/freshness/health/session 기준으로 다시 고정한다.
2. live attach lifecycle과 read-only projection의 경계를 명확히 한다.
3. stale/degraded/blocked/healthy 상태가 operator view에서 과장 없이 표현되게 만든다.

## 제외 범위

- new WebRTC backport expansion
- unrelated UI redesign
- full production remote desktop implementation
- workload governance

## 구현 작업 목록

1. lane-2 proof schema 변경이 CRT viewer/runtime에 모두 반영됐는지 점검한다.
2. `remoteSessionHealth` 계산과 화면 표시를 transport truth 기준으로 정렬한다.
3. attach-ready/live-ready 상태를 projection-only 상태와 분리한다.
4. one-flow harness와 remote smoke artifact를 새 state machine 기준으로 갱신한다.
5. operator acceptance note와 replay commands를 갱신한다.

## 검증 명령

- `cd /home/hugh51/musu-functions && ./scripts/mus28-crt-remote-smoke.sh`
- `node /home/hugh51/musu-functions/MUSU-CRT/tools/mus58_remote_session_health_matrix.mjs`
- `cd /home/hugh51/musu-functions && ./scripts/mus55-operator-oneflow-harness.sh`

## 기대 Artifact / Evidence

- updated operator-view artifact set
- refreshed one-flow manifest
- state matrix for healthy/degraded/stale/blocked
- operator acceptance runbook

## 리스크 / 보류 항목

- actual attach lifecycle가 wire-level transport truth보다 앞서면 다시 drift가 생긴다.
- viewer에서 semantics를 과장하면 QA는 통과해도 operator trust는 떨어진다.

## 완료 기준

- operator surface가 lane-2 transport truth와 모순 없이 읽힌다.
- remote session 상태가 projection-only, attach-ready, blocked를 분명히 구분한다.
- end-to-end acceptance packet에서 CRT가 더 이상 weakest link가 아니게 된다.

## 다음 Handoff

- 다음 packet은 `MUSU-WORKS` autonomous workload closure다.
